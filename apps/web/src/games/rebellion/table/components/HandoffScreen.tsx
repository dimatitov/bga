import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { factions } from '@bga/game-rebellion/assets';
import type { HandoffView } from '@bga/game-rebellion/schema';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/platform';
import { translateError } from '@/shared/i18n';
import { REBELLION_ERRORS_NS } from '../../i18n';
import { IGNORED_CODE } from '../../board/model/commandFeedback';
import { phaseName, resetBoardState } from '../../board';
import { useSendCommand } from '../hooks/useSendCommand';
import { PrototypeBadge } from './PrototypeBadge';

/**
 * Hot-seat handoff screen (SWR-004 plan-frontend §5.3, ux-decisions §13.6, D-SW4-20..23). Shown for the server's
 * `view.kind === 'handoff'` — public metadata only; it replaces the whole table: no board, canvas, sidebar, log or
 * debug hook are mounted, and the board stores are wiped before paint. Focus goes to the heading, not to the
 * button (D-SW4-21 / OQ-1): a stray Enter of player A must not accept the turn for player B; the first Tab
 * reaches «Я — <side>». Accept → `ACCEPT_HANDOFF` (actor = `activeSide`, `expectedVersion = view.version` — from
 * `useSendCommand`); the player view of the new side then remounts the table (TableScreen keys it by viewer).
 */
export function HandoffScreen({
  sessionId,
  view,
  backHref,
}: {
  sessionId: string;
  view: HandoffView;
  backHref: string;
}) {
  const { t } = useTranslation();
  const { send, isPending } = useSendCommand(sessionId);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const side = view.activeSide;
  const visual = factions[side];

  // Nothing of the previous side may survive in the board stores (plan-frontend §5.3 step 2).
  useLayoutEffect(() => resetBoardState(sessionId), [sessionId]);
  useEffect(() => titleRef.current?.focus(), []);

  const accept = async () => {
    setError(null);
    const outcome = await send({ type: 'ACCEPT_HANDOFF' });
    if (!outcome.ok && outcome.code !== IGNORED_CODE) {
      setError(translateError(t, outcome, { gameNs: REBELLION_ERRORS_NS }));
    }
  };

  return (
    <Box
      component="section"
      aria-labelledby="handoff-title"
      data-testid="handoff-screen"
      data-active-side={side}
      data-round={view.round}
      data-version={view.version}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        minHeight: '100dvh',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, minHeight: 56 }}>
        <Button
          component={RouterLink}
          to={backHref}
          startIcon={<ArrowBackIcon />}
          size="small"
          data-testid="session-back-to-game"
        >
          {t('rebellion.session:topBar.backToGame')}
        </Button>
      </Box>
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          px: 2,
          py: { xs: 3, sm: 6 },
          alignSelf: 'start',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 560,
            display: 'grid',
            gap: 2,
            justifyItems: 'center',
            textAlign: 'center',
          }}
        >
          <Box
            component="img"
            src={`data:image/svg+xml,${encodeURIComponent(visual.emblemSvg)}`}
            alt=""
            aria-hidden
            data-testid="handoff-emblem"
            sx={{ width: { xs: 64, sm: 96 }, height: { xs: 64, sm: 96 } }}
          />
          <Typography
            ref={titleRef}
            id="handoff-title"
            component="h1"
            variant="h5"
            data-testid="handoff-title"
            tabIndex={-1}
          >
            {t(`rebellion.session:handoff.title.${side}`)}
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            {t('rebellion.session:handoff.text')}
          </Typography>
          <Typography variant="body2" data-testid="handoff-round">
            {t('rebellion.session:handoff.round', {
              round: view.round,
              phase: phaseName(t, view.phase),
            })}
          </Typography>
          <PrototypeBadge status={view.sessionStatus} />
          {error && (
            <Alert severity="error" role="alert" data-testid="handoff-error" sx={{ width: '100%' }}>
              {error}
            </Alert>
          )}
          <Button
            variant="contained"
            size="large"
            data-testid="handoff-accept"
            aria-busy={isPending}
            disabled={isPending}
            onClick={() => void accept()}
            startIcon={isPending ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ mt: 1, width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 240 } }}
          >
            {t(`rebellion.session:handoff.accept.${side}`)}
          </Button>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('rebellion.session:handoff.trustNote')}
          </Typography>
        </Box>
      </Box>
      <Tooltip title={t('common:nav.settings')}>
        <IconButton
          component={RouterLink}
          to={paths.settings}
          aria-label={t('common:nav.settings')}
          data-testid="session-settings"
          sx={{ position: 'absolute', top: 8, right: 16 }}
        >
          <SettingsIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
