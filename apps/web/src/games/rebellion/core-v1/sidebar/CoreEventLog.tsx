import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { StatusBadge } from '@/shared/ui';
import { useCoreBoard } from '../model/coreContext';
import { coreLogMessage, isAiEvent, isAutoEvent } from './coreLogMessage';

const T = terminalTokens;
const C = T.color;

/**
 * Event log of the `core-v1` table (SWR-005 plan-frontend §7, D-SW5-13; tab «Журнал» of `CoreSidebar`): newest
 * first; `role="log"` with `aria-live="off"` — announcements go through the table live region.
 * SWR-006 (Q-FE-4): every event of the AI side reads «Империя (AI): …» and carries the tag «AI»
 * (`log-entry-<seq>-ai`, `aria-hidden` — the line already says «(AI)»). Events arrive redacted by the server:
 * the AI Rebels' moves to / from the hidden base read «скрытая зона» for the Empire.
 * SWR-009 C2: terminal rows (time column + text, thin divider); an AI row has a 2 px red left edge (`data-edge="ai"`)
 * and a faint red wash, the tag is a red badge (light text shade, QD-8). The time is the event's own `at`
 * (`data-time` = ISO), formatted HH:MM in the UI language — never an invented clock.
 * `log-entry-<seq>[data-type][data-actor][data-auto][data-ai][data-time]`.
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
      <Typography data-testid="event-log-empty" variant="body2" sx={{ color: C.warm }}>
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
        const time = new Date(e.at);
        const validTime = !Number.isNaN(time.getTime());
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
            data-time={e.at}
            data-edge={ai ? 'ai' : undefined}
            sx={{
              display: 'grid',
              gridTemplateColumns: '44px minmax(0, 1fr) auto',
              columnGap: '6px',
              alignItems: 'start',
              py: '7px',
              borderBottom: `1px solid ${C.line}`,
              ...(ai && {
                borderLeft: `2px solid ${C.red}`,
                pl: '6px',
                background: `linear-gradient(90deg, ${alpha(C.red, 0.07)}, transparent 72%)`,
              }),
            }}
          >
            <Typography
              component="time"
              dateTime={e.at}
              variant="meta"
              sx={{ color: C.muted, fontVariantNumeric: 'tabular-nums', pt: '2px' }}
            >
              {validTime ? fmt.format(time) : ''}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: C.paper, fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' }}
            >
              {coreLogMessage(e, t, view)}
            </Typography>
            {ai ? (
              <StatusBadge
                tone="red"
                data-testid={`log-entry-${e.seq}-ai`}
                aria-hidden
                sx={{ padding: '1px 5px', mt: '1px' }}
              >
                {t('rebellion.match:log.aiTag')}
              </StatusBadge>
            ) : (
              <span />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
