import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { activationOf, moveSources } from '../model/viewModel';
import { MOVE_TITLE_ID } from './focus';
import { leaderLabel, systemLabel } from './labels';
import { MoveSourceFieldset } from './MoveSourceFieldset';

/**
 * Moves of the viewer's own activation (plan-frontend §5.3 step 4): the heading «Activation: <system> · <leader>»
 * (focus target after ACTIVATE and after each successful MOVE) and one fieldset per `MOVE_PIECES` source, in server
 * order. No sources → a neutral note; finishing the activation is the «Finish activation» control.
 */
export function MovePanel() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const activation = activationOf(view);
  const sources = moveSources(view);
  if (!activation) return null;
  const leader = leaderLabel(t, activation.leaderId);
  const title =
    activation.systemId === null
      ? t('rebellion.turn:move.titleZone', { leader })
      : t('rebellion.turn:move.title', {
          system: systemLabel(t, view, activation.systemId),
          leader,
        });

  return (
    <Box
      component="section"
      aria-labelledby={MOVE_TITLE_ID}
      data-testid="move-panel"
      data-to={activation.systemId ?? undefined}
      sx={{ display: 'grid', gap: 1.5 }}
    >
      <Typography
        id={MOVE_TITLE_ID}
        component="h3"
        variant="subtitle1"
        tabIndex={-1}
        sx={{
          fontWeight: 600,
          '&:focus': { outline: 'none' },
          '&:focus-visible': { outline: '2px solid', outlineOffset: 2 },
        }}
      >
        {title}
      </Typography>
      {sources.length === 0 ? (
        <Typography variant="body2" data-testid="move-none">
          {t('rebellion.turn:move.none')}
        </Typography>
      ) : (
        <>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('rebellion.turn:move.intro')}
          </Typography>
          {sources.map((s) => (
            <MoveSourceFieldset key={s.fromSystemId} source={s} />
          ))}
        </>
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t('rebellion.turn:move.pinnedHint')}
      </Typography>
    </Box>
  );
}
