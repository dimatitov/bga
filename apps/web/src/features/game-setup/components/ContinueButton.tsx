import ReplayIcon from '@mui/icons-material/Replay';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useGamesList } from '../hooks/useGamesList';
import { continueHint } from '../lib/summaryText';

/** «Продолжить» → latest game by `updatedAt` (A-1, D-M-2); disabled without saved games. */
export function ContinueButton() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const hintId = useId();
  const { latest, isPending, isError } = useGamesList();

  const hint = isPending
    ? t('setup:menu.loadingGames')
    : latest
      ? continueHint(t, latest, i18n.language)
      : isError
        ? null
        : t('setup:menu.noGames');

  return (
    <Stack spacing={0.5}>
      <Button
        variant="outlined"
        size="large"
        fullWidth
        startIcon={<ReplayIcon />}
        data-testid="menu-continue"
        loading={isPending}
        disabled={!latest}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => {
          if (latest) void navigate(`/games/${encodeURIComponent(latest.gameId)}`);
        }}
        sx={{ justifyContent: 'flex-start' }}
      >
        {t('setup:menu.continue')}
      </Button>
      {hint ? (
        <Typography id={hintId} variant="body2" color="text.secondary" sx={{ pl: 1 }}>
          {hint}
        </Typography>
      ) : null}
    </Stack>
  );
}
