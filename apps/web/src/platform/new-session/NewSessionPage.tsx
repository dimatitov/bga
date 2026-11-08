import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useParams } from 'react-router';
import type { WebGameEntry } from '@/games/registry';
import { ComingSoonNotice } from '../game-page/ComingSoonNotice';
import { GameNotFound } from '../game-page/GameNotFound';
import { paths } from '../paths';
import { useGameEntry } from '../registry/useGameRegistry';
import { canStartSession } from '../registry/selectors';
import { useCreateSession } from '../sessions/useCreateSession';

function BackToGame({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  return (
    <Button
      component={RouterLink}
      to={paths.game(gameId)}
      startIcon={<ArrowBackIcon />}
      size="small"
      data-testid="new-session-back-to-game"
    >
      {t('gamePage:backToGame')}
    </Button>
  );
}

function SetupHost({ entry }: { entry: WebGameEntry }) {
  const { t } = useTranslation();
  const { definition, SetupScreen } = entry;
  const start = useCreateSession(definition.id);
  if (!SetupScreen) return null;
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '30vh' }} aria-busy="true">
          <CircularProgress aria-label={t('common:app.loading')} />
        </Box>
      }
    >
      <SetupScreen
        gameId={definition.id}
        definition={definition}
        start={start}
        backHref={paths.game(definition.id)}
      />
    </Suspense>
  );
}

/**
 * `/games/:gameId/new` (plan-frontend §2, §2.2): unknown → `game-not-found`; coming_soon or no `SetupScreen` →
 * `game-coming-soon` in place, no form, no redirect (Q-17); otherwise "← To game" (Q-19) + the game's setup screen.
 */
export function NewSessionPage() {
  const { gameId } = useParams();
  const entry = useGameEntry(gameId);
  if (!entry) return <GameNotFound />;
  const { definition } = entry;
  const startable = canStartSession(entry);
  return (
    <Box
      data-testid="new-session-page"
      data-game-id={definition.id}
      sx={{ px: 2, py: 4, maxWidth: 960, mx: 'auto' }}
    >
      <BackToGame gameId={definition.id} />
      {startable ? (
        <SetupHost key={definition.id} entry={entry} />
      ) : (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
            {definition.name}
          </Typography>
          <ComingSoonNotice />
        </Box>
      )}
    </Box>
  );
}
