import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import type { SetupScreenProps } from '@/games/types';
import { translateUnknownError } from '@/shared/i18n';
import { REBELLION_ERRORS_NS } from '../i18n';
import { DifficultyPicker } from './components/DifficultyPicker';
import { FactionCards } from './components/FactionCards';
import { GameModePicker } from './components/GameModePicker';
import { OpponentPicker } from './components/OpponentPicker';
import { RulesetPicker } from './components/RulesetPicker';
import { initialSetupForm, type SetupFormValues } from './model/setupForm';
import { type SetupValidation, validateSetup } from './model/toSetupInput';

type ClientError = Extract<SetupValidation, { ok: false }>['reason'];

const CLIENT_ERROR_KEYS: Record<ClientError, string> = {
  invalid: 'rebellion.setup:newGame.invalid',
  rulesetUnavailable: 'rebellion.errors:rulesetUnavailable',
  modeUnavailable: 'rebellion.errors:modeUnavailable',
};

/**
 * Rebellion new-game form (SWR-004 plan-frontend §2, ux-decisions §13, D-SW4-1..14). Rendered by the platform's
 * NewSessionPage at `/games/:gameId/new` under «← К игре»; the platform owns session creation
 * (`start.submit(setup)` → `POST /api/sessions` with `Idempotency-Key` → `/sessions/:id`).
 *
 * Five blocks: side (cards) → opponent (+ caption) → AI difficulty (AI only) → ruleset → mode; then the prototype
 * note, the inline error and «Начать игру» / «Отмена». PO defaults on every mount (AC-02, Q-19): the state is
 * local to this mounted screen, nothing is remembered between openings.
 */
export default function SetupScreen({ start, backHref }: SetupScreenProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<SetupFormValues>(initialSetupForm);
  const [clientError, setClientError] = useState<ClientError | null>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const pending = start.isPending;
  const serverError = start.error;

  // D-SW4-11: after a failed request the button is enabled again — return focus to it (it was disabled while
  // pending, so focus fell to <body>) and keep the alert in view (375 px).
  useEffect(() => {
    if (!serverError) return;
    startRef.current?.focus();
    alertRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [serverError]);

  const update = <K extends keyof SetupFormValues>(key: K, value: SetupFormValues[K]) => {
    setForm((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
    // D-SW4-12: the error belongs to the previous settings.
    setClientError(null);
    if (start.error) start.reset();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const result = validateSetup(form);
    if (!result.ok) {
      if (start.error) start.reset();
      setClientError(result.reason);
      return;
    }
    setClientError(null);
    start.submit(result.setup);
  };

  const errorText = clientError
    ? t(CLIENT_ERROR_KEYS[clientError])
    : serverError
      ? translateUnknownError(t, serverError, { gameNs: REBELLION_ERRORS_NS })
      : null;

  return (
    <Box
      sx={{ px: { xs: 0, sm: 2 }, py: { xs: 2, sm: 4 }, display: 'flex', justifyContent: 'center' }}
    >
      <Paper
        component="form"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={pending}
        data-testid="setup-form"
        sx={{ width: '100%', maxWidth: 720, p: { xs: 2, sm: 4 } }}
      >
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 3 }}>
          {t('rebellion.setup:newGame.title')}
        </Typography>

        <Stack spacing={3}>
          <FactionCards
            value={form.playerFaction}
            onChange={(v) => update('playerFaction', v)}
            disabled={pending}
          />
          <OpponentPicker
            value={form.opponentType}
            onChange={(v) => update('opponentType', v)}
            playerFaction={form.playerFaction}
            disabled={pending}
          />
          {/* Unmounted for a human opponent (out of the a11y tree, AC-04); `form.aiDifficulty` is kept (Q-19). */}
          <Collapse in={form.opponentType === 'ai'} unmountOnExit>
            <DifficultyPicker
              value={form.aiDifficulty}
              onChange={(v) => update('aiDifficulty', v)}
              disabled={pending || form.opponentType !== 'ai'}
            />
          </Collapse>
          <RulesetPicker
            value={form.ruleset}
            onChange={(v) => update('ruleset', v)}
            disabled={pending}
          />
          <GameModePicker
            value={form.gameMode}
            onChange={(v) => update('gameMode', v)}
            disabled={pending}
          />

          <Stack
            direction="row"
            spacing={1}
            data-testid="setup-prototype-note"
            sx={{ alignItems: 'flex-start', color: 'text.secondary' }}
          >
            <InfoOutlinedIcon fontSize="small" aria-hidden sx={{ mt: '2px' }} />
            <Typography variant="body2">{t('rebellion.common:prototype.full')}</Typography>
          </Stack>

          {errorText ? (
            <Alert ref={alertRef} severity="error" role="alert" data-testid="setup-error">
              {errorText}
            </Alert>
          ) : null}

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 1.5, sm: 2 }}
            sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}
          >
            <Button
              ref={startRef}
              type="submit"
              variant="contained"
              size="large"
              startIcon={<PlayArrowIcon />}
              data-testid="setup-start"
              loading={pending}
              loadingPosition="start"
              aria-busy={pending}
              sx={{ minHeight: 44 }}
            >
              {t(pending ? 'rebellion.setup:newGame.starting' : 'rebellion.setup:newGame.start')}
            </Button>
            <Button
              component={RouterLink}
              to={backHref}
              disabled={pending}
              size="large"
              data-testid="setup-cancel"
              sx={{ minHeight: 44 }}
            >
              {t('rebellion.setup:newGame.cancel')}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
