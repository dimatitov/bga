/**
 * SWR-010 W5 — helpers of the Physical Sync v0 / card integration tests (plan-backend §5, §9, §10.1).
 * A `physical_companion` game against the AI, driven over HTTP with raw envelopes (the table commands
 * `CONFIRM_TABLE_TASK` / `REGISTER_CARD` are not bot candidates, so `AutomatedGame.send` does not type them).
 */
import type { INestApplication } from '@nestjs/common';
import {
  AutomationRunSummarySchema,
  SessionAutomationSchema,
  SessionCommandOkSchema,
  type AutomationRunSummary,
  type SessionAutomation,
} from '@bga/platform';
import {
  CorePlayerViewSchema,
  probeDefinitionId,
  type CoreGameState,
  type CorePlayerView,
  type Difficulty,
  type Faction,
  type RebellionSetupInput,
} from '@bga/game-rebellion/schema';
import { expect } from 'vitest';
import { commanderFake, runPath, type CommanderCall } from './automation-helpers';
import { storedState, type WireEvent } from './core-fixtures';
import { R, postCommand } from './fixtures';
import { decisionText, okResponse } from './openai-fake-fetch';
import { api } from './test-app';

export function physicalVsAi(
  playerFaction: Faction,
  aiDifficulty: Difficulty = 'normal',
): RebellionSetupInput {
  return {
    playerFaction,
    opponentType: 'ai',
    aiDifficulty,
    ruleset: 'base',
    gameMode: 'physical_companion',
  };
}

/** Any engine command of the human (game commands and the two table commands). */
export type AnyCommand =
  | { type: 'PASS' }
  | { type: 'FINISH_ACTIVATION' }
  | { type: 'ACTIVATE_SYSTEM'; leaderId: string; systemId: string }
  | { type: 'MOVE_PIECES'; pieceIds: string[]; fromSystemId: string; toSystemId: string }
  | { type: 'CONFIRM_TABLE_TASK'; taskId: string }
  | { type: 'REGISTER_CARD'; zoneId: string; definitionId: string };

export const confirmTask = (taskId: string): AnyCommand => ({ type: 'CONFIRM_TABLE_TASK', taskId });
export const registerCard = (systemId: string, zoneId = 'rebels-location'): AnyCommand => ({
  type: 'REGISTER_CARD',
  zoneId,
  definitionId: probeDefinitionId(systemId),
});

export interface Ok {
  view: CorePlayerView;
  events: WireEvent[];
  summary: AutomationRunSummary;
}

/**
 * Commander fake: the model picks the first `ACTIVATE_SYSTEM` action when there is one (so the AI creates table
 * tasks), otherwise the first action. Every request is recorded in `responses`.
 */
export function activatingCommander() {
  return commanderFake((call: CommanderCall) => {
    const input = String(call.body.input);
    const data = JSON.parse(
      input.slice(input.indexOf('Game (data):\n') + 'Game (data):\n'.length),
    ) as {
      availableActions?: { id: string; type: string }[];
    };
    const actions = data.availableActions ?? [];
    const pick = actions.find((a) => a.type === 'ACTIVATE_SYSTEM') ?? actions[0];
    return okResponse({ text: decisionText(pick?.id ?? call.ids[0] ?? 'c1', 'Move.') });
  });
}

/** A physical game over HTTP: every reply body is kept for leak scans. */
export class PhysicalGame {
  readonly replies: { label: string; status: number; body: unknown }[] = [];

  constructor(
    readonly app: INestApplication,
    readonly id: string,
    readonly human: Faction,
    public version: number,
  ) {}

  static async create(
    app: INestApplication,
    setup: RebellionSetupInput,
  ): Promise<{ game: PhysicalGame; view: CorePlayerView; automation: SessionAutomation }> {
    const res = await api(app).post('/api/sessions').send({ gameId: R, setup });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body as { sessionId: string; view: unknown; automation: unknown };
    const view = CorePlayerViewSchema.parse(body.view);
    const game = new PhysicalGame(app, body.sessionId, setup.playerFaction, view.version);
    game.replies.push({ label: 'POST /api/sessions', status: 201, body: res.body });
    return { game, view, automation: SessionAutomationSchema.parse(body.automation) };
  }

  async post(command: AnyCommand, expectedVersion = this.version) {
    const res = await postCommand(this.app, this.id, {
      actor: this.human,
      expectedVersion,
      command,
    });
    this.replies.push({ label: `POST ${command.type}`, status: res.status, body: res.body });
    return { status: res.status, body: res.body as unknown };
  }

  async send(command: AnyCommand): Promise<Ok> {
    const res = await this.post(command);
    expect(res.status, `${command.type} → ${JSON.stringify(res.body)}`).toBe(200);
    const body = SessionCommandOkSchema.parse(res.body);
    const ok: Ok = {
      view: CorePlayerViewSchema.parse(body.view),
      events: body.events as WireEvent[],
      summary: AutomationRunSummarySchema.parse(body.automation),
    };
    this.version = ok.view.version;
    return ok;
  }

  async run(): Promise<Ok> {
    const res = await api(this.app).post(runPath(this.id)).send({});
    this.replies.push({ label: 'POST /automation/run', status: res.status, body: res.body });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const body = SessionCommandOkSchema.parse(res.body);
    const ok: Ok = {
      view: CorePlayerViewSchema.parse(body.view),
      events: body.events as WireEvent[],
      summary: AutomationRunSummarySchema.parse(body.automation),
    };
    this.version = ok.view.version;
    return ok;
  }

  async get(): Promise<{ view: CorePlayerView; automation: SessionAutomation; raw: unknown }> {
    const res = await api(this.app).get(`/api/sessions/${this.id}`);
    expect(res.status).toBe(200);
    this.replies.push({ label: 'GET /api/sessions/:id', status: 200, body: res.body });
    const body = res.body as { view: unknown; automation: unknown };
    return {
      view: CorePlayerViewSchema.parse(body.view),
      automation: SessionAutomationSchema.parse(body.automation),
      raw: res.body,
    };
  }

  state(): Promise<CoreGameState> {
    return storedState(this.app, this.id);
  }

  /** Confirms every confirmable head task; stops at an empty queue or a `registerBase` head. */
  async confirmAll(): Promise<Ok | null> {
    let last: Ok | null = null;
    for (let i = 0; i < 50; i += 1) {
      const head = (await this.state()).table?.tasks[0];
      if (!head || head.completion !== 'confirm') return last;
      last = await this.send(confirmTask(head.id));
    }
    throw new Error('confirmAll: the queue does not drain');
  }
}

/** Tokens of a card id (`probe-x` must not match inside `probe-x-y`): whole JSON string or `probe-x#…`. */
export function containsCardToken(json: string, token: string): boolean {
  return json.includes(`"${token}"`) || json.includes(`"${token}#`);
}

/** Instance + definition ids of the cards in a stored zone (the search tokens of the leak matrix). */
export function zoneTokens(state: CoreGameState, zoneId: string): string[] {
  const zone = state.cards?.pile.zones.find((z) => z.id === zoneId);
  if (!zone) return [];
  const defs = zone.cards.map(
    (instanceId) =>
      state.cards?.pile.instances.find((i) => i.id === instanceId)?.definitionId ?? '',
  );
  return [...zone.cards, ...defs.filter((d) => d !== '')];
}
