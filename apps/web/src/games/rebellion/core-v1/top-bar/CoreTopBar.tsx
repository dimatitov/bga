import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FlagIcon from '@mui/icons-material/OutlinedFlag';
import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/platform';
import type { TableScreenProps } from '@/games/types';
import { phaseName } from '../../board';
import { PrototypeBadge } from '../../table/components/PrototypeBadge';
import { SaveStatus } from '../../table/components/SaveStatus';
import type { SaveStatus as SaveStatusValue } from '../../table/hooks/useSendCommand';
import { useCoreBoard } from '../model/coreContext';
import { isGameOver, markers } from '../model/viewModel';
import { TimeTrack } from './TimeTrack';
import { PassedIndicator, TurnIndicator } from './TurnIndicator';

/** Same D-1 group layout as the legacy `SessionTopBar` (SWR-004 D-SW4-18): groups wrap, never scroll. */
const GROUP = { display: 'flex', alignItems: 'center', minWidth: 0 } as const;

/**
 * Top bar of the `core-v1` table (SWR-005 plan-frontend §7, §15.1; Worker P2). DOM order = Tab order:
 * nav («← К игре») → sides (`TurnIndicator`) → state (`TimeTrack`, «Фаза: Приказы», who has passed, `controls`)
 * → status (slice badge, «Завершена», save status) → ⚙. `controls` is a slot for P1's `TurnControls`
 * («Завершить активацию» / «Пас») so the two workers do not share a file. `table-top-bar`.
 * «Завершена» shows for the platform status `completed` or as soon as the view carries `outcome` (the status
 * arrives with the invalidated detail, AM-FE-10).
 */
export function CoreTopBar({
  status,
  saveStatus,
  backHref,
  controls,
}: {
  status: TableScreenProps['status'];
  saveStatus: SaveStatusValue;
  backHref: string;
  controls?: ReactNode;
}) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const { time, reputation } = markers(view);
  const completed = status === 'completed' || isGameOver(view);
  return (
    <Box
      component="header"
      data-testid="table-top-bar"
      aria-label={t('rebellion.session:topBar.label')}
      sx={{
        gridArea: 'top',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 1,
        px: 2,
        py: 1,
        minHeight: 56,
        minWidth: 0,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ ...GROUP, order: 1 }}>
        <Button
          component={RouterLink}
          to={backHref}
          startIcon={<ArrowBackIcon />}
          size="small"
          aria-label={t('rebellion.session:topBar.backToGameIcon')}
          data-testid="session-back-to-game"
          sx={{
            minWidth: 0,
            '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: { xs: 0, sm: -0.5 } },
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            {t('rebellion.session:topBar.backToGame')}
          </Box>
        </Button>
      </Box>
      <Box sx={{ ...GROUP, order: 2 }}>
        <TurnIndicator view={view} />
      </Box>
      <Box
        data-group="state"
        sx={{
          ...GROUP,
          flexWrap: 'wrap',
          columnGap: 2,
          rowGap: 1,
          order: { xs: 4, sm: 5, lg: 3 },
          flexBasis: { xs: '100%', lg: 'auto' },
          mx: { lg: 'auto' },
        }}
      >
        <Box sx={{ ...GROUP, flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
          <TimeTrack time={time} reputation={reputation} />
          <Typography
            data-testid="phase-indicator"
            data-phase={view.phase}
            variant="subtitle1"
            sx={{ whiteSpace: 'nowrap' }}
          >
            {t('rebellion.match:phase.label', { phase: phaseName(t, view.phase) })}
          </Typography>
          <PassedIndicator view={view} />
        </Box>
        {controls ? (
          <Box data-testid="top-bar-controls" sx={{ ...GROUP, flexWrap: 'wrap', gap: 1 }}>
            {controls}
          </Box>
        ) : null}
      </Box>
      <Box
        data-group="status"
        sx={{
          ...GROUP,
          flexWrap: 'wrap',
          gap: 1.5,
          order: { xs: 5, sm: 3, lg: 4 },
          flexBasis: { xs: '100%', sm: 'auto' },
          ml: { sm: 'auto', lg: 0 },
        }}
      >
        <PrototypeBadge status={completed ? 'completed' : status} variant="core-v1" />
        {completed && (
          <Chip
            data-testid="session-status-completed"
            data-status="completed"
            size="small"
            variant="outlined"
            icon={<FlagIcon aria-hidden />}
            label={t('common:sessionStatus.completed')}
            sx={{ fontWeight: 600, '& .MuiChip-icon': { color: 'inherit' } }}
          />
        )}
        <SaveStatus status={saveStatus} />
      </Box>
      <Box sx={{ ...GROUP, order: { xs: 3, sm: 4, lg: 5 }, ml: { xs: 'auto', sm: 0 } }}>
        <Tooltip title={t('common:nav.settings')}>
          <IconButton
            component={RouterLink}
            to={paths.settings}
            aria-label={t('common:nav.settings')}
            data-testid="session-settings"
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
