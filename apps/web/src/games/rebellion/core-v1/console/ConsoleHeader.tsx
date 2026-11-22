import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/platform';
import { terminalTokens } from '@/shared/theme';
import { useCoreBoard } from '../model/coreContext';
import { CONSOLE_AREA } from './consoleLayout';

const T = terminalTokens;

/**
 * Console header (SWR-009 plan §2 C1, §4; design-analysis §3): «← К игре» (`session-back-to-game`), the brand
 * «◆ BGA / GALACTIC OPERATIONS», the real rules engine of the view (amber; the prototype's decorative right-hand
 * text is replaced by it) and ⚙ (`session-settings`). `console-header[data-rules-engine]`. Below 600 px «К игре» is an icon
 * (accessible name kept) and the brand is hidden — the header never scrolls sideways.
 */
export function ConsoleHeader({ backHref }: { backHref: string }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const engine = view.rulesEngine.toUpperCase();
  return (
    <Box
      component="header"
      data-testid="console-header"
      data-rules-engine={view.rulesEngine}
      aria-label={t('rebellion.session:console.headerLabel')}
      sx={{
        gridArea: CONSOLE_AREA.header,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 2 },
        minHeight: 42,
        minWidth: 0,
        px: { xs: 0.5, sm: 1.5 },
        border: `1px solid ${T.color.bezel}`,
        bgcolor: T.color.module,
        color: T.color.paper,
        fontSize: 12,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
      }}
    >
      <Button
        component={RouterLink}
        to={backHref}
        variant="text"
        startIcon={<ArrowBackIcon />}
        aria-label={t('rebellion.session:topBar.backToGameIcon')}
        data-testid="session-back-to-game"
        sx={{
          flex: 'none',
          // Icon-only below 600 px: still a 44×44 touch target (AC-14, QA-1); with its label it is wider anyway.
          minWidth: 44,
          minHeight: 44,
          justifyContent: 'center',
          '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: { xs: 0, sm: -0.5 } },
        }}
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          {t('rebellion.session:topBar.backToGame')}
        </Box>
      </Button>
      <Box
        component="span"
        data-testid="console-brand"
        sx={{
          display: { xs: 'none', sm: 'inline-flex' },
          alignItems: 'center',
          gap: 1,
          minWidth: 0,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            flex: 'none',
            width: 10,
            height: 10,
            border: `1px solid ${T.color.phosphor}`,
            transform: 'rotate(45deg)',
          }}
        />
        {t('rebellion.session:console.brand')}
      </Box>
      <Box
        component="span"
        data-testid="console-rules-engine"
        sx={{ ml: 'auto', color: T.color.amber, whiteSpace: 'nowrap' }}
      >
        {t('rebellion.session:console.engine', { engine })}
      </Box>
      <Tooltip title={t('common:nav.settings')}>
        <IconButton
          component={RouterLink}
          to={paths.settings}
          aria-label={t('common:nav.settings')}
          data-testid="session-settings"
          sx={{ flex: 'none' }}
        >
          <SettingsIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
