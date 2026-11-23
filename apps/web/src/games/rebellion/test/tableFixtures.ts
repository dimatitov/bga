/**
 * SWR-010 FE-B (plan-frontend §10): Physical Execution views for web tests. Task queues follow plan-backend §5.3 /
 * §11.3 (ids `t-<version>-<n>`, steps from `TABLE_STEP_KEYS`, `null` system = the «Rebel Base» space); card zones come
 * from FE-A's `cardsView`. Every factory parses with `PlayerViewSchema` (see `core-v1/table/tableFixtures.test.ts`).
 * Tasks of the AI side name only what the human may see (no base system for the human Empire).
 */
import {
  FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS,
  probeDefinitionId,
  type PlayerViewCore,
  type RebellionSettings,
  type TableTask,
  type TableTaskKind,
  type TableView,
} from '@bga/game-rebellion/schema';
import { cardsView } from './cardFixtures';
import {
  CORE_EMPIRE_VS_AI,
  CORE_REBELS_VS_AI,
  CS_CORELLIA,
  CS_SULLUST,
  L_VADER,
  U_ST1,
  U_ST2,
  U_TIE,
  makeCoreEmpireView,
  makeCoreView,
} from './coreFixtures';

export const CORE_PHYSICAL_REBELS: RebellionSettings = {
  ...CORE_REBELS_VS_AI,
  gameMode: 'physical_companion',
};

export const CORE_PHYSICAL_EMPIRE: RebellionSettings = {
  ...CORE_EMPIRE_VS_AI,
  gameMode: 'physical_companion',
};

/** Systems the human Rebels may register as the base in the fixtures (the server's `eligibleDefinitionIds`). */
export const ELIGIBLE_BASE_SYSTEMS = ['yavin', 'hoth', 'dagobah'] as const;

const NO_AFFECTED: TableTask['affected'] = {
  cardDefinitionIds: [],
  leaderIds: [],
  unitIds: [],
  systemIds: [],
};

/** A task of `kind` with a minimal valid shape; `overrides` replace whole fields. */
export function makeTableTask(kind: TableTaskKind, overrides: Partial<TableTask> = {}): TableTask {
  return {
    id: 't-1-1',
    kind,
    actor: 'system',
    titleKey: `table.tasks.${kind}`,
    createdAtVersion: 1,
    affected: { ...NO_AFFECTED },
    steps: [{ key: 'table.steps.setupFirstGame', params: {} }],
    completion: kind === 'registerBase' ? 'register' : 'confirm',
    ...overrides,
  };
}

const removedProbeIds = () => FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS.map((s) => probeDefinitionId(s));

/** Initial queue of a human Rebel player (§5.3): `t-1-1 initialSetup` → `t-1-2 registerBase` (unless registered). */
export function initialRebelsTasks({
  registered = false,
}: { registered?: boolean } = {}): TableTask[] {
  const setup = makeTableTask('initialSetup', {
    id: 't-1-1',
    affected: { ...NO_AFFECTED, cardDefinitionIds: removedProbeIds() },
    steps: [
      { key: 'table.steps.setupFirstGame', params: {} },
      { key: 'table.steps.removeProbeCards', params: { definitionIds: removedProbeIds() } },
      { key: 'table.steps.setAsideReferenceStack', params: {} },
    ],
  });
  if (registered) return [setup];
  return [
    setup,
    makeTableTask('registerBase', {
      id: 't-1-2',
      actor: 'rebels',
      steps: [{ key: 'table.steps.registerBaseCard', params: {} }],
    }),
  ];
}

/** Initial queue of a human Empire player (§5.3): one `initialSetup` with the Location placeholder. */
export function initialEmpireTasks(): TableTask[] {
  return [
    makeTableTask('initialSetup', {
      id: 't-1-1',
      affected: { ...NO_AFFECTED, cardDefinitionIds: removedProbeIds() },
      steps: [
        { key: 'table.steps.setupFirstGame', params: {} },
        { key: 'table.steps.removeProbeCards', params: { definitionIds: removedProbeIds() } },
        { key: 'table.steps.placeLocationPlaceholder', params: {} },
        { key: 'table.steps.setAsideReferenceStack', params: {} },
      ],
    }),
  ];
}

/** The AI Empire activated Corellia with Vader. */
export function aiActivationTask(id = 't-5-1'): TableTask {
  return makeTableTask('aiActivation', {
    id,
    actor: 'empire',
    createdAtVersion: 5,
    affected: { ...NO_AFFECTED, leaderIds: [L_VADER], systemIds: [CS_CORELLIA] },
    steps: [
      { key: 'table.steps.placeLeader', params: { leaderId: L_VADER, systemId: CS_CORELLIA } },
    ],
  });
}

/** The AI Empire moved two troopers and a TIE from Sullust to Corellia. */
export function aiMoveTask(id = 't-6-1'): TableTask {
  return makeTableTask('aiMove', {
    id,
    actor: 'empire',
    createdAtVersion: 6,
    affected: {
      ...NO_AFFECTED,
      unitIds: [U_ST1, U_ST2, U_TIE],
      systemIds: [CS_SULLUST, CS_CORELLIA],
    },
    steps: [
      {
        key: 'table.steps.moveUnits',
        params: {
          unitIds: [U_ST1, U_ST2, U_TIE],
          fromSystemId: CS_SULLUST,
          toSystemId: CS_CORELLIA,
        },
      },
    ],
  });
}

/** The AI Rebels moved units into their (hidden) base — the human Empire sees only the «Rebel Base» space. */
export function aiMoveIntoBaseTask(
  unitIds: string[],
  fromSystemId: string,
  id = 't-6-1',
): TableTask {
  return makeTableTask('aiMove', {
    id,
    actor: 'rebels',
    createdAtVersion: 6,
    affected: { ...NO_AFFECTED, unitIds, systemIds: [fromSystemId, null] },
    steps: [{ key: 'table.steps.moveUnits', params: { unitIds, fromSystemId, toSystemId: null } }],
  });
}

/** Refresh for the human Empire: leaders back, the drawn probe cards (taken from the reference stack), time +1. */
export function refreshTaskEmpire(systems: string[] = ['hoth', 'endor'], id = 't-8-1'): TableTask {
  const cards = systems.map((s) => probeDefinitionId(s));
  return makeTableTask('refresh', {
    id,
    createdAtVersion: 8,
    affected: { ...NO_AFFECTED, cardDefinitionIds: cards, leaderIds: [L_VADER] },
    steps: [
      { key: 'table.steps.returnLeaders', params: { leaderIds: [L_VADER] } },
      { key: 'table.steps.takeProbeCards', params: { definitionIds: cards } },
      { key: 'table.steps.advanceTime', params: { from: 1, to: 2 } },
    ],
  });
}

/** Refresh for the human Rebels: the opponent drew `count` probe cards (a count only). */
export function refreshTaskRebels(count = 2, id = 't-8-1'): TableTask {
  return makeTableTask('refresh', {
    id,
    createdAtVersion: 8,
    steps: [
      { key: 'table.steps.opponentDrewProbeCards', params: { count } },
      { key: 'table.steps.advanceTime', params: { from: 1, to: 2 } },
    ],
  });
}

function table(tasks: TableTask[], extra: Partial<TableView> = {}): TableView {
  return { tasks, aiWaiting: false, registration: null, ...extra };
}

export interface PhysicalViewOptions {
  tasks?: TableTask[];
  aiWaiting?: boolean;
  /** The Location card is not registered yet (`registration` set, Location zone empty). Default: registered. */
  unregistered?: boolean;
}

/**
 * Human Rebels vs AI Empire, `physical_companion`. Default: the initial queue before the registration (head
 * `initialSetup`, then `registerBase`), Location physical and empty, no legal actions while tasks are open.
 */
export function makePhysicalRebelsView(
  opts: PhysicalViewOptions = {},
  overrides: Partial<PlayerViewCore> = {},
): PlayerViewCore {
  const unregistered = opts.unregistered ?? true;
  const tasks = opts.tasks ?? initialRebelsTasks({ registered: !unregistered });
  return makeCoreView({
    settings: { ...CORE_PHYSICAL_REBELS },
    ...(tasks.length > 0 ? { legalActions: [] } : {}),
    cards: cardsView('rebels', {
      location: unregistered ? null : 'yavin',
      physicalZoneIds: ['rebels-location'],
    }),
    table: table(tasks, {
      aiWaiting: opts.aiWaiting ?? false,
      registration: unregistered
        ? {
            zoneId: 'rebels-location',
            eligibleDefinitionIds: ELIGIBLE_BASE_SYSTEMS.map((s) => probeDefinitionId(s)),
          }
        : null,
    }),
    ...overrides,
  });
}

/** Human Empire vs AI Rebels, `physical_companion`. Default: the initial queue (`initialSetup` with the placeholder). */
export function makePhysicalEmpireView(
  opts: Omit<PhysicalViewOptions, 'unregistered'> & { empireProbes?: string[] } = {},
  overrides: Partial<PlayerViewCore> = {},
): PlayerViewCore {
  const tasks = opts.tasks ?? initialEmpireTasks();
  return makeCoreEmpireView({
    settings: { ...CORE_PHYSICAL_EMPIRE },
    ...(tasks.length > 0 ? { legalActions: [] } : {}),
    cards: cardsView('empire', {
      empireProbes: opts.empireProbes ?? [],
      physicalZoneIds: ['empire-probes'],
    }),
    table: table(tasks, { aiWaiting: opts.aiWaiting ?? false }),
    ...overrides,
  });
}
