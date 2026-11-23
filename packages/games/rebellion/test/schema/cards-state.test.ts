/**
 * SWR-010 W2 (plan-backend §3.1, §4.1, §11.2–11.4): optional `cards` / `table` state fields and their invariants,
 * new events (state vs view forms), commands, error keys, view fields, table schemas.
 * States with cards are built here with the platform engine (the real `initCoreCards` is W3's).
 */
import { describe, expect, it } from 'vitest';
import { createPile, type CardAuthority, type CardPile } from '@bga/platform/cards';
import {
  CORE_COMMAND_TYPES,
  CardsDrawnEventSchema,
  CardsDrawnViewEventSchema,
  CardRegisteredEventSchema,
  CardRegisteredViewEventSchema,
  CommandSchema,
  CoreCardsStateSchema,
  CoreCardsViewSchema,
  CoreEventSchema,
  CoreGameStateV3Schema,
  CorePlayerViewSchema,
  CoreTableStateSchema,
  CoreViewEventSchema,
  FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS,
  GameEventSchema,
  MOCK_COMMAND_TYPES,
  PROBE_SYSTEM_IDS,
  PlayerEventSchema,
  REBELLION_CARD_ZONES,
  REBELLION_ERROR_MESSAGE_KEYS,
  TABLE_STEP_KEYS,
  TABLE_TASK_KINDS,
  TableTaskConfirmedEventSchema,
  TableTaskSchema,
  TableViewSchema,
  probeDefinitionId,
  probeInstanceId,
  rebellionCardEngineContext,
  settingsFromSetupInput,
  type CoreGameState,
  type RebellionSettings,
  type TableTask,
} from '../../src/schema';
import { applyCommand, createCoreGame, toSideView } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import { APPLY_CTX, env, newGame } from '../rules/helpers';
import { AT, coreEmpireView } from './core-sample';

const NOW = '2026-11-23T10:00:00.000Z';

function settings(
  playerFaction: 'rebels' | 'empire',
  gameMode: 'digital' | 'physical_companion',
  opponentType: 'ai' | 'human' = 'ai',
): RebellionSettings {
  return settingsFromSetupInput({
    playerFaction,
    opponentType,
    ruleset: 'base',
    gameMode,
    ...(opponentType === 'human' ? { aiDifficulty: null } : {}),
  });
}

/** Test-side card layout per plan-backend §3.4 (no shuffle: order is irrelevant for the invariants). */
function pileFor(
  baseSystemId: string,
  s: RebellionSettings,
  registrationPending: boolean,
): CardPile {
  const instances = PROBE_SYSTEM_IDS.map((id) => ({
    id: probeInstanceId(id),
    definitionId: probeDefinitionId(id),
  }));
  const box = FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS.map((id) => probeInstanceId(id));
  const location = registrationPending ? [] : [probeInstanceId(baseSystemId)];
  const used = new Set([...box, ...location]);
  const physicalLocation = s.gameMode === 'physical_companion' && s.playerFaction === 'rebels';
  const authority: Record<string, CardAuthority> = Object.fromEntries(
    REBELLION_CARD_ZONES.map((z) => [
      z.id,
      z.id === 'rebels-location' && physicalLocation ? 'physical' : 'digital',
    ]),
  );
  const result = createPile(rebellionCardEngineContext, {
    instances,
    placement: {
      'probe-deck': instances.map((i) => i.id).filter((id) => !used.has(id)),
      'probe-box': box,
      'rebels-location': location,
    },
    authority,
  });
  if (!result.ok) throw new Error(`pile: ${JSON.stringify(result.error)}`);
  return result.pile;
}

function task(
  id: string,
  kind: TableTask['kind'],
  completion: TableTask['completion'] = 'confirm',
): TableTask {
  return {
    id,
    kind,
    actor: 'system',
    titleKey: `table.tasks.${kind}`,
    createdAtVersion: 1,
    affected: { cardDefinitionIds: [], leaderIds: [], unitIds: [], systemIds: [] },
    steps: [{ key: 'table.steps.setupFirstGame', params: {} }],
    completion,
  };
}

/** A valid stored state with cards (and a table when physical). */
function stateWith(
  playerFaction: 'rebels' | 'empire',
  gameMode: 'digital' | 'physical_companion',
): CoreGameState {
  const s = settings(playerFaction, gameMode);
  const created = createCoreGame(s, coreDataBaseV1, { gameId: 'swr010-w2', now: NOW });
  const pending = gameMode === 'physical_companion' && playerFaction === 'rebels';
  const state: CoreGameState = {
    ...created,
    cards: {
      catalogId: 'rebellion-cards-v1',
      pile: pileFor(created.rebelBase.systemId, s, pending),
    },
  };
  if (gameMode === 'physical_companion') {
    state.table = pending
      ? {
          tasks: [task('t-1-1', 'initialSetup'), task('t-1-2', 'registerBase', 'register')],
          baseRegistration: { eligibleSystemIds: ['yavin'] },
        }
      : { tasks: [task('t-1-1', 'initialSetup')], baseRegistration: null };
  }
  return state;
}

function issues(state: unknown): string[] {
  const r = CoreGameStateV3Schema.safeParse(state);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

function moveCard(state: CoreGameState, instanceId: string, from: string, to: string): void {
  const zones = state.cards!.pile.zones;
  const src = zones.find((z) => z.id === from)!;
  const dst = zones.find((z) => z.id === to)!;
  src.cards = src.cards.filter((c) => c !== instanceId);
  dst.cards = [...dst.cards, instanceId];
}

describe('state: optional cards / table (§3.1)', () => {
  it('a legacy core-v1 state (no cards, no table) is valid and stays without the fields', () => {
    // SWR-010 W5: new games now get `cards`; a legacy row is a created game without the optional fields.
    const created = createCoreGame(settings('rebels', 'digital'), coreDataBaseV1, {
      gameId: 'legacy',
      now: NOW,
    });
    const { cards: _cards, table: _table, ...legacy } = created;
    const parsed = CoreGameStateV3Schema.parse(legacy);
    expect('cards' in parsed).toBe(false);
    expect('table' in parsed).toBe(false);
    expect(parsed).toEqual(legacy);
    // Stored JSON (schema key order) round-trips byte-identically.
    const stored = JSON.stringify(parsed);
    expect(JSON.stringify(CoreGameStateV3Schema.parse(JSON.parse(stored)))).toBe(stored);
  });

  it.each([
    ['rebels', 'digital'],
    ['empire', 'digital'],
    ['rebels', 'physical_companion'],
    ['empire', 'physical_companion'],
  ] as const)('valid: %s / %s with cards', (side, mode) => {
    const state = stateWith(side, mode);
    expect(issues(state)).toEqual([]);
    const parsed = CoreGameStateV3Schema.parse(state);
    expect(parsed).toEqual(state);
    const stored = JSON.stringify(parsed);
    expect(JSON.stringify(CoreGameStateV3Schema.parse(JSON.parse(stored)))).toBe(stored);
  });

  it('null is not a stored representation', () => {
    expect(issues({ ...stateWith('rebels', 'digital'), cards: null }).length).toBeGreaterThan(0);
    expect(issues({ ...stateWith('rebels', 'digital'), table: null }).length).toBeGreaterThan(0);
  });

  it('table ⇔ physical_companion', () => {
    const digital = stateWith('empire', 'digital');
    digital.table = { tasks: [], baseRegistration: null };
    expect(issues(digital)).toContain('table is present exactly in physical_companion games');
    const physical = stateWith('empire', 'physical_companion');
    delete physical.table;
    expect(issues(physical)).toContain('table is present exactly in physical_companion games');
  });

  it('physical_companion ⇒ AI opponent and cards', () => {
    const noCards = stateWith('empire', 'physical_companion');
    delete noCards.cards;
    expect(issues(noCards)).toContain('physical_companion games track cards');
    const hotSeat = stateWith('empire', 'physical_companion');
    hotSeat.settings = settings('empire', 'physical_companion', 'human');
    expect(issues(hotSeat)).toContain('physical_companion is played against the AI only');
  });

  it('cards: exactly 31 instances and no platform invariant issue', () => {
    const missing = stateWith('rebels', 'digital');
    const lost = probeInstanceId('hoth');
    missing.cards!.pile.instances = missing.cards!.pile.instances.filter((i) => i.id !== lost);
    missing.cards!.pile.zones = missing.cards!.pile.zones.map((z) => ({
      ...z,
      cards: z.cards.filter((c) => c !== lost),
    }));
    expect(issues(missing)).toContain('exactly 31 card instances');

    const twice = stateWith('rebels', 'digital');
    twice.cards!.pile.zones.find((z) => z.id === 'empire-probes')!.cards.push(lost);
    expect(issues(twice).some((m) => m.startsWith('card invariant'))).toBe(true);

    expect(
      issues({
        ...stateWith('rebels', 'digital'),
        cards: { catalogId: 'other', pile: twice.cards!.pile },
      }),
    ).not.toEqual([]);
  });

  it('the Location card names the base; at most one card', () => {
    const state = stateWith('empire', 'digital');
    const other = PROBE_SYSTEM_IDS.find(
      (id) =>
        id !== state.rebelBase.systemId &&
        !(FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS as readonly string[]).includes(id),
    )!;
    const wrong = structuredClone(state);
    moveCard(wrong, probeInstanceId(state.rebelBase.systemId), 'rebels-location', 'probe-deck');
    moveCard(wrong, probeInstanceId(other), 'probe-deck', 'rebels-location');
    expect(issues(wrong)).toContain('the Location card must name the rebel base system');

    const two = structuredClone(state);
    moveCard(two, probeInstanceId(other), 'probe-deck', 'rebels-location');
    expect(issues(two)).toContain('the Location holds at most one card');
  });

  it('reveal: Location empty and the base card on the Rebel Base space; nothing revealed before', () => {
    const state = stateWith('empire', 'digital');
    const base = probeInstanceId(state.rebelBase.systemId);

    const revealed = structuredClone(state);
    revealed.rebelBase.revealed = true;
    moveCard(revealed, base, 'rebels-location', 'rebels-base-revealed');
    expect(issues(revealed)).toEqual([]);

    const notMoved = structuredClone(state);
    notMoved.rebelBase.revealed = true;
    expect(issues(notMoved)).toContain('a revealed base leaves the Location empty');
    expect(issues(notMoved)).toContain('a revealed base card lies on the Rebel Base space');

    const early = structuredClone(state);
    moveCard(early, base, 'rebels-location', 'rebels-base-revealed');
    expect(issues(early)).toContain('no revealed base card before the reveal');
  });

  it('registration: baseRegistration ⇔ registerBase task ⇔ empty Location before the reveal; Rebels only', () => {
    const msg = 'baseRegistration iff a registerBase task is queued';
    const pendingMsg = 'baseRegistration iff the Location awaits registration';

    const noFlag = stateWith('rebels', 'physical_companion');
    noFlag.table!.baseRegistration = null;
    expect(issues(noFlag)).toContain(msg);
    expect(issues(noFlag)).toContain(pendingMsg);

    const noTask = stateWith('rebels', 'physical_companion');
    noTask.table!.tasks = [task('t-1-1', 'initialSetup')];
    expect(issues(noTask)).toContain(msg);

    const registered = stateWith('rebels', 'physical_companion');
    moveCard(
      registered,
      probeInstanceId(registered.rebelBase.systemId),
      'probe-deck',
      'rebels-location',
    );
    expect(issues(registered)).toContain(pendingMsg);

    const empire = stateWith('empire', 'physical_companion');
    empire.table = {
      tasks: [task('t-1-1', 'registerBase', 'register')],
      baseRegistration: { eligibleSystemIds: ['yavin'] },
    };
    expect(issues(empire)).toContain('only a human Rebel player registers the base');

    const emptyDigital = stateWith('rebels', 'digital');
    moveCard(
      emptyDigital,
      probeInstanceId(emptyDigital.rebelBase.systemId),
      'rebels-location',
      'probe-deck',
    );
    expect(issues(emptyDigital)).toContain(pendingMsg);
  });

  it('table task ids are unique', () => {
    const state = stateWith('empire', 'physical_companion');
    state.table!.tasks = [task('t-1-1', 'initialSetup'), task('t-1-1', 'refresh')];
    expect(issues(state)).toContain('duplicate table task id');
  });

  it('FIX-R1: completion matches kind (register iff registerBase)', () => {
    const msg = 'completion is register iff kind is registerBase';
    const confirmRegister = stateWith('rebels', 'physical_companion');
    confirmRegister.table!.tasks = [
      task('t-1-1', 'initialSetup'),
      task('t-1-2', 'registerBase', 'confirm'),
    ];
    expect(issues(confirmRegister)).toContain(msg);

    const registerOther = stateWith('empire', 'physical_companion');
    registerOther.table!.tasks = [task('t-1-1', 'initialSetup', 'register')];
    expect(issues(registerOther)).toContain(msg);

    const registerRefresh = stateWith('rebels', 'physical_companion');
    registerRefresh.table!.tasks.push(task('t-2-1', 'refresh', 'register'));
    expect(issues(registerRefresh)).toEqual([msg]);
  });

  it('FIX-R1: at most one registerBase task', () => {
    const state = stateWith('rebels', 'physical_companion');
    state.table!.tasks.push(task('t-1-3', 'registerBase', 'register'));
    expect(issues(state)).toEqual(['at most one registerBase task']);
  });

  it('FIX-R1: titleKey is table.tasks.<kind>', () => {
    const state = stateWith('empire', 'physical_companion');
    state.table!.tasks = [{ ...task('t-1-1', 'initialSetup'), titleKey: 'table.tasks.refresh' }];
    expect(issues(state)).toEqual(['titleKey is table.tasks.<kind>']);
  });

  it('FIX-R1: valid fixtures and engine-created physical games still pass', () => {
    for (const faction of ['rebels', 'empire'] as const) {
      expect(issues(stateWith(faction, 'physical_companion'))).toEqual([]);
      const created = createCoreGame(settings(faction, 'physical_companion'), coreDataBaseV1, {
        gameId: 'swr010-fix-r1',
        now: NOW,
      });
      expect(issues(created)).toEqual([]);
    }
  });
});

describe('table schemas (§11.3)', () => {
  it('kinds and step keys are frozen', () => {
    expect(TABLE_TASK_KINDS).toEqual([
      'initialSetup',
      'registerBase',
      'aiActivation',
      'aiMove',
      'refresh',
      'baseRevealed',
    ]);
    expect(TABLE_STEP_KEYS).toHaveLength(14);
    expect(TABLE_STEP_KEYS.every((k) => k.startsWith('table.steps.'))).toBe(true);
  });

  it('task shape', () => {
    expect(TableTaskSchema.safeParse(task('t-3-2', 'refresh')).success).toBe(true);
    expect(TableTaskSchema.safeParse({ ...task('t-0-1', 'refresh') }).success).toBe(false);
    expect(TableTaskSchema.safeParse({ ...task('x', 'refresh') }).success).toBe(false);
    expect(
      TableTaskSchema.safeParse({ ...task('t-1-1', 'refresh'), titleKey: 'tasks.x' }).success,
    ).toBe(false);
    expect(TableTaskSchema.safeParse({ ...task('t-1-1', 'refresh'), steps: [] }).success).toBe(
      false,
    );
    expect(
      TableTaskSchema.safeParse({
        ...task('t-1-1', 'aiMove'),
        affected: {
          cardDefinitionIds: [],
          leaderIds: [],
          unitIds: ['u-01'],
          systemIds: [null, 'hoth'],
        },
        steps: [
          {
            key: 'table.steps.moveUnits',
            params: { unitIds: ['u-01'], fromSystemId: null, toSystemId: 'hoth' },
          },
          { key: 'table.steps.advanceTime', params: { from: 1, to: 2 } },
        ],
      }).success,
    ).toBe(true);
    expect(
      TableTaskSchema.safeParse({
        ...task('t-1-1', 'aiMove'),
        steps: [{ key: 'table.steps.unknown', params: {} }],
      }).success,
    ).toBe(false);
    expect(
      TableTaskSchema.safeParse({
        ...task('t-1-1', 'aiMove'),
        steps: [{ key: 'table.steps.moveUnits', params: { 'bad-key': 'x' } }],
      }).success,
    ).toBe(false);
  });

  it('state and view', () => {
    expect(CoreTableStateSchema.safeParse({ tasks: [], baseRegistration: null }).success).toBe(
      true,
    );
    expect(
      CoreTableStateSchema.safeParse({ tasks: [], baseRegistration: { eligibleSystemIds: [] } })
        .success,
    ).toBe(false);
    expect(
      TableViewSchema.safeParse({
        tasks: [],
        aiWaiting: false,
        registration: { zoneId: 'rebels-location', eligibleDefinitionIds: ['probe-yavin'] },
      }).success,
    ).toBe(true);
    expect(
      TableViewSchema.safeParse({
        tasks: [],
        aiWaiting: false,
        registration: { zoneId: 'empire-probes', eligibleDefinitionIds: ['probe-yavin'] },
      }).success,
    ).toBe(false);
  });
});

describe('cards state / view schemas (§11.2)', () => {
  it('state: catalog id literal + platform pile', () => {
    const pile = pileFor('yavin', settings('rebels', 'digital'), false);
    expect(CoreCardsStateSchema.safeParse({ catalogId: 'rebellion-cards-v1', pile }).success).toBe(
      true,
    );
    expect(CoreCardsStateSchema.safeParse({ catalogId: 'x', pile }).success).toBe(false);
  });

  it('view: zones with hidden order never listed', () => {
    const zone = {
      id: 'probe-deck',
      kind: 'deck',
      owner: null,
      visibility: 'hidden',
      ordered: true,
      authority: 'digital',
      count: 25,
      cards: null,
    };
    expect(
      CoreCardsViewSchema.safeParse({ catalogId: 'rebellion-cards-v1', zones: [zone] }).success,
    ).toBe(true);
    expect(
      CoreCardsViewSchema.safeParse({
        catalogId: 'rebellion-cards-v1',
        zones: [
          {
            ...zone,
            count: 1,
            cards: [{ instanceId: 'probe-hoth#1', definitionId: 'probe-hoth' }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('events (§4.1)', () => {
  const drawn = {
    seq: 9,
    type: 'CARDS_DRAWN',
    actor: 'system',
    payload: {
      side: 'empire',
      fromZoneId: 'probe-deck',
      toZoneId: 'empire-probes',
      count: 2,
      definitionIds: ['probe-hoth', 'probe-endor'],
    },
    at: AT,
  } as const;
  const registered = {
    seq: 3,
    type: 'CARD_REGISTERED',
    actor: 'rebels',
    payload: { zoneId: 'rebels-location', definitionId: 'probe-hoth' },
    at: AT,
  } as const;
  const confirmed = {
    seq: 4,
    type: 'TABLE_TASK_CONFIRMED',
    actor: 'empire',
    payload: { taskId: 't-1-1', kind: 'initialSetup' },
    at: AT,
  } as const;

  it('state forms are accepted by every union', () => {
    for (const e of [drawn, registered, confirmed]) {
      expect(CoreEventSchema.safeParse(e).success, e.type).toBe(true);
      expect(GameEventSchema.safeParse(e).success, e.type).toBe(true);
      expect(CoreViewEventSchema.safeParse(e).success, e.type).toBe(true);
      expect(PlayerEventSchema.safeParse(e).success, e.type).toBe(true);
    }
    expect(CardsDrawnEventSchema.safeParse(drawn).success).toBe(true);
    expect(CardRegisteredEventSchema.safeParse(registered).success).toBe(true);
    expect(TableTaskConfirmedEventSchema.safeParse(confirmed).success).toBe(true);
  });

  it('CARDS_DRAWN: count === definitionIds.length; actor system; count > 0', () => {
    const bad = { ...drawn, payload: { ...drawn.payload, count: 3 } };
    expect(CoreEventSchema.safeParse(bad).success).toBe(false);
    expect(CoreEventSchema.safeParse({ ...drawn, actor: 'empire' }).success).toBe(false);
    expect(
      CoreEventSchema.safeParse({
        ...drawn,
        payload: { ...drawn.payload, count: 0, definitionIds: [] },
      }).success,
    ).toBe(false);
  });

  it('redacted (null) forms only in the view schemas', () => {
    const drawnView = { ...drawn, payload: { ...drawn.payload, definitionIds: null } };
    const registeredView = {
      ...registered,
      payload: { ...registered.payload, definitionId: null },
    };
    expect(CardsDrawnViewEventSchema.safeParse(drawnView).success).toBe(true);
    expect(CardRegisteredViewEventSchema.safeParse(registeredView).success).toBe(true);
    for (const e of [drawnView, registeredView]) {
      expect(CoreViewEventSchema.safeParse(e).success, e.type).toBe(true);
      expect(PlayerEventSchema.safeParse(e).success, e.type).toBe(true);
      expect(CoreEventSchema.safeParse(e).success, e.type).toBe(false);
      expect(GameEventSchema.safeParse(e).success, e.type).toBe(false);
    }
  });

  it('FIX-R1: CARDS_DRAWN view form keeps count === definitionIds.length when not redacted', () => {
    const short = { ...drawn, payload: { ...drawn.payload, definitionIds: ['probe-hoth'] } };
    const empty = { ...drawn, payload: { ...drawn.payload, definitionIds: [] } };
    for (const e of [short, empty]) {
      expect(CardsDrawnViewEventSchema.safeParse(e).success).toBe(false);
      expect(CoreViewEventSchema.safeParse(e).success).toBe(false);
      expect(PlayerEventSchema.safeParse(e).success).toBe(false);
    }
    expect(CardsDrawnViewEventSchema.safeParse(drawn).success).toBe(true);
    const redacted = { ...drawn, payload: { ...drawn.payload, definitionIds: null } };
    expect(CardsDrawnViewEventSchema.safeParse(redacted).success).toBe(true);
  });
});

describe('commands, errors, view fields (§11.4)', () => {
  it('CONFIRM_TABLE_TASK / REGISTER_CARD parse; core-only', () => {
    expect(CommandSchema.safeParse({ type: 'CONFIRM_TABLE_TASK', taskId: 't-1-1' }).success).toBe(
      true,
    );
    expect(CommandSchema.safeParse({ type: 'CONFIRM_TABLE_TASK', taskId: '' }).success).toBe(false);
    expect(
      CommandSchema.safeParse({ type: 'CONFIRM_TABLE_TASK', taskId: 'x'.repeat(33) }).success,
    ).toBe(false);
    expect(
      CommandSchema.safeParse({
        type: 'REGISTER_CARD',
        zoneId: 'rebels-location',
        definitionId: 'probe-yavin',
      }).success,
    ).toBe(true);
    expect(
      CommandSchema.safeParse({
        type: 'REGISTER_CARD',
        zoneId: 'Rebels Location',
        definitionId: 'probe-yavin',
      }).success,
    ).toBe(false);
    expect(
      CommandSchema.safeParse({
        type: 'REGISTER_CARD',
        zoneId: 'rebels-location',
        definitionId: 'probe-yavin',
        x: 1,
      }).success,
    ).toBe(false);
    expect(CORE_COMMAND_TYPES).toEqual([
      'ACTIVATE_SYSTEM',
      'MOVE_PIECES',
      'FINISH_ACTIVATION',
      'PASS',
      'ACCEPT_HANDOFF',
      'CONFIRM_TABLE_TASK',
      'REGISTER_CARD',
    ]);
    expect(MOCK_COMMAND_TYPES).toEqual([
      'MOVE_PIECES',
      'ADVANCE_PHASE',
      'END_TURN',
      'ACCEPT_HANDOFF',
    ]);
  });

  it('R5: the new commands on a mock-v1 game → 422 commandUnavailable', () => {
    const state = newGame();
    for (const command of [
      { type: 'CONFIRM_TABLE_TASK', taskId: 't-1-1' },
      { type: 'REGISTER_CARD', zoneId: 'rebels-location', definitionId: 'probe-yavin' },
    ] as const) {
      const result = applyCommand(state, env(state, command), APPLY_CTX);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ILLEGAL_COMMAND');
        expect(result.error.messageKey).toBe('errors.commandUnavailable');
      }
    }
  });

  it('error keys appended last, in order', () => {
    expect(Object.entries(REBELLION_ERROR_MESSAGE_KEYS).slice(-7)).toEqual([
      ['tableSyncPending', 'errors.tableSyncPending'],
      ['tableTaskNotFound', 'errors.tableTaskNotFound'],
      ['tableTaskNotHead', 'errors.tableTaskNotHead'],
      ['tableTaskNeedsRegistration', 'errors.tableTaskNeedsRegistration'],
      ['registrationUnavailable', 'errors.registrationUnavailable'],
      ['unknownCard', 'errors.unknownCard'],
      ['cardNotEligible', 'errors.cardNotEligible'],
    ]);
  });

  it('view: cards / table are required and nullable', () => {
    const view = coreEmpireView();
    expect(CorePlayerViewSchema.safeParse(view).success).toBe(true);
    const { cards: _c, ...noCards } = view;
    const { table: _t, ...noTable } = view;
    expect(CorePlayerViewSchema.safeParse(noCards).success).toBe(false);
    expect(CorePlayerViewSchema.safeParse(noTable).success).toBe(false);
    expect(
      CorePlayerViewSchema.safeParse({
        ...view,
        cards: { catalogId: 'rebellion-cards-v1', zones: [] },
        table: { tasks: [], aiWaiting: false, registration: null },
      }).success,
    ).toBe(true);
  });

  it('the real projection (W3 / W4): cards for every side, the table only for the human side', () => {
    const state = stateWith('empire', 'physical_companion');
    for (const side of ['rebels', 'empire'] as const) {
      const view = toSideView(state, side);
      expect(view.kind === 'player' && view.rulesEngine === 'core-v1').toBe(true);
      if (view.kind === 'player' && view.rulesEngine === 'core-v1') {
        expect(view.cards).not.toBeNull();
        if (side === 'empire') expect(view.table).not.toBeNull();
        else expect(view.table).toBeNull();
        expect(CorePlayerViewSchema.safeParse(view).success).toBe(true);
      }
    }
  });
});
