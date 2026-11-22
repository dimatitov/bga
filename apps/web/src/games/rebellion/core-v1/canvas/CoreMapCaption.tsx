import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { mapStyle } from '../../theme/mapStyle';

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
        left: 10,
        bottom: 8,
        color: mapStyle.housing.metaText,
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        bgcolor: alpha(mapStyle.screen.background, 0.8),
        px: 0.75,
      }}
    >
      {t('rebellion.map:caption.core')}
    </Typography>
  );
}
