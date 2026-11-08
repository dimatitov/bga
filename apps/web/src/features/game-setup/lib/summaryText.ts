import { type GameSummary } from '@swr/contracts';
import { type TFunction } from 'i18next';
import { formatRelativeTime } from './formatRelativeTime';

/** «Раунд 2 · Империя · 5 мин назад» under «Продолжить» (D-M-2). */
export function continueHint(t: TFunction, game: GameSummary, language: string): string {
  return t('setup:menu.continueHint', {
    round: t('common:round', { round: game.round }),
    faction: t(`common:faction.${game.setup.humanFaction}`),
    time: formatRelativeTime(game.updatedAt, language),
  });
}

/** «Империя vs AI (Обычная) · Р2 · Командование · 5 мин назад» (D-M-3). */
export function recentItemText(t: TFunction, game: GameSummary, language: string): string {
  const { opponent } = game.setup;
  return t('setup:recent.item', {
    faction: t(`common:faction.${game.setup.humanFaction}`),
    opponent:
      opponent.kind === 'ai'
        ? t('setup:recent.opponentAi', {
            difficulty: t(`common:difficulty.${opponent.difficulty}`),
          })
        : t('setup:recent.opponentHuman'),
    round: game.round,
    phase: t(`common:phase.${game.phase}`),
    time: formatRelativeTime(game.updatedAt, language),
  });
}
