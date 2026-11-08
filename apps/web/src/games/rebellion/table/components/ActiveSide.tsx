import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { PlayerViewMock } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { FactionChip } from '../../ui/FactionChip';

/**
 * Sides group of the top bar (SWR-004 plan-frontend §5.2, D-SW4-19). Human game: «Ход: <side>» — the active
 * side; AI game: the player's side. `data-side` is that side. The opponent text hides below 600 px (D-1, Q-22).
 */
export function ActiveSide({ view }: { view: PlayerViewMock }) {
  const { t } = useTranslation();
  const opp = view.settings;
  const human = opp.opponentType === 'human';
  const side = human ? view.activeSide : view.viewer;
  return (
    <Box
      data-testid="active-side"
      data-side={side}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}
    >
      {human && (
        <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
          {t('rebellion.session:topBar.turn')}
        </Typography>
      )}
      <FactionChip faction={side} />
      <Typography
        component="span"
        variant="body2"
        sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline' } }}
      >
        {!human && opp.aiDifficulty !== null
          ? t('rebellion.session:topBar.vsAi', {
              difficulty: t(`rebellion.common:difficulty.${opp.aiDifficulty}`),
            })
          : t('rebellion.session:topBar.vsHuman')}
      </Typography>
    </Box>
  );
}
