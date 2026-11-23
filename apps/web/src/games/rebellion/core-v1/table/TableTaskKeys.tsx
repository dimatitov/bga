import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import { KeyButton } from '@/shared/ui';
import { useCoreBoard } from '../model/coreContext';
import { headTask, TABLE_NS } from './model/tableModel';
import { useTableCommands } from './useTableCommands';

/**
 * Key row of the console rail in the `physical` mode (SWR-010 FE-B, plan-frontend §2.2, §3.2): one primary key «Done on
 * the table» (`table-task-confirm`) for a head task with `completion: 'confirm'`; nothing for the Location registration
 * (its form has its own key) — the rail hides the empty row (`:empty`). Disabled while a command or an AI run is in
 * flight (`aria-busy`); a second click before the re-render is ignored by the sender (one request, TC-PX-04/05).
 */
export function TableTaskKeys() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const { confirm, isPending } = useTableCommands();
  const head = headTask(view);
  if (!head || head.completion !== 'confirm') return null;
  return (
    <Box role="group" aria-label={t(`${TABLE_NS}:px.keysLabel`)} data-testid="table-task-keys">
      <KeyButton
        tone="primary"
        led={isPending ? 'off' : 'green'}
        fullWidth
        disabled={isPending}
        aria-busy={isPending || undefined}
        data-testid="table-task-confirm"
        data-task-id={head.id}
        onClick={() => void confirm()}
      >
        {t(`${TABLE_NS}:px.confirm`)}
      </KeyButton>
    </Box>
  );
}
