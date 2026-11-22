import { PlayerEventSchema, type PlayerViewCore } from '@bga/game-rebellion/schema';
import type { AutomationLastRun } from '@/platform';
import { aiSideOf } from './aiCommander';
import { hiddenZone } from './viewModel';

/** Systems (and the hidden zone) touched by the AI in its last automation run, in order of first appearance. */
export interface AiRecentMarks {
  systemIds: string[];
  zone: boolean;
}

/**
 * «Recent AI action» marks (SWR-009 K-5, plan §3.2, QD-3, AC-11): only from the REDACTED events of the last automation
 * run, only events whose `actor` is the AI side — `SYSTEM_ACTIVATED.systemId`, `PIECES_MOVED.from/toSystemId`.
 * A `null` system (the hidden base zone of an Empire view) marks the zone, never a system; only ids present in
 * `view.map.systems` are returned. `BASE_REVEALED` has actor `system` in the schema, so it never marks by itself (the
 * AI move that caused it already does). `null` when it is not an AI game or there is no last run. No new state: the
 * marks live as long as `lastRun` (same as the AI turn summary, A-6).
 */
export function aiRecentMarks(
  lastRun: AutomationLastRun | null,
  view: PlayerViewCore,
): AiRecentMarks | null {
  const ai = aiSideOf(view.settings);
  if (ai === null || lastRun === null) return null;
  const known = new Set(view.map.systems.map((s) => s.id));
  const zoneShown = hiddenZone(view) !== null;
  const systemIds: string[] = [];
  let zone = false;
  const mark = (id: string | null) => {
    if (id === null) {
      if (zoneShown) zone = true;
      return;
    }
    if (known.has(id) && !systemIds.includes(id)) systemIds.push(id);
  };
  for (const raw of lastRun.events) {
    const parsed = PlayerEventSchema.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.actor !== ai) continue;
    if (e.type === 'SYSTEM_ACTIVATED') mark(e.payload.systemId);
    else if (e.type === 'PIECES_MOVED') {
      mark(e.payload.fromSystemId);
      mark(e.payload.toSystemId);
    }
  }
  return { systemIds, zone };
}
