/**
 * SWR-006 W9: helpers of the HTTP automation scenarios (`automation-*.int.test.ts`). Real Nest app (`startApp`),
 * real game registry (the registered Rebellion module with the ranked bot) unless a test passes its own, fresh
 * SQLite copy per app. A game is driven ONLY through `POST /api/sessions`, `POST …/commands`, `POST …/automation/run`
 * and `GET …`; the stored row is read for oracles (human scripts, invariants, equality) — never shown to the bot.
 */
import type { INestApplication, LogLevel } from '@nestjs/common';
import type { AiUsage } from '@prisma/client';
import {
  AutomationDecisionPointSchema,
  AutomationRunSummarySchema,
  SessionAutomationSchema,
  SessionCommandOkSchema,
  type AutomationRunSummary,
  type ServerGameModule,
  type SessionAutomation,
} from '@bga/platform';
import {
  CorePlayerViewSchema,
  type CoreGameState,
  type CorePlayerView,
  type Difficulty,
  type Faction,
  type RebellionSetupInput,
} from '@bga/game-rebellion/schema';
import { expect } from 'vitest';
import type { AiTestOverrides } from '../../src/ai/ai.types';
import type { Clock, IdGenerator } from '../../src/common/runtime.tokens';
import type { AiCommanderConfig, OpenAIConfig } from '../../src/config/env';
import type { AutomationLogLevel } from '../../src/sessions/automation/automation-log';
import { PrismaService } from '../../src/persistence/prisma.service';
import { fixedIds, storedEvents, storedState, type WireEvent } from './core-fixtures';
import { R, postCommand } from './fixtures';
import {
  createFakeFetch,
  decisionText,
  modelReply,
  okResponse,
  type FakeFetch,
  type FakeReply,
  type FakeRequest,
} from './openai-fake-fetch';
import type { HumanCommand, HumanScript } from './scripted-empire';
import { api, startApp, type TestDb } from './test-app';

// ---------------------------------------------------------------------------------------------------------
// Setups, clocks
// ---------------------------------------------------------------------------------------------------------

/** Human Rebels vs AI Empire (the PO default scenario with `normal`). */
export function rebelsVsAi(aiDifficulty: Difficulty = 'normal'): RebellionSetupInput {
  return {
    playerFaction: 'rebels',
    opponentType: 'ai',
    aiDifficulty,
    ruleset: 'base',
    gameMode: 'digital',
  };
}

/** Human Empire vs AI Rebels. */
export function empireVsAi(aiDifficulty: Difficulty = 'normal'): RebellionSetupInput {
  return {
    playerFaction: 'empire',
    opponentType: 'ai',
    aiDifficulty,
    ruleset: 'base',
    gameMode: 'digital',
  };
}

export const FIXED_NOW = '2026-11-19T12:00:00.000Z';

/** A clock that never moves (engine-vs-API and two-app equality: every `at` is the same). */
export function frozenClock(now = FIXED_NOW): Clock {
  return { now: () => now };
}

// ---------------------------------------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------------------------------------

export interface LoggedLine {
  level: AutomationLogLevel;
  line: string;
}

export interface RebellionApp {
  app: INestApplication;
  /** Runner lines (`automation.step` / `automation.run` / `automation.error`). */
  automationLogs: LoggedLine[];
  /** AI layer lines (attempt / usage lines of SWR-005B). */
  aiLogs: string[];
}

export interface StartRebellionOptions {
  ids?: IdGenerator | string[];
  clock?: Clock;
  aiCommander?: Partial<AiCommanderConfig>;
  openai?: OpenAIConfig;
  fake?: FakeFetch;
  /** Extra AI overrides (sleep / monotonic clock); fake fetch + log sinks are filled in. */
  ai?: Omit<AiTestOverrides, 'openaiFetch' | 'logSink'>;
  gameModules?: readonly ServerGameModule[];
  /** Nest logger levels (default: none — the runner lines go to `automationLogs`). */
  logger?: LogLevel[] | false;
  /** `false`: do not override the automation log sink (lines go to the Nest logger). */
  captureAutomationLogs?: boolean;
}

export async function startRebellionApp(
  db: TestDb,
  options: StartRebellionOptions = {},
): Promise<RebellionApp> {
  const automationLogs: LoggedLine[] = [];
  const aiLogs: string[] = [];
  const ids = Array.isArray(options.ids) ? fixedIds(...options.ids) : options.ids;
  const app = await startApp(db.url, {
    logger: options.logger ?? false,
    clock: options.clock ?? frozenClock(),
    ...(ids ? { idGenerator: ids } : {}),
    ...(options.gameModules ? { gameModules: options.gameModules } : {}),
    config: { aiCommander: options.aiCommander, openai: options.openai },
    automation:
      options.captureAutomationLogs === false
        ? {}
        : { logSink: (level, line) => automationLogs.push({ level, line }) },
    ai: {
      sleep: () => Promise.resolve(),
      random: () => 0.5,
      ...options.ai,
      openaiFetch: options.fake?.fetch,
      logSink: (line) => aiLogs.push(line),
    },
  });
  return { app, automationLogs, aiLogs };
}

// ---------------------------------------------------------------------------------------------------------
// A game driven through HTTP
// ---------------------------------------------------------------------------------------------------------

export interface Reply {
  status: number;
  body: unknown;
}

export interface CommandReply {
  view: CorePlayerView;
  events: WireEvent[];
  summary: AutomationRunSummary;
  raw: unknown;
}

export const runPath = (sessionId: string) => `/api/sessions/${sessionId}/automation/run`;

function okReply(res: { status: number; body: unknown }, label: string): CommandReply {
  expect(res.status, `${label} → ${res.status} ${JSON.stringify(res.body)}`).toBe(200);
  const body = SessionCommandOkSchema.parse(res.body);
  return {
    view: CorePlayerViewSchema.parse(body.view),
    events: body.events as WireEvent[],
    summary: AutomationRunSummarySchema.parse(body.automation),
    raw: res.body,
  };
}

export class AutomatedGame {
  /** Every 2xx/4xx body this game received (label, status, body) — for scans. */
  readonly replies: { label: string; status: number; body: unknown; request?: unknown }[] = [];
  /** Summaries of every command / run response, in order. */
  readonly summaries: AutomationRunSummary[] = [];

  constructor(
    readonly app: INestApplication,
    readonly id: string,
    readonly human: Faction,
    public version: number,
  ) {}

  static async create(
    app: INestApplication,
    setup: RebellionSetupInput,
  ): Promise<{
    game: AutomatedGame;
    automation: SessionAutomation;
    view: CorePlayerView;
    raw: unknown;
  }> {
    const res = await api(app).post('/api/sessions').send({ gameId: R, setup });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body as { sessionId: string; view: unknown; automation: unknown };
    const view = CorePlayerViewSchema.parse(body.view);
    const game = new AutomatedGame(app, body.sessionId, setup.playerFaction, view.version);
    game.replies.push({ label: 'POST /api/sessions', status: 201, body: res.body, request: setup });
    return {
      game,
      automation: SessionAutomationSchema.parse(body.automation),
      view,
      raw: res.body,
    };
  }

  envelope(command: HumanCommand, expectedVersion = this.version) {
    return { actor: this.human, expectedVersion, command };
  }

  /** Posts a command without asserting the status. */
  async post(command: HumanCommand, expectedVersion = this.version): Promise<Reply> {
    const env = this.envelope(command, expectedVersion);
    const res = await postCommand(this.app, this.id, env);
    this.replies.push({
      label: `POST /commands ${command.type}`,
      status: res.status,
      body: res.body,
      request: env,
    });
    return { status: res.status, body: res.body as unknown };
  }

  /** Posts a command that must succeed; updates the version. */
  async send(command: HumanCommand): Promise<CommandReply> {
    const reply = okReply(await this.post(command), `${this.human} ${command.type}`);
    this.version = reply.view.version;
    this.summaries.push(reply.summary);
    return reply;
  }

  async runRaw(): Promise<Reply> {
    const res = await api(this.app).post(runPath(this.id)).send({});
    this.replies.push({
      label: 'POST /automation/run',
      status: res.status,
      body: res.body,
      request: {},
    });
    return { status: res.status, body: res.body as unknown };
  }

  async run(): Promise<CommandReply> {
    const reply = okReply(await this.runRaw(), 'run');
    this.version = reply.view.version;
    this.summaries.push(reply.summary);
    return reply;
  }

  async get(): Promise<{
    status: string;
    view: CorePlayerView;
    automation: SessionAutomation;
    raw: unknown;
  }> {
    const res = await api(this.app).get(`/api/sessions/${this.id}`);
    expect(res.status).toBe(200);
    this.replies.push({ label: 'GET /api/sessions/:id', status: 200, body: res.body });
    const body = res.body as { status: string; view: unknown; automation: unknown };
    return {
      status: body.status,
      view: CorePlayerViewSchema.parse(body.view),
      automation: SessionAutomationSchema.parse(body.automation),
      raw: res.body,
    };
  }

  state(): Promise<CoreGameState> {
    return storedState(this.app, this.id);
  }

  events() {
    return storedEvents(this.app, this.id);
  }

  /**
   * Plays the human script until the game ends (each command is chosen from the stored state, i.e. the oracle).
   * `onReply` sees every command response. Returns the final stored state.
   */
  async playToEnd(
    script: HumanScript,
    options: {
      maxCommands?: number;
      onReply?: (reply: CommandReply, command: HumanCommand) => void;
    } = {},
  ): Promise<CoreGameState> {
    const max = options.maxCommands ?? 400;
    for (let i = 0; i < max; i += 1) {
      const state = await this.state();
      if (state.outcome !== null) return state;
      expect(state.activeSide, `${this.id}: the human must be to move`).toBe(this.human);
      const command = script(state);
      const reply = await this.send(command);
      options.onReply?.(reply, command);
    }
    throw new Error(`${this.id}: the game did not end in ${max} human commands`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Engine driver (TC-DIF-10: the same path as the server, without HTTP)
// ---------------------------------------------------------------------------------------------------------

/**
 * Plays a game on the module directly, exactly like the server: create → automation (bot pick =
 * `fallbackCandidateId`, schema-validated point) until the human's turn → human command → … until the end.
 */
export function engineGame(
  module: ServerGameModule,
  sessionId: string,
  setup: RebellionSetupInput,
  human: HumanScript,
  now = FIXED_NOW,
): { state: CoreGameState; humanCommands: HumanCommand[] } {
  const automation = module.automation;
  if (!automation) throw new Error('engineGame: no automation');
  const parsed = module.parseSetup(setup);
  if (!parsed.ok) throw new Error('engineGame: invalid setup');
  let state = module.createInitialState(parsed.value, { sessionId, now }).state as CoreGameState;
  const humanCommands: HumanCommand[] = [];
  const drain = () => {
    for (let steps = 0; automation.pendingActor(state) !== null; steps += 1) {
      if (steps > 64) throw new Error('engineGame: run longer than 64 steps');
      const point = AutomationDecisionPointSchema.parse(automation.decisionPoint(state));
      const result = automation.applyCandidate(state, point.fallbackCandidateId, { now });
      if (!result.ok) throw new Error('engineGame: the engine rejected the bot');
      state = result.state as CoreGameState;
    }
  };
  drain();
  for (let i = 0; state.outcome === null; i += 1) {
    if (i > 400) throw new Error('engineGame: the game did not end');
    const command = human(state);
    humanCommands.push(command);
    const result = module.applyCommand(
      state,
      { actor: setup.playerFaction, expectedVersion: module.version(state), command },
      { now },
    );
    if (!result.ok) throw new Error(`engineGame: human ${command.type} rejected`);
    state = result.state as CoreGameState;
    drain();
  }
  return { state, humanCommands };
}

// ---------------------------------------------------------------------------------------------------------
// Logs, rows
// ---------------------------------------------------------------------------------------------------------

export interface StepLog {
  sessionId: string;
  step: number;
  strategy: string;
  source: string;
  fallbackCode: string;
  code: string;
}

/** Parsed `automation.step` lines. */
export function stepLogs(lines: readonly LoggedLine[]): StepLog[] {
  return lines
    .map((l) => l.line)
    .filter((line) => line.startsWith('automation.step '))
    .map((line) => {
      const fields = Object.fromEntries(
        line
          .split(' ')
          .slice(1)
          .map((kv) => kv.split('=') as [string, string]),
      );
      return {
        sessionId: fields.sessionId ?? '',
        step: Number(fields.step),
        strategy: fields.strategy ?? '',
        source: fields.source ?? '',
        fallbackCode: fields.fallbackCode ?? '',
        code: fields.code ?? '',
      };
    });
}

export function usageRows(app: INestApplication, budgetKey?: string): Promise<AiUsage[]> {
  return app.get(PrismaService).aiUsage.findMany({
    where: budgetKey === undefined ? {} : { budgetKey },
    orderBy: { createdAt: 'asc' },
  });
}

/** Polls until `predicate` holds (background AI calls finishing after a deadline), at most `timeoutMs`. */
export async function eventually(
  predicate: () => Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > until) throw new Error('eventually: timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// ---------------------------------------------------------------------------------------------------------
// Fake OpenAI for the commander (real SDK, fake fetch)
// ---------------------------------------------------------------------------------------------------------

export interface CommanderCall {
  index: number;
  /** Candidate ids of the strict schema enum of this request. */
  ids: string[];
  body: Record<string, unknown>;
  req: FakeRequest;
}

/** Candidate ids of a Responses request (from `text.format.schema.properties.selectedActionId.enum`). */
export function actionIdsOf(body: unknown): string[] {
  const b = body as {
    text?: { format?: { schema?: { properties?: { selectedActionId?: { enum?: unknown } } } } };
  };
  const ids = b.text?.format?.schema?.properties?.selectedActionId?.enum;
  return Array.isArray(ids) ? ids.map(String) : [];
}

/** The data block of a commander prompt (`Game (data):\n{…}`), parsed. */
export function gameDataOf(body: unknown): Record<string, unknown> {
  const input = (body as { input?: unknown }).input;
  if (typeof input !== 'string') throw new Error('no input');
  const prefix = 'Game (data):\n';
  expect(input.startsWith(prefix)).toBe(true);
  return JSON.parse(input.slice(prefix.length)) as Record<string, unknown>;
}

/**
 * Fake OpenAI: `GET /models/{id}` → available; `POST /responses` → `reply(call)` (default: a valid decision for the
 * LAST candidate id — usually not the bot's pick). `responses` lists every commander call in order.
 */
export function commanderFake(
  reply?: (call: CommanderCall) => FakeReply | Promise<FakeReply>,
): FakeFetch & {
  responses: CommanderCall[];
} {
  const responses: CommanderCall[] = [];
  const fake = createFakeFetch((req) => {
    const path = new URL(req.url).pathname;
    const modelMatch = /\/models\/([^/]+)$/.exec(path);
    if (modelMatch) return modelReply(decodeURIComponent(modelMatch[1] ?? ''));
    if (path.endsWith('/responses')) {
      const call: CommanderCall = {
        index: responses.length,
        ids: actionIdsOf(req.body),
        body: req.body as Record<string, unknown>,
        req,
      };
      responses.push(call);
      if (reply) return reply(call);
      return okResponse({ text: decisionText(call.ids[call.ids.length - 1] ?? 'c1') });
    }
    return { kind: 'json', status: 404, body: { error: { message: 'unexpected path' } } };
  });
  return Object.assign(fake, { responses });
}
