import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { automationFallbackReasonText, useSessionAutomation } from '@/platform';
import { terminalTokens } from '@/shared/theme';
import { aiSideOf, aiSummaryText, hasAiFallback } from '../model/aiCommander';
import { useCoreBoard } from '../model/coreContext';

/**
 * Summary of the last AI turn in the turn panel (SWR-006 plan-frontend §6.4): «Ход AI: N действий» from the
 * automation summary of the last response with steps (`steps` of the server, Q-FE-5: kept until the next response
 * with steps or the next human command); with OpenAI and `fallbacks > 0` — «Часть ходов AI (k) сделал бот:
 * OpenAI недоступен — <причины>» by the fallback codes (D-PO-3). Nothing from the model is shown.
 * `ai-turn-summary[data-steps][data-source]`, `ai-fallback-notice[data-fallbacks][data-reasons]`.
 * SWR-009 C2: the amber «AI: …» line of the «Your task» module (amber text shade, QD-8); the notice is a warning alert.
 */
export function AiTurnSummary() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const automation = useSessionAutomation();
  const lastRun = automation?.lastRun ?? null;
  if (aiSideOf(view.settings) === null || !lastRun) return null;
  const { summary } = lastRun;
  const text = aiSummaryText(t, summary);
  if (text === null) return null;
  return (
    <Box
      data-testid="ai-turn-summary"
      data-steps={summary.steps}
      data-source={lastRun.source}
      sx={{ display: 'grid', gap: 1 }}
    >
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, color: terminalTokens.color.amberText, overflowWrap: 'anywhere' }}
      >
        {text}
      </Typography>
      {hasAiFallback(summary) && (
        <Alert
          severity="warning"
          data-testid="ai-fallback-notice"
          data-fallbacks={summary.fallbacks}
          data-reasons={summary.fallbackReasons.join(',')}
        >
          {t('rebellion.match:ai.fallback', {
            count: summary.fallbacks,
            // No code reported (should not happen) → the generic «другая причина».
            reasons: (summary.fallbackReasons.length > 0 ? summary.fallbackReasons : ['unknown'])
              .map((code) => automationFallbackReasonText(t, code))
              .join(', '),
          })}
        </Alert>
      )}
    </Box>
  );
}
