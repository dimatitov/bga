import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type Difficulty, type Faction, type PlayerKind } from '@swr/contracts';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { translateUnknownError } from '@/shared/i18n';
import { MockBadge } from '@/shared/ui';
import { DifficultyPicker } from './components/DifficultyPicker';
import { FactionPicker } from './components/FactionPicker';
import { OpponentPicker } from './components/OpponentPicker';
import { useCreateGame } from './hooks/useCreateGame';
import { buildSetup } from './lib/buildSetup';

/** `/games/new` — one-page form (D-N-1..D-N-6). */
export function NewGamePage() {
  const { t } = useTranslation();
  const hintId = useId();
  const [faction, setFaction] = useState<Faction | null>(null);
  const [opponent, setOpponent] = useState<PlayerKind>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const createGame = useCreateGame();
  const pending = createGame.isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!faction || pending) return;
    createGame.mutate(buildSetup(faction, opponent, difficulty));
  };

  return (
    <Box sx={{ px: 2, py: 4, display: 'flex', justifyContent: 'center' }}>
      <Paper
        component="form"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={pending}
        sx={{ width: '100%', maxWidth: 640, p: { xs: 2, sm: 4 } }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3 }}
        >
          <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} size="small">
            {t('setup:newGame.backToMenu')}
          </Button>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {t('setup:newGame.title')}
          </Typography>
          <MockBadge data-testid="setup-mock-badge" />
        </Stack>

        <Stack spacing={3}>
          <FactionPicker value={faction} onChange={setFaction} disabled={pending} />
          <OpponentPicker value={opponent} onChange={setOpponent} disabled={pending} />
          <Collapse in={opponent === 'ai'} unmountOnExit>
            <DifficultyPicker
              value={difficulty}
              onChange={setDifficulty}
              // Disabled as soon as the opponent is human, so the group is never interactive while it collapses (D-N-4).
              disabled={pending || opponent !== 'ai'}
            />
          </Collapse>

          <Typography variant="body2" color="text.secondary">
            {t('common:mock.scenario')}
          </Typography>

          {createGame.isError ? (
            <Alert severity="error" data-testid="setup-error">
              {translateUnknownError(t, createGame.error)}
            </Alert>
          ) : null}

          <Stack
            direction="row"
            spacing={2}
            sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
          >
            {!faction ? (
              <Typography id={hintId} variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>
                {t('setup:newGame.factionHint')}
              </Typography>
            ) : null}
            <Button component={RouterLink} to="/" disabled={pending}>
              {t('setup:newGame.cancel')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="large"
              startIcon={<PlayArrowIcon />}
              data-testid="setup-start"
              disabled={!faction}
              loading={pending}
              loadingPosition="start"
              aria-describedby={!faction ? hintId : undefined}
            >
              {t('setup:newGame.start')}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
