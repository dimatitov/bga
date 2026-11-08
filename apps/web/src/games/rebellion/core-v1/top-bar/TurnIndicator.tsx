import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { FactionChip } from '../../ui/FactionChip';
import { hasPassed } from '../model/viewModel';

/**
 * Sides group of the `core-v1` top bar (SWR-005 plan-frontend §7): «Ход: □ Повстанцы (вы)» — the active side;
 * «(вы)» when it is the viewer's side in an AI game; the opponent text («против AI · Обычная» / «против второго
 * игрока») hides below 600 px. `turn-indicator[data-side][data-mine]`.
 */
export function TurnIndicator({ view }: { view: PlayerViewCore }) {
  const { t } = useTranslation();
  const settings = view.settings;
  const ai = settings.opponentType === 'ai';
  const side = view.activeSide;
  const mine = side === view.viewer;
  let opponent: string;
  if (!ai) opponent = t('rebellion.match:turn.vsHuman');
  else if (settings.aiDifficulty !== null)
    opponent = t('rebellion.match:turn.vsAi', {
      difficulty: t(`rebellion.common:difficulty.${settings.aiDifficulty}`),
    });
  else opponent = t('rebellion.match:turn.vsAiPlain');
  return (
    <Box
      data-testid="turn-indicator"
      data-side={side}
      data-mine={mine ? 'true' : 'false'}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}
    >
      <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
        {t('rebellion.session:topBar.turn')}
      </Typography>
      <FactionChip faction={side} />
      {ai && mine && (
        <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
          {t('rebellion.match:turn.you')}
        </Typography>
      )}
      <Typography
        component="span"
        variant="body2"
        sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline' } }}
      >
        {opponent}
      </Typography>
    </Box>
  );
}

/**
 * Who has passed for the rest of the command phase (R-6, `view.passed`): one chip per side «Империя: пас».
 * Nothing when nobody has passed or the game is over. `passed-indicator[data-rebels][data-empire]`.
 */
export function PassedIndicator({ view }: { view: PlayerViewCore }) {
  const { t } = useTranslation();
  const sides = (['rebels', 'empire'] as const).filter((s) => hasPassed(view, s));
  if (view.outcome || sides.length === 0) return null;
  return (
    <Box
      data-testid="passed-indicator"
      data-rebels={String(view.passed.rebels)}
      data-empire={String(view.passed.empire)}
      role="group"
      aria-label={t('rebellion.match:passed.label')}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
    >
      {sides.map((s) => (
        <Chip
          key={s}
          data-testid={`passed-${s}`}
          size="small"
          variant="outlined"
          label={t('rebellion.match:passed.side', { side: t(`rebellion.common:faction.${s}`) })}
        />
      ))}
    </Box>
  );
}
