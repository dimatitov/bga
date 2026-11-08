import { RebellionSessionDetailsSchema } from '@bga/game-rebellion/schema';
import type { SessionSummary } from '@bga/platform';
import type { TFunction } from 'i18next';
import type { SessionLinePart } from '@/games/types';

/**
 * Rebellion session line for "Continue"/"Recent" on the game page (D-GP-4/5, Q-13; SWR-004 plan-frontend §3,
 * AM-FE-9; SWR-005 plan-frontend §7, AM-FE-7). Parts (namespace `rebellion.list`):
 * - `faction` «Империя», `opponent` «против AI (Сложная)» / «против второго игрока»;
 * - `core-v1`: `progress` «Время 3 · Репутация 14 · Приказы» (`round` = time marker); a finished game —
 *   `progress` «Время 14 · Репутация 14» + `outcome` «Победа Повстанцев» (`details.winner`);
 * - `mock-v1` (old prototype): `progress` «Р2 · Приказы» + `engine` «Старый прототип».
 * The platform renders them and appends status («Завершена» for `completed`) + time.
 * `aiDifficulty: null` (human, Q-20) → no difficulty; ruleset/mode are not shown while only one is selectable (OQ-4).
 * Invalid `details` → `[]`, so the platform shows its generic text.
 */
export function describeRebellionSession(summary: SessionSummary, t: TFunction): SessionLinePart[] {
  const parsed = RebellionSessionDetailsSchema.safeParse(summary.details);
  if (!parsed.success) return [];
  const {
    playerFaction,
    opponentType,
    aiDifficulty,
    round,
    phase,
    rulesEngine,
    winner,
    reputation,
  } = parsed.data;
  let opponent: string;
  if (opponentType === 'human') opponent = t('rebellion.list:opponentHuman');
  else if (aiDifficulty)
    opponent = t('rebellion.list:opponentAi', {
      difficulty: t(`rebellion.common:difficulty.${aiDifficulty}`),
    });
  else opponent = t('rebellion.list:opponentAiPlain');
  const parts: SessionLinePart[] = [
    { key: 'faction', text: t(`rebellion.common:faction.${playerFaction}`) },
    { key: 'opponent', text: opponent },
  ];
  const phaseText = t(`rebellion.common:phase.${phase}`);

  if (rulesEngine === 'mock-v1') {
    parts.push(
      { key: 'progress', text: t('rebellion.list:progress', { round, phase: phaseText }) },
      { key: 'engine', text: t('rebellion.list:legacy') },
    );
    return parts;
  }

  let progress: string;
  if (reputation === null)
    progress = t('rebellion.list:progressTime', { time: round, phase: phaseText });
  else if (winner !== null)
    progress = t('rebellion.list:progressCoreOver', { time: round, reputation });
  else progress = t('rebellion.list:progressCore', { time: round, reputation, phase: phaseText });
  parts.push({ key: 'progress', text: progress });
  if (winner !== null) {
    parts.push({
      key: 'outcome',
      text: t(winner === 'rebels' ? 'rebellion.list:winnerRebels' : 'rebellion.list:winnerEmpire'),
    });
  }
  return parts;
}
