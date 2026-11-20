import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { automationFallbackReasonText, type SessionAutomationState } from '@/platform';
import { translateUnknownError } from '@/shared/i18n';
import { monoSx } from '../components/mono';
import { DecisionRow } from './DecisionRow';
import { useDevAiTableDiagnostics } from './diagnosticsFlag';
import { decisionRowsNewestFirst, type PanelState, panelErrorReason } from './model';
import { sessionDecisionsKey, useSessionDecisions } from './queries';
import { Totals } from './Totals';

export interface DevAiSessionDiagnosticsProps {
  sessionId: string;
  automation: SessionAutomationState;
}

/** «Last AI turn» from the public `AutomationRunSummary` (incl. fallbacks without a model call, plan-backend §6). */
function LastRun({ lastRun }: { lastRun: NonNullable<SessionAutomationState['lastRun']> }) {
  const { t } = useTranslation('devAi');
  const { steps, fallbacks, fallbackReasons } = lastRun.summary;
  return (
    <Box
      data-testid="dev-ai-session-last-run"
      data-steps={String(steps)}
      data-fallbacks={String(fallbacks)}
      data-reasons={fallbackReasons.join(',')}
      sx={{ typography: 'body2' }}
    >
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
        {t('session.lastRun.title')}
      </Typography>
      <div>{t('session.lastRun.summary', { steps, fallbacks })}</div>
      {fallbackReasons.length === 0 ? (
        <div>{t('session.fallback.none')}</div>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {fallbackReasons.map((code) => (
            <li key={code}>
              <Box component="span" sx={{ ...monoSx, fontWeight: 600 }}>
                {t('session.fallback.code', { code })}
              </Box>{' '}
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {automationFallbackReasonText(t, code)}
              </Box>
            </li>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** The panel itself: mounted only with the gate open, so the query never runs otherwise (plan-frontend §2.1, §2.3). */
function DecisionsPanel({ sessionId, automation }: DevAiSessionDiagnosticsProps) {
  const { t } = useTranslation('devAi');
  const queryClient = useQueryClient();
  const query = useSessionDecisions(sessionId);
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const toggleId = useId();
  const headingId = useId();
  const regionId = useId();

  // One refetch per AI turn: a new `lastRun.seq`, or the end of a run (`running → idle|stalled|error`; a run without
  // steps keeps `seq`). A run that ends with steps changes both at once → still one request.
  const seq = automation.lastRun?.seq ?? null;
  const phase = automation.phase;
  const prev = useRef({ seq, phase });
  useEffect(() => {
    const before = prev.current;
    prev.current = { seq, phase };
    const newTurn = seq !== null && seq !== before.seq;
    const runEnded = before.phase === 'running' && phase !== 'running';
    if (newTurn || runEnded) {
      void queryClient.invalidateQueries({ queryKey: sessionDecisionsKey(sessionId), exact: true });
    }
  }, [seq, phase, queryClient, sessionId]);

  const state: PanelState = query.isError
    ? panelErrorReason(query.error)
    : query.data
      ? 'ready'
      : 'loading';
  const data = query.data;
  const rows = data ? decisionRowsNewestFirst(data.decisions) : [];

  const chip =
    state === 'loading'
      ? t('session.chipPending')
      : data
        ? t('session.chip', { count: data.totals.total.decisions })
        : t('session.chipError');

  const collapse = () => {
    setExpanded(false);
    toggleRef.current?.focus();
  };
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && expanded) {
      e.stopPropagation();
      collapse();
    }
  };

  const errorText =
    state === 'unavailable'
      ? t('session.error.unavailable')
      : state === 'forbidden'
        ? t('session.error.forbidden')
        : state === 'error'
          ? translateUnknownError(t, query.error)
          : null;

  return (
    <Box
      component="section"
      aria-labelledby={expanded ? headingId : toggleId}
      data-testid="dev-ai-session-diagnostics"
      data-state={state}
      data-decisions={String(data?.decisions.length ?? 0)}
      data-expanded={String(expanded)}
      onKeyDown={handleKeyDown}
      sx={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: (theme) => theme.zIndex.speedDial,
        display: 'flex',
        flexDirection: 'column-reverse',
        alignItems: 'flex-start',
        gap: 1,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <Button
        ref={toggleRef}
        id={toggleId}
        variant="contained"
        color="secondary"
        size="small"
        aria-expanded={expanded}
        aria-controls={regionId}
        data-testid="dev-ai-session-toggle"
        onClick={() => (expanded ? collapse() : setExpanded(true))}
        sx={{ textTransform: 'none', maxWidth: '100%' }}
      >
        {chip}
      </Button>
      <Box id={regionId} hidden={!expanded} sx={{ width: 'min(440px, calc(100vw - 32px))' }}>
        {expanded ? (
          <Paper
            elevation={8}
            sx={{
              p: 2,
              maxHeight: 'min(60vh, 520px)',
              overflowY: 'auto',
              overflowX: 'hidden',
              display: 'grid',
              gap: 1.5,
            }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <Typography
                id={headingId}
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}
              >
                {t('session.title')}
              </Typography>
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                loading={query.isFetching}
                onClick={() => void query.refetch()}
                data-testid="dev-ai-session-refresh"
              >
                {t('session.refresh')}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {t('session.note')}
            </Typography>
            {errorText !== null ? (
              <Alert
                severity={state === 'error' ? 'error' : 'warning'}
                data-testid="dev-ai-session-error"
                data-reason={state}
              >
                {errorText}
              </Alert>
            ) : null}
            {automation.lastRun ? <LastRun lastRun={automation.lastRun} /> : null}
            {data ? <Totals totals={data.totals} /> : null}
            {data ? (
              <Box>
                <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
                  {t('session.decisions.title')}
                </Typography>
                {rows.length === 0 ? (
                  <Typography variant="body2" data-testid="dev-ai-session-empty">
                    {t('session.empty')}
                  </Typography>
                ) : (
                  <Box component="ul" sx={{ m: 0, p: 0 }}>
                    {rows.map((row) => (
                      <DecisionRow key={row.index} index={row.index} decision={row.decision} />
                    ))}
                  </Box>
                )}
              </Box>
            ) : null}
          </Paper>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * Dev-only AI decision panel of the session host (SWR-008 plan-frontend §2.1–§2.6, QD-15/QD-16). The compile-time gate
 * (`import.meta.env.DEV`) is the literal in `SessionHost.tsx`; here — the opt-in switch of `/dev/ai` (off by default)
 * and an automated participant. While closed, nothing is rendered and nothing is requested.
 */
export function DevAiSessionDiagnostics({ sessionId, automation }: DevAiSessionDiagnosticsProps) {
  const enabled = useDevAiTableDiagnostics((s) => s.enabled);
  if (!enabled || automation.strategy === null) return null;
  return <DecisionsPanel sessionId={sessionId} automation={automation} />;
}
