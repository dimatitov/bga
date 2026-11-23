/**
 * English texts of the decision point for the model (SWR-006 D-PO-1, plan-backend §4.6): `objective`,
 * `situation`, candidate `summary`. Built ONLY from the actor's own view (+ values derived from it): never
 * `view.id`, `version`, event times or setting keys other than the difficulty. For the Empire before the reveal
 * nothing here depends on the base location (Rebel pieces in the base are "the hidden zone"; base guesses come
 * from `intel`, which is itself invariant). ASCII only; every text is cut deterministically to its limit.
 */
import { probeSystemOf, type CorePlayerView, type Faction } from '../schema';
import { possibleBaseSystems, type BaseIntel } from './intel';
import type { BotCandidate } from './types';
import { buildViewModel, type ForceSummary, type ViewModel } from './view-model';

export const DESCRIBE_LIMITS = { objective: 300, situation: 4000, summary: 160 } as const;
/** Per-section budget of `situation` (sections are cut independently, then the whole text). */
const SECTION_MAX = 600;
const LIST_MAX = 16;

const SIDE_NAME: Record<Faction, string> = { empire: 'Empire', rebels: 'Rebels' };
const SIDE_ADJECTIVE: Record<Faction, string> = { empire: 'Imperial', rebels: 'Rebel' };

/** `1 ship`, `2 ships`. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

const OBJECTIVE: Record<Faction, string> = {
  empire:
    'Find the hidden Rebel base: activate unsearched systems and move ground units into them; a system ' +
    'activated by you with your ground unit in it is searched when the activation ends. After the base is ' +
    'revealed keep units in it: you win when no Rebel unit remains there.',
  rebels:
    'Survive until the time marker reaches reputation. Keep the base hidden and guarded: the Empire wins if ' +
    'it holds the revealed base with no Rebel unit in it.',
};

/** Cut to `max` characters (ASCII texts: one char = one code unit), marking the cut with "...". */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

/** Replace anything outside printable ASCII (ids are kebab-case ASCII already; defensive). */
function ascii(text: string): string {
  return text.replace(/[^\x20-\x7e\n]/g, '?');
}

function list(items: readonly string[], empty = 'none', separator = ', '): string {
  if (items.length === 0) return empty;
  const shown = items.slice(0, LIST_MAX).join(separator);
  return items.length > LIST_MAX ? `${shown} (+${items.length - LIST_MAX} more)` : shown;
}

export function objectiveFor(view: CorePlayerView): string {
  return clip(OBJECTIVE[view.viewer], DESCRIBE_LIMITS.objective);
}

function forcesText(forces: ForceSummary): string {
  const parts = [`${forces.ground} ground`, count(forces.ships, 'ship')];
  if (forces.capacity > 0) parts.push(`capacity ${forces.capacity}`);
  return parts.join(', ');
}

function forcesSection(model: ViewModel, side: 'own' | 'enemy'): string[] {
  const bySystem = side === 'own' ? model.ownUnitsBySystem : model.enemyUnitsBySystem;
  return model.systemIds
    .filter((id) => bySystem.has(id))
    .map((id) => `${id}: ${forcesText(model.forcesOf(side, id))}`);
}

function leadersText(view: CorePlayerView, owner: Faction): string {
  const leaders = view.leaders.filter((l) => l.owner === owner);
  const pool = leaders.filter((l) => l.location.kind === 'pool').map((l) => l.id);
  const onMap: string[] = [];
  let hidden = 0;
  for (const leader of leaders) {
    if (leader.location.kind === 'system')
      onMap.push(`${leader.id} at ${leader.location.systemId}`);
    if (leader.location.kind === 'rebelBase') hidden += 1;
  }
  const parts = [`in pool: ${list(pool)}`, `on the map: ${list(onMap)}`];
  if (hidden > 0) parts.push(`${hidden} in the hidden zone`);
  return parts.join('; ');
}

function activationText(view: CorePlayerView, model: ViewModel): string {
  const activation = view.activation;
  if (activation === null) return 'none';
  const where =
    activation.location.kind === 'system' ? activation.location.systemId : 'the hidden zone';
  if (activation.side === view.viewer) {
    const moves = model.activation?.moves ?? 0;
    return `yours: ${where} with ${activation.leaderId}; moves made in it: ${moves}`;
  }
  return `opponent's: ${where} with ${activation.leaderId}`;
}

function baseLines(view: CorePlayerView, intel: BaseIntel | null, model: ViewModel): string[] {
  if (view.viewer === 'rebels') {
    const baseId = view.rebelBase.systemId;
    const state = view.rebelBase.revealed ? 'revealed to the Empire' : 'hidden from the Empire';
    return [`Your base: ${baseId ?? 'unknown'} (${state}).`];
  }
  if (view.rebelBase.systemId !== null) {
    return [`Rebel base: revealed at ${view.rebelBase.systemId}.`];
  }
  const lines = ['Rebel base: unknown.'];
  if (intel === null) return lines;
  const searched = model.systemIds.filter((id) => intel.searched.has(id));
  lines.push(`Searched systems (not the base): ${list(searched)}.`);
  const difficulty = view.settings.aiDifficulty ?? 'normal';
  if (difficulty !== 'easy') {
    const weights = possibleBaseSystems(view, intel, {
      useHints: true,
      useStartRule: difficulty === 'hard',
    });
    const ranked = [...weights]
      .map(([id, w], i) => ({ id, w, i }))
      .sort((a, b) => b.w - a.w || a.i - b.i)
      .map(({ id, w }) => (w > 1 ? `${id} (hint ${w - 1})` : id));
    lines.push(`Possible base locations (${ranked.length}): ${list(ranked)}.`);
  }
  return lines;
}

/**
 * SWR-010 (plan-backend §8.1, AQ-5): card knowledge of the actor, ONLY from its own `view.cards` (own cards +
 * public counts; the opponent's cards are never in the view). Lines appear only when a count is > 0, so round 1
 * and legacy games (`cards: null`) keep the SWR-008 text byte for byte. The Rebels' single Location card is a
 * constant and is not printed.
 */
function cardLines(view: CorePlayerView): string[] {
  const cards = view.cards;
  if (cards === null) return [];
  const zone = (id: string) => cards.zones.find((z) => z.id === id);
  const probes = zone('empire-probes');
  const deckCount = zone('probe-deck')?.count ?? 0;
  if (probes === undefined || probes.count === 0) return [];
  if (view.viewer === 'empire') {
    const systems = (probes.cards ?? []).map(
      (c) => probeSystemOf(c.definitionId) ?? c.definitionId,
    );
    return [
      `Your probe cards (the Rebel base is NOT in these systems): ${list(systems)}. ` +
        `Probe deck: ${count(deckCount, 'card')} left.`,
    ];
  }
  return [
    `The Empire holds ${count(probes.count, 'probe card')} (each names a system that is not your base); ` +
      `probe deck: ${count(deckCount, 'card')} left.`,
  ];
}

/**
 * Compact situation of the actor (≤ 4000): round, time/reputation, passes, leaders, base knowledge, forces,
 * the hidden zone, the current activation. Sections in a fixed order, each cut to its own budget.
 */
export function situationFor(
  view: CorePlayerView,
  intel: BaseIntel | null,
  model: ViewModel = buildViewModel(view),
): string {
  const me = view.viewer;
  const other = model.opponent;
  const passed = (['rebels', 'empire'] as const).filter((side) => view.passed[side]);
  const difficulty = view.settings.aiDifficulty;
  const sections: string[] = [
    // Review F-8: neutral wording — the model must not read "bot difficulty" as an instruction to play weakly.
    `You play the ${SIDE_NAME[me]}${difficulty ? ` (game difficulty setting: ${difficulty})` : ''}.`,
    `Round ${view.round}, phase ${view.phase}. Time ${view.markers.time}, reputation ${view.markers.reputation}: ` +
      `the Rebels win when time reaches reputation (${Math.max(0, view.markers.reputation - view.markers.time)} rounds left).`,
    `Passed this round: ${list(
      passed.map((s) => SIDE_NAME[s]),
      'nobody',
    )}.`,
    `Your leaders: ${leadersText(view, me)}.`,
    `${SIDE_ADJECTIVE[other]} leaders: ${leadersText(view, other)}.`,
    ...baseLines(view, intel, model),
    ...cardLines(view),
    `Your forces: ${list(forcesSection(model, 'own'), 'none', '; ')}.`,
    `Visible ${SIDE_ADJECTIVE[other]} forces: ${list(forcesSection(model, 'enemy'), 'none', '; ')}.`,
  ];
  if (me === 'empire' && view.rebelBase.systemId === null) {
    sections.push(`Rebel units in the hidden zone: ${model.hiddenEnemyUnits}.`);
  }
  sections.push(`Current activation: ${activationText(view, model)}.`);
  const text = sections.map((s) => clip(ascii(s), SECTION_MAX)).join('\n');
  return clip(text, DESCRIBE_LIMITS.situation);
}

function moveCounts(candidate: BotCandidate, model: ViewModel): { ground: number; ships: number } {
  let ground = 0;
  let ships = 0;
  if (candidate.command.type !== 'MOVE_PIECES') return { ground, ships };
  const ids = new Set(candidate.command.pieceIds);
  for (const unit of model.view.units) {
    if (!ids.has(unit.id)) continue;
    if (model.typeOf(unit.typeKey)?.arena === 'ground') ground += 1;
    else ships += 1;
  }
  return { ground, ships };
}

/** One line per candidate (≤ 160), from the actor's view and `intel` only. */
export function summaryFor(
  view: CorePlayerView,
  candidate: BotCandidate,
  model: ViewModel = buildViewModel(view),
  intel: BaseIntel | null = null,
): string {
  const command = candidate.command;
  let text: string;
  switch (command.type) {
    case 'ACTIVATE_SYSTEM': {
      const parts = [`Activate ${command.systemId} with ${command.leaderId}`];
      if (view.viewer === 'empire') {
        if (view.rebelBase.systemId !== null) {
          parts.push(
            command.systemId === view.rebelBase.systemId ? 'revealed base' : 'not the base',
          );
        } else if (intel !== null) {
          const known =
            intel.searched.has(command.systemId) || intel.excluded.has(command.systemId);
          parts.push(`searched or excluded: ${known ? 'yes' : 'no'}`);
        }
      } else if (command.systemId === view.rebelBase.systemId) {
        parts.push('your base');
      }
      parts.push(
        `your ground units there: ${model.ownGroundIn(command.systemId)}`,
        `that can move in: ${model.deliverableGround(command.systemId)}`,
      );
      text = `${parts.join('; ')}.`;
      break;
    }
    case 'MOVE_PIECES': {
      const { ground, ships } = moveCounts(candidate, model);
      text =
        `Move ${count(command.pieceIds.length, 'unit')} (${ground} ground, ${count(ships, 'ship')}) ` +
        `from ${command.fromSystemId} into ${command.toSystemId}.`;
      break;
    }
    case 'FINISH_ACTIVATION': {
      const where = model.activation?.systemId ?? 'the current system';
      text = `Finish the activation of ${where}.`;
      break;
    }
    case 'PASS':
      text = 'Pass for the rest of this round.';
      break;
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
  return clip(ascii(text), DESCRIBE_LIMITS.summary);
}
