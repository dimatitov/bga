import DoneAllIcon from '@mui/icons-material/DoneAll';
import PanToolIcon from '@mui/icons-material/PanTool';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { activatableLeaders, canFinish, canPass, isGameOver } from '../model/viewModel';
import { PassConfirmDialog } from './PassConfirmDialog';
import { useTurnCommands } from './useTurnCommands';

/**
 * «Finish activation» / «Pass» (plan-frontend §5.2, §9; D-SW5-2): always visible in the top bar (P2 places it via
 * `CoreTopBar controls`), enabled only when `legalActions` lists `FINISH_ACTIVATION` / `PASS`. «Pass» asks for
 * confirmation only while `ACTIVATE_SYSTEM` still lists a leader (Q-FE-3; R-6: a pass lasts for the whole phase).
 * After the game is over the controls are gone (the outcome banner says why).
 */
export function TurnControls() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const { finish, pass, isPending } = useTurnCommands();
  const [confirming, setConfirming] = useState(false);
  // Cancel returns focus to «Pass»; after a confirmed pass the focus goes to the turn panel heading instead.
  const [restoreFocus, setRestoreFocus] = useState(true);

  if (isGameOver(view)) return null;
  const finishable = canFinish(view);
  const passable = canPass(view);
  const leftLeaders = activatableLeaders(view).length;

  const onPass = () => {
    if (leftLeaders > 0) {
      setRestoreFocus(true);
      setConfirming(true);
    } else void pass();
  };

  return (
    <Box
      role="group"
      aria-label={t('rebellion.turn:controls.label')}
      data-testid="turn-controls"
      sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
    >
      <Button
        variant={finishable ? 'contained' : 'outlined'}
        size="small"
        startIcon={<DoneAllIcon />}
        data-testid="finish-activation"
        disabled={!finishable || isPending}
        onClick={() => void finish()}
      >
        {t('rebellion.turn:controls.finish')}
      </Button>
      <Button
        variant="outlined"
        size="small"
        startIcon={<PanToolIcon />}
        data-testid="pass-turn"
        disabled={!passable || isPending}
        onClick={onPass}
      >
        {t('rebellion.turn:controls.pass')}
      </Button>
      <PassConfirmDialog
        open={confirming}
        restoreFocus={restoreFocus}
        count={leftLeaders}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setRestoreFocus(false);
          setConfirming(false);
          void pass();
        }}
      />
    </Box>
  );
}
