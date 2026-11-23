import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { TerminalModule } from '@/shared/ui';
import { useCoreBoard } from '../model/coreContext';
import { isGameOver } from '../model/viewModel';
import { PX_TITLE_ID } from '../panels/focus';
import { useTableErrorStore } from './model/tableErrorStore';
import { headTask, isAiWaiting, TABLE_NS, tableTasks, taskTitle } from './model/tableModel';
import { TableTaskCard } from './TableTaskCard';
import { TableTaskWaiting } from './TableTaskWaiting';

const T = terminalTokens;
const C = T.color;

/**
 * Physical Execution module of the console rail (SWR-010 FE-B, plan-frontend §2.2, §3.2, AC-21): replaces «Your task»
 * while the server keeps table tasks (`consoleMode(view) === 'physical'`). Header «Physical table · task 1 of N» (its
 * span is the focus target `PX_TITLE_ID`), the head task (`TableTaskCard`), the waiting status (text + LED), the titles
 * of the next tasks and the inline rejection of the last command for this head. Everything comes from `view.table`.
 * `physical-execution[data-head-kind][data-queue-length][data-ai-waiting]`.
 */
export function PhysicalExecutionPanel() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const tasks = tableTasks(view);
  const head = headTask(view);
  const aiWaiting = isAiWaiting(view);
  const errorTaskId = useTableErrorStore((s) => s.taskId);
  const errorText = useTableErrorStore((s) => s.text);
  const error = head && errorTaskId === head.id ? errorText : null;
  const rest = tasks.slice(1);

  return (
    <TerminalModule
      data-testid="physical-execution"
      data-head-kind={head?.kind ?? ''}
      data-queue-length={tasks.length}
      data-ai-waiting={aiWaiting ? 'true' : 'false'}
      label={
        <Box
          component="span"
          id={PX_TITLE_ID}
          tabIndex={-1}
          sx={{
            '&:focus': { outline: 'none' },
            '&:focus-visible': {
              outline: `${T.focus.width}px solid ${T.focus.color}`,
              outlineOffset: T.focus.offset,
            },
          }}
        >
          {t(`${TABLE_NS}:px.label`, { n: tasks.length > 0 ? 1 : 0, total: tasks.length })}
        </Box>
      }
      sx={{ overflowY: 'auto', minHeight: 0 }}
    >
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        <TableTaskWaiting aiWaiting={aiWaiting} gameOver={isGameOver(view)} />
        {head && <TableTaskCard key={head.id} task={head} isHead />}
        {error && (
          <Alert severity="error" role="alert" data-testid="table-task-error">
            {error}
          </Alert>
        )}
        {rest.length > 0 && (
          <Box data-testid="table-task-next">
            <Typography
              component="h3"
              sx={{
                m: 0,
                color: C.muted,
                fontSize: T.type.meta.size,
                lineHeight: `${T.type.meta.lineHeight}px`,
                letterSpacing: T.letterSpacing.meta,
                textTransform: 'uppercase',
              }}
            >
              {t(`${TABLE_NS}:px.next`)}
            </Typography>
            <Box component="ol" start={2} sx={{ m: 0, pl: 2.5, color: C.warm }}>
              {rest.map((task) => (
                <Typography
                  key={task.id}
                  component="li"
                  variant="body2"
                  data-testid={`table-task-${task.id}`}
                  data-head="false"
                  data-kind={task.kind}
                >
                  {taskTitle(t, task)}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </TerminalModule>
  );
}
