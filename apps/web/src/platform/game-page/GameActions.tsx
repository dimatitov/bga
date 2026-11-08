import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import type { WebGameEntry } from '@/games/registry';
import { paths } from '../paths';
import type { GameSessionsResult } from '../sessions/useGameSessions';
import { SESSION_LINE_SEPARATOR, useSessionLine } from '../sessions/useSessionLine';
import { SessionMeta } from './RecentSessions';

/**
 * "New session" + "Continue" (D-GP-2, D-GP-3, D-GP-6, D-GP-7). Inactive actions are native `disabled` buttons;
 * for a game that cannot start, both point to the "coming soon" notice via `aria-describedby`.
 */
export function GameActions(props: {
  entry: WebGameEntry;
  startable: boolean;
  sessions: GameSessionsResult;
  comingSoonId: string;
}) {
  const { t } = useTranslation();
  const { entry, startable, sessions, comingSoonId } = props;
  const { definition } = entry;
  const hintId = useId();
  const sessionLine = useSessionLine(entry);
  const latest = startable && !sessions.isError ? sessions.latest : null;
  const describedBy = startable ? undefined : comingSoonId;

  // Q-21: the hint of "Continue" = the same session line + status chip + time; empty list → "no saved sessions".
  let hint: ReactNode = null;
  if (latest) {
    const line = sessionLine(latest);
    hint = (
      <>
        <span>{line.description || t('gamePage:session.untitled')}</span>
        <span aria-hidden>{SESSION_LINE_SEPARATOR.trim()}</span>
        <SessionMeta line={line} statusTestId="game-continue-status" />
      </>
    );
  } else if (startable && sessions.isSuccess) hint = t('gamePage:continueEmpty');

  return (
    <Stack
      component="nav"
      aria-label={t('gamePage:actionsLabel')}
      spacing={1.5}
      sx={{ maxWidth: { xs: '100%', sm: 420 } }}
    >
      {startable ? (
        <Button
          component={RouterLink}
          to={paths.newSession(definition.id)}
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          data-testid="game-new-session"
        >
          {t('gamePage:newSession')}
        </Button>
      ) : (
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          disabled
          aria-describedby={describedBy}
          data-testid="game-new-session"
        >
          {t('gamePage:newSession')}
        </Button>
      )}
      {latest ? (
        <Button
          component={RouterLink}
          to={paths.session(latest.sessionId)}
          variant="outlined"
          size="large"
          startIcon={<ReplayIcon />}
          aria-describedby={hintId}
          data-testid="game-continue"
          data-session-id={latest.sessionId}
        >
          {t('gamePage:continue')}
        </Button>
      ) : (
        <Button
          variant="outlined"
          size="large"
          startIcon={<ReplayIcon />}
          disabled
          loading={startable && sessions.isPending && sessions.fetchStatus === 'fetching'}
          aria-describedby={describedBy ?? (hint ? hintId : undefined)}
          data-testid="game-continue"
        >
          {t('gamePage:continue')}
        </Button>
      )}
      {hint ? (
        <Typography
          id={hintId}
          variant="body2"
          component="div"
          color="text.secondary"
          data-testid="game-continue-hint"
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            columnGap: 1,
            rowGap: 0.5,
            overflowWrap: 'anywhere',
          }}
        >
          {hint}
        </Typography>
      ) : null}
    </Stack>
  );
}
