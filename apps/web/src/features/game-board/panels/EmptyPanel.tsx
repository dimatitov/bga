import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Faction, PieceKind } from '@swr/contracts';
import { useTranslation } from 'react-i18next';
import { PieceGlyph } from '@/shared/ui';
import { factionName, kindName } from '../model/labels';
import { AdvancePhaseButton } from './AdvancePhaseButton';

const LEGEND_FACTIONS: Faction[] = ['empire', 'rebellion'];
const LEGEND_KINDS: PieceKind[] = ['unit', 'leader', 'token'];

/** Nothing selected: hint, legend, game actions (D-C-1). */
export function EmptyPanel() {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        {t('board:panel.emptyHint')}
      </Typography>
      <Typography
        variant="overline"
        component="h3"
        sx={{ color: 'text.secondary', display: 'block' }}
      >
        {t('board:legend.title')}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.5 }}>
        {LEGEND_FACTIONS.map((f) => (
          <Box component="li" key={f} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <PieceGlyph kind="unit" owner={f} />
            <Typography variant="body2">
              {t(`board:legend.${f}`, { faction: factionName(t, f) })}
            </Typography>
          </Box>
        ))}
        {LEGEND_KINDS.map((k) => (
          <Box component="li" key={k} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <PieceGlyph kind={k} owner="empire" />
            <Typography variant="body2">{kindName(t, k)}</Typography>
          </Box>
        ))}
        <Box component="li" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <PieceGlyph kind="token" owner="rebellion" hidden />
          <Typography variant="body2">{t('board:piece.unknown')}</Typography>
        </Box>
      </Box>
      <Box component="section" sx={{ mt: 2 }} aria-label={t('board:panel.gameActions')}>
        <Typography
          variant="overline"
          component="h3"
          sx={{ color: 'text.secondary', display: 'block' }}
        >
          {t('board:panel.gameActions')}
        </Typography>
        <AdvancePhaseButton testId="advance-phase-panel" />
      </Box>
    </Box>
  );
}
