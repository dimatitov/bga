import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { Led } from '@/shared/ui';

const T = terminalTokens;

/**
 * Same loading skeleton for every game (D-SH-1), in the console look (SWR-009 N): header strip of the console case
 * + a dark display with a blinking LED, a spinner and the loading text (the LED is still with reduced motion).
 */
export function SessionLoading() {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="session-loading"
      aria-busy="true"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        gap: `${T.space.gap}px`,
        p: { xs: `${T.space.gap}px`, md: `${T.space.console}px` },
        bgcolor: 'terminal.case',
      }}
    >
      <Box
        sx={{
          height: 42,
          flex: 'none',
          border: `1px solid ${T.color.bezel}`,
          bgcolor: 'terminal.module',
        }}
      />
      <Box
        sx={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          alignContent: 'center',
          gap: 2,
          border: `${T.bezel.housing}px solid ${T.color.bezel}`,
          bgcolor: 'terminal.crt',
        }}
      >
        <CircularProgress aria-hidden="true" />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Led state="green" blink />
          <Typography sx={{ color: 'text.secondary' }}>{t('sessionHost:loading')}</Typography>
        </Box>
      </Box>
    </Box>
  );
}
