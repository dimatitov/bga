import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMoveController } from '../hooks/useMoveController';
import { useBoard } from '../model/boardContext';
import { useDragStore } from '../model/dragStore';
import { systemNameById } from '../model/labels';

export interface MoveOption {
  testId: string;
  pieceIds: string[];
  fromSystemId: string;
  toSystemId: string;
}

export interface ActionsSectionProps {
  title: string;
  /** Heading above the move buttons (e.g. "Move to:" / "Move all mine (2) to:"). */
  moveLabel?: string;
  moves: MoveOption[];
  /** Shown when there are no moves (D-C-5). */
  emptyReason?: string;
  children?: ReactNode;
}

/** Move buttons built from `legalActions` only (D-C-4); one click = one command; one command in flight (D-P-7). */
export function ActionsSection({
  title,
  moveLabel,
  moves,
  emptyReason,
  children,
}: ActionsSectionProps) {
  const { t } = useTranslation();
  const { view } = useBoard();
  const { move, isPending } = useMoveController();
  const pendingMove = useDragStore((s) => s.pendingMove);
  const busy = isPending || !!pendingMove;
  return (
    <Box data-testid="action-panel" component="section" aria-label={title} sx={{ mt: 2 }}>
      <Typography
        variant="overline"
        component="h3"
        sx={{ color: 'text.secondary', display: 'block' }}
      >
        {title}
      </Typography>
      {moves.length > 0 && moveLabel && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          {moveLabel}
        </Typography>
      )}
      {moves.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {moves.map((m) => {
            const isThis =
              !!pendingMove &&
              pendingMove.toSystemId === m.toSystemId &&
              pendingMove.pieceIds.join() === m.pieceIds.join();
            return (
              <Button
                key={m.testId}
                data-testid={m.testId}
                variant="outlined"
                size="medium"
                disabled={busy}
                startIcon={isThis ? <CircularProgress size={16} /> : <ArrowForwardIcon />}
                onClick={() => void move(m.pieceIds, m.fromSystemId, m.toSystemId)}
                sx={{ minHeight: 40 }}
              >
                {systemNameById(t, view, m.toSystemId)}
              </Button>
            );
          })}
        </Box>
      ) : (
        emptyReason && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {emptyReason}
          </Typography>
        )
      )}
      {children}
      {moves.length > 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          {t('board:actions.mockFootnote')}
        </Typography>
      )}
    </Box>
  );
}
