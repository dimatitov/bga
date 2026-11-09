import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HelpIcon from '@mui/icons-material/Help';
import Box from '@mui/material/Box';
import { type AIModelRole, type AiDevModelStatus } from '@bga/platform';
import { useTranslation } from 'react-i18next';
import { MonoValue } from './MonoValue';

/** One model line: role · id · availability (text + icon, not colour only). */
export function ModelRow({ role, model }: { role: AIModelRole; model: AiDevModelStatus }) {
  const { t } = useTranslation('devAi');
  const availability =
    model.available === true ? 'true' : model.available === false ? 'false' : 'unknown';
  const icon =
    availability === 'true' ? (
      <CheckCircleIcon fontSize="small" color="success" aria-hidden />
    ) : availability === 'false' ? (
      <ErrorIcon fontSize="small" color="error" aria-hidden />
    ) : (
      <HelpIcon fontSize="small" color="action" aria-hidden />
    );
  const label =
    availability === 'true'
      ? t('status.models.available')
      : availability === 'false'
        ? t('status.models.unavailable')
        : t('status.models.unknown');
  return (
    <Box
      component="li"
      data-testid={`dev-ai-model-${role}`}
      data-available={availability}
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.5 }}
    >
      <Box component="span" sx={{ fontWeight: 600, minWidth: 72 }}>
        {t(`status.models.${role}`)}
      </Box>
      <MonoValue value={model.id} placeholder={t('status.models.notConfigured')} />
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        {icon}
        {label}
      </Box>
    </Box>
  );
}
