import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBoard } from '../model/boardContext';
import { logMessage } from './logMessage';

/** Event log (D-L-1): newest first; `role="log"` with `aria-live="off"` — announcements go via the live region (D-F-6). */
export function EventLog() {
  const { t, i18n } = useTranslation();
  const { view } = useBoard();
  const fmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }),
    [i18n.language],
  );
  const events = [...view.log].sort((a, b) => b.seq - a.seq);
  return (
    <Box
      component="ol"
      data-testid="event-log"
      role="log"
      aria-live="off"
      aria-label={t('board:log.title')}
      sx={{ listStyle: 'none', p: 0, m: 0 }}
    >
      {events.map((e) => (
        <Box
          component="li"
          key={e.seq}
          data-testid="event-log-item"
          data-seq={e.seq}
          data-type={e.type}
          sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1 }}
        >
          <Typography
            component="time"
            dateTime={e.at}
            variant="caption"
            sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', minWidth: 40 }}
          >
            {fmt.format(new Date(e.at))}
          </Typography>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {logMessage(e, t, view)}
          </Typography>
          {e.type === 'PHASE_ADVANCED' && (
            <Chip
              label={t('board:log.mockTag')}
              size="small"
              variant="outlined"
              sx={{ color: 'mock.main', borderColor: 'mock.main', height: 20 }}
            />
          )}
        </Box>
      ))}
    </Box>
  );
}
