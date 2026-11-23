import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { Led } from '@/shared/ui';
import { TABLE_NS } from './model/tableModel';

const T = terminalTokens;

/**
 * Waiting status of the Physical Execution module (SWR-010 FE-B, plan-frontend §3.2, TC-PX-10): an amber LED (blinks
 * while the AI waits; never with reduced motion — `Led` handles it) **and** the status in text, so it is never told by
 * the LED alone. `aiWaiting` — the server's `view.table.aiWaiting`; `gameOver` — the game ended with tasks left (C-5).
 */
export function TableTaskWaiting({
  aiWaiting,
  gameOver,
}: {
  aiWaiting: boolean;
  gameOver: boolean;
}) {
  const { t } = useTranslation();
  const text = aiWaiting
    ? t(`${TABLE_NS}:px.waiting.ai`)
    : gameOver
      ? t(`${TABLE_NS}:px.waiting.over`)
      : t(`${TABLE_NS}:px.waiting.you`);
  return (
    <Box
      data-testid="table-task-waiting"
      data-ai-waiting={aiWaiting ? 'true' : 'false'}
      aria-live="polite"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        fontSize: T.type.meta.size,
        lineHeight: `${T.type.meta.lineHeight}px`,
        letterSpacing: T.letterSpacing.meta,
        textTransform: 'uppercase',
        color: T.color.warm,
      }}
    >
      <Led state={gameOver && !aiWaiting ? 'off' : 'amber'} blink={aiWaiting} />
      <span>{text}</span>
    </Box>
  );
}
