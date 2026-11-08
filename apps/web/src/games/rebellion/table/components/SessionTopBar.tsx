import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { PlayerViewPlayer } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/platform';
import type { TableScreenProps } from '@/games/types';
import { AdvancePhaseButton, phaseName } from '../../board';
import type { SaveStatus as SaveStatusValue } from '../hooks/useSendCommand';
import { ActiveSide } from './ActiveSide';
import { EndTurnButton } from './EndTurnButton';
import { PrototypeBadge } from './PrototypeBadge';
import { SaveStatus } from './SaveStatus';

/**
 * D-1 layout (SWR-004 plan-frontend §5.5, D-SW4-18): groups wrap instead of scrolling horizontally.
 * DOM order = Tab order (nav → sides → state → status → settings); `order` only moves groups between rows:
 * - ≥ 1200 (`lg`): one row — nav · sides · state (centred) · status · ⚙;
 * - 600–1199 (`sm`–`md`): nav · sides · ⟶ · status · ⚙ / state;
 * - < 600 (`xs`): «←» · side · ⟶ · ⚙ / round · phase / buttons / badge + save.
 */
const GROUP = { display: 'flex', alignItems: 'center', minWidth: 0 } as const;

/**
 * Top bar (D-T-1..D-T-4, SWR-003 D-SH-4, SWR-004 D-1): "← To game", sides / «Ход: …», round/phase, mock "End
 * phase", «Передать ход» (human games), «Прототип» badge, save status, settings.
 */
export function SessionTopBar({
  view,
  status,
  saveStatus,
  backHref,
}: {
  view: PlayerViewPlayer;
  /** Platform session status (`TableScreenProps.status`) — drives the «Прототип» badge (AC-13). */
  status: TableScreenProps['status'];
  saveStatus: SaveStatusValue;
  /** Game page (`/games/:gameId`) — from `TableScreenProps.backHref`. */
  backHref: string;
}) {
  const { t } = useTranslation();
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
        <ActiveSide view={view} />
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
        <Box
          sx={{
            ...GROUP,
            gap: 2,
            whiteSpace: 'nowrap',
            flexBasis: { xs: '100%', sm: 'auto' },
          }}
        >
          <Typography
            data-testid="round-indicator"
            data-round={view.round}
            variant="subtitle1"
            sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
          >
            {t('rebellion.session:topBar.round', { round: view.round })}
          </Typography>
          <Typography data-testid="phase-indicator" data-phase={view.phase} variant="subtitle1">
            {t('rebellion.session:topBar.phase', { phase: phaseName(t, view.phase) })}
          </Typography>
        </Box>
        <Box sx={{ ...GROUP, flexWrap: 'wrap', gap: 1 }}>
          <AdvancePhaseButton />
          <EndTurnButton />
        </Box>
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
        <PrototypeBadge status={status} />
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
