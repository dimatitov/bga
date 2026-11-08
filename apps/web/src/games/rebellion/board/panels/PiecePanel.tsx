import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { Piece } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { FactionChip } from '../../ui/FactionChip';
import { PieceGlyph } from '../../ui/PieceGlyph';
import { useBoard } from '../model/boardContext';
import { isUnknownPiece, kindName, systemNameById } from '../model/labels';
import { canAdvancePhase, moveTargetsForPiece } from '../model/legal';
import { useSelectionStore } from '../model/selectionStore';
import { ActionsSection } from './ActionsSection';

/** Piece panel (D-C-4/D-C-5): type, kind, owner, location chip, one button per legal target. */
export function PiecePanel({ piece }: { piece: Piece }) {
  const { t } = useTranslation();
  const { view } = useBoard();
  const selectSystem = useSelectionStore((s) => s.selectSystem);
  const targets = moveTargetsForPiece(view, piece.id);
  const unknown = isUnknownPiece(piece);
  const own = piece.owner === view.viewer;
  const emptyReason = !own
    ? t('rebellion.board:actions.enemyNoActions')
    : canAdvancePhase(view) || view.legalActions.length > 0
      ? t('rebellion.board:actions.noMoves')
      : t('rebellion.board:actions.noMovesPhase');

  return (
    <Box data-testid="piece-panel" data-piece-id={piece.id}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <PieceGlyph kind={piece.kind} owner={piece.owner} hidden={unknown} size={22} />
        <Typography variant="body2">{kindName(t, piece.kind)}</Typography>
        <FactionChip faction={piece.owner} />
      </Box>
      {unknown && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {t('rebellion.board:piece.unknownHint')}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('rebellion.board:piece.location')}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          data-testid="piece-panel-system"
          label={systemNameById(t, view, piece.systemId)}
          onClick={() => selectSystem(piece.systemId)}
        />
      </Box>
      <ActionsSection
        title={t('rebellion.board:actions.title')}
        moveLabel={t('rebellion.board:actions.moveTo')}
        moves={targets.map((to) => ({
          testId: `action-move-${piece.id}-${to}`,
          pieceIds: [piece.id],
          fromSystemId: piece.systemId,
          toSystemId: to,
        }))}
        emptyReason={emptyReason}
      />
    </Box>
  );
}
