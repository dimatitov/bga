import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { CoreLeaderView, CoreUnitView, FactionId } from '@bga/game-rebellion/schema';
import { type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { KeyButton } from '@/shared/ui';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import {
  activatedSystemId,
  activationTargets,
  hiddenZone,
  isContested,
  leaderLocationLabel,
  leadersAt,
  poolOf,
  systemsByRegion,
  unitsAt,
} from '../model/viewModel';
import { BOARD_LIST_ID } from '../panels/focus';
import { factionLabel, leaderLabel, regionLabel, systemLabel, unitLabel } from '../panels/labels';
import { useTurnCommands } from '../panels/useTurnCommands';

type OptionKind = 'system' | 'unit' | 'leader' | 'zone';
interface OptionRef {
  key: string;
  kind: OptionKind;
  id: string;
}

const SIDES: FactionId[] = ['rebels', 'empire'];

const T = terminalTokens;
const C = T.color;

/**
 * Option row (SWR-009 C2, AC-14): hover — key-hover fill; selected — dark amber fill + amber edge; focus-visible — the
 * amber 2 px ring; ≥ 44 px on touch. Texts stay `paper` / `warm` (pairs checked in `textPairs`).
 */
const optionSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  minHeight: 36,
  '@media (pointer: coarse)': { minHeight: T.key.touchMinHeight },
  px: 1.25,
  borderRadius: `${T.radius}px`,
  border: '1px solid transparent',
  color: C.paper,
  cursor: 'pointer',
  '&:hover': { backgroundColor: T.key.hover.bg, borderColor: T.key.hover.border },
  '&[aria-selected="true"]': {
    backgroundColor: T.selection.bg,
    borderColor: C.amber,
    boxShadow: `inset 2px 0 0 ${C.amber}`,
  },
  '&:focus-visible': {
    outline: `${T.focus.width}px solid ${T.focus.color}`,
    outlineOffset: T.focus.offset,
  },
} as const;

/**
 * Accessible list of the `core-v1` table (plan-frontend §5.3 step 3, §9): `role="listbox"` of systems grouped by
 * region (with their leaders and units), the hidden rebel-base zone (only when the server hides the base) and both
 * leader pools. Roving tabindex like the legacy list (Tab enters, arrows/Home/End move, Enter/Space select).
 * Markers are data attributes + text suffixes from the view: `data-activatable` (armed leader's
 * `ACTIVATE_SYSTEM.systemIds`), `data-activated`, `data-contested`, `data-remote`, `data-region`.
 * With an armed leader and a selected target, `system-item-<id>-activate` sends `ACTIVATE_SYSTEM`.
 * SWR-009 C2: terminal rows (meta region headers, amber selected row, dashed hidden-zone row), primary key.
 */
export function CoreBoardList() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const selection = useSelectionStore((s) => s.selection);
  const selectSystem = useSelectionStore((s) => s.selectSystem);
  const selectPiece = useSelectionStore((s) => s.selectPiece);
  const selectLeader = useSelectionStore((s) => s.selectLeader);
  const selectZone = useSelectionStore((s) => s.selectZone);
  const armed = useCoreUiStore((s) => s.armedLeaderId);
  const { activate, isPending } = useTurnCommands();
  const listRef = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const targets = useMemo(() => new Set(activationTargets(view, armed)), [view, armed]);
  const activated = activatedSystemId(view);
  const zone = hiddenZone(view);
  const regions = useMemo(() => systemsByRegion(view), [view]);

  const options = useMemo<OptionRef[]>(() => {
    const out: OptionRef[] = [];
    for (const r of regions) {
      for (const s of r.systems) {
        out.push({ key: `system-${s.id}`, kind: 'system', id: s.id });
        for (const l of leadersAt(view, s.id))
          out.push({ key: `leader-${l.id}`, kind: 'leader', id: l.id });
        for (const u of unitsAt(view, s.id))
          out.push({ key: `unit-${u.id}`, kind: 'unit', id: u.id });
      }
    }
    if (zone) {
      out.push({ key: 'zone', kind: 'zone', id: 'zone' });
      for (const id of zone.leaderIds) out.push({ key: `leader-${id}`, kind: 'leader', id });
      for (const id of zone.unitIds) out.push({ key: `unit-${id}`, kind: 'unit', id });
    }
    for (const side of SIDES) {
      for (const l of poolOf(view, side))
        out.push({ key: `leader-${l.id}`, kind: 'leader', id: l.id });
    }
    return out;
  }, [regions, view, zone]);

  const selectedKey =
    selection.kind === 'system'
      ? `system-${selection.systemId}`
      : selection.kind === 'piece'
        ? `unit-${selection.pieceId}`
        : selection.kind === 'leader'
          ? `leader-${selection.leaderId}`
          : selection.kind === 'zone'
            ? 'zone'
            : null;
  const has = (key: string | null) => key !== null && options.some((o) => o.key === key);
  const rovingKey =
    (has(activeKey) && activeKey) || (has(selectedKey) && selectedKey) || options[0]?.key;

  const choose = (o: OptionRef) => {
    setActiveKey(o.key);
    if (o.kind === 'system') selectSystem(o.id);
    else if (o.kind === 'unit') selectPiece(o.id);
    else if (o.kind === 'leader') selectLeader(o.id);
    else selectZone();
  };

  const focusOption = (key: string) => {
    setActiveKey(key);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-option-key="${key}"]`);
    el?.focus();
    // The list lives in a capped, scrolling tab panel: keep the active option visible (jsdom has no scrollIntoView).
    el?.scrollIntoView?.({ block: 'nearest' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.key === rovingKey);
    let next: number;
    if (e.key === 'ArrowDown') next = Math.min(options.length - 1, idx + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      const o = options[idx];
      if (o) choose(o);
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    const o = options[next];
    if (o) focusOption(o.key);
  };

  const optionProps = (o: OptionRef, selected: boolean) => ({
    role: 'option',
    id: `core-board-list-${o.key}`,
    'data-option-key': o.key,
    'aria-selected': selected,
    tabIndex: o.key === rovingKey ? 0 : -1,
    onClick: () => choose(o),
    onFocus: () => setActiveKey(o.key),
  });

  const leaderOption = (l: CoreLeaderView): ReactNode => (
    <Box
      key={l.id}
      {...optionProps(
        { key: `leader-${l.id}`, kind: 'leader', id: l.id },
        selectedKey === `leader-${l.id}`,
      )}
      data-testid={`leader-item-${l.id}`}
      data-owner={l.owner}
      data-location={leaderLocationLabel(l)}
      sx={optionSx}
    >
      <Typography variant="body2">
        {t('rebellion.turn:list.leader', {
          name: leaderLabel(t, l.id),
          side: factionLabel(t, l.owner),
        })}
      </Typography>
    </Box>
  );

  const unitOption = (u: CoreUnitView): ReactNode => (
    <Box
      key={u.id}
      {...optionProps(
        { key: `unit-${u.id}`, kind: 'unit', id: u.id },
        selectedKey === `unit-${u.id}`,
      )}
      data-testid={`piece-item-${u.id}`}
      data-owner={u.owner}
      data-system-id={u.location.kind === 'system' ? u.location.systemId : undefined}
      sx={optionSx}
    >
      <Typography variant="body2">
        {t('rebellion.turn:list.unit', {
          name: unitLabel(t, view, u.id),
          side: factionLabel(t, u.owner),
        })}
      </Typography>
    </Box>
  );

  const selectedTarget =
    armed !== null && selection.kind === 'system' && targets.has(selection.systemId)
      ? selection.systemId
      : null;
  const zoneCount = zone ? zone.unitIds.length + zone.leaderIds.length : 0;

  return (
    <Box>
      <Box
        ref={listRef}
        id={BOARD_LIST_ID}
        role="listbox"
        data-testid="board-list"
        aria-label={t('rebellion.turn:list.label')}
        onKeyDown={onKeyDown}
        sx={{ display: 'grid', gap: 0.25 }}
      >
        {regions.map((r) => (
          <Box
            key={r.regionId}
            role="group"
            aria-label={t('rebellion.turn:list.region', {
              region: regionLabel(t, view, r.regionId),
            })}
            data-testid={`region-group-${r.regionId}`}
            sx={{ display: 'grid', gap: 0.25 }}
          >
            <Typography
              variant="overline"
              aria-hidden="true"
              sx={{ color: C.muted, px: 1.25, mt: 1, lineHeight: 1.5 }}
            >
              {regionLabel(t, view, r.regionId)}
            </Typography>
            {r.systems.map((s) => {
              const units = unitsAt(view, s.id);
              const leaders = leadersAt(view, s.id);
              const isTarget = targets.has(s.id);
              const contested = isContested(view, s.id);
              return (
                <Box key={s.id} role="presentation" sx={{ display: 'contents' }}>
                  <Box
                    {...optionProps(
                      { key: `system-${s.id}`, kind: 'system', id: s.id },
                      selectedKey === `system-${s.id}`,
                    )}
                    data-testid={`system-item-${s.id}`}
                    data-region={s.regionId}
                    data-remote={s.remote ? 'true' : 'false'}
                    data-contested={contested ? 'true' : 'false'}
                    data-activated={activated === s.id ? 'true' : 'false'}
                    data-activatable={isTarget ? 'true' : 'false'}
                    sx={{ ...optionSx, mt: 0.5 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {t('rebellion.turn:list.system', {
                        name: systemLabel(t, view, s.id),
                        count: units.length,
                      })}
                      {s.remote ? t('rebellion.turn:list.remote') : ''}
                      {contested ? t('rebellion.turn:list.contested') : ''}
                      {activated === s.id ? t('rebellion.turn:list.activated') : ''}
                      {isTarget ? t('rebellion.turn:activate.inList') : ''}
                    </Typography>
                  </Box>
                  {leaders.length + units.length > 0 && (
                    <Box
                      role="group"
                      aria-label={systemLabel(t, view, s.id)}
                      sx={{ display: 'grid', gap: 0.25, pl: 2 }}
                    >
                      {leaders.map(leaderOption)}
                      {units.map(unitOption)}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
        {zone && (
          <Box
            role="group"
            aria-label={t('rebellion.turn:zone.title')}
            sx={{ display: 'grid', gap: 0.25 }}
          >
            <Box
              {...optionProps({ key: 'zone', kind: 'zone', id: 'zone' }, selectedKey === 'zone')}
              data-testid="hidden-base-zone"
              data-count={zoneCount}
              sx={{ ...optionSx, mt: 1, border: `1px dashed ${C.bezelLight}` }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {t('rebellion.turn:list.zone', { count: zoneCount })}
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gap: 0.25, pl: 2 }} role="presentation">
              {view.leaders.filter((l) => zone.leaderIds.includes(l.id)).map(leaderOption)}
              {view.units.filter((u) => zone.unitIds.includes(u.id)).map(unitOption)}
            </Box>
          </Box>
        )}
        {SIDES.map((side) => {
          const pool = poolOf(view, side);
          if (pool.length === 0) return null;
          return (
            <Box
              key={side}
              role="group"
              aria-label={t('rebellion.turn:list.pool', { side: factionLabel(t, side) })}
              data-testid={`pool-group-${side}`}
              sx={{ display: 'grid', gap: 0.25 }}
            >
              <Typography
                variant="overline"
                aria-hidden="true"
                sx={{ color: C.muted, px: 1.25, mt: 1, lineHeight: 1.5 }}
              >
                {t('rebellion.turn:list.pool', { side: factionLabel(t, side) })}
              </Typography>
              {pool.map(leaderOption)}
            </Box>
          );
        })}
      </Box>
      {selectedTarget && armed && (
        <KeyButton
          sx={{ mt: 1.5, maxWidth: '100%' }}
          tone="primary"
          led={isPending ? 'off' : 'green'}
          data-testid={`system-item-${selectedTarget}-activate`}
          disabled={isPending}
          onClick={() => void activate(armed, selectedTarget)}
        >
          {t('rebellion.turn:activate.withLeader', {
            system: systemLabel(t, view, selectedTarget),
            leader: leaderLabel(t, armed),
          })}
        </KeyButton>
      )}
    </Box>
  );
}
