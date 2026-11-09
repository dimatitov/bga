import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type AIModelRole, type AiRequestedProvider } from '@bga/platform';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { paths } from '@/platform/paths';
import { announce } from '@/shared/feedback';
import { AiErrorAlert } from './components/AiErrorAlert';
import { ResultCard, type ResultState } from './components/ResultCard';
import { RunControls } from './components/RunControls';
import { ScenarioList } from './components/ScenarioList';
import { StatusCard } from './components/StatusCard';
import { aiErrorText } from './errorText';
import { useDevAiStatus, useTestDecision } from './queries';
import { DEV_AI_TEST_SCENARIO } from './testScenario';

/**
 * `/dev/ai` — dev-only AI diagnostics (SWR-005B, plan-frontend §5). Lives only in the lazy dev chunk; the server
 * decides provider, model, budget and legality — the page only shows answers. A request is sent only on click.
 */
export function DevAiPage() {
  const { t, i18n } = useTranslation('devAi');
  const lng = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const status = useDevAiStatus();
  const decision = useTestDecision();
  // D-FE-3: local state, provider defaults to the free mock on every visit; role defaults to tactical (A-4).
  const [role, setRole] = useState<AIModelRole>('tactical');
  const [provider, setProvider] = useState<AiRequestedProvider>('mock');
  // Synchronous in-flight flag: two clicks dispatched before a re-render must not send two (paid) requests.
  const inFlight = useRef(false);

  const pending = decision.isPending;
  const resultState: ResultState = pending
    ? 'pending'
    : decision.isSuccess
      ? 'success'
      : decision.isError
        ? 'error'
        : 'empty';
  const errorView = decision.isError ? aiErrorText(t, decision.error, lng) : null;

  const handleSubmit = () => {
    // Guard against a double click before the re-render disables the button (R-FE-3).
    if (inFlight.current || decision.isPending) return;
    inFlight.current = true;
    decision.reset();
    decision.mutate(
      { scenario: DEV_AI_TEST_SCENARIO, role, provider },
      {
        onSuccess: (res) => announce(t('announce.success', { id: res.decision.selectedActionId })),
        onError: (err) => announce(t('announce.error', { text: aiErrorText(t, err, lng).text })),
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(paths.catalog);
  };

  return (
    <Box
      data-testid="dev-ai-page"
      sx={{ px: 2, py: { xs: 2, md: 4 }, mx: 'auto', width: '100%', maxWidth: 1200, minWidth: 0 }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          size="small"
          onClick={handleBack}
          data-testid="dev-ai-back"
        >
          {t('back')}
        </Button>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {t('title')}
        </Typography>
        <Chip label={t('devBadge')} size="small" color="secondary" data-testid="dev-ai-badge" />
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('intro')}
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
          gridTemplateAreas: {
            xs: '"status" "run" "side" "scenario"',
            md: '"status side" "run side" "scenario side"',
          },
        }}
      >
        <StatusCard
          area="status"
          data={status.data}
          error={status.error}
          isPending={status.isPending}
          isFetching={status.isFetching}
          onRefetch={() => void status.refetch()}
        />
        <RunControls
          area="run"
          status={status.data}
          role={role}
          provider={provider}
          pending={pending}
          onRole={setRole}
          onProvider={setProvider}
          onSubmit={handleSubmit}
        />
        <Stack spacing={2} sx={{ gridArea: 'side', minWidth: 0 }}>
          {errorView ? <AiErrorAlert view={errorView} /> : null}
          <ResultCard
            state={resultState}
            response={decision.data}
            scenario={DEV_AI_TEST_SCENARIO}
          />
        </Stack>
        <ScenarioList
          area="scenario"
          scenario={DEV_AI_TEST_SCENARIO}
          selectedId={decision.data?.decision.selectedActionId ?? null}
        />
      </Box>
    </Box>
  );
}
