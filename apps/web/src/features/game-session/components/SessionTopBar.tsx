import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { PlayerView } from '@swr/contracts';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { AdvancePhaseButton, phaseName } from '@/features/game-board';
import { FactionChip, MockBadge } from '@/shared/ui';
import type { SaveStatus as SaveStatusValue } from '../hooks/useSendCommand';
import { SaveStatus } from './SaveStatus';

/** Top bar (D-T-1..D-T-4): menu, sides, round/phase, mock "End phase", MOCK badge, save status, settings. */
export function SessionTopBar({
  view,
  saveStatus,
}: {
  view: PlayerView;
  saveStatus: SaveStatusValue;
}) {
  const { t } = useTranslation();
  const opp = view.setup.opponent;
  return (
    <Box
      component="header"
      sx={{
        gridArea: 'top',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        minHeight: 56,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflowX: 'auto',
      }}
    >
      <Button
        component={RouterLink}
        to="/"
        startIcon={<ArrowBackIcon />}
        size="small"
        data-testid="session-menu"
      >
        {t('common:nav.menu')}
      </Button>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
        <FactionChip faction={view.setup.humanFaction} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {opp.kind === 'ai'
            ? t('session:topBar.vsAi', { difficulty: t(`common:difficulty.${opp.difficulty}`) })
            : t('session:topBar.vsHuman')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mx: 'auto', whiteSpace: 'nowrap' }}>
        <Typography
          data-testid="round-indicator"
          data-round={view.round}
          variant="subtitle1"
          sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
        >
          {t('session:topBar.round', { round: view.round })}
        </Typography>
        <Typography data-testid="phase-indicator" data-phase={view.phase} variant="subtitle1">
          {t('session:topBar.phase', { phase: phaseName(t, view.phase) })}
        </Typography>
        <AdvancePhaseButton />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, whiteSpace: 'nowrap' }}>
        <MockBadge />
        <SaveStatus status={saveStatus} />
        <Tooltip title={t('common:nav.settings')}>
          <IconButton
            component={RouterLink}
            to="/settings"
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
