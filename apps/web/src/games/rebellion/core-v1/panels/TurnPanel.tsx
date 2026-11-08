import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import {
  activatableLeaders,
  canActivateLeader,
  hasPassed,
  opponentOf,
  turnState,
} from '../model/viewModel';
import { ActivationPicker } from './ActivationPicker';
import { TURN_PANEL_ID, TURN_TITLE_ID } from './focus';
import { factionLabel } from './labels';
import { LeaderPool } from './LeaderPool';
import { MovePanel } from './MovePanel';
import { useTurnErrorStore } from './turnErrorStore';

export type TurnPanelState = 'idle' | 'armed' | 'activation' | 'waiting' | 'over';

/**
 * «Turn» panel (plan-frontend §3.4, §5.1, §9): the top of the sidebar. `turn-panel[data-state]`:
 * `idle` — the viewer may activate / pass (pool + hint); `armed` — a leader is taken (pool + system picker);
 * `activation` — the viewer's own activation (moves); `waiting` — not the viewer's turn; `over` — game over.
 * Everything comes from `legalActions` / view fields through `viewModel`; the heading is the focus target after
 * FINISH / PASS in an AI game and the target of the «To the turn panel» skip link.
 */
export function TurnPanel() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const armedLeaderId = useCoreUiStore((s) => s.armedLeaderId);
  const activationError = useTurnErrorStore((s) => s.activation);

  const coarse = turnState(view);
  const armed =
    coarse === 'idle' && armedLeaderId !== null && canActivateLeader(view, armedLeaderId)
      ? armedLeaderId
      : null;
  const state: TurnPanelState = armed ? 'armed' : coarse;
  const opponent = opponentOf(view.viewer);

  let status: string;
  if (state === 'over') status = t('rebellion.turn:panel.gameOver');
  else if (state === 'waiting') {
    status = hasPassed(view, view.viewer)
      ? t('rebellion.turn:panel.youPassed')
      : t('rebellion.turn:panel.waiting', { side: factionLabel(t, view.activeSide) });
  } else if (state === 'activation') status = '';
  else if (hasPassed(view, opponent)) status = t(`rebellion.turn:panel.opponentPassed.${opponent}`);
  else status = t('rebellion.turn:panel.yourTurn');

  return (
    <Box
      component="section"
      id={TURN_PANEL_ID}
      aria-labelledby={TURN_TITLE_ID}
      data-testid="turn-panel"
      data-state={state}
      sx={{ display: 'grid', gap: 1.5, p: 2, overflowY: 'auto', minHeight: 0 }}
    >
      <Typography
        id={TURN_TITLE_ID}
        component="h2"
        variant="h6"
        tabIndex={-1}
        sx={{
          '&:focus': { outline: 'none' },
          '&:focus-visible': { outline: '2px solid', outlineOffset: 2 },
        }}
      >
        {t('rebellion.turn:panel.title')}
      </Typography>
      {status && (
        <Typography variant="body2" data-testid="turn-status">
          {status}
        </Typography>
      )}
      {(state === 'idle' || state === 'armed') && (
        <>
          <LeaderPool />
          {activatableLeaders(view).length > 0 && !armed && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('rebellion.turn:pool.hint')}
            </Typography>
          )}
          {armed && <ActivationPicker key={armed} leaderId={armed} />}
          {activationError && (
            <Alert severity="error" role="alert" data-testid="activation-error">
              {activationError}
            </Alert>
          )}
        </>
      )}
      {state === 'activation' && <MovePanel />}
    </Box>
  );
}
