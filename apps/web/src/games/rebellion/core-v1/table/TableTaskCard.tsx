import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { TableTask } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { useCoreBoard } from '../model/coreContext';
import { factionLabel } from '../panels/labels';
import { LocationRegisterForm } from './LocationRegisterForm';
import { affectedItems, registrationOf, stepText, TABLE_NS, taskTitle } from './model/tableModel';

const T = terminalTokens;
const C = T.color;

const blockTitleSx = {
  m: 0,
  color: C.muted,
  fontSize: T.type.meta.size,
  lineHeight: `${T.type.meta.lineHeight}px`,
  letterSpacing: T.letterSpacing.meta,
  textTransform: 'uppercase',
} as const;

const AFFECTED = ['cards', 'leaders', 'units', 'systems'] as const;

/**
 * One physical-table task (SWR-010 FE-B, plan-frontend §3.2, AC-21): a named region with three blocks —
 * «What happened» (`px.happened.<kind>` + the acting side), «Affected» (cards / leaders / units / systems; a `null`
 * system is the «Rebel Base» space) and «Do on the table» (numbered `<ol>` of the steps). A `register` task shows the
 * Location registration form instead of the confirm key. Text comes from `task.steps[].params` / `task.affected` only.
 */
export function TableTaskCard({ task, isHead }: { task: TableTask; isHead: boolean }) {
  const { t, i18n } = useTranslation();
  const { view } = useCoreBoard();
  const lng = i18n.resolvedLanguage ?? i18n.language;
  const titleId = `table-task-title-${task.id}`;
  const affected = affectedItems(t, task, view);
  const anyAffected = AFFECTED.some((k) => affected[k].length > 0);
  const registration = registrationOf(view);
  const side = task.actor === 'system' ? '' : factionLabel(t, task.actor);

  return (
    <Box
      role="region"
      aria-labelledby={titleId}
      data-testid={`table-task-${task.id}`}
      data-head={isHead ? 'true' : 'false'}
      data-kind={task.kind}
      sx={{ display: 'grid', gap: 1 }}
    >
      <Typography
        component="h3"
        id={titleId}
        variant="subtitle1"
        sx={{ m: 0, fontWeight: 700, color: C.paper }}
      >
        {taskTitle(t, task)}
      </Typography>

      <Box>
        <Typography component="h4" sx={blockTitleSx}>
          {t(`${TABLE_NS}:px.happenedTitle`)}
        </Typography>
        <Typography variant="body2" sx={{ color: C.paper }} data-testid="table-task-happened">
          {t(`${TABLE_NS}:px.happened.${task.kind}`, { side })}
        </Typography>
      </Box>

      <Box>
        <Typography component="h4" sx={blockTitleSx}>
          {t(`${TABLE_NS}:px.affected.title`)}
        </Typography>
        {anyAffected ? (
          <Box
            component="dl"
            data-testid="table-task-affected"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr)',
              columnGap: 1.5,
            }}
          >
            {AFFECTED.filter((k) => affected[k].length > 0).map((k) => (
              <Box key={k} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="body2" sx={{ color: C.muted }}>
                  {t(`${TABLE_NS}:px.affected.${k}`)}
                </Typography>
                <Typography
                  component="dd"
                  variant="body2"
                  data-affected={k}
                  sx={{ m: 0, color: C.paper, overflowWrap: 'anywhere' }}
                >
                  {affected[k].join(', ')}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: C.warm }} data-testid="table-task-affected">
            {t(`${TABLE_NS}:px.affected.none`)}
          </Typography>
        )}
      </Box>

      <Box>
        <Typography component="h4" sx={blockTitleSx}>
          {t(`${TABLE_NS}:px.doTitle`)}
        </Typography>
        <Box
          component="ol"
          data-testid="table-task-steps"
          sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, color: C.paper }}
        >
          {task.steps.map((step, i) => (
            <Typography
              key={`${step.key}-${i}`}
              component="li"
              variant="body2"
              data-step={step.key.replace('table.steps.', '')}
            >
              {stepText(t, step, view, lng)}
            </Typography>
          ))}
        </Box>
      </Box>

      {isHead && task.completion === 'register' && registration && (
        <LocationRegisterForm key={task.id} registration={registration} />
      )}
    </Box>
  );
}
