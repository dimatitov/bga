import FlagIcon from '@mui/icons-material/OutlinedFlag';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { TableScreenProps } from '@/games/types';
import { CONSOLE_FULL, CONSOLE_SPLIT, MOBILE_SHEET, mq, terminalTokens } from '@/shared/theme';
import { StatusBadge } from '@/shared/ui/terminal';
import { phaseName } from '../../board';
import { SaveStatus } from '../../table/components/SaveStatus';
import type { SaveStatus as SaveStatusValue } from '../../table/hooks/useSendCommand';
import { CONSOLE_AREA } from '../console/consoleLayout';
import { aiSideOf } from '../model/aiCommander';
import { useCoreBoard } from '../model/coreContext';
import { isGameOver, markers } from '../model/viewModel';
import { AiCommanderStatus } from './AiCommanderStatus';
import { TimeTrack } from './TimeTrack';
import { PassedIndicator, TurnIndicator } from './TurnIndicator';

const T = terminalTokens;

/** Vertical divider before a cell (wide status bar only). */
const DIVIDED = {
  [mq.up(CONSOLE_FULL)]: { borderLeft: `1px solid ${T.color.bezel}`, pl: '13px' },
} as const;

/**
 * Status bar grid (SWR-009 plan §4; design `.status`): five cells side · track · round/phase · AI box · state.
 * ≥ 1200 one row; 900–1199 three columns (wraps into two rows); 760–899 two columns; < 760 a compact 2-column grid
 * with fixed areas «side | phase» · «track» (full width) · «AI box | state» (hot-seat: «track | state»), target
 * ≤ ~170 px high (SWR-009 C1 fix round 1). Cells never overlap and the bar never scrolls sideways.
 */
const BAR = {
  gridArea: CONSOLE_AREA.status,
  display: 'grid',
  alignItems: 'center',
  gap: '8px 12px',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  [mq.down(MOBILE_SHEET)]: {
    gap: '6px 10px',
    py: '6px',
    gridTemplateAreas: '"side phase" "track track" "ai save"',
    '&[data-ai="false"]': { gridTemplateAreas: '"side phase" "track save"' },
    '& > [data-cell="side"]': { gridArea: 'side' },
    '& > [data-cell="phase"]': { gridArea: 'phase' },
    '& > [data-cell="track"]': { gridArea: 'track' },
    '& > [data-cell="ai"]': { gridArea: 'ai' },
    '& > [data-cell="save"]': { gridArea: 'save' },
  },
  [mq.up(CONSOLE_SPLIT)]: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  [mq.up(CONSOLE_FULL)]: {
    gridTemplateColumns:
      'minmax(170px, 220px) minmax(180px, 1fr) minmax(120px, 160px) minmax(190px, 260px) minmax(130px, 170px)',
  },
  minWidth: 0,
  px: { xs: '10px', sm: '15px' },
  py: '8px',
  border: `1px solid ${T.color.bezelLight}`,
  bgcolor: T.color.moduleHead,
} as const;

/**
 * Status bar of the `core-v1` console (SWR-005 plan-frontend §7; SWR-009 plan §2 C1, design «status»), the
 * existing `table-top-bar`. DOM order = Tab order: side (`turn-indicator`) → time/reputation (`time-track`) →
 * round + phase (`phase-indicator`, `passed-indicator`) → AI Commander (`ai-commander-status`, AI game only) →
 * state (`save-status`, `session-status-completed`). «← К игре» and ⚙ live in the console header, the turn keys in
 * the rail, the slice badge in the footer (SWR-009 K-7, plan §4).
 * «Завершена» shows for the platform status `completed` or as soon as the view carries `outcome` (the status
 * arrives with the invalidated detail, AM-FE-10).
 */
export function CoreTopBar({
  status,
  saveStatus,
}: {
  status: TableScreenProps['status'];
  saveStatus: SaveStatusValue;
}) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const { time, reputation } = markers(view);
  const completed = status === 'completed' || isGameOver(view);
  return (
    <Box
      component="section"
      data-testid="table-top-bar"
      aria-label={t('rebellion.session:console.statusLabel')}
      data-ai={aiSideOf(view.settings) === null ? 'false' : 'true'}
      sx={BAR}
    >
      <Box data-cell="side" sx={{ minWidth: 0 }}>
        <TurnIndicator view={view} />
      </Box>
      <Box data-cell="track" data-group="state" sx={{ minWidth: 0, ...DIVIDED }}>
        <TimeTrack time={time} reputation={reputation} />
      </Box>
      <Box data-cell="phase" sx={{ minWidth: 0, display: 'grid', gap: '4px' }}>
        <Typography variant="meta" component="span">
          {t('rebellion.session:topBar.round', { round: time })}
        </Typography>
        <Typography
          data-testid="phase-indicator"
          data-phase={view.phase}
          component="strong"
          sx={{
            fontSize: 14,
            lineHeight: '18px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: T.color.phosphor,
            overflowWrap: 'anywhere',
          }}
        >
          {phaseName(t, view.phase)}
        </Typography>
        <PassedIndicator view={view} />
      </Box>
      <AiCell over={completed} />
      <Box data-cell="save" sx={{ minWidth: 0, display: 'grid', gap: '4px', ...DIVIDED }}>
        <Typography variant="meta" component="span">
          {t('rebellion.session:console.state')}
        </Typography>
        <SaveStatus status={saveStatus} />
        {completed && (
          <StatusBadge
            tone="neutral"
            data-testid="session-status-completed"
            data-status="completed"
            sx={{ justifySelf: 'start' }}
          >
            <FlagIcon aria-hidden sx={{ fontSize: 14 }} />
            {t('common:sessionStatus.completed')}
          </StatusBadge>
        )}
      </Box>
    </Box>
  );
}

/** The AI box cell; absent in hot-seat (no empty grid cell). */
function AiCell({ over }: { over: boolean }) {
  const { view } = useCoreBoard();
  if (aiSideOf(view.settings) === null) return null;
  return (
    <Box data-cell="ai" sx={{ minWidth: 0 }}>
      <AiCommanderStatus over={over} />
    </Box>
  );
}
