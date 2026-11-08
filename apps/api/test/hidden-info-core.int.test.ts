/**
 * SWR-005 W6b — hidden information of `core-v1` at the API level (AC-10; plan-backend §5.2 level 2; TC-H-13,
 * TC-H-15, TC-H-16; Clarifications Q-17; W3 accepted). Two scripted games with fixed session ids (the base is
 * read from the DB row): Empire vs AI (POST included) and hot-seat (Rebel moves into AND out of the hidden base,
 * a Rebel activation of the base, two rounds, then the reveal). EVERY body addressed to the Empire is walked
 * with paths — `POST /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions`, `/commands` successes and
 * 4xx (probes included), handoff screens — and the base id may appear ONLY in:
 *   - the static catalogue `view.map.systems[*]` (id, adjacency);
 *   - `view.legalActions[*]` of the Empire: `ACTIVATE_SYSTEM.systemIds` (= all 32 systems, asserted, TC-H-07) and the Empire's OWN `MOVE_PIECES` from/to;
 *   - the Empire's OWN data (W3 accepted): its units / leaders / activation locations and its own events
 *     (`actor: 'empire'`) — the Empire may stand in the base system without knowing it;
 *   - `error.details` echoing a value the Empire itself sent in that request.
 * Anything else (a key, an exact value or a substring) fails with its path. The Nest log output of the whole
 * run is captured and must not contain the base id (Q-17). After the reveal: `BASE_REVEALED` and
 * `view.rebelBase.systemId` for both sides. The list of scanned responses → `.tmp/hidden-info-scan.log`
 * (copied to `docs/tasks/SWR-005/artifacts/logs/hidden-info-scan.log`).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_EMP_SESSION,
  AI_EMP_SETUP,
  BASE_SYSTEM,
  CoreSession,
  HS_SESSION_2,
  HS_SETUP,
  accept,
  activate,
  asCore,
  endTurn,
  envelope,
  finish,
  fixedIds,
  move,
  pass,
  storedState,
  type Step,
} from './support/core-fixtures';
import { R, postCommand, tickingClock } from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';
import { TMP_DIR } from './global-setup';

// ---------------------------------------------------------------------------------------------------------
// Path-aware scanner
// ---------------------------------------------------------------------------------------------------------

/** Every path where `baseId` occurs: as a key, an exact value or inside a string. */
function occurrences(value: unknown, baseId: string, path = '$'): string[] {
  if (typeof value === 'string') return value.includes(baseId) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => occurrences(v, baseId, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(k.includes(baseId) ? [`${path}.${k}(key)`] : []),
      ...occurrences(v, baseId, `${path}.${k}`),
    ]);
  }
  return [];
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}

const STATIC_MAP = /^\$\.view\.map\.systems\[\d+\]\.(id|nameKey|adjacentSystemIds\[\d+\])$/;
const EMPIRE_LEGAL = /^\$\.view\.legalActions\[\d+\]\.(systemIds\[\d+\]|fromSystemId|toSystemId)$/;

interface Owned {
  owner?: string;
  actor?: string;
  side?: string;
}

/** Paths of `body` where the base id is NOT allowed (see the file header). */
function leaks(body: unknown, baseId: string, request?: unknown): string[] {
  const b = body as {
    view?: { units?: Owned[]; leaders?: Owned[]; log?: Owned[]; activation?: Owned | null };
    events?: Owned[];
  };
  const own = (list: Owned[] | undefined, i: string) => {
    const item = list?.[Number(i)];
    return (item?.owner ?? item?.actor) === 'empire';
  };
  const echoed = new Set(request === undefined ? [] : stringsOf(request));
  return occurrences(body, baseId).filter((path) => {
    if (STATIC_MAP.test(path) || EMPIRE_LEGAL.test(path)) return false;
    let m = /^\$\.view\.(units|leaders)\[(\d+)\]\.location\.systemId$/.exec(path);
    if (m) return !own(b.view?.[m[1] as 'units' | 'leaders'], m[2]!);
    if (path === '$.view.activation.location.systemId')
      return b.view?.activation?.side !== 'empire';
    m = /^\$\.view\.log\[(\d+)\]\.payload\./.exec(path);
    if (m) return !own(b.view?.log, m[1]!);
    m = /^\$\.events\[(\d+)\]\.payload\./.exec(path);
    if (m) return !own(b.events, m[1]!);
    if (/^\$\.error\.details\.\w+$/.test(path)) {
      const value = path
        .split('.')
        .slice(1)
        .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], body);
      return !(typeof value === 'string' && echoed.has(value));
    }
    return true;
  });
}

// ---------------------------------------------------------------------------------------------------------

interface ScanRecord {
  game: string;
  label: string;
  status: number;
  addressedTo: string;
  toEmpire: boolean;
  scanned: boolean;
  revealed: boolean;
  leaks: string[];
}

const records: ScanRecord[] = [];
const captured: string[] = [];

describe('core-v1 hidden base: path-aware scan of every Empire-addressed API response (AC-10)', () => {
  let db: TestDb;
  let app: INestApplication;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const capture =
      (stream: string) =>
      (chunk: unknown): boolean => {
        captured.push(`${stream}: ${String(chunk)}`);
        return true;
      };
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(capture('stdout') as never);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(capture('stderr') as never);
    db = createTestDb();
    app = await startApp(db.url, {
      clock: tickingClock(),
      idGenerator: fixedIds(AI_EMP_SESSION, HS_SESSION_2),
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
  });

  afterEach(async () => {
    await stopApp(app, db);
    stdout.mockRestore();
    stderr.mockRestore();
  });

  afterAll(() => {
    const scanned = records.filter((r) => r.scanned);
    const toEmpire = records.filter((r) => r.toEmpire);
    const out = [
      `# SWR-005 W6b hidden-info scan (TC-H-13/15/16) — base id read from the DB row of each game.`,
      `# ${records.length} responses recorded; ${toEmpire.length} Empire-addressed (incl. lists and handoff screens); ${scanned.length} path-scanned (Empire-addressed while the base was hidden); ${records.length - toEmpire.length} not Empire-addressed (Rebels' own board in hot-seat); leaks found: ${records.filter((r) => r.leaks.length > 0).length}`,
      `# columns: n | game | request | HTTP status | addressed to | path-scanned | base at that moment | leaks`,
      ...records.map(
        (r, i) =>
          `${String(i + 1).padStart(3)} | ${r.game} | ${r.label} | ${r.status} | ${r.addressedTo} | ${r.scanned ? 'scanned' : r.toEmpire ? 'after reveal (not hidden)' : 'skipped (Rebels board)'} | ${r.revealed ? 'revealed' : 'hidden'} | ${r.leaks.length === 0 ? 'none' : r.leaks.join(', ')}`,
      ),
      `# Nest log capture: ${captured.length} chunks written to stdout/stderr by the app during the run; base id occurrences: ${captured.filter((c) => c.includes(BASE_SYSTEM)).length}`,
    ];
    writeFileSync(join(TMP_DIR, 'hidden-info-scan.log'), `${out.join('\n')}\n`);
  });

  /**
   * One scripted game: records and scans every response; `revealed` flips when BASE_REVEALED arrives.
   */
  function scanner(game: string, baseId: string) {
    let revealed = false;

    function record(label: string, status: number, body: unknown, request?: unknown) {
      const view = (body as { view?: { kind?: string; viewer?: string } }).view;
      const isList = Array.isArray(body);
      const isError = (body as { ok?: boolean }).ok === false;
      const actor = (request as { actor?: string } | undefined)?.actor;
      let addressedTo: string;
      if (isList) addressedTo = 'list (everyone)';
      else if (isError) addressedTo = `${actor ?? '?'} (error)`;
      else if (view?.kind === 'handoff') addressedTo = 'handoff (public)';
      else addressedTo = view?.viewer ?? '?';
      const toEmpire =
        isList ||
        view?.kind === 'handoff' ||
        (isError && actor === 'empire') ||
        view?.viewer === 'empire';
      const scan = toEmpire && !revealed;
      const found = scan ? leaks(body, baseId, request) : [];
      records.push({
        game,
        label,
        status,
        addressedTo,
        toEmpire,
        scanned: scan,
        revealed,
        leaks: found,
      });
      expect(found, `${game}: ${label} leaks the base`).toEqual([]);

      // Empire board before the reveal: structural checks on top of the path scan.
      if (scan && view?.kind === 'player' && view.viewer === 'empire') {
        const v = asCore(view);
        expect(v.rebelBase).toEqual({ systemId: null, revealed: false });
        expect(v.units.some((u) => u.location.kind === 'rebelBase')).toBe(true);
        const activateLa = v.legalActions.find((a) => a.type === 'ACTIVATE_SYSTEM');
        if (activateLa) {
          // TC-H-07: all 32 systems (an own leader does not exclude one, Q-BE-3) — the base is neither
          // excluded nor singled out.
          expect(activateLa.systemIds).toEqual(v.map.systems.map((sys) => sys.id));
        }
      }
      return body;
    }

    return {
      record,
      markRevealed() {
        revealed = true;
      },
      get revealed() {
        return revealed;
      },
    };
  }

  function driver(s: CoreSession, scan: ReturnType<typeof scanner>) {
    const label = (step: Step) =>
      `POST /commands ${step.actor} ${step.command.type}${'systemId' in step.command ? ` ${step.command.leaderId}→${step.command.systemId}` : ''}${'pieceIds' in step.command ? ` [${step.command.pieceIds.join(',')}] ${step.command.fromSystemId}→${step.command.toSystemId}` : ''}`;
    return {
      async send(step: Step) {
        const env = envelope(step, s.version);
        const res = await s.send(step);
        // The response of the revealing command already shows the revealed state (nothing hidden any more);
        // a reveal on a hand-over comes with a handoff screen and no events — the row tells either way.
        if ((await storedState(app, s.id)).rebelBase.revealed) scan.markRevealed();
        scan.record(label(step), 200, res.raw, env);
        await this.observe();
        return res;
      },
      /** A probe that must be rejected (4xx); its error body is scanned like any response. */
      async probe(step: Step, status: number, key: string, expectedVersion = s.version) {
        const env = envelope(step, expectedVersion);
        const res = await postCommand(app, s.id, env);
        expect(res.status, `${label(step)}: ${JSON.stringify(res.body)}`).toBe(status);
        expect(res.body.error.messageKey).toBe(key);
        scan.record(`${label(step)} (probe, v=${expectedVersion})`, res.status, res.body, env);
        return res.body as { error: { details?: unknown } };
      },
      async raw(body: unknown, labelText: string) {
        const res = await postCommand(app, s.id, body);
        expect(res.status).toBe(400);
        scan.record(labelText, res.status, res.body, body);
      },
      /** GET /:id (the active side's board or the handoff) and the list, after every command. */
      async observe() {
        const got = await api(app).get(`/api/sessions/${s.id}`);
        expect(got.status).toBe(200);
        scan.record('GET /api/sessions/:id', 200, got.body);
        const list = await api(app).get(`/api/sessions?gameId=${R}`);
        expect(list.status).toBe(200);
        scan.record('GET /api/sessions?gameId=rebellion', 200, list.body);
        const all = await api(app).get('/api/sessions');
        scan.record('GET /api/sessions', 200, all.body);
        return got.body as { view: unknown };
      },
    };
  }

  it('the scanner itself flags Rebel data, the base marker, substrings and non-echoed details', () => {
    const body = {
      view: {
        map: { systems: [{ id: 'rodia', nameKey: 'systems.rodia', adjacentSystemIds: ['rodia'] }] },
        units: [
          { owner: 'empire', location: { kind: 'system', systemId: 'rodia' } },
          { owner: 'rebels', location: { kind: 'system', systemId: 'rodia' } },
        ],
        activation: { side: 'rebels', location: { kind: 'system', systemId: 'rodia' } },
        rebelBase: { systemId: 'rodia' },
        log: [
          { actor: 'empire', payload: { systemId: 'rodia' } },
          { actor: 'rebels', payload: { systemId: 'rodia' } },
        ],
        legalActions: [{ type: 'ACTIVATE_SYSTEM', systemIds: ['rodia'] }],
        note: 'hidden in rodia',
        rodia: 1,
      },
      events: [{ actor: 'rebels', payload: { toSystemId: 'rodia' } }],
      error: { details: { systemId: 'rodia', fromSystemId: 'rodia' } },
    };
    expect(leaks(body, 'rodia', { command: { systemId: 'rodia' } })).toEqual([
      '$.view.units[1].location.systemId',
      '$.view.activation.location.systemId',
      '$.view.rebelBase.systemId',
      '$.view.log[1].payload.systemId',
      '$.view.note',
      '$.view.rodia(key)',
      '$.events[0].payload.toSystemId',
    ]);
    expect(leaks(body, 'rodia')).toContain('$.error.details.fromSystemId');
  });

  it('TC-H-13 / TC-H-15 / TC-H-16: Empire vs AI — POST, GET, list, commands and probes; then the reveal', async () => {
    const res = await api(app).post('/api/sessions').send({ gameId: R, setup: AI_EMP_SETUP });
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe(AI_EMP_SESSION);
    const baseId = (await storedState(app, AI_EMP_SESSION)).rebelBase.systemId;
    expect(baseId).toBe(BASE_SYSTEM);
    const scan = scanner('AI_EMP', baseId);
    scan.record('POST /api/sessions (Empire vs AI)', 201, res.body);
    const s = new CoreSession(app, AI_EMP_SESSION, res.body.view.version);
    const d = driver(s, scan);
    await d.observe();

    // TC-H-15: list details carry no systems at all.
    const list = await api(app).get(`/api/sessions?gameId=${R}`);
    expect(Object.keys(list.body[0].details).sort()).toEqual(
      [
        'aiDifficulty',
        'gameMode',
        'opponentFaction',
        'opponentType',
        'phase',
        'playerFaction',
        'reputation',
        'round',
        'ruleset',
        'rulesEngine',
        'winner',
      ].sort(),
    );

    // Probes before an activation (some reference the base on purpose).
    await d.probe(activate('empire', 'leia', baseId), 422, 'errors.leaderNotInPool');
    await d.probe(activate('empire', 'yoda', baseId), 422, 'errors.unknownLeader');
    await d.probe(activate('empire', 'vader', 'nowhere'), 422, 'errors.unknownSystem');
    await d.probe(move('empire', ['u-11'], baseId, 'malastare'), 422, 'errors.noActivation');
    await d.probe(finish('empire'), 422, 'errors.noActivation');
    await d.probe(pass('rebels'), 422, 'errors.notYourSide');
    await d.probe(accept('empire'), 422, 'errors.handoffNotAvailable');
    await d.probe(endTurn('empire'), 422, 'errors.commandUnavailable');
    await d.probe(pass('empire'), 409, 'errors.versionConflict', s.version + 1);
    await d.raw(
      {
        actor: 'empire',
        expectedVersion: s.version,
        command: { type: 'ACTIVATE_SYSTEM', leaderId: 'vader', systemId: baseId, extra: baseId },
      },
      'POST /commands empire ACTIVATE_SYSTEM + extra key (probe, 400)',
    );

    await d.send(activate('empire', 'vader', 'malastare'));
    // During the activation: a Rebel unit of the base, asked for from the base and from another neighbour →
    // the same answer (owner before location); an own unit elsewhere echoes only the request.
    const fromBase = await d.probe(
      move('empire', ['u-11'], baseId, 'malastare'),
      422,
      'errors.notOwner',
    );
    const fromOther = await d.probe(
      move('empire', ['u-11'], 'bothawui', 'malastare'),
      422,
      'errors.notOwner',
    );
    expect(fromBase).toEqual(fromOther);
    await d.probe(move('empire', ['u-42'], baseId, 'malastare'), 422, 'errors.notInFromSystem');
    await d.probe(move('empire', ['u-40'], 'sullust', baseId), 422, 'errors.notActivatedSystem');
    await d.probe(activate('empire', 'tarkin', baseId), 422, 'errors.activationInProgress');
    await d.probe(pass('empire'), 422, 'errors.activationInProgress');
    await d.send(move('empire', ['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare'));
    await d.send(finish('empire'));
    // The Empire passes → refresh → round 2 → the AI Rebels pass again (auto) → the Empire's turn.
    const r2 = await d.send(pass('empire'));
    expect(asCore(r2.view)).toMatchObject({ round: 2, activeSide: 'empire' });

    // The Empire walks into the base system without knowing it (own data — allowed, W3).
    await d.send(activate('empire', 'vader', baseId));
    await d.send(move('empire', ['u-40', 'u-43', 'u-45'], 'malastare', baseId));
    expect(scan.revealed).toBe(false);
    const revealedRes = await d.send(finish('empire'));

    // After the reveal: BASE_REVEALED and the base id for the Empire, the past log no longer redacted.
    expect(scan.revealed).toBe(true);
    const revealedEvent = revealedRes.events.find((e) => e.type === 'BASE_REVEALED');
    expect(revealedEvent?.payload).toEqual({ systemId: baseId });
    const after = asCore((await d.observe()).view);
    expect(after).toMatchObject({
      viewer: 'empire',
      rebelBase: { systemId: baseId, revealed: true },
      outcome: null,
    });
    expect(after.units.every((u) => u.location.kind === 'system')).toBe(true);

    // Q-17: the base id never reached the Nest logs (the app logged during the run).
    expect(captured.some((c) => c.includes('Nest'))).toBe(true);
    expect(captured.filter((c) => c.includes(baseId))).toEqual([]);
  });

  it('TC-H-13 / TC-H-16: hot-seat — Rebels into / out of the hidden base, base activation, 2 rounds, reveal', async () => {
    // The first fixed id goes to an unused session so that this game gets `seed-win-1`.
    await api(app).post('/api/sessions').send({ gameId: R, setup: AI_EMP_SETUP });
    const res = await api(app).post('/api/sessions').send({ gameId: R, setup: HS_SETUP });
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe(HS_SESSION_2);
    const baseId = (await storedState(app, HS_SESSION_2)).rebelBase.systemId;
    expect(baseId).toBe(BASE_SYSTEM);
    const scan = scanner('HOT_SEAT', baseId);
    scan.record('POST /api/sessions (hot-seat, Rebels board)', 201, res.body);
    const s = new CoreSession(app, HS_SESSION_2, res.body.view.version);
    const d = driver(s, scan);
    await d.observe();

    // Round 1. Rebels: Leia activates the (hidden) base, the transport comes INTO it.
    await d.send(activate('rebels', 'leia', baseId));
    await d.send(move('rebels', ['u-02'], 'bothawui', baseId));
    await d.send(finish('rebels')); // → handoff to the Empire
    const e1 = await d.send(accept('empire'));
    const e1view = asCore(e1.view);
    // The Rebel events of the base are in the Empire's log with the base system as null.
    expect(
      e1view.log.find((e) => e.type === 'SYSTEM_ACTIVATED' && e.actor === 'rebels')?.payload,
    ).toEqual({
      leaderId: 'leia',
      systemId: null,
    });
    expect(e1view.leaders.find((l) => l.id === 'leia')?.location).toEqual({ kind: 'rebelBase' });

    await d.probe(activate('empire', 'leia', baseId), 422, 'errors.leaderNotInPool');
    await d.probe(pass('rebels'), 422, 'errors.notYourTurn');
    await d.send(activate('empire', 'vader', 'malastare'));
    const a = await d.probe(move('empire', ['u-02'], baseId, 'malastare'), 422, 'errors.notOwner');
    const b = await d.probe(
      move('empire', ['u-02'], 'bothawui', 'malastare'),
      422,
      'errors.notOwner',
    );
    expect(a).toEqual(b);
    await d.send(move('empire', ['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare'));
    await d.send(finish('empire')); // → handoff to the Rebels
    await d.send(accept('rebels'));
    await d.send(pass('rebels')); // → handoff to the Empire
    await d.send(accept('empire'));
    await d.send(pass('empire')); // → refresh, round 2, handoff to the Rebels

    // Round 2. Rebels: an X-wing leaves the hidden base (OUT of it).
    await d.send(accept('rebels'));
    await d.send(activate('rebels', 'dodonna', 'bothawui'));
    await d.send(move('rebels', ['u-09'], baseId, 'bothawui'));
    await d.send(finish('rebels')); // → handoff to the Empire
    const e2 = asCore((await d.send(accept('empire'))).view);
    expect(e2.round).toBe(2);
    expect(
      e2.log.find(
        (e) =>
          e.type === 'PIECES_MOVED' && e.actor === 'rebels' && e.payload.pieceIds.includes('u-09'),
      )?.payload,
    ).toEqual({ pieceIds: ['u-09'], fromSystemId: null, toSystemId: 'bothawui' });

    // Empire: Vader activates the base system, ground units come in; finishing reveals the base (R-8).
    await d.send(activate('empire', 'vader', baseId));
    await d.send(move('empire', ['u-40', 'u-43', 'u-45'], 'malastare', baseId));
    expect(scan.revealed).toBe(false);
    const reveal = await d.send(finish('empire'));
    expect(scan.revealed).toBe(true);
    // The reveal happens on a hand-over: the response is the handoff screen (no events), not a leak.
    expect(reveal.view.kind).toBe('handoff');

    // Both sides see the revealed base: the Rebels after taking the seat …
    const rebels = asCore((await d.send(accept('rebels'))).view);
    expect(rebels).toMatchObject({
      viewer: 'rebels',
      rebelBase: { systemId: baseId, revealed: true },
    });
    expect(rebels.log.find((e) => e.type === 'BASE_REVEALED')?.payload).toEqual({
      systemId: baseId,
    });
    // … and the Empire after the Rebels pass and it takes the seat again (Rebel units still on the base).
    await d.send(pass('rebels'));
    const empire = asCore((await d.send(accept('empire'))).view);
    expect(empire).toMatchObject({
      viewer: 'empire',
      rebelBase: { systemId: baseId, revealed: true },
      outcome: null,
    });
    expect(empire.log.find((e) => e.type === 'BASE_REVEALED')?.payload).toEqual({
      systemId: baseId,
    });
    expect(empire.units.every((u) => u.location.kind === 'system')).toBe(true);

    const scannedHere = records.filter((r) => r.game === 'HOT_SEAT' && r.scanned);
    expect(scannedHere.length).toBeGreaterThan(40);
    expect(captured.some((c) => c.includes('Nest'))).toBe(true);
    expect(captured.filter((c) => c.includes(baseId))).toEqual([]);
  });
});
