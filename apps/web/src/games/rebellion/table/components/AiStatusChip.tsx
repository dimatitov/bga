import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Chip from '@mui/material/Chip';
import { useTranslation } from 'react-i18next';

/** Placeholder: the AI opponent does not act in this prototype (D-T-5). */
export function AiStatusChip() {
  const { t } = useTranslation();
  return (
    <Chip
      data-testid="ai-status"
      icon={<SmartToyOutlinedIcon />}
      label={t('rebellion.session:ai.inactive')}
      variant="outlined"
      size="small"
      sx={{ color: 'mock.main', borderColor: 'mock.main' }}
    />
  );
}
