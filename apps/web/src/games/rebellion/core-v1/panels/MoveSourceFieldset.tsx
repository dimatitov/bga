import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { capacityPreview, type MoveSource } from '../model/viewModel';
import { systemLabel, unitLabel } from './labels';
import { useTurnErrorStore } from './turnErrorStore';
import { useTurnCommands } from './useTurnCommands';

const EMPTY: readonly string[] = [];

/**
 * One `MOVE_PIECES` source of the current activation (plan-frontend §5.3 step 4): a `fieldset` with a checkbox per
 * unit the server listed (`pieces`), «select all», the capacity PREVIEW «Capacity N/M» from the server's numbers
 * (Q-FE-2; never a gate — the server decides `insufficientCapacity`), and «Move (n) to <system>» which sends
 * exactly the checked set. A rejection is shown inline (`move-error-<from>`) and the draft is kept.
 */
export function MoveSourceFieldset({ source }: { source: MoveSource }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const { move, isPending } = useTurnCommands();
  const from = source.fromSystemId;
  const draft = useCoreUiStore((s) => s.moveDraft[from] ?? EMPTY);
  const toggle = useCoreUiStore((s) => s.toggleDraftPiece);
  const setDraft = useCoreUiStore((s) => s.setDraft);
  const error = useTurnErrorStore((s) => s.move[from] ?? null);

  const candidateIds = source.pieces.map((p) => p.pieceId);
  const selected = draft.filter((id) => candidateIds.includes(id));
  const allChecked = selected.length === candidateIds.length && candidateIds.length > 0;
  const showCapacity = source.pieces.some((p) => p.requiresTransport || p.transportCapacity > 0);
  const preview = capacityPreview(source, selected);
  const toName = systemLabel(t, view, source.toSystemId);
  const legendId = `core-move-source-${from}-legend`;

  return (
    <Box
      component="fieldset"
      data-testid={`move-source-${from}`}
      data-to={source.toSystemId}
      aria-labelledby={legendId}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, m: 0, px: 1.5, pb: 1.5, pt: 0.5 }}
    >
      <Typography id={legendId} component="legend" variant="subtitle2" sx={{ px: 0.5 }}>
        {t('rebellion.turn:move.source', { system: systemLabel(t, view, from) })}
      </Typography>
      <FormControlLabel
        label={t('rebellion.turn:move.selectAll')}
        control={
          <Checkbox
            size="small"
            checked={allChecked}
            indeterminate={selected.length > 0 && !allChecked}
            disabled={isPending}
            onChange={() => setDraft(from, allChecked ? [] : candidateIds)}
            slotProps={{ input: { 'data-testid': `move-select-all-${from}` } as object }}
          />
        }
      />
      <Box sx={{ display: 'grid', pl: 2 }}>
        {source.pieces.map((p) => (
          <FormControlLabel
            key={p.pieceId}
            label={
              <Box component="span" sx={{ display: 'inline-flex', gap: 1, flexWrap: 'wrap' }}>
                <span>{unitLabel(t, view, p.pieceId)}</span>
                {p.requiresTransport && (
                  <Box component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
                    {t('rebellion.turn:move.needsTransport')}
                  </Box>
                )}
                {p.transportCapacity > 0 && (
                  <Box component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
                    {t('rebellion.turn:move.carries', { count: p.transportCapacity })}
                  </Box>
                )}
              </Box>
            }
            control={
              <Checkbox
                size="small"
                checked={selected.includes(p.pieceId)}
                disabled={isPending}
                onChange={() => toggle(from, p.pieceId)}
                slotProps={{ input: { 'data-testid': `move-piece-${p.pieceId}` } as object }}
              />
            }
          />
        ))}
      </Box>
      {showCapacity && (
        <Typography
          variant="body2"
          data-testid={`move-capacity-${from}`}
          data-required={preview.required}
          data-capacity={preview.capacity}
          data-fits={preview.fits ? 'true' : 'false'}
          aria-label={t('rebellion.turn:move.capacityLabel', {
            required: preview.required,
            capacity: preview.capacity,
          })}
          sx={{ mt: 0.5, fontWeight: preview.fits ? 400 : 600 }}
        >
          {t('rebellion.turn:move.capacity', {
            required: preview.required,
            capacity: preview.capacity,
          })}
        </Typography>
      )}
      {showCapacity && !preview.fits && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('rebellion.turn:move.capacityOver')}
        </Typography>
      )}
      <Button
        variant="outlined"
        size="small"
        startIcon={<ArrowForwardIcon />}
        data-testid={`move-submit-${from}`}
        data-to={source.toSystemId}
        disabled={selected.length === 0 || isPending}
        onClick={() => void move(source, selected)}
        sx={{ mt: 1 }}
      >
        {t('rebellion.turn:move.submit', { count: selected.length, system: toName })}
      </Button>
      {error && (
        <Alert severity="error" role="alert" data-testid={`move-error-${from}`} sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
