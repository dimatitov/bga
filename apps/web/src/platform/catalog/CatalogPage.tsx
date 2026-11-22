import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useGameRegistry } from '../registry/useGameRegistry';
import { catalogOrder } from '../registry/selectors';
import { TerminalPanel } from '../ui/TerminalPanel';
import { GameCard } from './GameCard';

/** `/` — static catalogue from the web registry, no network requests (Q-1, D-CAT-1..9). */
export function CatalogPage() {
  const { t } = useTranslation();
  const entries = catalogOrder(useGameRegistry());
  return (
    <Box
      data-testid="game-catalog"
      sx={{ px: 2, py: { xs: 3, sm: 4 }, maxWidth: 1200, mx: 'auto' }}
    >
      <TerminalPanel
        component="header"
        surface="case"
        sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 2.5 }, mb: 3 }}
      >
        <Typography variant="h1" sx={{ color: 'primary.main' }}>
          {t('catalog:title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          {t('catalog:subtitle')}
        </Typography>
      </TerminalPanel>
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
          }}
        >
          {entries.map((entry) => (
            <GameCard key={entry.definition.id} entry={entry} />
          ))}
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" component="p" sx={{ mt: 4 }}>
        {t('catalog:footer')}
      </Typography>
    </Box>
  );
}
