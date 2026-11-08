/**
 * Events of a command response → what the `core-v1` table announces (aria-live / snackbar; SWR-005 plan-frontend
 * §3.1, §7). Pure: returns language-neutral descriptors; the text is built by the caller with `announcementI18n`
 * (keys live in the `rebellion.match` namespace, owned by Worker P2 — `announce.*`).
 *
 * Only what the player did NOT do themselves is announced: automatic AI moves (`payload.auto`), a new round
 * (time advanced), leaders returning, the base reveal, the end of the game. The player's own commands get their
 * feedback in the panels. Hidden information: events arrive already redacted by the server (system `null` =
 * hidden zone); nothing here looks anything up.
 */
import type { FactionId, OutcomeReason, PlayerEvent } from '@bga/game-rebellion/schema';

export type Announcement =
  | { kind: 'autoPass'; side: FactionId }
  | { kind: 'autoFinish'; side: FactionId }
  | { kind: 'opponentPassed'; side: FactionId }
  | { kind: 'leadersReturned'; count: number }
  | { kind: 'newRound'; round: number }
  | { kind: 'baseRevealed'; systemId: string }
  | { kind: 'gameOver'; winner: FactionId; reason: OutcomeReason };

/**
 * Descriptors for `events` (response order) as seen by `viewer`. A pass / finish by the viewer itself is not
 * announced (unless it was automatic, which never happens to a human side but is kept honest).
 */
export function announcementsFor(
  events: readonly PlayerEvent[],
  viewer: FactionId,
): Announcement[] {
  const out: Announcement[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'PASSED':
        if (e.payload.auto) out.push({ kind: 'autoPass', side: e.actor });
        else if (e.actor !== viewer) out.push({ kind: 'opponentPassed', side: e.actor });
        break;
      case 'ACTIVATION_FINISHED':
        if (e.payload.auto) out.push({ kind: 'autoFinish', side: e.actor });
        break;
      case 'LEADERS_RETURNED':
        if (e.payload.leaderIds.length > 0) {
          out.push({ kind: 'leadersReturned', count: e.payload.leaderIds.length });
        }
        break;
      case 'TIME_ADVANCED':
        out.push({ kind: 'newRound', round: e.payload.to });
        break;
      case 'BASE_REVEALED':
        out.push({ kind: 'baseRevealed', systemId: e.payload.systemId });
        break;
      case 'GAME_OVER':
        out.push({ kind: 'gameOver', winner: e.payload.winner, reason: e.payload.reason });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Whether the response ended the game (FE then invalidates the session detail and lists, AM-FE-10). */
export function endsGame(events: readonly PlayerEvent[]): boolean {
  return events.some((e) => e.type === 'GAME_OVER');
}

/**
 * i18n key + interpolation values of an announcement (`rebellion.match:announce.<kind>`). Values that are ids
 * (side, system, reason) are passed as i18n keys of their own namespaces for the caller to translate:
 * `side` → `rebellion.common:faction.<side>`, `systemId` → `rebellion.data:systems.<id>`,
 * `reason` → `rebellion.match:outcome.reason.<reason>`.
 */
export function announcementI18n(a: Announcement): {
  key: string;
  values: Record<string, string | number>;
} {
  const key = `rebellion.match:announce.${a.kind}`;
  switch (a.kind) {
    case 'autoPass':
    case 'autoFinish':
    case 'opponentPassed':
      return { key, values: { side: a.side } };
    case 'leadersReturned':
      return { key, values: { count: a.count } };
    case 'newRound':
      return { key, values: { round: a.round } };
    case 'baseRevealed':
      return { key, values: { systemId: a.systemId } };
    case 'gameOver':
      return { key, values: { winner: a.winner, reason: a.reason } };
  }
}
