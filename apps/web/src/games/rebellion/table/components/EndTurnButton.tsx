import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';
import { reportCommandFailure, useBoard } from '../../board';

/**
 * «Передать ход» (`END_TURN`, SWR-004 plan-frontend §5.2): rendered only in a human game (TC-C-19), enabled only
 * when the server lists `END_TURN` in `legalActions` (AM-FE-7 — the UI does not decide whose turn it is). No
 * confirmation (D-P-3): the handoff screen is the pause. The handoff view replaces the table by itself.
 */
export function EndTurnButton() {
  const { t } = useTranslation();
  const { view, send, isPending } = useBoard();
  if (view.settings.opponentType !== 'human') return null;
  const legal = view.legalActions.some((a) => a.type === 'END_TURN');
  const endTurn = async () => {
    const outcome = await send({ type: 'END_TURN' });
    if (!outcome.ok) reportCommandFailure(t, outcome, () => void endTurn());
  };
  return (
    <Button
      data-testid="end-turn"
      variant="outlined"
      size="small"
      disabled={!legal || isPending}
      onClick={() => void endTurn()}
      startIcon={isPending ? <CircularProgress size={14} /> : <SwapHorizIcon />}
      sx={{ whiteSpace: 'nowrap' }}
    >
      {t('rebellion.session:topBar.endTurn')}
    </Button>
  );
}
