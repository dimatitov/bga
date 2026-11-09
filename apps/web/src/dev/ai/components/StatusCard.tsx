import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutlineOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type AiDevStatus } from '@bga/platform';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isNotFound } from '@/shared/api/errors';
import { aiErrorText } from '../errorText';
import { formatUsd } from '../format';
import { AiErrorAlert } from './AiErrorAlert';
import { ModelRow } from './ModelRow';
import { monoSx } from './mono';
import { Section } from './Section';

export type StatusState = 'loading' | 'ready' | 'unavailable' | 'error';

function YesNo({ yes, text }: { yes: boolean; text: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {yes ? (
        <CheckCircleIcon fontSize="small" color="success" aria-hidden />
      ) : (
        <RemoveCircleOutlineIcon fontSize="small" color="action" aria-hidden />
      )}
      {text}
    </Box>
  );
}

function Field({
  label,
  children,
  ...rest
}: { label: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1 }} {...rest}>
      <Box component="span" sx={{ color: 'text.secondary' }}>
        {label}:
      </Box>
      <Box component="span" sx={{ fontWeight: 600 }}>
        {children}
      </Box>
    </Box>
  );
}

/** Connection status card (plan-frontend §5.3). */
export function StatusCard({
  data,
  error,
  isPending,
  isFetching,
  onRefetch,
  area,
}: {
  data: AiDevStatus | undefined;
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
  onRefetch: () => void;
  area?: string;
}) {
  const { t, i18n } = useTranslation('devAi');
  const lng = i18n.resolvedLanguage ?? i18n.language;
  const state: StatusState = data
    ? 'ready'
    : isPending
      ? 'loading'
      : isNotFound(error)
        ? 'unavailable'
        : 'error';

  return (
    <Section
      title={t('status.title')}
      testId="dev-ai-status"
      dataState={state}
      busy={state === 'loading'}
      area={area}
    >
      {state === 'loading' ? (
        <Stack spacing={1}>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="80%" />
        </Stack>
      ) : null}

      {state === 'unavailable' ? <Alert severity="info">{t('status.unavailable')}</Alert> : null}

      {state === 'error' ? (
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <AiErrorAlert
            testId="dev-ai-status-error"
            view={{ ...aiErrorText(t, error, lng), title: t('status.errorTitle') }}
          />
          <Button variant="outlined" onClick={onRefetch} data-testid="dev-ai-status-retry">
            {t('status.retry')}
          </Button>
        </Stack>
      ) : null}

      {data ? (
        <Stack spacing={1.5}>
          <Field
            label={t('status.openai.label')}
            data-testid="dev-ai-status-openai"
            data-enabled={String(data.openaiEnabled)}
          >
            <YesNo
              yes={data.openaiEnabled}
              text={data.openaiEnabled ? t('status.openai.on') : t('status.openai.off')}
            />
          </Field>
          <Field
            label={t('status.provider')}
            data-testid="dev-ai-status-provider"
            data-provider={data.provider}
          >
            <Box component="code" sx={monoSx}>
              {data.provider}
            </Box>
          </Field>
          <Field
            label={t('status.key.label')}
            data-testid="dev-ai-status-key"
            data-configured={String(data.keyConfigured)}
          >
            <YesNo
              yes={data.keyConfigured}
              text={data.keyConfigured ? t('status.key.yes') : t('status.key.no')}
            />
          </Field>
          <Box>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
              {t('status.models.title')}
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
              <ModelRow role="strategy" model={data.models.strategy} />
              <ModelRow role="tactical" model={data.models.tactical} />
            </Stack>
          </Box>
          <Field
            label={t('status.budget.title')}
            data-testid="dev-ai-budget"
            data-remaining-usd={data.budget.remainingUsd ?? ''}
          >
            {data.budget.limitUsd === null || data.budget.remainingUsd === null
              ? t('status.budget.unlimited', { spent: formatUsd(data.budget.spentUsd, lng) })
              : t('status.budget.line', {
                  spent: formatUsd(data.budget.spentUsd, lng),
                  limit: formatUsd(data.budget.limitUsd, lng),
                  remaining: formatUsd(data.budget.remainingUsd, lng),
                })}
          </Field>
          <Box>
            <Button
              variant="outlined"
              size="small"
              onClick={onRefetch}
              disabled={isFetching}
              data-testid="dev-ai-status-refresh"
            >
              {t('status.refresh')}
            </Button>
          </Box>
        </Stack>
      ) : null}
    </Section>
  );
}
