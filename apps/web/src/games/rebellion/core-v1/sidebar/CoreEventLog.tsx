import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { coreLogMessage, isAiEvent, isAutoEvent } from './coreLogMessage';

/**
 * Event log of the `core-v1` table (SWR-005 plan-frontend §7, D-SW5-13; tab «Журнал» of `CoreSidebar`): newest
 * first; `role="log"` with `aria-live="off"` — announcements go through the table live region.
 * SWR-006 (Q-FE-4): every event of the AI side reads «Империя (AI): …» and carries the chip «AI»
 * (`log-entry-<seq>-ai`, `aria-hidden` — the line already says «(AI)»). Events arrive redacted by the server:
 * the AI Rebels' moves to / from the hidden base read «скрытая зона» for the Empire.
 * `log-entry-<seq>[data-type][data-actor][data-auto][data-ai]`.
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
        const ai = isAiEvent(e, view.settings);
        return (
          <Box
            component="li"
            key={e.seq}
            data-testid={`log-entry-${e.seq}`}
            data-seq={e.seq}
            data-type={e.type}
            data-actor={e.actor}
            data-auto={isAutoEvent(e) ? 'true' : 'false'}
            data-ai={ai ? 'true' : 'false'}
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
            </Box>
            {ai && (
              <Chip
                data-testid={`log-entry-${e.seq}-ai`}
                icon={<SmartToyOutlinedIcon aria-hidden />}
                label={t('rebellion.match:log.aiTag')}
                size="small"
                variant="outlined"
                aria-hidden
                sx={{
                  color: 'text.secondary',
                  borderColor: 'divider',
                  height: 20,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
