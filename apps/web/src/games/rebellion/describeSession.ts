import { RebellionSessionDetailsSchema } from '@bga/game-rebellion/schema';
import type { SessionSummary } from '@bga/platform';
import type { TFunction } from 'i18next';
import type { SessionLinePart } from '@/games/types';

/**
 * Rebellion session line for "Continue"/"Recent" on the game page (D-GP-4/5, Q-13; SWR-004 plan-frontend §3,
 * AM-FE-9): parts `faction` «Империя», `opponent` «против AI (Сложная)» / «против второго игрока», `progress`
 * «Р2 · Командование» (namespace `rebellion.list`). The platform renders them and appends status + time.
 * `aiDifficulty: null` (human, Q-20) → no difficulty; ruleset/mode are not shown while only one is selectable (OQ-4).
 * Invalid `details` → `[]`, so the platform shows its generic text.
 */
export function describeRebellionSession(summary: SessionSummary, t: TFunction): SessionLinePart[] {
  const parsed = RebellionSessionDetailsSchema.safeParse(summary.details);
  if (!parsed.success) return [];
  const { playerFaction, opponentType, aiDifficulty, round, phase } = parsed.data;
  let opponent: string;
  if (opponentType === 'human') opponent = t('rebellion.list:opponentHuman');
  else if (aiDifficulty)
    opponent = t('rebellion.list:opponentAi', {
      difficulty: t(`rebellion.common:difficulty.${aiDifficulty}`),
    });
  else opponent = t('rebellion.list:opponentAiPlain');
  return [
    { key: 'faction', text: t(`rebellion.common:faction.${playerFaction}`) },
    { key: 'opponent', text: opponent },
    {
      key: 'progress',
      text: t('rebellion.list:progress', {
        round,
        phase: t(`rebellion.common:phase.${phase}`),
      }),
    },
  ];
}
