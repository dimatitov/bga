import type { SessionStatus } from '@bga/platform';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/shared/ui/terminal';

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
 * the full text (not a tooltip: touch has none); the badge wraps instead of truncating on a narrow bar
 * (TC-VA-06). `prototype-badge[data-variant][data-status][data-compact]`.
 * Shown for `status === 'prototype'`; a finished `core-v1` / legacy game (`completed`) keeps its disclaimer —
 * the rules are still partial. Other statuses (`active`, `setup`) show nothing.
 *
 * SWR-009 (plan §2 C1): an amber UI Kit badge. `compact` (console footer of `core-v1`) says the short
 * «Реальная карта · правила частичные»; the full slice text stays in the «Партия» tab (`game-info-status`).
 */
export function PrototypeBadge({
  status,
  variant = 'generic',
  compact = false,
}: {
  status: SessionStatus;
  variant?: PrototypeBadgeVariant;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const shown = status === 'prototype' || (status === 'completed' && variant !== 'generic');
  if (!shown) return null;
  const short = compact && variant === 'core-v1';
  return (
    <StatusBadge
      tone="amber"
      data-testid="prototype-badge"
      data-status={status}
      data-variant={variant}
      data-compact={short ? 'true' : 'false'}
      sx={{ whiteSpace: 'normal', maxWidth: short ? 'none' : 320, overflowWrap: 'anywhere' }}
    >
      {t(short ? 'rebellion.session:console.rulesPartial' : TEXT_KEY[variant])}
    </StatusBadge>
  );
}
