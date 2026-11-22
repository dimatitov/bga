import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { type DragEvent, type KeyboardEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { ForceGlyph } from '../../ui/ForceGlyph';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { encodeLeaderDrag } from '../model/dnd';
import { activatableLeaders, poolOf } from '../model/viewModel';
import { leaderLabel } from './labels';
import { useTurnCommands } from './useTurnCommands';

const LABEL_ID = 'core-leader-pool-label';
const NO_LEADERS_ID = 'core-leader-pool-no-leaders';

const T = terminalTokens;
const K = T.key;
const COARSE = '@media (pointer: coarse)';

/**
 * The viewer's leader pool (plan-frontend §5.2–5.3 step 1): `role="radiogroup"` with roving tabindex — one Tab
 * stop, arrows move between the leaders that may activate and arm them, Space/Enter/click arms or disarms, Esc
 * disarms. Availability comes only from `ACTIVATE_SYSTEM.leaderIds`: a leader that is not listed (e.g.
 * `canActivate: false`) is shown with `aria-disabled` and the reason. An armed leader can also be dragged onto
 * the map (HTML5 DnD, `application/x-swr-leader`; the drop is handled by the map).
 * SWR-009 C2: header «ПУЛ ЛИДЕРОВ» + «N / M доступны» (`leader-pool-count`), two columns of key-like cards (≥ 44 px on
 * touch): armed = amber selected key, unavailable = dashed border + the reason in text (not by colour alone).
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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography
          id={LABEL_ID}
          variant="overline"
          component="h3"
          sx={{ m: 0, color: T.color.paper, fontWeight: 700, lineHeight: 1.5 }}
        >
          {t('rebellion.turn:pool.label')}
        </Typography>
        {pool.length > 0 && (
          <Typography
            variant="meta"
            data-testid="leader-pool-count"
            data-available={enabled.length}
            data-total={pool.length}
            sx={{ color: T.color.muted, textTransform: 'uppercase' }}
          >
            {t('rebellion.turn:pool.count', {
              available: String(enabled.length).padStart(2, '0'),
              total: String(pool.length).padStart(2, '0'),
            })}
          </Typography>
        )}
      </Box>
      {pool.length === 0 ? (
        <Typography variant="body2" data-testid="leader-pool-empty" sx={{ color: T.color.warm }}>
          {t('rebellion.turn:pool.empty')}
        </Typography>
      ) : (
        <Box
          role="radiogroup"
          aria-labelledby={LABEL_ID}
          aria-describedby={enabled.length === 0 ? NO_LEADERS_ID : undefined}
          aria-disabled={enabled.length === 0 || undefined}
          data-testid="leader-pool"
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}
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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '7px',
                  minWidth: 0,
                  minHeight: 36,
                  [COARSE]: { minHeight: K.touchMinHeight },
                  px: '6px',
                  py: '4px',
                  borderRadius: `${T.radius}px`,
                  textAlign: 'left',
                  border: checked
                    ? `2px solid ${K.selected.border}`
                    : `1px ${isAvailable ? 'solid' : 'dashed'} ${
                        isAvailable ? K.default.border : K.disabled.border
                      }`,
                  backgroundColor: checked
                    ? K.selected.bg
                    : isAvailable
                      ? K.default.bg
                      : T.color.module,
                  boxShadow: checked || !isAvailable ? 'none' : `inset 0 1px ${K.default.bevel}`,
                  color: checked ? K.selected.text : isAvailable ? K.default.text : T.color.muted,
                  cursor: isAvailable ? 'grab' : 'not-allowed',
                  ...(isAvailable &&
                    !checked && {
                      '&:hover': { backgroundColor: K.hover.bg, borderColor: K.hover.border },
                    }),
                  '&:focus-visible': {
                    outline: `${T.focus.width}px solid ${T.focus.color}`,
                    outlineOffset: T.focus.offset,
                  },
                }}
              >
                <ForceGlyph owner={leader.owner} kind="leader" size={12} />
                <Box
                  component="span"
                  sx={{ display: 'grid', minWidth: 0, overflowWrap: 'anywhere' }}
                >
                  <Box component="span" sx={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>
                    {leaderLabel(t, leader.id)}
                  </Box>
                  {!isAvailable && (
                    <Box component="span" id={reasonId} sx={{ fontSize: 11, lineHeight: 1.3 }}>
                      {t('rebellion.turn:pool.unavailable')}
                    </Box>
                  )}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      )}
      {enabled.length === 0 && (
        <Typography
          id={NO_LEADERS_ID}
          variant="body2"
          data-testid="leader-pool-no-leaders"
          sx={{ color: T.color.warm }}
        >
          {t('rebellion.turn:panel.noLeaders')}
        </Typography>
      )}
    </Box>
  );
}
