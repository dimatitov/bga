import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type AIModelRole, type AiDevStatus, type AiRequestedProvider } from '@bga/platform';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/shared/ui';
import { Section } from './Section';

const ROLES: readonly AIModelRole[] = ['tactical', 'strategy'];
const PROVIDERS: readonly AiRequestedProvider[] = ['mock', 'auto'];

/** Role / provider choice, paid-request warning and the «Test AI» button (plan-frontend §5.2). */
export function RunControls({
  status,
  role,
  provider,
  pending,
  onRole,
  onProvider,
  onSubmit,
  area,
}: {
  status: AiDevStatus | undefined;
  role: AIModelRole;
  provider: AiRequestedProvider;
  pending: boolean;
  onRole: (role: AIModelRole) => void;
  onProvider: (provider: AiRequestedProvider) => void;
  onSubmit: () => void;
  area?: string;
}) {
  const { t } = useTranslation('devAi');
  const roleLabelId = useId();
  const providerLabelId = useId();
  // Unknown status counts as "may be paid": the warning disappears only when the server says OpenAI is off.
  const openaiOff = status?.openaiEnabled === false;

  return (
    <Section title={t('run.title')} testId="dev-ai-run" area={area}>
      <Stack spacing={2.5}>
        <div>
          <Typography id={roleLabelId} variant="subtitle2" component="p" sx={{ mb: 1 }}>
            {t('run.role.label')}
          </Typography>
          <ChoiceGroup
            labelledBy={roleLabelId}
            value={role}
            onChange={onRole}
            disabled={pending}
            columns="stack-xs"
            data-testid="dev-ai-role"
            options={ROLES.map((r) => {
              const model = status?.models[r].id;
              return {
                value: r,
                testId: `dev-ai-role-${r}`,
                label: model
                  ? t('run.role.withModel', { role: t(`run.role.${r}`), model })
                  : t(`run.role.${r}`),
              };
            })}
          />
        </div>
        <div>
          <Typography id={providerLabelId} variant="subtitle2" component="p" sx={{ mb: 1 }}>
            {t('run.provider.label')}
          </Typography>
          <ChoiceGroup
            labelledBy={providerLabelId}
            value={provider}
            onChange={onProvider}
            disabled={pending}
            columns="stack-xs"
            data-testid="dev-ai-provider"
            options={PROVIDERS.map((p) => ({
              value: p,
              testId: `dev-ai-provider-${p}`,
              label: t(`run.provider.${p}`),
            }))}
          />
        </div>
        {provider === 'auto' && !openaiOff ? (
          <Alert severity="warning" data-testid="dev-ai-paid-warning">
            {t('run.paidWarning')}
          </Alert>
        ) : null}
        {provider === 'auto' && openaiOff ? (
          <Alert severity="info" data-testid="dev-ai-auto-mock-hint">
            {t('run.autoMockHint')}
          </Alert>
        ) : null}
        <Button
          variant="contained"
          size="large"
          onClick={onSubmit}
          disabled={pending}
          data-testid="dev-ai-submit"
          data-pending={String(pending)}
          startIcon={pending ? <CircularProgress size={20} color="inherit" aria-hidden /> : null}
          sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
        >
          {pending ? t('run.pending') : t('run.submit')}
        </Button>
      </Stack>
    </Section>
  );
}
