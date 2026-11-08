import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { useTranslation } from 'react-i18next';

export interface MockBadgeProps {
  /** i18n key of the label (default `common:mock.badge` → «MOCK»). */
  labelKey?: string;
  /** Tooltip i18n key (default `common:mock.tooltip`). */
  tooltipKey?: string;
  'data-testid'?: string;
}

/** "MOCK" marker — always text, not only colour (ux-decisions §9). */
export function MockBadge({
  labelKey = 'common:mock.badge',
  tooltipKey = 'common:mock.tooltip',
  'data-testid': testId = 'mock-badge',
}: MockBadgeProps) {
  const { t } = useTranslation();
  return (
    <Tooltip title={t(tooltipKey)}>
      <Chip
        label={t(labelKey)}
        size="small"
        variant="outlined"
        data-testid={testId}
        tabIndex={0}
        sx={{
          color: 'mock.main',
          borderColor: 'mock.main',
          fontWeight: 700,
          letterSpacing: '0.08em',
        }}
      />
    </Tooltip>
  );
}
