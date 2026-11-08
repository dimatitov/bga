import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useParams } from 'react-router';
import type { WebGameEntry } from '@/games/registry';
import { paths } from '../paths';
import { canStartSession } from '../registry/selectors';
import { useGameEntry } from '../registry/useGameRegistry';
import { useGameSessions } from '../sessions/useGameSessions';
import { ComingSoonNotice } from './ComingSoonNotice';
import { GameActions } from './GameActions';
import { GameHero } from './GameHero';
import { GameNotFound } from './GameNotFound';
import { RecentSessions } from './RecentSessions';

function GamePageContent({ entry }: { entry: WebGameEntry }) {
  const { t } = useTranslation();
  const { definition } = entry;
  const startable = canStartSession(entry);
  const comingSoonId = useId();
  // Q-16: sessions of a game that cannot start (coming_soon) are never requested.
  const sessions = useGameSessions(definition.id, { enabled: startable });

  return (
    <Box
      data-testid="game-page"
      data-game-id={definition.id}
      data-status={definition.status}
      sx={{ px: 2, py: 4, maxWidth: 1200, mx: 'auto' }}
    >
      <Button
        component={RouterLink}
        to={paths.catalog}
        startIcon={<ArrowBackIcon />}
        size="small"
        data-testid="game-back-to-catalog"
        sx={{ mb: 2 }}
      >
        {t('gamePage:backToCatalog')}
      </Button>
      <Stack spacing={4}>
        <GameHero entry={entry}>
          {startable ? null : <ComingSoonNotice id={comingSoonId} />}
          <GameActions
            entry={entry}
            startable={startable}
            sessions={sessions}
            comingSoonId={comingSoonId}
          />
        </GameHero>
        {startable ? <RecentSessions entry={entry} sessions={sessions} /> : null}
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          data-testid="game-disclaimer"
        >
          {t('common:disclaimer')}
        </Typography>
      </Stack>
    </Box>
  );
}

/** `/games/:gameId` (ux §12.4) — unknown id → `game-not-found` (no requests, D-GP-8). */
export function GamePage() {
  const { gameId } = useParams();
  const entry = useGameEntry(gameId);
  if (!entry) return <GameNotFound />;
  return <GamePageContent key={entry.definition.id} entry={entry} />;
}
