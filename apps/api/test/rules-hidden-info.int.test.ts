/**
 * SWR-008 W10 — hidden information with the rules context ON (AC-6; R-1, QD-6, QD-7; test-cases.md TC-H-01, TC-H-03,
 * TC-H-04, TC-H-05, TC-H-06, TC-H-07, TC-H-08; PO §10 items 5 and 6). Real Nest app, real Rebellion module and
 * knowledge base, REAL OpenAI SDK on a fake fetch (never the network), sentinel key. Every request is also recorded
 * RAW (method, URL, header set, serialized body exactly as handed to `fetch`; only `authorization` is not recorded and
 * the random per-request `idempotency-key` value is masked).
 *
 * - TC-H-01 (AC-6a, AI Empire): two DB copies hold the SAME session (same id) differing ONLY in where the hidden base
 *   is (`relocateHiddenBase`, never under Imperial ground — QD-20); human Rebels R-PASSIVE / R-ACTIVE. Every raw request
 *   before a reveal is byte-identical (instructions + input incl. the rules block + schema + headers).
 * - TC-H-03 (AC-6a, AI Rebels, QD-6: the Empire has no private state in core-v1): everything outside the Rebels' view
 *   varies — another session id / budget key, another spent budget (an AiUsage row), another clock — the raw requests
 *   are byte-identical.
 * - TC-H-04 / TC-H-08 (AC-6b): AI Empire games to the end (2 session ids × R-ACTIVE / R-PASSIVE): before the reveal no
 *   request names the base outside the Empire's OWN public context (candidates it may activate, its own forces /
 *   leaders / activation, the list of possible locations), never in the rules block, never its localized name, never a
 *   Rebel unit standing in the base, never `rebelBase`; logs and AiUsage rows never name the base.
 * - TC-H-05 (AC-6c): no session id / budget key, sentinel key (outside `authorization`), budget sums, DB path or
 *   knowledge-base root in any request; no `metadata` / `user` / `safety_identifier` / `prompt_cache_key`.
 * - TC-H-06: the Empire inside its activation of system X: base = X vs base = Y → equal decision points / rules query /
 *   requests; the reveal happens only on FINISH and only where X is the base.
 * - TC-H-07 (AC-6d, QD-7): AI Rebels, human Empire, dev diagnostics endpoint: two copies with the base in different
 *   systems → every Empire-addressed body (incl. the diagnostics) clean; rule ids / counts / chars / version,
 *   fallbacks, tokens and cost of the diagnostics equal in both copies (fake usage constants, Q-BE-1).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  AiSessionDecisionsResponseSchema,
  AutomationDecisionPointSchema,
  type AutomationDecisionPoint,
} from '@bga/platform';
import { rebellionServerModule } from '@bga/game-rebellion/server';
import { chooseRebelBase } from '@bga/game-rebellion/rules';
import { coreDataBaseV1 } from '@bga/game-rebellion/scenario';
import {
  CoreGameStateV3Schema,
  eligibleRebelBaseSystemIds,
  type CoreGameState,
} from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/persistence/prisma.service';
import { TMP_DIR } from './global-setup';
import { swapLocationCard } from './support/location-card';
import {
  AutomatedGame,
  aiEmpireSeed,
  applyEngine,
  commanderFake,
  empireVsAi,
  insertStoredSession,
  promptParts,
  rebelsVsAi,
  recordRaw,
  relocateHiddenBase,
  ruleIdsOfBlock,
  runPath,
  seedRow,
  startRebellionApp,
  usageRows,
  type CommanderCall,
  type RawRequest,
  type RebellionApp,
} from './support/automation-helpers';
import { storedState } from './support/core-fixtures';
import { tickingClock } from './support/fixtures';
import { baseLeaks } from './support/hidden-scan';
import { SENTINEL_KEY, decisionText, enabledOpenAI, okResponse } from './support/openai-fake-fetch';
import {
  activeRebels,
  distancesFrom,
  huntingEmpire,
  passiveHuman,
  type HumanScript,
} from './support/scripted-empire';
import { REPO_ROOT } from './support/test-config';
import { api, createTestDb, removeTestDb, type TestDb } from './support/test-app';
import type { Clock } from '../src/common/runtime.tokens';

const apps: INestApplication[] = [];
const dbs: TestDb[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const db of dbs.splice(0)) removeTestDb(db);
});

/** Budget of every session here; its decimal and micro-USD forms must never reach a request (TC-H-05). */
const MAX_COST_USD = 4.321;
const BUDGET_MARKERS = ['4.321', '4321000'];
const KB_ROOT_MARKERS = [REPO_ROOT, join(REPO_ROOT, 'packages', 'games', 'rebellion', 'knowledge')];

type Fake = ReturnType<typeof commanderFake> & { raw: RawRequest[] };

interface Started extends RebellionApp {
  db: TestDb;
  fake: Fake;
}

async function openaiApp(
  ids: string[],
  reply: (
    call: CommanderCall,
  ) => ReturnType<typeof okResponse> | Promise<ReturnType<typeof okResponse>>,
  options: { clock?: Clock; maxSteps?: number } = {},
): Promise<Started> {
  const db = createTestDb();
  dbs.push(db);
  const fake = recordRaw(commanderFake(reply));
  const started = await startRebellionApp(db, {
    ids,
    fake,
    ...(options.clock ? { clock: options.clock } : {}),
    openai: enabledOpenAI({ maxRetries: 0, maxCostPerSessionUsd: MAX_COST_USD }),
    aiCommander: {
      provider: 'openai',
      rulesContext: 'on',
      ...(options.maxSteps ? { maxSteps: options.maxSteps } : {}),
    },
  });
  apps.push(started.app);
  return { ...started, db, fake };
}

/** Deterministic "model": the second candidate (a pure function of the request). */
const secondCandidate = (call: CommanderCall) =>
  okResponse({ text: decisionText(call.ids[1] ?? call.ids[0] ?? 'c1', 'Hold the line.') });

function actionsOf(call: CommanderCall): { id: string; type: string; summary?: string }[] {
  return (
    JSON.parse(promptParts(call.body).game) as {
      availableActions: { id: string; type: string; summary?: string }[];
    }
  ).availableActions;
}

/** An eligible base for `state` that the Empire cannot tell from the real one (see `relocateHiddenBase`). */
function otherBase(state: CoreGameState): { to: string; relocated: CoreGameState } {
  const base = state.rebelBase.systemId as string;
  const empireAt = new Set(state.units.filter((u) => u.owner === 'empire').map((u) => u.systemId));
  const activatedByEmpire = new Set(
    state.log
      .filter((e) => e.actor === 'empire' && e.type === 'SYSTEM_ACTIVATED')
      .map((e) => (e.payload as { systemId: string }).systemId),
  );
  const farness = (sys: string) =>
    Math.min(...[...empireAt].map((e) => distancesFrom(state, sys).get(e) ?? 99));
  const options = eligibleRebelBaseSystemIds(coreDataBaseV1)
    .filter((sys) => sys !== base && !empireAt.has(sys) && !activatedByEmpire.has(sys))
    .sort((x, y) => farness(y) - farness(x) || (x < y ? -1 : 1));
  for (const to of options) {
    const moved = relocateHiddenBase(state, to);
    // SWR-010: the Location card moves with the base (swapped with `to`'s deck card).
    const relocated = moved && swapLocationCard(moved, base, to);
    if (relocated) return { to, relocated: CoreGameStateV3Schema.parse(relocated) };
  }
  throw new Error('no other base');
}

async function storeState(app: INestApplication, id: string, state: CoreGameState) {
  await app.get(PrismaService).session.update({
    where: { id },
    data: { state: JSON.stringify(state) },
  });
}

/** TC-H-05: nothing private in any request (body, URL, headers; `authorization` may hold only the key). */
function expectNothingPrivate(fake: Fake, sessionIds: readonly string[], db: TestDb) {
  const markers = [
    ...sessionIds,
    SENTINEL_KEY,
    ...BUDGET_MARKERS,
    db.file,
    db.url,
    TMP_DIR,
    ...KB_ROOT_MARKERS,
  ];
  for (const raw of fake.raw) {
    const text = `${raw.method} ${raw.url}\n${raw.headers.map(([n, v]) => `${n}: ${v}`).join('\n')}\n${raw.body ?? ''}`;
    for (const marker of markers) expect(text, marker).not.toContain(marker);
  }
  for (const call of fake.responses) {
    for (const field of ['metadata', 'user', 'safety_identifier', 'prompt_cache_key']) {
      expect(call.body, field).not.toHaveProperty(field);
    }
    for (const [name, value] of call.req.headers.entries()) {
      if (name === 'authorization') expect(value).toBe(`Bearer ${SENTINEL_KEY}`);
    }
  }
  expect(fake.raw.length).toBe(fake.calls.length);
}

/** Only the `POST /responses` raw requests. */
function responsesOf(fake: Fake): RawRequest[] {
  return fake.raw.filter((r) => new URL(r.url).pathname.endsWith('/responses'));
}

function logText(started: RebellionApp): string {
  return [...started.aiLogs, ...started.automationLogs.map((l) => l.line)].join('\n');
}

const UNKNOWN = 'Rebel base: unknown.';

describe('SWR-008 W10: hidden information with the rules context on (AC-6)', () => {
  it.each([
    ['R-PASSIVE', passiveHuman],
    ['R-ACTIVE', activeRebels],
  ] as const)(
    'TC-H-01 / TC-H-05: AI Empire, human Rebels %s — two copies differing only in the base send byte-identical raw requests (rules block included) until a reveal',
    async (name, script: HumanScript) => {
      const id = `swr008-w10-h01-${name.toLowerCase()}`;
      const a = await openaiApp([id], secondCandidate);
      const b = await openaiApp([id], secondCandidate);
      const gameA = (await AutomatedGame.create(a.app, rebelsVsAi('normal'))).game;
      const gameB = (await AutomatedGame.create(b.app, rebelsVsAi('normal'))).game;
      const stateA = await gameA.state();
      const baseA = stateA.rebelBase.systemId as string;
      const { to: baseB, relocated } = otherBase(stateA);
      await storeState(b.app, id, relocated);
      let diverged = false;
      let commands = 0;
      for (let i = 0; i < 40; i += 1) {
        const [sa, sb] = [await gameA.state(), await gameB.state()];
        if (sa.outcome !== null || sb.outcome !== null) break;
        if (sa.rebelBase.revealed || sb.rebelBase.revealed) break;
        const [ca, cb] = [script(sa), script(sb)];
        if (JSON.stringify(ca) !== JSON.stringify(cb)) {
          diverged = true; // the human script itself reacts to the base (R-ACTIVE avoids it): stop comparing here
          break;
        }
        await gameA.send(ca);
        await gameB.send(cb);
        commands += 1;
      }
      const ra = responsesOf(a.fake);
      const rb = responsesOf(b.fake);
      // The comparable prefix: both requests made with the base still hidden from the Empire.
      let k = 0;
      while (
        k < Math.min(ra.length, rb.length) &&
        ra[k]!.body!.includes(UNKNOWN) &&
        rb[k]!.body!.includes(UNKNOWN)
      )
        k += 1;
      expect(k).toBeGreaterThanOrEqual(5);
      for (let i = 0; i < k; i += 1) {
        expect(rb[i], `request ${i}`).toEqual(ra[i]);
        const block = promptParts(JSON.parse(ra[i]!.body!)).rules;
        expect(block).not.toBeNull();
        expect(block).not.toContain(baseA);
        expect(block).not.toContain(baseB);
      }
      // The prefix ends only because a game really revealed its base (oracle: the stored state), or the runs ended.
      if (k < ra.length && !ra[k]!.body!.includes(UNKNOWN))
        expect((await gameA.state()).rebelBase.revealed).toBe(true);
      if (k < rb.length && !rb[k]!.body!.includes(UNKNOWN))
        expect((await gameB.state()).rebelBase.revealed).toBe(true);
      if (k < Math.min(ra.length, rb.length)) {
        expect(
          [!ra[k]!.body!.includes(UNKNOWN), !rb[k]!.body!.includes(UNKNOWN)].includes(true),
        ).toBe(true);
      } else {
        expect(ra.length).toBe(rb.length);
      }
      // AiUsage: rule ids / version / sizes of the compared requests are the same multiset in both copies.
      const rulesOf = async (started: Started) =>
        (await usageRows(started.app, id))
          .map((r) =>
            JSON.stringify([
              r.rulesEnabled,
              r.rulesIds,
              r.rulesVersion,
              r.rulesChars,
              r.rulesCount,
            ]),
          )
          .sort();
      if (k === ra.length && k === rb.length) expect(await rulesOf(b)).toEqual(await rulesOf(a));
      expectNothingPrivate(a.fake, [id], a.db);
      expectNothingPrivate(b.fake, [id], b.db);
      for (const [started, base] of [
        [a, baseA],
        [b, baseB],
      ] as const) {
        expect(logText(started)).not.toContain(base);
        expect(JSON.stringify(await usageRows(started.app, id))).not.toContain(base);
      }
      console.log(
        `[swr008-w10-h01] ${name} commands=${commands} identicalRequests=${k} requestsA=${ra.length} requestsB=${rb.length} bases=${baseA}/${baseB} diverged=${diverged}`,
      );
    },
  );

  it('TC-H-03 / TC-H-05 (QD-6): AI Rebels — another session id / budget key, spent budget and clock outside the Rebels view → byte-identical raw requests', async () => {
    const eligible = eligibleRebelBaseSystemIds(coreDataBaseV1);
    const idA = 'swr008-w10-h03-a';
    const base = chooseRebelBase(idA, eligible);
    let n = 0;
    while (chooseRebelBase(`swr008-w10-h03-b-${n}`, eligible) !== base) n += 1;
    const idB = `swr008-w10-h03-b-${n}`;
    const a = await openaiApp([idA], secondCandidate);
    const b = await openaiApp([idB], secondCandidate, { clock: tickingClock() });
    // Another spent budget for B's key (a paid AiUsage row) before the game.
    await b.app.get(PrismaService).aiUsage.create({
      data: {
        id: '00000000-0000-4000-8000-0000000000b3',
        budgetKey: idB,
        provider: 'openai',
        model: 'gpt-6-luna',
        role: 'tactical',
        status: 'ok',
        attempts: 1,
        estimatedCostMicroUsd: 987_654,
        pricingVersion: 'openai-2026-11-08',
        durationMs: 100,
      },
    });
    const gameA = (await AutomatedGame.create(a.app, empireVsAi('hard'))).game;
    const gameB = (await AutomatedGame.create(b.app, empireVsAi('hard'))).game;
    expect(gameA.id).toBe(idA);
    expect(gameB.id).toBe(idB);
    const [sa0, sb0] = [await gameA.state(), await gameB.state()];
    expect(sb0.rebelBase).toEqual(sa0.rebelBase);
    // The Rebels' views differ only in the session id and event times (precondition).
    expect(sb0.log.map((e) => e.at)).not.toEqual(sa0.log.map((e) => e.at));
    let commands = 0;
    for (let i = 0; i < 80; i += 1) {
      const [sa, sb] = [await gameA.state(), await gameB.state()];
      if (sa.outcome !== null) {
        expect(sb.outcome).toEqual(sa.outcome);
        break;
      }
      const command = huntingEmpire(sa);
      expect(huntingEmpire(sb)).toEqual(command);
      await gameA.send(command);
      await gameB.send(command);
      commands += 1;
    }
    const ra = responsesOf(a.fake);
    const rb = responsesOf(b.fake);
    expect(ra.length).toBeGreaterThan(10);
    expect(rb).toEqual(ra);
    expect(a.fake.raw).toEqual(b.fake.raw);
    expectNothingPrivate(a.fake, [idA, idB], a.db);
    expectNothingPrivate(b.fake, [idA, idB], b.db);
    for (const raw of [...ra, ...rb]) expect(raw.body).not.toContain('987654');
    console.log(
      `[swr008-w10-h03] commands=${commands} identicalRequests=${ra.length} base=${base} idB=${idB}`,
    );
  });

  it('TC-H-04 / TC-H-05 / TC-H-08: AI Empire games to the end (2 ids × R-ACTIVE / R-PASSIVE) — no request names the base outside the Empire’s own public context before the reveal', async () => {
    const locale = (lng: 'en' | 'ru') =>
      (
        JSON.parse(
          readFileSync(
            join(
              REPO_ROOT,
              'apps',
              'web',
              'src',
              'games',
              'rebellion',
              'locales',
              lng,
              'data.json',
            ),
            'utf8',
          ),
        ) as { systems: Record<string, string> }
      ).systems;
    const names = [locale('en'), locale('ru')];
    // Situation lines allowed to name any system (the Empire's own pieces / options, public lists).
    const OWN_LINES =
      /^(Possible base locations \(|Your forces: |Your leaders: |Current activation: )/;
    let scanned = 0;
    let gamesEnded = 0;
    const perGame: string[] = [];
    for (const [id, script] of [
      ['swr008-w10-h04-a', activeRebels],
      ['swr008-w10-h04-a2', passiveHuman],
      ['swr008-w10-h04-b', passiveHuman],
      ['swr008-w10-h04-b2', activeRebels],
    ] as const) {
      const seen: { call: CommanderCall; state: CoreGameState }[] = [];
      let started: Started | null = null;
      const s = await openaiApp([id], async (call) => {
        seen.push({ call, state: await storedState(started!.app, id) });
        return secondCandidate(call);
      });
      started = s;
      const { game } = await AutomatedGame.create(s.app, rebelsVsAi('normal'));
      const base = (await game.state()).rebelBase.systemId as string;
      const final = await game.playToEnd(script, { maxCommands: 300 });
      if (final.outcome !== null) gamesEnded += 1;
      let before = 0;
      for (const { call, state } of seen) {
        if (state.rebelBase.revealed) continue;
        before += 1;
        scanned += 1;
        const text = JSON.stringify(call.body);
        expect(text).not.toContain('rebelBase');
        expect(text).toContain(UNKNOWN);
        expect(call.req.url).not.toContain(base);
        for (const [n, v] of call.req.headers.entries()) expect(`${n}: ${v}`).not.toContain(base);
        for (const name of names) {
          const localized = name[base];
          expect(localized).toBeTruthy();
          expect(text).not.toContain(localized!);
        }
        // Rebel units standing in the base (hidden) are never named.
        for (const u of state.units) {
          if (u.owner === 'rebels' && u.systemId === base)
            expect(text).not.toMatch(new RegExp(`\\b${u.id}\\b`));
        }
        const { rules, game: gameBlock } = promptParts(call.body);
        expect(rules).not.toBeNull();
        expect(rules).not.toContain(base);
        const data = JSON.parse(gameBlock) as {
          objective: string;
          situation: string;
          availableActions: { id: string; type: string; target?: string; summary?: string }[];
        };
        expect(data.objective).not.toContain(base);
        for (const line of data.situation.split('\n')) {
          if (OWN_LINES.test(line)) continue;
          expect(line, `situation line names the base: ${line}`).not.toContain(base);
        }
        expect(data.situation).not.toContain(`revealed at ${base}`);
        // Candidates are the Empire's own options: a target / summary may name the base like any other system, but
        // never says it is (or is not) the base.
        for (const action of data.availableActions) {
          if (action.target === base)
            expect(action.summary ?? '').not.toMatch(/revealed base|not the base/);
        }
      }
      expectNothingPrivate(s.fake, [id], s.db);
      expect(logText(s)).not.toContain(base);
      expect(JSON.stringify(await usageRows(s.app, id))).not.toContain(base);
      perGame.push(
        `${id}:${script === activeRebels ? 'R-ACTIVE' : 'R-PASSIVE'}:requests=${seen.length}:beforeReveal=${before}:outcome=${final.outcome?.winner ?? 'none'}`,
      );
    }
    expect(scanned).toBeGreaterThan(20);
    expect(gamesEnded).toBe(4);
    console.log(`[swr008-w10-h04] scannedBeforeReveal=${scanned} ${perGame.join(' ')}`);
  }, 60_000);

  it('TC-H-06: AI Empire inside its activation of X — base = X vs base = Y: equal decision points, rules query and request; the reveal happens only on FINISH and only where X is the base', async () => {
    const position = aiEmpireSeed();
    const id = position.row.id;
    const x = position.state.rebelBase.systemId as string;
    const activated = applyEngine(position.state, [
      { actor: 'empire', command: { type: 'ACTIVATE_SYSTEM', leaderId: 'vader', systemId: x } },
    ]);
    const { to: y, relocated } = otherBase(activated);
    expect(y).not.toBe(x);
    const point = (s: CoreGameState) =>
      AutomationDecisionPointSchema.parse(rebellionServerModule.automation!.decisionPoint(s));
    expect(point(relocated)).toEqual(point(activated));
    expect(point(activated).rulesQuery).toEqual({
      commandTypes: ['FINISH_ACTIVATION', 'MOVE_PIECES'],
      tags: ['base-hidden', 'opponent-passed'],
    });
    // "Model": the first move that brings ground units in (a pure function of the request), then FINISH.
    const pick = (call: CommanderCall) => {
      const actions = actionsOf(call);
      const move = actions.find(
        (c) => c.type === 'MOVE_PIECES' && /\(([1-9]\d*) ground/.test(c.summary ?? ''),
      );
      const finish = actions.find((c) => c.type === 'FINISH_ACTIVATION');
      return okResponse({ text: decisionText((move ?? finish ?? actions[0]!).id) });
    };
    const copies = [] as { started: Started; base: string }[];
    for (const [state, base] of [
      [activated, x],
      [relocated, y],
    ] as const) {
      const started = await openaiApp([id], pick, { maxSteps: 1 });
      await insertStoredSession(started.app, {
        ...seedRow(position),
        state,
        version: state.version,
      });
      copies.push({ started, base });
    }
    const [A, B] = copies as [(typeof copies)[0], (typeof copies)[0]];
    // Step 1 (MOVE vs FINISH): one request each, byte-identical; then Imperial ground stands in X in both copies.
    for (const c of copies) {
      const res = await api(c.started.app).post(runPath(id)).send({});
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    expect(responsesOf(A.started.fake)).toHaveLength(1);
    expect(responsesOf(B.started.fake)).toEqual(responsesOf(A.started.fake));
    const req = A.started.fake.responses[0]!;
    const ids = ruleIdsOfBlock(promptParts(req.body).rules ?? '');
    expect(ids).toContain('rebellion:base.death-star-does-not-reveal');
    expect(ids).not.toContain('rebellion:base.reveal-procedure');
    const [midA, midB] = [
      await storedState(A.started.app, id),
      await storedState(B.started.app, id),
    ];
    const groundIn = (s: CoreGameState) =>
      s.units.filter(
        (u) =>
          u.owner === 'empire' && u.systemId === x && /stormtrooper|at-st|at-at/.test(u.typeKey),
      ).length;
    expect(groundIn(midA)).toBeGreaterThan(0);
    expect(groundIn(midB)).toBe(groundIn(midA));
    expect([midA.rebelBase.revealed, midB.rebelBase.revealed]).toEqual([false, false]);
    // Step 2 point (only FINISH left): equal in both copies, still `base-hidden`.
    const p2a = point(midA) as AutomationDecisionPoint;
    expect(point(midB)).toEqual(p2a);
    expect(p2a.rulesQuery?.tags).toEqual(['base-hidden', 'opponent-passed']);
    // Step 2: FINISH → only the copy with the base in X reveals.
    for (const c of copies) {
      const res = await api(c.started.app).post(runPath(id)).send({});
      expect(res.status).toBe(200);
    }
    const [endA, endB] = [
      await storedState(A.started.app, id),
      await storedState(B.started.app, id),
    ];
    expect(endA.activation).toBeNull();
    expect(endB.activation).toBeNull();
    expect(endA.rebelBase).toEqual({ systemId: x, revealed: true });
    expect(endB.rebelBase).toEqual({ systemId: y, revealed: false });
    for (const c of copies) expectNothingPrivate(c.started.fake, [id], c.started.db);
  });

  it('TC-H-07 (QD-7, Q-BE-1): AI Rebels, human Empire, two copies with the base elsewhere — Empire-addressed bodies and dev diagnostics clean; diagnostics rules / fallbacks / tokens / cost equal', async () => {
    const id = 'swr008-w10-h07';
    // "Model": PASS whenever offered (same decision sequence in both copies), else FINISH, else the first candidate.
    const pick = (call: CommanderCall) => {
      const actions = actionsOf(call);
      const choice =
        actions.find((c) => c.type === 'PASS') ??
        actions.find((c) => c.type === 'FINISH_ACTIVATION') ??
        actions[0]!;
      return okResponse({ text: decisionText(choice.id) });
    };
    const a = await openaiApp([id], pick);
    const b = await openaiApp([id], pick);
    const gameA = (await AutomatedGame.create(a.app, empireVsAi('hard'))).game;
    const gameB = (await AutomatedGame.create(b.app, empireVsAi('hard'))).game;
    const baseA = (await gameA.state()).rebelBase.systemId as string;
    const { to: baseB, relocated } = otherBase(await gameB.state());
    await storeState(b.app, id, relocated);
    gameA.replies.splice(0);
    gameB.replies.splice(0);
    const diag = async (started: Started) => {
      const res = await api(started.app).get(`/api/dev/ai/sessions/${id}/decisions`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return {
        body: res.body as unknown,
        parsed: AiSessionDecisionsResponseSchema.parse(res.body),
      };
    };
    let scanned = 0;
    const scan = (game: AutomatedGame, base: string, extra: { label: string; body: unknown }[]) => {
      for (const r of [...game.replies.splice(0), ...extra]) {
        expect(
          baseLeaks(r.body, base, 'request' in r ? r.request : undefined),
          `${r.label}`,
        ).toEqual([]);
        scanned += 1;
      }
    };
    for (let i = 0; i < 40; i += 1) {
      const [sa, sb] = [await gameA.state(), await gameB.state()];
      if (sa.outcome !== null || sb.outcome !== null) break;
      const ca = passiveHuman(sa);
      expect(passiveHuman(sb)).toEqual(ca);
      await gameA.send(ca);
      await gameB.send(ca);
      await gameA.get();
      await gameB.get();
      const [da, db] = [await diag(a), await diag(b)];
      const [na, nb] = [await gameA.state(), await gameB.state()];
      // After the end of the game (or a reveal) the base is public: those bodies are not scanned.
      const open = (s: CoreGameState) => s.outcome !== null || s.rebelBase.revealed;
      if (open(na) || open(nb)) break;
      scan(gameA, baseA, [{ label: 'GET diagnostics', body: da.body }]);
      scan(gameB, baseB, [{ label: 'GET diagnostics', body: db.body }]);
    }
    const [da, db] = [(await diag(a)).parsed, (await diag(b)).parsed];
    expect(da.decisions.length).toBeGreaterThan(3);
    const comparable = (d: typeof da) =>
      d.decisions.map(({ at: _at, durationMs: _ms, ...rest }) => rest);
    expect(comparable(db)).toEqual(comparable(da));
    expect(db.totals).toEqual(da.totals);
    expect(da.decisions.every((d) => d.rules.enabled && d.rules.count > 0)).toBe(true);
    // The requests themselves DO differ (the AI Rebels know their own base): only the public selection is shared.
    const [ra, rb] = [responsesOf(a.fake), responsesOf(b.fake)];
    expect(rb.length).toBe(ra.length);
    expect(ra.some((r, i) => r.body !== rb[i]!.body)).toBe(true);
    ra.forEach((r, i) =>
      expect(promptParts(JSON.parse(rb[i]!.body!)).rules).toBe(
        promptParts(JSON.parse(r.body!)).rules,
      ),
    );
    expectNothingPrivate(a.fake, [id], a.db);
    expectNothingPrivate(b.fake, [id], b.db);
    console.log(
      `[swr008-w10-h07] decisions=${da.decisions.length} scannedEmpireBodies=${scanned} bases=${baseA}/${baseB}`,
    );
  });
});
