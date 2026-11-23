/**
 * Physical Execution selectors (SWR-010 FE-B, plan-frontend §2.1, §4.1, §8.3). Pure functions of the server view:
 * the console mode, the task queue and the display values of task steps. Everything comes from `view.table`
 * (built by the server from the human's redacted view) + public names; nothing hidden is inferred here.
 */
import type {
  PlayerViewCore,
  TableStep,
  TableStepKey,
  TableTask,
  TableView,
} from '@bga/game-rebellion/schema';
import type { TFunction } from 'i18next';
import { cardName } from '../../cards/model/catalog';
import { coreLeaderName, coreSystemName, coreUnitName } from '../../sidebar/coreLogMessage';

export const TABLE_NS = 'rebellion.table';

export type ConsoleMode = 'turn' | 'physical';

/**
 * `physical` while the server keeps physical-table tasks for the viewer (also after the game is over, C-5), `turn`
 * otherwise. A function of the view only: a reload restores the mode by itself (AC-14, AC-21).
 */
export function consoleMode(view: PlayerViewCore): ConsoleMode {
  return view.table !== null && view.table.tasks.length > 0 ? 'physical' : 'turn';
}

export function tableTasks(view: PlayerViewCore): readonly TableTask[] {
  return view.table?.tasks ?? [];
}

/** The head of the queue — the only task the player can complete now. */
export function headTask(view: PlayerViewCore): TableTask | null {
  return view.table?.tasks[0] ?? null;
}

/** «AI waits for the table» — the server's flag (queue non-empty, game running, AI side active). */
export function isAiWaiting(view: PlayerViewCore): boolean {
  return view.table?.aiWaiting ?? false;
}

/** The pending Location registration (human Rebels, physical game), `null` otherwise. */
export function registrationOf(view: PlayerViewCore): TableView['registration'] {
  return view.table?.registration ?? null;
}

/** Localized task title (`rebellion.table:table.tasks.<kind>`). */
export function taskTitle(t: TFunction, task: Pick<TableTask, 'titleKey'>): string {
  return t(`${TABLE_NS}:${task.titleKey}`);
}

const MISSING = '—';

function listFormat(lng: string, items: readonly string[]): string {
  if (items.length === 0) return MISSING;
  try {
    return new Intl.ListFormat(lng, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

/** A system named in a task: `null` = the «Rebel Base» space (the hidden zone of the viewer). */
function systemText(t: TFunction, view: PlayerViewCore, systemId: string | null): string {
  return systemId === null ? t(`${TABLE_NS}:px.baseSpace`) : coreSystemName(t, systemId, view);
}

/** Units grouped by their (shown) type: «2× X-wing, 1× Rebel trooper». */
export function groupedUnits(
  t: TFunction,
  view: PlayerViewCore,
  unitIds: readonly string[],
): string[] {
  const counts = new Map<string, number>();
  for (const id of unitIds) {
    const name = coreUnitName(t, id, view);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, n]) => `${n}× ${name}`);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Interpolation values each step text needs (plan-frontend §8.3); a missing one becomes «—». */
const STEP_VALUES: Readonly<Record<TableStepKey, readonly string[]>> = {
  'table.steps.setupFirstGame': [],
  'table.steps.removeProbeCards': ['cards', 'count'],
  'table.steps.setAsideReferenceStack': [],
  'table.steps.placeLocationPlaceholder': [],
  'table.steps.registerBaseCard': [],
  'table.steps.placeLeader': ['leader', 'system'],
  'table.steps.moveUnits': ['units', 'count', 'from', 'to'],
  'table.steps.returnLeaders': ['leaders', 'count'],
  'table.steps.takeProbeCards': ['cards', 'count'],
  'table.steps.opponentDrewProbeCards': ['count'],
  'table.steps.advanceTime': ['from', 'to'],
  'table.steps.revealBase': ['system'],
  'table.steps.revealOwnBase': ['system'],
  'table.steps.moveBaseUnits': ['system'],
};

export type StepValues = Record<string, string | number>;

/**
 * Display values of a step (plan-frontend §8.3) from its `params` only: card ids → card names, leader / unit /
 * system ids → names (`null` system → «the "Rebel Base" space»), lists → `Intl.ListFormat` of `lng`. A param that
 * is absent or of an unexpected shape becomes «—» (never a crash, never a raw id list).
 */
export function stepValues(
  t: TFunction,
  step: TableStep,
  view: PlayerViewCore,
  lng: string,
): StepValues {
  const p = step.params;
  const out: StepValues = {};
  if (isStringArray(p.definitionIds)) {
    out.cards = listFormat(
      lng,
      p.definitionIds.map((id) => cardName(t, id)),
    );
    out.count = p.definitionIds.length;
  }
  if (typeof p.leaderId === 'string') out.leader = coreLeaderName(t, p.leaderId);
  if (isStringArray(p.leaderIds)) {
    out.leaders = listFormat(
      lng,
      p.leaderIds.map((id) => coreLeaderName(t, id)),
    );
    out.count = p.leaderIds.length;
  }
  if (isStringArray(p.unitIds)) {
    out.units = listFormat(lng, groupedUnits(t, view, p.unitIds));
    out.count = p.unitIds.length;
  }
  if (typeof p.systemId === 'string' || p.systemId === null) {
    out.system = systemText(t, view, p.systemId);
  }
  if (typeof p.fromSystemId === 'string' || p.fromSystemId === null) {
    out.from = systemText(t, view, p.fromSystemId);
  }
  if (typeof p.toSystemId === 'string' || p.toSystemId === null) {
    out.to = systemText(t, view, p.toSystemId);
  }
  if (typeof p.count === 'number') out.count = p.count;
  if (typeof p.from === 'number') out.from = p.from;
  if (typeof p.to === 'number') out.to = p.to;
  for (const name of STEP_VALUES[step.key] ?? []) {
    if (!(name in out)) out[name] = MISSING;
  }
  return out;
}

/** Localized text of one step. */
export function stepText(t: TFunction, step: TableStep, view: PlayerViewCore, lng: string): string {
  return t(`${TABLE_NS}:${step.key}`, stepValues(t, step, view, lng));
}

export interface AffectedItems {
  cards: string[];
  leaders: string[];
  units: string[];
  systems: string[];
}

/** What the task touches (AC-21 «Затронуто»), localized; units grouped by type, `null` system = «Rebel Base» space. */
export function affectedItems(t: TFunction, task: TableTask, view: PlayerViewCore): AffectedItems {
  const a = task.affected;
  return {
    cards: a.cardDefinitionIds.map((id) => cardName(t, id)),
    leaders: a.leaderIds.map((id) => coreLeaderName(t, id)),
    units: groupedUnits(t, view, a.unitIds),
    systems: [...new Set(a.systemIds.map((id) => systemText(t, view, id)))],
  };
}
