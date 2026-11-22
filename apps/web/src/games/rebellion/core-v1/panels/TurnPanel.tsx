import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useSessionAutomation } from '@/platform';
import { terminalTokens } from '@/shared/theme';
import { Led, type LedState, TerminalModule } from '@/shared/ui';
import { phaseName } from '../../board';
import { aiSideOf } from '../model/aiCommander';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import {
  activatableLeaders,
  canActivateLeader,
  hasPassed,
  opponentOf,
  turnState,
} from '../model/viewModel';
import { ActivationPicker } from './ActivationPicker';
import { AiTurnSummary } from './AiTurnSummary';
import { TURN_PANEL_ID, TURN_TITLE_ID } from './focus';
import { factionLabel } from './labels';
import { LeaderPool } from './LeaderPool';
import { MovePanel } from './MovePanel';
import { useTurnErrorStore } from './turnErrorStore';

export type TurnPanelState = 'idle' | 'armed' | 'activation' | 'waiting' | 'over';

const C = terminalTokens.color;

/**
 * «Your task» module of the console rail (SWR-009 C2; plan-frontend SWR-005 §3.4, §5.1, §9). `turn-panel[data-state]`:
 * `idle` — the viewer may activate / pass (pool + hint); `armed` — a leader is taken (pool + system picker);
 * `activation` — the viewer's own activation (moves); `waiting` — not the viewer's turn; `over` — game over.
 * Header «ВАША ЗАДАЧА · <phase>» (its text span is the focus target after FINISH / PASS and of the «To the turn
 * panel» skip link), the task line, `turn-status`, the LED line «ВАШ ХОД · <side>» (`turn-led-line[data-led]`) and
 * the amber AI line (`AiTurnSummary`). Everything comes from `legalActions` / view fields / the automation state.
 */
export function TurnPanel() {
  const { t } = useTranslation();
  const { view, aiThinking = false } = useCoreBoard();
  const automation = useSessionAutomation();
  const armedLeaderId = useCoreUiStore((s) => s.armedLeaderId);
  const activationError = useTurnErrorStore((s) => s.activation);

  const coarse = turnState(view);
  const armed =
    coarse === 'idle' && armedLeaderId !== null && canActivateLeader(view, armedLeaderId)
      ? armedLeaderId
      : null;
  const state: TurnPanelState = armed ? 'armed' : coarse;
  const opponent = opponentOf(view.viewer);
  const aiSide = aiSideOf(view.settings);

  const aiStalled =
    aiSide !== null && (automation?.phase === 'error' || automation?.phase === 'stalled');

  let status: string;
  if (state === 'over') status = t('rebellion.turn:panel.gameOver');
  else if (aiThinking) status = t('rebellion.turn:panel.aiThinking');
  else if (state === 'waiting' && aiStalled) status = t('rebellion.turn:panel.aiStalled');
  else if (state === 'waiting') {
    status = hasPassed(view, view.viewer)
      ? t('rebellion.turn:panel.youPassed')
      : t('rebellion.turn:panel.waiting', { side: factionLabel(t, view.activeSide) });
  } else if (state === 'activation') status = '';
  else if (hasPassed(view, opponent)) status = t(`rebellion.turn:panel.opponentPassed.${opponent}`);
  else status = t('rebellion.turn:panel.yourTurn');

  // LED line: green — the viewer acts; amber (blinking) — the AI moves; red — the AI run stalled; off — waiting / over.
  let led: LedState;
  let ledText: string;
  const active = factionLabel(t, view.activeSide);
  if (state === 'over') {
    led = 'off';
    ledText = t('rebellion.turn:panel.led.over');
  } else if (aiThinking) {
    led = 'amber';
    ledText = t('rebellion.turn:panel.led.thinking', { side: factionLabel(t, aiSide ?? opponent) });
  } else if (state === 'waiting' && aiStalled) {
    led = 'red';
    ledText = t('rebellion.turn:panel.led.stalled', { side: factionLabel(t, aiSide ?? opponent) });
  } else if (state === 'waiting') {
    led = 'off';
    ledText = t('rebellion.turn:panel.led.other', { side: active });
  } else {
    led = 'green';
    ledText = t('rebellion.turn:panel.led.own', { side: factionLabel(t, view.viewer) });
  }

  return (
    <TerminalModule
      id={TURN_PANEL_ID}
      data-testid="turn-panel"
      data-state={state}
      label={
        <Box
          component="span"
          id={TURN_TITLE_ID}
          tabIndex={-1}
          sx={{
            '&:focus': { outline: 'none' },
            '&:focus-visible': {
              outline: `${terminalTokens.focus.width}px solid ${terminalTokens.focus.color}`,
              outlineOffset: terminalTokens.focus.offset,
            },
          }}
        >
          {t('rebellion.turn:panel.label', { phase: phaseName(t, view.phase) })}
        </Box>
      }
      sx={{ overflowY: 'auto', minHeight: 0 }}
    >
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Typography
          component="p"
          variant="subtitle1"
          data-testid="turn-task"
          sx={{ m: 0, fontWeight: 700, color: C.paper }}
        >
          {t(`rebellion.turn:panel.task.${state}`)}
        </Typography>
        {status && (
          <Typography variant="body2" data-testid="turn-status" sx={{ color: C.warm }}>
            {status}
          </Typography>
        )}
        <Box
          data-testid="turn-led-line"
          data-led={led}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            fontSize: terminalTokens.type.meta.size,
            lineHeight: `${terminalTokens.type.meta.lineHeight}px`,
            letterSpacing: terminalTokens.letterSpacing.meta,
            textTransform: 'uppercase',
            color: led === 'green' ? C.phosphorText : led === 'red' ? C.redText : C.warm,
          }}
        >
          <Led state={led} blink={led === 'amber'} />
          <span>{ledText}</span>
        </Box>
        <AiTurnSummary />
        {(state === 'idle' || state === 'armed') && (
          <>
            <LeaderPool />
            {activatableLeaders(view).length > 0 && !armed && (
              <Typography variant="body2" sx={{ color: C.warm }}>
                {t('rebellion.turn:pool.hint')}
              </Typography>
            )}
            {armed && <ActivationPicker key={armed} leaderId={armed} />}
            {activationError && (
              <Alert severity="error" role="alert" data-testid="activation-error">
                {activationError}
              </Alert>
            )}
          </>
        )}
        {state === 'activation' && <MovePanel />}
      </Box>
    </TerminalModule>
  );
}
