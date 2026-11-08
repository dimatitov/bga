import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

/** "Temporary graphics · fictional systems (mock)" caption, bottom-left of the map (ux-decisions §9). */
export function MapCaption() {
  const { t } = useTranslation();
  return (
    <Typography
      variant="caption"
      data-testid="map-caption"
      sx={{
        position: 'absolute',
        left: 16,
        bottom: 12,
        color: 'text.secondary',
        pointerEvents: 'none',
        bgcolor: 'rgba(7,10,16,0.7)',
        px: 1,
        borderRadius: 1,
      }}
    >
      {t('rebellion.board:canvas.mockCaption')}
    </Typography>
  );
}
