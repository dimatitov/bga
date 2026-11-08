import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { coreLogMessage, isAutoEvent } from './coreLogMessage';

/**
 * Event log of the `core-v1` table (SWR-005 plan-frontend §7, D-SW5-13; tab «Журнал» of `CoreSidebar`): newest
 * first; `role="log"` with `aria-live="off"` — announcements go through the table live region. An automatic AI
 * move (`payload.auto`) is marked honestly: chip «авто» + visible hint «AI Commander ещё не реализован…»
 * (also the chip tooltip, linked by `aria-describedby`). `log-entry-<seq>[data-type][data-actor][data-auto]`.
 */
export function CoreEventLog() {
  const { t, i18n } = useTranslation();
  const { view } = useCoreBoard();
  const fmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }),
    [i18n.language],
  );
  const events = useMemo(() => [...view.log].sort((a, b) => b.seq - a.seq), [view.log]);

  if (events.length === 0) {
    return (
      <Typography data-testid="event-log-empty" variant="body2" sx={{ color: 'text.secondary' }}>
        {t('rebellion.match:log.empty')}
      </Typography>
    );
  }

  return (
    <Box
      component="ol"
      data-testid="event-log"
      role="log"
      aria-live="off"
      aria-label={t('rebellion.match:log.title')}
      sx={{ listStyle: 'none', p: 0, m: 0 }}
    >
      {events.map((e) => {
        const auto = isAutoEvent(e);
        const hintId = `log-entry-${e.seq}-auto-hint`;
        return (
          <Box
            component="li"
            key={e.seq}
            data-testid={`log-entry-${e.seq}`}
            data-seq={e.seq}
            data-type={e.type}
            data-actor={e.actor}
            data-auto={auto ? 'true' : 'false'}
            sx={{
              py: 0.75,
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
            }}
          >
            <Typography
              component="time"
              dateTime={e.at}
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontVariantNumeric: 'tabular-nums',
                minWidth: 40,
                pt: 0.25,
              }}
            >
              {fmt.format(new Date(e.at))}
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2">{coreLogMessage(e, t, view)}</Typography>
              {auto && (
                <Typography
                  id={hintId}
                  variant="caption"
                  data-testid={`log-entry-${e.seq}-auto-hint`}
                  sx={{ display: 'block', color: 'text.secondary' }}
                >
                  {t('rebellion.match:log.autoHint')}
                </Typography>
              )}
            </Box>
            {auto && (
              <Tooltip describeChild title={t('rebellion.match:log.autoHint')}>
                <Chip
                  data-testid={`log-entry-${e.seq}-auto`}
                  icon={<SmartToyOutlinedIcon aria-hidden />}
                  label={t('rebellion.match:log.autoTag')}
                  size="small"
                  variant="outlined"
                  tabIndex={0}
                  aria-describedby={hintId}
                  sx={{
                    color: 'mock.main',
                    borderColor: 'mock.main',
                    height: 20,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
              </Tooltip>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
