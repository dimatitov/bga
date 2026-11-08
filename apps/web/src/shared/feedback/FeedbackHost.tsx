import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { type SyntheticEvent } from 'react';
import { VisuallyHidden } from '@/shared/ui/VisuallyHidden';
import { dismissNotification, type FeedbackSeverity, useFeedbackStore } from './feedbackStore';

const DURATION_MS: Record<FeedbackSeverity, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 6000,
};

/**
 * Snackbar (`feedback`, bottom-left) + the ONLY aria-live region of the app (`live-region`, R-12, D-F-6).
 * Rendered once by AppProviders.
 */
export function FeedbackHost() {
  const current = useFeedbackStore((s) => s.queue[0]);
  const live = useFeedbackStore((s) => s.live);

  const handleClose = (_e?: SyntheticEvent | Event | null, reason?: string) => {
    if (reason === 'clickaway' || !current) return;
    dismissNotification(current.id);
  };

  return (
    <>
      <Snackbar
        key={current?.id}
        open={Boolean(current)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        autoHideDuration={current ? DURATION_MS[current.severity] : null}
        onClose={handleClose}
        data-testid="feedback"
        data-severity={current?.severity}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={() => handleClose()}
            // The live region below announces the text; avoid double announcement.
            role="presentation"
            action={
              current.action ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    current.action?.onClick();
                    handleClose();
                  }}
                >
                  {current.action.label}
                </Button>
              ) : undefined
            }
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
      <VisuallyHidden>
        <div role="status" aria-live="polite" aria-atomic="true" data-testid="live-region">
          {live ? <span key={live.id}>{live.text}</span> : null}
        </div>
      </VisuallyHidden>
    </>
  );
}
