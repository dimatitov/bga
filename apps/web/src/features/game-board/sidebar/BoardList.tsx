import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PieceGlyph } from '@/shared/ui';
import { useMoveController } from '../hooks/useMoveController';
import { useBoard } from '../model/boardContext';
import { useDragStore } from '../model/dragStore';
import {
  factionName,
  isUnknownPiece,
  pieceName,
  systemName,
  systemNameById,
} from '../model/labels';
import { highlightedSystemIds } from '../model/legal';
import { comparePieces } from '../model/pieceLayout';
import { useSelectionStore } from '../model/selectionStore';

type OptionRef = { key: string; kind: 'system' | 'piece'; id: string };

const optionSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  minHeight: 40,
  px: 1.5,
  borderRadius: 1,
  cursor: 'pointer',
  '&:hover': { bgcolor: 'action.hover' },
  '&[aria-selected="true"]': {
    bgcolor: 'action.selected',
    outline: '1px solid',
    outlineColor: 'board.selected',
  },
} as const;

/**
 * Accessible alternative to the canvas (R-9, D-A-4, approved amendment): `role="listbox"` with `role="option"` +
 * `aria-selected` for systems and pieces (grouped per system). Roving tabindex: Tab enters, arrows move, Enter/Space
 * select — the same store actions as clicks on the canvas (D-P-5). Move targets of the selected piece are offered as
 * buttons below the listbox (interactive content is not allowed inside options).
 */
export function BoardList() {
  const { t } = useTranslation();
  const { view } = useBoard();
  const selection = useSelectionStore((s) => s.selection);
  const selectSystem = useSelectionStore((s) => s.selectSystem);
  const selectPiece = useSelectionStore((s) => s.selectPiece);
  const drag = useDragStore((s) => s.drag);
  const pendingMove = useDragStore((s) => s.pendingMove);
  const { move, isPending } = useMoveController();
  const listRef = useRef<HTMLDivElement>(null);
  const human = view.setup.humanFaction;

  const highlighted = useMemo(
    () => highlightedSystemIds(view, selection, drag),
    [view, selection, drag],
  );

  const groups = useMemo(
    () =>
      view.systems.map((s) => ({
        system: s,
        pieces: view.pieces
          .filter((p) => p.systemId === s.id)
          .sort((a, b) => (a.owner === b.owner ? comparePieces(a, b) : a.owner === human ? -1 : 1)),
      })),
    [view.systems, view.pieces, human],
  );
  const options: OptionRef[] = useMemo(
    () =>
      groups.flatMap(({ system, pieces }) => [
        { key: `system-${system.id}`, kind: 'system' as const, id: system.id },
        ...pieces.map((p) => ({ key: `piece-${p.id}`, kind: 'piece' as const, id: p.id })),
      ]),
    [groups],
  );

  const selectedKey =
    selection.kind === 'system'
      ? `system-${selection.systemId}`
      : selection.kind === 'piece'
        ? `piece-${selection.pieceId}`
        : null;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const rovingKey =
    (activeKey && options.some((o) => o.key === activeKey) && activeKey) ||
    (selectedKey && options.some((o) => o.key === selectedKey) && selectedKey) ||
    options[0]?.key;

  const activate = (o: OptionRef) => {
    setActiveKey(o.key);
    if (o.kind === 'system') selectSystem(o.id);
    else selectPiece(o.id);
  };

  const focusOption = (key: string) => {
    setActiveKey(key);
    listRef.current?.querySelector<HTMLElement>(`[data-option-key="${key}"]`)?.focus();
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
      if (o) activate(o);
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    const o = options[next];
    if (o) focusOption(o.key);
  };

  const selectedPiece =
    selection.kind === 'piece' ? view.pieces.find((p) => p.id === selection.pieceId) : undefined;
  const busy = isPending || !!pendingMove;

  const optionProps = (o: OptionRef, selected: boolean) => ({
    role: 'option',
    id: `board-list-${o.key}`,
    'data-option-key': o.key,
    'aria-selected': selected,
    tabIndex: o.key === rovingKey ? 0 : -1,
    onClick: () => activate(o),
    onFocus: () => setActiveKey(o.key),
  });

  return (
    <Box>
      <Box
        ref={listRef}
        role="listbox"
        data-testid="board-list"
        aria-label={t('board:list.label')}
        onKeyDown={onKeyDown}
        sx={{ display: 'grid', gap: 0.25 }}
      >
        {groups.map(({ system, pieces }) => {
          const isTarget = highlighted.includes(system.id);
          const sysSelected = selection.kind === 'system' && selection.systemId === system.id;
          return (
            <Box key={system.id} role="presentation" sx={{ display: 'contents' }}>
              <Box
                {...optionProps(
                  { key: `system-${system.id}`, kind: 'system', id: system.id },
                  sysSelected,
                )}
                data-testid={`system-item-${system.id}`}
                data-highlighted={isTarget ? 'true' : 'false'}
                sx={{ ...optionSx, fontWeight: 600, mt: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t('board:list.systemOption', {
                    name: systemName(t, system),
                    count: pieces.length,
                  })}
                  {isTarget ? t('board:list.targetSuffix') : ''}
                </Typography>
              </Box>
              {pieces.length > 0 && (
                <Box
                  role="group"
                  aria-label={systemName(t, system)}
                  sx={{ display: 'grid', gap: 0.25, pl: 2 }}
                >
                  {pieces.map((p) => (
                    <Box
                      key={p.id}
                      {...optionProps(
                        { key: `piece-${p.id}`, kind: 'piece', id: p.id },
                        selection.kind === 'piece' && selection.pieceId === p.id,
                      )}
                      data-testid={`piece-item-${p.id}`}
                      data-system-id={p.systemId}
                      data-owner={p.owner}
                      sx={optionSx}
                    >
                      <PieceGlyph kind={p.kind} owner={p.owner} hidden={isUnknownPiece(p)} />
                      <Typography variant="body2">
                        {t('board:list.pieceOption', {
                          name: pieceName(t, p),
                          faction: factionName(t, p.owner),
                        })}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      {selectedPiece && highlighted.length > 0 && (
        <Box component="section" aria-label={t('board:list.moveHere')} sx={{ mt: 2 }}>
          <Typography
            variant="overline"
            component="h3"
            sx={{ color: 'text.secondary', display: 'block' }}
          >
            {t('board:list.moveSelected', { piece: pieceName(t, selectedPiece) })}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {highlighted.map((to) => (
              <Button
                key={to}
                data-testid={`system-item-${to}-move`}
                size="small"
                variant="outlined"
                disabled={busy}
                startIcon={<ArrowForwardIcon />}
                onClick={() => void move([selectedPiece.id], selectedPiece.systemId, to)}
              >
                {t('board:list.moveHereTo', { system: systemNameById(t, view, to) })}
              </Button>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
