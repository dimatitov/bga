import ScienceIcon from '@mui/icons-material/Science';
import Chip from '@mui/material/Chip';
import type { SessionStatus } from '@bga/platform';
import { useTranslation } from 'react-i18next';

/**
 * «Прототип» badge of the table and the handoff screen (SWR-004 AC-13, plan-frontend §5.4). Always the full text
 * (not a tooltip: touch has none); the chip wraps instead of truncating on a narrow top bar (TC-VA-06).
 * Rendered only for `status === 'prototype'`.
 */
export function PrototypeBadge({ status }: { status: SessionStatus }) {
  const { t } = useTranslation();
  if (status !== 'prototype') return null;
  return (
    <Chip
      data-testid="prototype-badge"
      data-status={status}
      icon={<ScienceIcon />}
      label={t('rebellion.common:prototype.full')}
      variant="outlined"
      size="small"
      sx={{
        color: 'mock.main',
        borderColor: 'mock.main',
        height: 'auto',
        maxWidth: 320,
        py: 0.25,
        '& .MuiChip-icon': { color: 'mock.main' },
        '& .MuiChip-label': { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' },
      }}
    />
  );
}
