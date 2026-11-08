import HomeIcon from '@mui/icons-material/Home';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import type { System } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { PieceGlyph } from '../../ui/PieceGlyph';
import { useBoard } from '../model/boardContext';
import {
  factionName,
  isUnknownPiece,
  pieceName,
  regionName,
  systemNameById,
} from '../model/labels';
import { groupMoveForSystem } from '../model/legal';
import { comparePieces } from '../model/pieceLayout';
import { useSelectionStore } from '../model/selectionStore';
import { ActionsSection } from './ActionsSection';

/** System panel (D-C-2/D-C-3): region, base marker (only if in the view), neighbours, objects, group move. */
export function SystemPanel({ system }: { system: System }) {
  const { t } = useTranslation();
  const { view } = useBoard();
  const selectSystem = useSelectionStore((s) => s.selectSystem);
  const selectPiece = useSelectionStore((s) => s.selectPiece);
  const human = view.viewer;
  const pieces = view.pieces
    .filter((p) => p.systemId === system.id)
    .sort((a, b) => (a.owner === b.owner ? comparePieces(a, b) : a.owner === human ? -1 : 1));
  const group = groupMoveForSystem(view, system.id);

  return (
    <Box data-testid="system-panel" data-system-id={system.id}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('rebellion.board:system.region', { region: regionName(t, system.regionId) })}
      </Typography>
      {view.rebelBase.systemId === system.id && (
        <Typography
          variant="body2"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
        >
          <HomeIcon fontSize="small" aria-hidden />
          {t(
            human === 'rebels'
              ? 'rebellion.board:system.baseOwn'
              : 'rebellion.board:system.baseRevealed',
          )}
        </Typography>
      )}

      <Typography
        variant="overline"
        component="h3"
        sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}
      >
        {t('rebellion.board:system.neighbours')}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {/* Adjacency is shown as information only (no legality derived from it). */}
        {system.adjacentSystemIds.map((id) => (
          <Chip
            key={id}
            data-testid={`system-neighbour-${id}`}
            label={systemNameById(t, view, id)}
            onClick={() => selectSystem(id)}
            variant="outlined"
            size="small"
          />
        ))}
      </Box>

      <Typography
        variant="overline"
        component="h3"
        sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}
      >
        {t('rebellion.board:system.objects', { count: pieces.length })}
      </Typography>
      {pieces.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('rebellion.board:system.noObjects')}
        </Typography>
      ) : (
        <List dense disablePadding>
          {pieces.map((p) => (
            <ListItemButton
              key={p.id}
              data-testid={`system-panel-piece-${p.id}`}
              onClick={() => selectPiece(p.id)}
              sx={{ minHeight: 40 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                <PieceGlyph kind={p.kind} owner={p.owner} hidden={isUnknownPiece(p)} />
              </ListItemIcon>
              <ListItemText primary={pieceName(t, p)} secondary={factionName(t, p.owner)} />
            </ListItemButton>
          ))}
        </List>
      )}

      {group && (
        <ActionsSection
          title={t('rebellion.board:actions.title')}
          moveLabel={t('rebellion.board:actions.moveAll', { count: group.pieceIds.length })}
          moves={group.toSystemIds.map((to) => ({
            testId: `action-move-all-${system.id}-${to}`,
            pieceIds: group.pieceIds,
            fromSystemId: system.id,
            toSystemId: to,
          }))}
        />
      )}
    </Box>
  );
}
