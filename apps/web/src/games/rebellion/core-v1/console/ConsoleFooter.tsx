import Box from '@mui/material/Box';
import type { SessionStatus } from '@bga/platform';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { PrototypeBadge } from '../../table/components/PrototypeBadge';
import { useCoreBoard } from '../model/coreContext';
import { mapStats } from '../model/mapStats';
import { CONSOLE_AREA } from './consoleLayout';

const T = terminalTokens;
const SEP = { color: T.color.muted } as const;

/**
 * Console footer (SWR-009 plan §2 C1; design-analysis §3): rules engine «CORE-V1» · «32 системы · 69 связей» (counted
 * from `view.map` by `mapStats`, never literals) · the slice badge «правила частичные» (`prototype-badge`, compact) ·
 * a static autosave note. The live save state is only in the status bar (`save-status`, PA-2) — no duplicate here.
 * `console-footer[data-systems][data-routes]`.
 */
export function ConsoleFooter({ status }: { status: SessionStatus }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const stats = useMemo(() => mapStats(view.map), [view.map]);
  return (
    <Box
      component="footer"
      data-testid="console-footer"
      data-systems={stats.systems}
      data-routes={stats.routes}
      aria-label={t('rebellion.session:console.footerLabel')}
      sx={{
        gridArea: CONSOLE_AREA.footer,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 0.5,
        minHeight: 36,
        minWidth: 0,
        px: 1.5,
        py: 0.5,
        border: `1px solid ${T.color.bezel}`,
        bgcolor: T.color.module,
        color: T.color.warm,
        fontSize: T.type.meta.size,
        lineHeight: `${T.type.meta.lineHeight}px`,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      <Box component="span" data-testid="console-footer-engine" sx={{ color: T.color.paper }}>
        {view.rulesEngine.toUpperCase()}
      </Box>
      <Box component="span" data-testid="console-footer-map">
        {t('rebellion.session:console.systems', { count: stats.systems })}
        <Box component="span" aria-hidden="true" sx={SEP}>
          {' · '}
        </Box>
        {t('rebellion.session:console.routes', { count: stats.routes })}
      </Box>
      <PrototypeBadge status={status} variant="core-v1" compact />
      <Box component="span" data-testid="console-footer-autosave" sx={{ ml: { sm: 'auto' } }}>
        {t('rebellion.session:console.autosave')}
      </Box>
    </Box>
  );
}
