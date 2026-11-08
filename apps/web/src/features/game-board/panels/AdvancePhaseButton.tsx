import ScienceIcon from '@mui/icons-material/Science';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';
import { useAdvancePhase } from '../hooks/useAdvancePhase';

/** "End phase (mock)" — labelled as mock by text + icon (D-T-3, D-P-8). */
export function AdvancePhaseButton({ testId = 'advance-phase' }: { testId?: string }) {
  const { t } = useTranslation();
  const { advance, enabled, isPending } = useAdvancePhase();
  return (
    <Button
      data-testid={testId}
      data-mock="true"
      variant="outlined"
      size="small"
      color="secondary"
      disabled={!enabled}
      onClick={() => void advance()}
      startIcon={isPending ? <CircularProgress size={14} /> : <ScienceIcon />}
      sx={{ whiteSpace: 'nowrap', borderColor: 'mock.main', color: 'mock.main' }}
    >
      {t('board:phase.advanceMock')}
    </Button>
  );
}
