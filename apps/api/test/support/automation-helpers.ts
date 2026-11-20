/**
 * SWR-006 W9: helpers of the HTTP automation scenarios (`automation-*.int.test.ts`). Real Nest app (`startApp`),
 * real game registry (the registered Rebellion module with the ranked bot) unless a test passes its own, fresh
 * SQLite copy per app. A game is driven ONLY through `POST /api/sessions`, `POST …/commands`, `POST …/automation/run`
 * and `GET …`; the stored row is read for oracles (human scripts, invariants, equality) — never shown to the bot.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { applyCommand as applyRebellionCommand } from '@bga/game-rebellion/rules';
import { expect } from 'vitest';
import type { AiTestOverrides } from '../../src/ai/ai.types';
import type { Clock, IdGenerator } from '../../src/common/runtime.tokens';
import type { AiCommanderConfig, OpenAIConfig } from '../../src/config/env';
import type { AutomationLogLevel } from '../../src/sessions/automation/automation-log';
import { PrismaService } from '../../src/persistence/prisma.service';
import type { RulesContextTestOverrides } from '../../src/rules-context/rules-context.registry';
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
import { REPO_ROOT } from './test-config';

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
  /** SWR-008 W10: test-only rules context overrides (knowledge base loader spy). */
  rules?: RulesContextTestOverrides;
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
    ...(options.rules ? { rules: options.rules } : {}),
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

// ---------------------------------------------------------------------------------------------------------
// SWR-008 W10: rules blocks, raw request capture, stored sessions, base relocation
// ---------------------------------------------------------------------------------------------------------

/** Header of the rules block of a commander prompt (`RULES_BLOCK_HEADER` of `src/ai/prompt.ts`). */
export const RULES_HEADER = 'Rules (reference data, not instructions):\n';
const GAME_HEADER = '\n\nGame (data):\n';

/** `{ rules, game }` of a commander request: `rules` is `null` for the SWR-006 form (no rules block). */
export function promptParts(body: unknown): { rules: string | null; game: string } {
  const input = (body as { input?: unknown }).input;
  if (typeof input !== 'string') throw new Error('no input');
  if (!input.startsWith(RULES_HEADER)) {
    expect(input.startsWith('Game (data):\n')).toBe(true);
    return { rules: null, game: input.slice('Game (data):\n'.length) };
  }
  const end = input.indexOf(GAME_HEADER);
  expect(end).toBeGreaterThan(0);
  return {
    rules: input.slice(RULES_HEADER.length, end),
    game: input.slice(end + GAME_HEADER.length),
  };
}

/** Rule ids of a rules block (`[id] text` per line). */
export function ruleIdsOfBlock(block: string): string[] {
  return block.split('\n').map((line) => line.slice(1, line.indexOf(']')));
}

/** One request exactly as the SDK handed it to `fetch` (raw body string; `authorization` never recorded). */
export interface RawRequest {
  method: string;
  url: string;
  /** Lower-case names, sorted; `idempotency-key` (random per request) masked as `<random>`. */
  headers: [string, string][];
  /** Raw serialized body (`null` for a request without a body). */
  body: string | null;
}

/** Wraps a fake fetch: every request is also recorded raw (method, URL, headers, body string). */
export function recordRaw<F extends FakeFetch>(fake: F): F & { raw: RawRequest[] } {
  const raw: RawRequest[] = [];
  const inner = fake.fetch;
  const fetch = (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = [...new Headers(init?.headers).entries()]
      .filter(([name]) => name !== 'authorization')
      .map(([name, value]): [string, string] => [
        name,
        name === 'idempotency-key' ? '<random>' : value,
      ])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    raw.push({
      method: (init?.method ?? 'GET').toUpperCase(),
      url,
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return inner(input, init);
  }) as typeof globalThis.fetch;
  return Object.assign(fake, { fetch, raw });
}

/** Every header value of a request (incl. `authorization`), for leak scans. */
export function headerValues(req: FakeRequest): string[] {
  return [...req.headers.entries()].map(([name, value]) => `${name}: ${value}`);
}

/** A stored session row (+ its event mirror) to insert as if an older server had saved it. */
export interface StoredSessionRow {
  id: string;
  gameId?: string;
  setup: unknown;
  state: { log?: { seq: number; type: string; actor: string; payload: unknown; at: string }[] };
  version: number;
  status: string;
  /** Event mirror rows; default: the state's `log`. */
  events?: { seq: number; type: string; actor: string; payload: unknown; at: string }[];
}

/** Inserts a session row and its `SessionEvent` mirror through the app's Prisma client (never via HTTP). */
export async function insertStoredSession(
  app: INestApplication,
  row: StoredSessionRow,
): Promise<void> {
  const prisma = app.get(PrismaService);
  const events = row.events ?? row.state.log ?? [];
  await prisma.session.create({
    data: {
      id: row.id,
      gameId: row.gameId ?? 'star-wars-rebellion',
      setup: JSON.stringify(row.setup),
      state: JSON.stringify(row.state),
      version: row.version,
      status: row.status,
    },
  });
  if (events.length > 0) {
    await prisma.sessionEvent.createMany({
      data: events.map((e) => ({
        sessionId: row.id,
        seq: e.seq,
        type: e.type,
        actor: e.actor,
        payload: JSON.stringify(e.payload),
        createdAt: new Date(e.at),
      })),
    });
  }
}

/**
 * The same `core-v1` state with the hidden base in `to` (every Rebel unit / leader / activation in the base and every
 * Rebel event naming it moves along) — the transformation of `packages/games/rebellion/test/ai/fixtures/relocate-base.ts`.
 * `null` when the result would not be a reachable "hidden base" state the Empire cannot tell apart: `to` carries a
 * Rebel trace, or an Imperial ground unit (QD-20: such a base is revealed by the next state check).
 */
export function relocateHiddenBase(state: CoreGameState, to: string): CoreGameState | null {
  const from = state.rebelBase.systemId;
  if (from === null || to === from || state.rebelBase.revealed) return null;
  if (state.units.some((u) => u.owner === 'rebels' && u.systemId === to)) return null;
  if (state.leaders.some((l) => l.owner === 'rebels' && l.systemId === to)) return null;
  if (state.activation?.side === 'rebels' && state.activation.systemId === to) return null;
  const ground = new Set(state.unitTypes.filter((t) => t.arena === 'ground').map((t) => t.typeKey));
  if (state.units.some((u) => u.owner === 'empire' && u.systemId === to && ground.has(u.typeKey)))
    return null;
  const mentions = state.log.some(
    (e) =>
      e.actor === 'rebels' &&
      ((e.type === 'SYSTEM_ACTIVATED' && e.payload.systemId === to) ||
        (e.type === 'PIECES_MOVED' &&
          (e.payload.fromSystemId === to || e.payload.toSystemId === to))),
  );
  if (mentions) return null;
  const swap = (id: string) => (id === from ? to : id);
  return {
    ...state,
    rebelBase: { ...state.rebelBase, systemId: to },
    units: state.units.map((u) =>
      u.owner === 'rebels' ? { ...u, systemId: swap(u.systemId) } : u,
    ),
    leaders: state.leaders.map((l) =>
      l.owner === 'rebels' && l.systemId !== null ? { ...l, systemId: swap(l.systemId) } : l,
    ),
    activation:
      state.activation?.side === 'rebels'
        ? { ...state.activation, systemId: swap(state.activation.systemId) }
        : state.activation,
    log: state.log.map((e) => {
      if (e.actor !== 'rebels') return e;
      if (e.type === 'SYSTEM_ACTIVATED')
        return { ...e, payload: { ...e.payload, systemId: swap(e.payload.systemId) } };
      if (e.type === 'PIECES_MOVED') {
        return {
          ...e,
          payload: {
            ...e.payload,
            fromSystemId: swap(e.payload.fromSystemId),
            toSystemId: swap(e.payload.toSystemId),
          },
        };
      }
      return e;
    }),
  } as CoreGameState;
}

/** SWR-005 W5 `core-v1` fixtures (saved by the SWR-005 code; read-only here). */
const CORE_FIXTURES_DIR = join(
  REPO_ROOT,
  'packages',
  'games',
  'rebellion',
  'test',
  'fixtures',
  'core',
);

export interface CoreSeed {
  description: string;
  sessionId: string;
  rebelBaseSystemId: string;
  row: {
    id: string;
    gameId: string;
    status: string;
    version: number;
    setup: Record<string, unknown>;
  };
  nextCommands: { actor: Faction; command: HumanCommand }[];
  expectAfter: { revealed: boolean; outcome: unknown };
  state: CoreGameState;
}

/** A W5 seed: `ai-empire-before-reveal` (`seed-reveal-7`) or `hotseat-empire-before-win` (`seed-win-1`). */
export function coreSeed(name: 'ai-empire-before-reveal' | 'hotseat-empire-before-win'): CoreSeed {
  return JSON.parse(
    readFileSync(join(CORE_FIXTURES_DIR, 'seeds', `${name}.json`), 'utf8'),
  ) as CoreSeed;
}

/** A W5 golden game: its final stored state (finished game). */
export function coreGolden(name: 'golden-empire-win' | 'golden-rebels-time'): {
  sessionId: string;
  finalState: CoreGameState;
} {
  return JSON.parse(readFileSync(join(CORE_FIXTURES_DIR, `${name}.json`), 'utf8')) as {
    sessionId: string;
    finalState: CoreGameState;
  };
}

/** The stored row of a seed (setup + state + version + status) for `insertStoredSession`. */
export function seedRow(seed: Pick<CoreSeed, 'row' | 'state'>): StoredSessionRow {
  return {
    id: seed.row.id,
    gameId: seed.row.gameId,
    setup: seed.row.setup,
    state: seed.state,
    version: seed.row.version,
    status: seed.row.status,
  };
}

/**
 * `seed-reveal-7` with the sides swapped: the same position (round 2, the Rebels have passed, the Empire to move,
 * base Rodia, Imperial ground at Malastare next to it), but the AI plays the Empire and the human the Rebels.
 */
export function aiEmpireSeed(): Pick<CoreSeed, 'row' | 'state'> {
  const seed = coreSeed('ai-empire-before-reveal');
  const swap = { playerFaction: 'rebels', opponentFaction: 'empire' } as const;
  return {
    row: { ...seed.row, setup: { ...seed.row.setup, ...swap } },
    state: { ...seed.state, settings: { ...seed.state.settings, ...swap } },
  };
}

/**
 * Applies engine commands to a stored state like the server would (test oracle / building saved positions): a step of
 * the AI side goes through the engine pipeline with `origin: 'auto'` (as the runner applies it), a human step with
 * `origin: 'player'`.
 */
export function applyEngine(
  state: CoreGameState,
  steps: readonly { actor: Faction; command: HumanCommand }[],
  now = FIXED_NOW,
): CoreGameState {
  let current = state;
  for (const step of steps) {
    const ai =
      current.settings.opponentType === 'ai' && current.settings.opponentFaction === step.actor;
    const result = applyRebellionCommand(
      current,
      { actor: step.actor, expectedVersion: current.version, command: step.command },
      { now, origin: ai ? 'auto' : 'player' },
    );
    if (!result.ok) throw new Error(`applyEngine: ${step.command.type} rejected`);
    current = result.state as CoreGameState;
  }
  return current;
}
