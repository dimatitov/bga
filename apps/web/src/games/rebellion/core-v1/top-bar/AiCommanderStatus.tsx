import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useSessionAutomation } from '@/platform';
import { aiCommanderLabel, aiCommanderState, aiSideOf } from '../model/aiCommander';
import { useCoreBoard } from '../model/coreContext';

/**
 * AI Commander of the top bar (SWR-006 plan-frontend §6.3, D-PO-4): «AI Commander · бот · Обычная» (provider from
 * the session automation, difficulty from the public settings) and, while the AI moves, «ИИ думает…»
 * (`ai-thinking`, `role="status"`). Only in an AI game; nothing in hot-seat.
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
  return (
    <Box
      data-testid="ai-commander-status"
      data-strategy={strategy ?? 'none'}
      data-difficulty={settings.aiDifficulty ?? 'none'}
      data-state={state}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}
    >
      <Chip
        size="small"
        variant="outlined"
        icon={<SmartToyOutlinedIcon aria-hidden />}
        label={aiCommanderLabel(t, strategy, settings.aiDifficulty)}
        sx={{ maxWidth: '100%', '& .MuiChip-icon': { color: 'inherit' } }}
      />
      {state === 'thinking' && (
        <Box
          data-testid="ai-thinking"
          role="status"
          aria-live="polite"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
        >
          <CircularProgress size={14} aria-hidden />
          <Typography component="span" variant="body2">
            {t('rebellion.match:ai.thinking')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
