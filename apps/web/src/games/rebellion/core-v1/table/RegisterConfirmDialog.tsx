import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyButton } from '@/shared/ui';
import { TABLE_NS } from './model/tableModel';

const TITLE_ID = 'core-location-register-dialog-title';
const TEXT_ID = 'core-location-register-dialog-text';

/**
 * «Register <system> as your base card?» (SWR-010 FE-B, plan-frontend §3.2, FD-5): the registration cannot be undone
 * (a repeat is 422), so it is confirmed. Same pattern as `PassConfirmDialog`: the focus starts on «Cancel» (also once
 * the enter transition has run); Esc / backdrop cancel.
 */
export function RegisterConfirmDialog({
  open,
  systemName,
  restoreFocus = true,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  systemName: string;
  /** `false` after a confirmed registration: the focus moves on with the response, not back to the form. */
  restoreFocus?: boolean;
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
      data-testid="location-register-dialog"
      slotProps={{ transition: { onEnter: focusCancel, onEntered: focusCancel } }}
    >
      <DialogTitle id={TITLE_ID}>{t(`${TABLE_NS}:register.dialogTitle`)}</DialogTitle>
      <DialogContent>
        <DialogContentText id={TEXT_ID}>
          {t(`${TABLE_NS}:register.dialogText`, { system: systemName })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <KeyButton
          autoFocus
          ref={cancelRef}
          onClick={onCancel}
          data-testid="location-register-cancel"
        >
          {t(`${TABLE_NS}:register.cancel`)}
        </KeyButton>
        <KeyButton
          tone="warning"
          led="amber"
          onClick={onConfirm}
          data-testid="location-register-confirm"
        >
          {t(`${TABLE_NS}:register.confirm`)}
        </KeyButton>
      </DialogActions>
    </Dialog>
  );
}
