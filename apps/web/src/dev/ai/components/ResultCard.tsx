import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type AiTestDecisionResponse } from '@bga/platform';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type DevAiScenario } from '../api';
import { formatDurationMs, formatUsd } from '../format';
import { monoSx } from './mono';
import { Section } from './Section';
import { TokenTable } from './TokenTable';

export type ResultState = 'empty' | 'pending' | 'success' | 'error';

function Row({
  label,
  children,
  ...rest
}: { label: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, minWidth: 0 }}>
      <Box component="span" sx={{ color: 'text.secondary' }}>
        {label}:
      </Box>
      <Box
        component="span"
        sx={{ fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}
        {...rest}
      >
        {children}
      </Box>
    </Box>
  );
}

/** Decision of the last attempt (plan-frontend §5.2); the budget is the snapshot from the mutation response. */
export function ResultCard({
  state,
  response,
  scenario,
}: {
  state: ResultState;
  response: AiTestDecisionResponse | undefined;
  scenario: DevAiScenario;
}) {
  const { t, i18n } = useTranslation('devAi');
  const lng = i18n.resolvedLanguage ?? i18n.language;
  const decision = state === 'success' ? response?.decision : undefined;
  const budget = state === 'success' ? response?.budget : undefined;
  const action = decision
    ? scenario.availableActions.find((a) => a.id === decision.selectedActionId)
    : undefined;

  return (
    <Section
      title={t('result.title')}
      testId="dev-ai-result"
      dataState={state}
      busy={state === 'pending'}
    >
      {state === 'pending' ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <CircularProgress size={20} aria-hidden />
          <Typography>{t('result.pending')}</Typography>
        </Stack>
      ) : null}
      {state === 'empty' || state === 'error' ? (
        <Typography color="text.secondary">{t('result.empty')}</Typography>
      ) : null}
      {decision && budget ? (
        <Stack spacing={1.25}>
          <Row
            label={t('result.action')}
            data-testid="dev-ai-result-action"
            data-action-id={decision.selectedActionId}
          >
            <Box component="code" sx={monoSx}>
              {action
                ? [action.id, action.type, action.target].filter(Boolean).join(' · ')
                : decision.selectedActionId}
            </Box>
          </Row>
          {action ? null : (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <WarningAmberIcon fontSize="small" color="warning" aria-hidden />
              {t('result.outOfList')}
            </Box>
          )}
          <Box>
            <Typography component="p" sx={{ color: 'text.secondary' }}>
              {t('result.reason')}:
            </Typography>
            <Typography
              component="p"
              data-testid="dev-ai-result-reason"
              sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
            >
              {decision.reason}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('result.reasonNote')}
            </Typography>
          </Box>
          <Row
            label={t('result.provider')}
            data-testid="dev-ai-result-provider"
            data-provider={decision.provider}
          >
            {decision.provider}
          </Row>
          <Row label={t('result.model')} data-testid="dev-ai-result-model">
            {decision.model}
          </Row>
          <Row
            label={t('result.duration')}
            data-testid="dev-ai-result-duration"
            data-ms={decision.durationMs}
          >
            {t('result.durationValue', { value: formatDurationMs(decision.durationMs, lng) })}
          </Row>
          <Row label={t('result.attempts')} data-testid="dev-ai-result-attempts">
            {decision.attempts}
          </Row>
          <TokenTable usage={decision.usage} caption={t('result.tokens.title')} />
          <Box>
            <Row
              label={t('result.cost')}
              data-testid="dev-ai-cost"
              data-usd={decision.estimatedCostUsd}
            >
              {formatUsd(decision.estimatedCostUsd, lng)}
            </Row>
            <Typography variant="body2" color="text.secondary" data-testid="dev-ai-cost-note">
              {t('result.costNote')}
            </Typography>
            <Typography variant="body2" color="text.secondary" data-testid="dev-ai-pricing">
              {t('result.pricing', { version: decision.pricingVersion })}
            </Typography>
          </Box>
          <Row
            label={t('result.budgetRemaining')}
            data-testid="dev-ai-budget-remaining"
            data-usd={budget.remainingUsd ?? ''}
          >
            {budget.remainingUsd === null
              ? t('result.budgetUnlimited')
              : formatUsd(budget.remainingUsd, lng)}
          </Row>
        </Stack>
      ) : null}
    </Section>
  );
}
