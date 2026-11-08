import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { Fragment, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import type { WebGameEntry } from '@/games/registry';
import { paths } from '../paths';
import type { GameSessionsResult } from '../sessions/useGameSessions';
import { SessionStatusChip } from '../ui/SessionStatusChip';
import {
  SESSION_LINE_SEPARATOR,
  type SessionLine,
  useSessionLine,
} from '../sessions/useSessionLine';

/**
 * Primary text of a row: the game's parts as `<span data-testid="recent-session-<key>">` joined by « · » (AM-FE-9),
 * the game's one-line string, or the generic «Партия».
 */
export function LinePrimary({ line }: { line: SessionLine }) {
  const { t } = useTranslation();
  if (line.parts.length === 0) return <>{line.description || t('gamePage:session.untitled')}</>;
  return (
    <>
      {line.parts.map((part, i) => (
        <Fragment key={part.key}>
          {i > 0 ? SESSION_LINE_SEPARATOR : null}
          <span data-testid={`recent-session-${part.key}`}>{part.text}</span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Status chip · relative time of a session (plan-frontend §3, ux §13.5): `<time dateTime={updatedAt}>` with the
 * absolute date as its title. Wraps as a unit on narrow screens.
 */
export function SessionMeta({
  line,
  statusTestId,
  dateTestId,
}: {
  line: SessionLine;
  statusTestId: string;
  dateTestId?: string;
}) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1,
        rowGap: 0.5,
      }}
    >
      <SessionStatusChip status={line.status} data-testid={statusTestId} />
      <span aria-hidden>{SESSION_LINE_SEPARATOR.trim()}</span>
      <time dateTime={line.iso} title={line.absolute || undefined} data-testid={dateTestId}>
        {line.time}
      </time>
    </Box>
  );
}

/** "Recent sessions" (D-GP-4..6, Q-13..15): ≤ 5 links, loading skeleton, empty state, inline error + Retry. */
export function RecentSessions({
  entry,
  sessions,
}: {
  entry: WebGameEntry;
  sessions: GameSessionsResult;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const sessionLine = useSessionLine(entry);

  let body;
  if (sessions.isError) {
    body = (
      <Alert
        severity="error"
        data-testid="game-sessions-error"
        action={
          <Button
            color="inherit"
            size="small"
            loading={sessions.isFetching}
            onClick={() => void sessions.refetch()}
          >
            {t('common:actions.retry')}
          </Button>
        }
      >
        {t('gamePage:sessionsError')}
      </Alert>
    );
  } else if (sessions.isPending) {
    body = (
      <Box
        aria-busy="true"
        aria-label={t('gamePage:recent.loading')}
        data-testid="game-recent-loading"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="text" height={40} />
        ))}
      </Box>
    );
  } else if (sessions.recent.length === 0) {
    body = (
      <Typography color="text.secondary" data-testid="game-recent-empty">
        {t('gamePage:recent.empty')}
      </Typography>
    );
  } else {
    body = (
      <List disablePadding>
        {sessions.recent.map((s) => {
          const line = sessionLine(s);
          return (
            <li key={s.sessionId}>
              <ListItemButton
                component={RouterLink}
                to={paths.session(s.sessionId)}
                data-testid={`recent-session-${s.sessionId}`}
                data-session-id={s.sessionId}
                data-session-status={line.status}
              >
                <ListItemText
                  primary={<LinePrimary line={line} />}
                  secondary={
                    <SessionMeta
                      line={line}
                      statusTestId="recent-session-status"
                      dateTestId="recent-session-date"
                    />
                  }
                  slotProps={{
                    primary: { sx: { overflowWrap: 'anywhere' } },
                    secondary: { component: 'div', sx: { mt: 0.5 } },
                  }}
                />
                <ChevronRightIcon aria-hidden />
              </ListItemButton>
            </li>
          );
        })}
      </List>
    );
  }

  return (
    <Box component="section" aria-labelledby={titleId} data-testid="game-recent-sessions">
      <Typography id={titleId} variant="overline" component="h2" color="text.secondary">
        {t('gamePage:recent.title')}
      </Typography>
      {body}
    </Box>
  );
}
