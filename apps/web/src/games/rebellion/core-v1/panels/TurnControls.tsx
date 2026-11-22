import Box from '@mui/material/Box';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CONSOLE_FULL, CONSOLE_SPLIT, mq } from '@/shared/theme';
import { KeyButton } from '@/shared/ui';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useActivateSystem } from '../hooks/useActivateSystem';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import {
  activatableLeaders,
  activationTargets,
  canFinish,
  canPass,
  isGameOver,
} from '../model/viewModel';
import { PassConfirmDialog } from './PassConfirmDialog';
import { useTurnCommands } from './useTurnCommands';

const ACTIVATE_HINT_ID = 'core-turn-activate-hint';
/** Below this width the three keys do not fit in one row without breaking «АКТИВИРОВАТЬ». */
const NARROW_KEYS = 480;

/**
 * Turn keys of the console rail (SWR-009 C2, K-7; plan-frontend SWR-005 §5.2, §9, D-SW5-2): `turn-controls` group of
 * three hardware keys, each enabled only by `legalActions`:
 * - primary «Активировать систему» (`turn-activate`) — enabled ⇔ a leader is armed and the selected system is one of
 *   its `ACTIVATE_SYSTEM.systemIds`; sends through `useActivateSystem` (same path as the map click / leader drop);
 * - warning «Пасовать» (`pass-turn`) — asks for confirmation only while `ACTIVATE_SYSTEM` still lists a leader
 *   (Q-FE-3; R-6: a pass lasts for the whole phase);
 * - «Завершить активацию» (`finish-activation`).
 * Layout: 3 in a row ≥ 1200 px, 2 columns (finish on the full width) 900–1199 px, 3 in a row 480–899 px, below 480 px
 * «Activate» on its own row and «Pass» + «Finish» below; below 900 px the parent rail makes the row sticky
 * (`CoreSidebar`). Labels wrap between words only. After the game is over the keys are gone (the outcome banner says why).
 */
export function TurnControls() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const { finish, pass, isPending } = useTurnCommands();
  const activateSystem = useActivateSystem();
  const armed = useCoreUiStore((s) => s.armedLeaderId);
  const selection = useSelectionStore((s) => s.selection);
  const [confirming, setConfirming] = useState(false);
  // Cancel returns focus to «Pass»; after a confirmed pass the focus goes to the turn panel heading instead.
  const [restoreFocus, setRestoreFocus] = useState(true);

  if (isGameOver(view)) return null;
  const finishable = canFinish(view);
  const passable = canPass(view);
  const leftLeaders = activatableLeaders(view).length;
  const target =
    armed !== null &&
    selection.kind === 'system' &&
    activationTargets(view, armed).includes(selection.systemId)
      ? selection.systemId
      : null;
  const activatable = armed !== null && target !== null;

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
      sx={{
        display: 'grid',
        gap: '6px',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        [mq.down(CONSOLE_FULL)]: {
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          '& > [data-testid="finish-activation"]': { gridColumn: '1 / -1' },
        },
        [mq.down(CONSOLE_SPLIT)]: {
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          '& > [data-testid="finish-activation"]': { gridColumn: 'auto' },
        },
        // Narrow phones: «Activate» on its own row (full width), «Pass» + «Finish» below — the longest word
        // («АКТИВИРОВАТЬ») never has to break.
        [mq.down(NARROW_KEYS)]: {
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          '& > [data-testid="turn-activate"]': { gridColumn: '1 / -1' },
        },
        // Labels wrap between words only (never inside a word), whatever the theme sets.
        '& > button': {
          minWidth: 0,
          whiteSpace: 'normal',
          overflowWrap: 'normal',
          wordBreak: 'normal',
          hyphens: 'manual',
        },
      }}
    >
      <KeyButton
        tone="primary"
        led={activatable && !isPending ? 'green' : 'off'}
        data-testid="turn-activate"
        data-leader-id={armed ?? undefined}
        data-system-id={target ?? undefined}
        aria-describedby={activatable ? undefined : ACTIVATE_HINT_ID}
        disabled={!activatable || isPending}
        onClick={() => {
          if (armed !== null && target !== null) void activateSystem(armed, target);
        }}
      >
        {t('rebellion.turn:controls.activate')}
      </KeyButton>
      <KeyButton
        tone="warning"
        led={passable && !isPending ? 'amber' : 'off'}
        data-testid="pass-turn"
        disabled={!passable || isPending}
        onClick={onPass}
      >
        {t('rebellion.turn:controls.pass')}
      </KeyButton>
      <KeyButton
        tone={finishable ? 'primary' : 'default'}
        data-testid="finish-activation"
        disabled={!finishable || isPending}
        onClick={() => void finish()}
      >
        {t('rebellion.turn:controls.finish')}
      </KeyButton>
      <Box id={ACTIVATE_HINT_ID} hidden>
        {t('rebellion.turn:controls.activateHint')}
      </Box>
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
