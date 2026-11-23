/**
 * SWR-010 W5 — the card leak matrix over HTTP (plan-backend §10.1, channels owned by W5; AC-7, AC-8, AC-15, AC-18,
 * AC-23; test-cases.md LK group at integration level). Real Rebellion module and runner; the commander in OpenAI
 * mode against a FAKE fetch (no network). Secrets:
 * - S1 the AI Rebels' Location card (before a reveal) — never in a client payload;
 * - S2 the AI Empire's probe cards — never in a client payload (the human Rebels see only the count);
 * - S3 the human's secret cards (human Empire's probes) — never in an AI-addressed channel;
 * - S4 the probe deck (content / order) — in no channel at all;
 * - S5 the human Rebels' base card (registered Location) — never in an AI-addressed channel before a reveal.
 * Channels: create / command / automation-run responses (view + events + summary), GET session, GET /api/sessions,
 * 422 / 409 error bodies, commander request bodies (prompt incl. situation, candidates, rules block), AiUsage rows,
 * `GET /api/dev/ai/sessions/:id/decisions`, server log lines (automation + AI sinks).
 * Tokens: `probe-<system>` / `probe-<system>#1` as whole ids (`probe-x` never matches inside `probe-x-y`).
 */
import type { INestApplication } from '@nestjs/common';
import { REBELLION_ERROR_MESSAGE_KEYS as K, type CoreGameState } from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import {
  commanderFake,
  startRebellionApp,
  usageRows,
  type RebellionApp,
} from './support/automation-helpers';
import { expectError } from './support/fixtures';
import { enabledOpenAI } from './support/openai-fake-fetch';
import {
  PhysicalGame,
  activatingCommander,
  confirmTask,
  physicalVsAi,
  registerCard,
  zoneTokens,
} from './support/physical-helpers';
import { api, createTestDb, removeTestDb, type TestDb } from './support/test-app';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

type Fake = ReturnType<typeof commanderFake>;

async function open(
  id: string,
  fake: Fake = commanderFake(),
): Promise<RebellionApp & { fake: Fake }> {
  const db = createTestDb();
  dbs.push(db);
  const started = await startRebellionApp(db, {
    ids: [id],
    fake,
    openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: 5 }),
    aiCommander: { provider: 'openai' },
  });
  apps.push(started.app);
  return { ...started, fake };
}

function digitalVsAi(playerFaction: 'rebels' | 'empire') {
  return { ...physicalVsAi(playerFaction), gameMode: 'digital' as const };
}

/** Raw-text scan for whole card ids (any JSON escaping): `probe-x` / `probe-x#1`, not `probe-x-y`. */
function leaks(text: string, tokens: readonly string[]): string[] {
  return [...new Set(tokens)].filter((t) =>
    new RegExp(`${t.replace(/[#-]/g, (c) => `\\${c}`)}(?![A-Za-z0-9-])`).test(text),
  );
}

/** Every AI-addressed / server-side channel of a session as text. */
async function aiChannels(started: RebellionApp & { fake: Fake }, sessionId: string) {
  const diag = await api(started.app).get(`/api/dev/ai/sessions/${sessionId}/decisions`);
  expect(diag.status, JSON.stringify(diag.body)).toBe(200);
  return {
    prompts: started.fake.responses.map((c) => JSON.stringify(c.body)).join('\n'),
    usage: JSON.stringify(await usageRows(started.app, sessionId)),
    diagnostics: JSON.stringify(diag.body),
    logs: [...started.aiLogs, ...started.automationLogs.map((l) => l.line)].join('\n'),
  };
}

/** Plays `n` rounds: the human passes whenever it is to move (each pass ends the round after the AI's turn). */
async function passRounds(game: PhysicalGame, n: number): Promise<CoreGameState> {
  for (let i = 0; i < n; i += 1) {
    const state = await game.state();
    if (state.outcome !== null) return state;
    await game.send({ type: 'PASS' });
    await game.run();
    await game.get();
    const list = await api(game.app).get('/api/sessions');
    game.replies.push({ label: 'GET /api/sessions', status: list.status, body: list.body });
  }
  return game.state();
}

describe('card leak matrix (W5 channels)', () => {
  it('human Rebels vs AI Empire (digital): S2 / S4 never reach the client; S4 / S5 never reach the AI channels', async () => {
    const id = 'w5-leak-reb';
    const started = await open(id);
    const { game } = await PhysicalGame.create(started.app, digitalVsAi('rebels'));
    const base = (await game.state()).rebelBase.systemId;
    // Error bodies: table commands in a digital game.
    expectError(
      await game.post(confirmTask('t-1-1')),
      422,
      'ILLEGAL_COMMAND',
      K.commandUnavailable,
    );
    expectError(
      await game.post(registerCard(base)),
      422,
      'ILLEGAL_COMMAND',
      K.registrationUnavailable,
    );
    expectError(await game.post({ type: 'PASS' }, game.version + 5), 409, 'VERSION_CONFLICT');
    const final = await passRounds(game, 3);
    expect(final.round).toBeGreaterThanOrEqual(3);

    const empireHand = zoneTokens(final, 'empire-probes');
    const deck = zoneTokens(final, 'probe-deck');
    expect(empireHand.length).toBeGreaterThanOrEqual(4);
    expect(deck.length).toBeGreaterThan(0);
    // Client channels: no Imperial probe, no deck card (S2, S4).
    expect(game.replies.length).toBeGreaterThan(10);
    for (const r of game.replies) {
      expect(leaks(JSON.stringify(r.body), [...empireHand, ...deck]), r.label).toEqual([]);
    }
    // The client sees the count only (A-9).
    const view = (await game.get()).view;
    const probes = view.cards?.zones.find((z) => z.id === 'empire-probes');
    expect(probes).toMatchObject({ count: empireHand.length / 2, cards: null });
    expect(view.cards?.zones.find((z) => z.id === 'probe-deck')?.cards).toBeNull();

    // AI-addressed and server channels: no deck card (S4) and — before a reveal — no Location card (S5).
    const ai = await aiChannels(started, id);
    const location = final.rebelBase.revealed ? [] : zoneTokens(final, 'rebels-location');
    for (const [name, text] of Object.entries(ai)) {
      expect(leaks(text, [...deck, ...location]), name).toEqual([]);
    }
    // The AI Empire's prompt names its own probes as systems only (situation line, §8.1).
    expect(ai.prompts).toContain('Your probe cards (the Rebel base is NOT in these systems)');
    // Server channels never carry card ids at all (diagnostics / usage / logs hold no situation).
    for (const name of ['usage', 'diagnostics', 'logs'] as const) {
      expect(
        leaks(ai[name], [...empireHand, ...deck, ...zoneTokens(final, 'rebels-location')]),
        name,
      ).toEqual([]);
    }
  });

  it('human Empire vs AI Rebels (digital): S1 / S4 never reach the client; S3 / S4 never reach the AI channels', async () => {
    const id = 'w5-leak-emp';
    const started = await open(id);
    const { game } = await PhysicalGame.create(started.app, digitalVsAi('empire'));
    const final = await passRounds(game, 3);
    expect(final.rebelBase.revealed).toBe(false);
    const location = zoneTokens(final, 'rebels-location');
    const deck = zoneTokens(final, 'probe-deck');
    const humanHand = zoneTokens(final, 'empire-probes');
    expect(location).toHaveLength(2);
    expect(humanHand.length).toBeGreaterThanOrEqual(4);
    expectError(
      await game.post(confirmTask('t-9-9')),
      422,
      'ILLEGAL_COMMAND',
      K.commandUnavailable,
    );

    for (const r of game.replies) {
      expect(leaks(JSON.stringify(r.body), [...location, ...deck]), r.label).toEqual([]);
    }
    // The human Empire sees its own probes (positive control of the scan: the tokens are found where legal).
    const view = (await game.get()).view;
    expect(leaks(JSON.stringify(view), humanHand).length).toBe(humanHand.length);
    expect(view.cards?.zones.find((z) => z.id === 'empire-probes')?.cards?.length).toBe(
      humanHand.length / 2,
    );

    const ai = await aiChannels(started, id);
    expect(started.fake.responses.length).toBeGreaterThan(0);
    for (const [name, text] of Object.entries(ai)) {
      expect(leaks(text, [...humanHand, ...deck]), name).toEqual([]);
    }
    // The AI Rebels know only the public counts.
    expect(ai.prompts).toContain('The Empire holds');
    expect(ai.prompts).not.toContain('Your probe cards');
  });

  it('human Rebels vs AI Empire (physical): no AI call before the registration; S5 never reaches the AI; tasks carry no Imperial probe', async () => {
    const id = 'w5-leak-phys-reb';
    const started = await open(id, activatingCommander());
    const { game, view } = await PhysicalGame.create(started.app, physicalVsAi('rebels'));
    const eligible = view.table?.registration?.eligibleDefinitionIds ?? [];
    const target = (eligible[eligible.length - 1] as string).replace(/^probe-/, '');
    await game.send(registerCard(target));
    await game.confirmAll();
    expect(started.fake.responses).toHaveLength(0);
    // Play rounds: confirm every task, pass when the Rebels are to move.
    for (let i = 0; i < 12; i += 1) {
      const state = await game.state();
      if (state.outcome !== null || state.round > 3) break;
      if ((state.table?.tasks.length ?? 0) > 0) await game.confirmAll();
      else if (state.activeSide === 'rebels') await game.send({ type: 'PASS' });
      else await game.run();
    }
    const final = await game.state();
    const empireHand = zoneTokens(final, 'empire-probes');
    const deck = zoneTokens(final, 'probe-deck');
    expect(empireHand.length).toBeGreaterThan(0);
    // Client channels after the registration (the eligible list is public before it): S2 / S4.
    const afterRegistration = game.replies.slice(2);
    for (const r of afterRegistration) {
      expect(leaks(JSON.stringify(r.body), [...empireHand, ...deck]), r.label).toEqual([]);
    }
    // Positive control: the human Rebels' own view names their Location card.
    const own = (await game.get()).view;
    expect(leaks(JSON.stringify(own), zoneTokens(final, 'rebels-location')).length).toBeGreaterThan(
      0,
    );
    // Table tasks for the human Rebels: an informational count step only.
    const allTasks = JSON.stringify(final.table);
    expect(leaks(allTasks, empireHand)).toEqual([]);
    // AI channels: the registered Location (S5) and the deck (S4) never appear.
    const ai = await aiChannels(started, id);
    expect(started.fake.responses.length).toBeGreaterThan(0);
    const location = final.rebelBase.revealed ? [] : zoneTokens(final, 'rebels-location');
    for (const [name, text] of Object.entries(ai)) {
      expect(leaks(text, [...deck, ...location]), name).toEqual([]);
    }
  });
});
