import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useGameRegistry } from '../registry/useGameRegistry';
import { catalogOrder } from '../registry/selectors';
import { GameCard } from './GameCard';

/** `/` — static catalogue from the web registry, no network requests (Q-1, D-CAT-1..9). */
export function CatalogPage() {
  const { t } = useTranslation();
  const entries = catalogOrder(useGameRegistry());
  return (
    <Box data-testid="game-catalog" sx={{ px: 2, py: 4, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
        {t('catalog:title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('catalog:subtitle')}
      </Typography>
      {entries.length === 0 ? (
        <Typography data-testid="catalog-empty">{t('catalog:empty')}</Typography>
      ) : (
        <Box
          component="ul"
          sx={{
            p: 0,
            m: 0,
            display: 'grid',
            gap: 3,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}
        >
          {entries.map((entry) => (
            <GameCard key={entry.definition.id} entry={entry} />
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 4 }}>
        {t('catalog:footer')}
      </Typography>
    </Box>
  );
}
