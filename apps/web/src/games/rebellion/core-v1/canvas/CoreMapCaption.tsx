import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

/** «Схема карты · собственная графика» caption, bottom-left of the core map (plan-frontend §8.2). */
export function CoreMapCaption() {
  const { t } = useTranslation();
  return (
    <Typography
      variant="caption"
      data-testid="map-caption"
      data-variant="core-v1"
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
      {t('rebellion.map:caption.core')}
    </Typography>
  );
}
