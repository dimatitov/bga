import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useSessionAutomation } from '@/platform';
import { MOBILE_SHEET, mq, terminalTokens } from '@/shared/theme';
import { Led } from '@/shared/ui/terminal';
import { aiCommanderLabel, aiCommanderState, aiSideOf } from '../model/aiCommander';
import { useCoreBoard } from '../model/coreContext';
import { AI_LEDS } from './statusBarModel';

const T = terminalTokens;

/**
 * AI Commander box of the status bar (SWR-006 plan-frontend §6.3, D-PO-4; SWR-009 design «AI-box»): three LEDs
 * (`ai-commander-led[data-state]`, decorative — the state is in words next to them), «AI Commander · бот · Обычная»
 * (provider from the session automation, difficulty from the public settings) and the state line: «Готов» (+ the
 * number of actions of the last run), «ИИ думает…» (`ai-thinking`, `role="status"`, amber LED blinks unless motion is
 * reduced), «Ход не завершён», «Партия окончена». Only in an AI game; nothing in hot-seat.
 * `ai-commander-status[data-strategy=bot|openai|none][data-difficulty][data-state=idle|thinking|stalled|over]`.
 */
export function AiCommanderStatus({ over }: { over: boolean }) {
  const { t } = useTranslation();
  const { view, aiThinking = false } = useCoreBoard();
  const automation = useSessionAutomation();
  const settings = view.settings;
  if (aiSideOf(settings) === null) return null;
  const strategy = automation?.strategy ?? null;
  const state = aiCommanderState({ over, thinking: aiThinking, phase: automation?.phase });
  const steps = automation?.lastRun?.summary.steps ?? 0;
  const leds = AI_LEDS[state];
  return (
    <Box
      data-testid="ai-commander-status"
      data-strategy={strategy ?? 'none'}
      data-difficulty={settings.aiDifficulty ?? 'none'}
      data-state={state}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        minWidth: 0,
        px: '10px',
        py: '8px',
        [mq.down(MOBILE_SHEET)]: { px: '7px', py: '5px', gap: '7px' },
        border: `1px solid ${T.statusCard.border}`,
        bgcolor: T.color.panel,
      }}
    >
      <Box
        data-testid="ai-commander-led"
        data-state={state}
        aria-hidden="true"
        sx={{ display: 'flex', gap: '5px', flex: 'none' }}
      >
        {leds.map((led, i) => (
          <Led key={i} state={led} blink={state === 'thinking' && led === 'amber'} />
        ))}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="strong"
          data-testid="ai-commander-label"
          sx={{
            display: 'block',
            fontSize: T.type.meta.size,
            lineHeight: `${T.type.meta.lineHeight}px`,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: T.color.paper,
            overflowWrap: 'anywhere',
          }}
        >
          {aiCommanderLabel(t, strategy, settings.aiDifficulty)}
        </Typography>
        {state === 'thinking' ? (
          <Typography
            component="span"
            data-testid="ai-thinking"
            role="status"
            aria-live="polite"
            sx={{ display: 'block', fontSize: T.type.meta.size, color: T.color.amberText }}
          >
            {t('rebellion.match:ai.thinking')}
          </Typography>
        ) : (
          <Typography
            component="span"
            data-testid="ai-commander-state"
            sx={{
              display: 'block',
              fontSize: T.type.meta.size,
              textTransform: 'uppercase',
              color:
                state === 'stalled'
                  ? T.color.redText
                  : state === 'over'
                    ? T.color.warm
                    : T.color.phosphor,
            }}
          >
            {state === 'idle'
              ? steps > 0
                ? t('rebellion.match:ai.state.readySteps', { count: steps })
                : t('rebellion.match:ai.state.ready')
              : t(`rebellion.match:ai.state.${state}`)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
