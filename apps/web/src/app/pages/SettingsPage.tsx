import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router';
import { paths } from '@/platform/paths';
import { TerminalPanel } from '@/platform/ui/TerminalPanel';
import { announce } from '@/shared/feedback';
import { i18n } from '@/shared/i18n';
import { type Language, LANGUAGES, useSettingsStore } from '@/shared/settings';
import { terminalTokens } from '@/shared/theme';
import { ChoiceGroup } from '@/shared/ui';

/** Section label of the settings panel (terminal `meta`, block so it sits above its control). */
const SECTION_LABEL = { display: 'block', mt: 0, mb: 1 } as const;

/** `/settings` — applied instantly, stored in localStorage `bga.settings.v1` (D-ST-1..3, R-13). */
export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const languageLabelId = useId();
  const motionHintId = useId();
  const language = useSettingsStore((s) => s.language);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setReduceMotion = useSettingsStore((s) => s.setReduceMotion);

  const handleBack = () => {
    // D-ST-2: history back; without in-app history → catalogue.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(paths.catalog);
  };

  const handleLanguage = (next: Language) => {
    if (next === language) return;
    setLanguage(next);
    // The store change re-renders AppProviders, which switches i18n; announce in the new language.
    void i18n.changeLanguage(next).then(() => announce(i18n.t('settings:announce.language')));
  };

  const handleReduceMotion = (checked: boolean) => {
    setReduceMotion(checked);
    announce(t(checked ? 'settings:announce.reduceMotionOn' : 'settings:announce.reduceMotionOff'));
  };

  return (
    <Box sx={{ px: 2, py: 4, display: 'flex', justifyContent: 'center' }}>
      <TerminalPanel sx={{ width: '100%', maxWidth: 640, overflow: 'hidden' }}>
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2,
            px: { xs: 2, sm: 4 },
            py: 1.5,
            bgcolor: 'terminal.moduleHead',
            borderBottom: `1px solid ${terminalTokens.module.headBorder}`,
          }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            size="small"
            onClick={handleBack}
            data-testid="settings-back"
          >
            {t('settings:back')}
          </Button>
          <Typography variant="h2" component="h1" sx={{ color: 'primary.main' }}>
            {t('settings:title')}
          </Typography>
        </Stack>

        <Stack spacing={4} sx={{ p: { xs: 2, sm: 4 } }}>
          <section>
            <Typography id={languageLabelId} variant="meta" component="h2" sx={SECTION_LABEL}>
              {t('settings:language.title')}
            </Typography>
            <ChoiceGroup
              labelledBy={languageLabelId}
              value={language}
              onChange={handleLanguage}
              data-testid="settings-language"
              options={LANGUAGES.map((lng) => ({
                value: lng,
                testId: `settings-language-${lng}`,
                label: t(`settings:language.${lng}`),
              }))}
            />
          </section>

          <section>
            <Typography variant="meta" component="h2" sx={SECTION_LABEL}>
              {t('settings:accessibility.title')}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={reduceMotion}
                  onChange={(e) => handleReduceMotion(e.target.checked)}
                  slotProps={{
                    input: {
                      'aria-describedby': motionHintId,
                      // testid on the input itself so `toBeChecked()` works (R-10).
                      ...({ 'data-testid': 'settings-reduce-motion' } as object),
                    },
                  }}
                />
              }
              label={t('settings:reduceMotion.label')}
            />
            <Typography id={motionHintId} variant="body2" color="text.secondary" sx={{ pl: 6 }}>
              {t('settings:reduceMotion.hint')}
            </Typography>
          </section>

          <Typography variant="body2" color="text.secondary">
            {t('settings:storageNote')}
          </Typography>

          {/* SWR-005B D-FE-2: dev-only entry to the AI diagnostics; the literal guard folds away in `vite build`. */}
          {import.meta.env.DEV ? (
            <section data-testid="settings-dev">
              <Typography variant="meta" component="h2" sx={SECTION_LABEL}>
                {t('settings:dev.title')}
              </Typography>
              <Box>
                <Link component={RouterLink} to="/dev/ai" data-testid="settings-dev-ai-link">
                  {t('settings:dev.aiLink')}
                </Link>
              </Box>
            </section>
          ) : null}
        </Stack>
      </TerminalPanel>
    </Box>
  );
}
