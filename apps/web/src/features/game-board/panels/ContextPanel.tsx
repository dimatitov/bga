import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { CONTEXT_HEADING_ID } from '../hooks/useMoveController';
import { useBoard } from '../model/boardContext';
import { pieceName, systemName } from '../model/labels';
import { useSelectionStore } from '../model/selectionStore';
import { EmptyPanel } from './EmptyPanel';
import { PiecePanel } from './PiecePanel';
import { SystemPanel } from './SystemPanel';

/** Right sidebar top: content follows the selection — `data-state` ∈ empty | system | piece (Q-3, D-P-3). */
export function ContextPanel() {
  const { t } = useTranslation();
  const { view } = useBoard();
  const selection = useSelectionStore((s) => s.selection);
  const system =
    selection.kind === 'system' ? view.systems.find((s) => s.id === selection.systemId) : undefined;
  const piece =
    selection.kind === 'piece' ? view.pieces.find((p) => p.id === selection.pieceId) : undefined;
  const state = system ? 'system' : piece ? 'piece' : 'empty';
  const heading = system
    ? systemName(t, system)
    : piece
      ? pieceName(t, piece)
      : t('board:panel.emptyTitle');

  return (
    <Box
      data-testid="context-panel"
      data-state={state}
      component="section"
      aria-labelledby={CONTEXT_HEADING_ID}
      sx={{ p: 2, overflowY: 'auto', minHeight: 0 }}
    >
      <Typography
        id={CONTEXT_HEADING_ID}
        component="h2"
        variant="h6"
        tabIndex={-1}
        sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', mb: 1 }}
      >
        {heading}
      </Typography>
      {system && <SystemPanel system={system} />}
      {piece && <PiecePanel piece={piece} />}
      {!system && !piece && <EmptyPanel />}
    </Box>
  );
}
