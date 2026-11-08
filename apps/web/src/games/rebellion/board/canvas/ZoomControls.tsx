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

/** +/−/fit + zoom level (D-I-7). DOM over the canvas; +/− are disabled at MAX/MIN (A-9). */
export function ZoomControls() {
  const { t } = useTranslation();
  const scale = useViewportStore((s) => s.viewport.scale);
  const zoomIn = useViewportStore((s) => s.zoomIn);
  const zoomOut = useViewportStore((s) => s.zoomOut);
  const fit = useViewportStore((s) => s.fit);
  const inEnabled = canZoomIn(scale);
  const outEnabled = canZoomOut(scale);
  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        p: 0.5,
        gap: 0.5,
      }}
    >
      <Tooltip title={t('rebellion.board:zoom.in')} placement="left">
        <span>
          <IconButton
            data-testid="zoom-in"
            aria-label={t('rebellion.board:zoom.in')}
            disabled={!inEnabled}
            onClick={zoomIn}
            sx={BTN}
          >
            <AddIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('rebellion.board:zoom.out')} placement="left">
        <span>
          <IconButton
            data-testid="zoom-out"
            aria-label={t('rebellion.board:zoom.out')}
            disabled={!outEnabled}
            onClick={zoomOut}
            sx={BTN}
          >
            <RemoveIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('rebellion.board:zoom.fit')} placement="left">
        <IconButton
          data-testid="zoom-fit"
          aria-label={t('rebellion.board:zoom.fit')}
          onClick={() => fit(true)}
          sx={BTN}
        >
          <FitScreenIcon />
        </IconButton>
      </Tooltip>
      <Typography
        data-testid="zoom-level"
        aria-label={t('rebellion.board:zoom.levelLabel', { percent: Math.round(scale * 100) })}
        variant="caption"
        sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'center' }}
      >
        {t('rebellion.board:zoom.level', { percent: Math.round(scale * 100) })}
      </Typography>
    </Paper>
  );
}
