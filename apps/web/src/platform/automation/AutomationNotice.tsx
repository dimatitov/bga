import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateUnknownError } from '@/shared/i18n';
import { automationNoticeSx } from './noticeLayout';
import type { SessionAutomationState } from './SessionAutomationContext';

interface AutomationNoticeProps {
  automation: SessionAutomationState;
  /** Raise the notice above the refetch warning when both are shown (fixed placement, `md`+). */
  stacked?: boolean;
}

/**
 * Generic notice of SessionHost (SWR-006 plan-frontend §4.4, Q-FE-2): the automated participant did not finish its
 * turn (`error` — the run failed, `stalled` — the server still waits) with «Continue AI turn». Names no game.
 * Placement: `automationNoticeSx` (in flow on `xs`–`sm`, bottom-left on `md`+; QA defect D-1).
 */
export function AutomationNotice({ automation, stacked = false }: AutomationNoticeProps) {
  const { t } = useTranslation();
  const { phase } = automation;
  const current = phase === 'error' ? 'error' : phase === 'stalled' ? 'stalled' : null;
  // A shown notice stays while its retry is in flight (button `loading`); an automatic run alone shows none.
  const [held, setHeld] = useState<'error' | 'stalled' | null>(null);
  if (current !== null && held !== current) setHeld(current);
  if (phase === 'idle' && held !== null) setHeld(null);
  const reason = current ?? (phase === 'running' ? held : null);
  if (reason === null) return null;
  return (
    <Alert
      severity="warning"
      role="alert"
      data-testid="session-automation-notice"
      data-reason={reason}
      action={
        <Button
          color="inherit"
          size="small"
          data-testid="session-automation-retry"
          loading={phase === 'running'}
          onClick={automation.retry}
        >
          {t('sessionHost:automation.retry')}
        </Button>
      }
      sx={automationNoticeSx(stacked)}
    >
      {reason === 'error'
        ? t('sessionHost:automation.error', {
            reason: translateUnknownError(t, automation.error),
          })
        : t('sessionHost:automation.stalled')}
    </Alert>
  );
}
