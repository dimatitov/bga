import ScienceIcon from '@mui/icons-material/Science';
import Chip from '@mui/material/Chip';
import type { SessionStatus } from '@bga/platform';
import { useTranslation } from 'react-i18next';

/**
 * `core-v1` — the slice disclaimer (D-SW5-15): «Реальная карта; правила частично: раунд и активация…»;
 * `legacy` — an old `mock-v1` session (D-SW5-1): «Старый прототип: тестовые правила»;
 * `generic` — the SWR-004 text (engine unknown).
 */
export type PrototypeBadgeVariant = 'core-v1' | 'legacy' | 'generic';

const TEXT_KEY: Record<PrototypeBadgeVariant, string> = {
  'core-v1': 'rebellion.common:prototype.coreV1',
  legacy: 'rebellion.common:prototype.legacy',
  generic: 'rebellion.common:prototype.full',
};

/**
 * Prototype badge of the table and the handoff screen (SWR-004 AC-13; SWR-005 plan-frontend §7, TC-C-14). Always
 * the full text (not a tooltip: touch has none); the chip wraps instead of truncating on a narrow top bar
 * (TC-VA-06). `prototype-badge[data-variant][data-status]`.
 * Shown for `status === 'prototype'`; a finished `core-v1` / legacy game (`completed`) keeps its disclaimer —
 * the rules are still partial. Other statuses (`active`, `setup`) show nothing.
 */
export function PrototypeBadge({
  status,
  variant = 'generic',
}: {
  status: SessionStatus;
  variant?: PrototypeBadgeVariant;
}) {
  const { t } = useTranslation();
  const shown = status === 'prototype' || (status === 'completed' && variant !== 'generic');
  if (!shown) return null;
  return (
    <Chip
      data-testid="prototype-badge"
      data-status={status}
      data-variant={variant}
      icon={<ScienceIcon />}
      label={t(TEXT_KEY[variant])}
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
