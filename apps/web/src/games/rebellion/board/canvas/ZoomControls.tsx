import AddIcon from '@mui/icons-material/Add';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import RemoveIcon from '@mui/icons-material/Remove';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { canZoomIn, canZoomOut } from '../model/geometry';
import { useViewportStore } from '../model/viewportStore';

const BTN = { width: 44, height: 44 };
/** Bar keys: 32 px on a fine pointer, 44 px touch targets on a coarse one (AC-14). */
const BAR_BTN = {
  width: 32,
  height: 32,
  minHeight: 32,
  '@media (pointer: coarse)': { width: 44, height: 44, minHeight: 44 },
};

export interface ZoomControlsProps {
  /**
   * `overlay` (default, legacy table): a floating column over the bottom-right of the canvas.
   * `bar` (SWR-009 map housing): an inline row of keys for the housing's bottom bar.
   */
  placement?: 'overlay' | 'bar';
}

/**
 * +/−/fit + zoom level (D-I-7). +/− are disabled at MAX / the effective minimum (A-9; SWR-005 §6: the minimum is
 * `min(MIN_SCALE, fit scale)`, so the whole map is always reachable). Shared by the `mock-v1` (overlay over the
 * canvas) and `core-v1` (bar of the map housing) tables.
 */
export function ZoomControls({ placement = 'overlay' }: ZoomControlsProps) {
  const { t } = useTranslation();
  const scale = useViewportStore((s) => s.viewport.scale);
  const minScale = useViewportStore((s) => s.minScale);
  const zoomIn = useViewportStore((s) => s.zoomIn);
  const zoomOut = useViewportStore((s) => s.zoomOut);
  const fit = useViewportStore((s) => s.fit);
  const inEnabled = canZoomIn(scale);
  const outEnabled = canZoomOut(scale, minScale);
  const bar = placement === 'bar';
  const btn = bar ? BAR_BTN : BTN;
  const tip = bar ? 'top' : 'left';
  return (
    <Paper
      elevation={bar ? 0 : 3}
      data-placement={placement}
      sx={
        bar
          ? {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 0.5,
              p: 0,
              bgcolor: 'transparent',
              border: 0,
            }
          : {
              position: 'absolute',
              right: 16,
              bottom: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              p: 0.5,
              gap: 0.5,
            }
      }
    >
      <Tooltip title={t('rebellion.board:zoom.in')} placement={tip}>
        <span>
          <IconButton
            data-testid="zoom-in"
            aria-label={t('rebellion.board:zoom.in')}
            disabled={!inEnabled}
            onClick={zoomIn}
            sx={btn}
          >
            <AddIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('rebellion.board:zoom.out')} placement={tip}>
        <span>
          <IconButton
            data-testid="zoom-out"
            aria-label={t('rebellion.board:zoom.out')}
            disabled={!outEnabled}
            onClick={zoomOut}
            sx={btn}
          >
            <RemoveIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('rebellion.board:zoom.fit')} placement={tip}>
        <IconButton
          data-testid="zoom-fit"
          aria-label={t('rebellion.board:zoom.fit')}
          onClick={() => fit(true)}
          sx={btn}
        >
          <FitScreenIcon />
        </IconButton>
      </Tooltip>
      <Typography
        data-testid="zoom-level"
        aria-label={t('rebellion.board:zoom.levelLabel', { percent: Math.round(scale * 100) })}
        variant="caption"
        sx={{
          fontVariantNumeric: 'tabular-nums',
          minWidth: 44,
          textAlign: 'center',
          ...(bar && { minWidth: 48, letterSpacing: '0.06em' }),
        }}
      >
        {t('rebellion.board:zoom.level', { percent: Math.round(scale * 100) })}
      </Typography>
    </Paper>
  );
}
