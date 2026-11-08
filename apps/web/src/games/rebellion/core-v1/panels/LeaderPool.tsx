import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { type DragEvent, type KeyboardEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { rebellionPalette } from '../../theme/palette';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { encodeLeaderDrag } from '../model/dnd';
import { activatableLeaders, poolOf } from '../model/viewModel';
import { leaderLabel } from './labels';
import { useTurnCommands } from './useTurnCommands';

const LABEL_ID = 'core-leader-pool-label';
const NO_LEADERS_ID = 'core-leader-pool-no-leaders';

/**
 * The viewer's leader pool (plan-frontend §5.2–5.3 step 1): `role="radiogroup"` with roving tabindex — one Tab
 * stop, arrows move between the leaders that may activate and arm them, Space/Enter/click arms or disarms, Esc
 * disarms. Availability comes only from `ACTIVATE_SYSTEM.leaderIds`: a leader that is not listed (e.g.
 * `canActivate: false`) is shown with `aria-disabled` and the reason. An armed leader can also be dragged onto
 * the map (HTML5 DnD, `application/x-swr-leader`; the drop is handled by the map).
 */
export function LeaderPool() {
  const { t } = useTranslation();
  const { view, isPending } = useCoreBoard();
  const armed = useCoreUiStore((s) => s.armedLeaderId);
  const { toggleArm } = useTurnCommands();
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const pool = poolOf(view, view.viewer);
  const available = new Set(activatableLeaders(view));
  const enabled = pool.filter((l) => available.has(l.id));
  const tabStop = enabled.find((l) => l.id === armed)?.id ?? enabled[0]?.id ?? null;

  const onKeyDown = (e: KeyboardEvent, leaderId: string) => {
    if (e.key === 'Escape') {
      // On the table the capture-phase Esc handler of `CoreTable` may have disarmed already (defaultPrevented).
      const current = useCoreUiStore.getState().armedLeaderId;
      if (!e.defaultPrevented && current !== null) {
        e.preventDefault();
        toggleArm(current);
      }
      return;
    }
    // Space/Enter are NOT handled here: `ButtonBase` (non-native button) already turns Enter (keydown) and Space
    // (keyup) into a click, i.e. `onClick` → `toggleArm`. Handling them here too toggled twice (SWR-005 D-3).
    if (e.key === ' ' || e.key === 'Enter') return;
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta || enabled.length === 0) return;
    e.preventDefault();
    const index = enabled.findIndex((l) => l.id === leaderId);
    const next = enabled[(index + delta + enabled.length) % enabled.length];
    if (!next) return;
    if (next.id !== armed) toggleArm(next.id);
    refs.current[next.id]?.focus();
  };

  const onDragStart = (e: DragEvent, leaderId: string) => {
    encodeLeaderDrag(e.dataTransfer, leaderId);
    e.dataTransfer.effectAllowed = 'move';
    if (armed !== leaderId) toggleArm(leaderId);
  };

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography
        id={LABEL_ID}
        variant="overline"
        component="h3"
        sx={{ color: 'text.secondary', lineHeight: 1.5 }}
      >
        {t('rebellion.turn:pool.label')}
      </Typography>
      {pool.length === 0 ? (
        <Typography variant="body2" data-testid="leader-pool-empty">
          {t('rebellion.turn:pool.empty')}
        </Typography>
      ) : (
        <Box
          role="radiogroup"
          aria-labelledby={LABEL_ID}
          aria-describedby={enabled.length === 0 ? NO_LEADERS_ID : undefined}
          aria-disabled={enabled.length === 0 || undefined}
          data-testid="leader-pool"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
        >
          {pool.map((leader) => {
            const isAvailable = available.has(leader.id);
            const checked = leader.id === armed;
            const reasonId = `core-leader-${leader.id}-reason`;
            return (
              <ButtonBase
                key={leader.id}
                component="div"
                ref={(el: HTMLDivElement | null) => {
                  refs.current[leader.id] = el;
                }}
                role="radio"
                aria-checked={checked}
                aria-disabled={!isAvailable || isPending || undefined}
                aria-describedby={isAvailable ? undefined : reasonId}
                tabIndex={leader.id === tabStop ? 0 : -1}
                data-testid={`leader-${leader.id}`}
                data-owner={leader.owner}
                data-available={isAvailable ? 'true' : 'false'}
                data-selected={checked ? 'true' : undefined}
                draggable={isAvailable && !isPending}
                onDragStart={(e: DragEvent) => onDragStart(e, leader.id)}
                onClick={() => {
                  if (isAvailable && !isPending) toggleArm(leader.id);
                }}
                onKeyDown={(e: KeyboardEvent) => onKeyDown(e, leader.id)}
                sx={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  minHeight: 44,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1,
                  border: 2,
                  borderStyle: isAvailable ? 'solid' : 'dashed',
                  borderColor: checked ? 'primary.main' : 'divider',
                  bgcolor: (theme) =>
                    checked ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                  color: isAvailable ? 'text.primary' : 'text.secondary',
                  cursor: isAvailable ? 'grab' : 'not-allowed',
                  textAlign: 'left',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: rebellionPalette.board.selected,
                    outlineOffset: 2,
                  },
                }}
              >
                <Box component="span" sx={{ fontWeight: 600, fontSize: 14 }}>
                  {leaderLabel(t, leader.id)}
                </Box>
                {!isAvailable && (
                  <Box component="span" id={reasonId} sx={{ fontSize: 12 }}>
                    {t('rebellion.turn:pool.unavailable')}
                  </Box>
                )}
              </ButtonBase>
            );
          })}
        </Box>
      )}
      {enabled.length === 0 && (
        <Typography id={NO_LEADERS_ID} variant="body2" data-testid="leader-pool-no-leaders">
          {t('rebellion.turn:panel.noLeaders')}
        </Typography>
      )}
    </Box>
  );
}
