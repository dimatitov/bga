import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

const TITLE_ID = 'core-pass-confirm-title';
const TEXT_ID = 'core-pass-confirm-text';

/**
 * «Pass?» (plan-frontend §5.3 step 5, Q-FE-3, D-SW5-6): shown only while the pool still has a leader who can
 * activate. Focus starts on «Cancel» (the safe action); Esc / backdrop close; Enter on «Pass» confirms.
 * `autoFocus` alone is not enough in a real browser: the modal focus trap moves the focus to the dialog surface
 * while the enter transition runs (SWR-005 D-1), so «Cancel» is focused again once the transition has entered
 * (and on enter, for reduced motion where the transition is instant).
 */
export function PassConfirmDialog({
  open,
  restoreFocus = true,
  count,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** `false` after a confirmed pass: the focus moves to the turn panel, not back to «Pass». */
  restoreFocus?: boolean;
  /** Leaders that could still activate (`ACTIVATE_SYSTEM.leaderIds.length`). */
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const focusCancel = () => cancelRef.current?.focus();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      disableRestoreFocus={!restoreFocus}
      aria-labelledby={TITLE_ID}
      aria-describedby={TEXT_ID}
      data-testid="pass-confirm"
      slotProps={{ transition: { onEnter: focusCancel, onEntered: focusCancel } }}
    >
      <DialogTitle id={TITLE_ID}>{t('rebellion.turn:pass.confirmTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText id={TEXT_ID}>
          {t('rebellion.turn:pass.confirmText', { count })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus ref={cancelRef} onClick={onCancel} data-testid="pass-confirm-cancel">
          {t('rebellion.turn:pass.cancel')}
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={onConfirm}
          data-testid="pass-confirm-ok"
        >
          {t('rebellion.turn:pass.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
