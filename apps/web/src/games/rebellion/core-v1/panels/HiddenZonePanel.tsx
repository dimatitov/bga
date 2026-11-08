import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { hiddenZone } from '../model/viewModel';
import { factionLabel, leaderLabel, unitLabel } from './labels';

/**
 * The hidden rebel-base zone (plan-frontend §4, §7; D-SW5-11): only what the server placed in it
 * (`location.kind === 'rebelBase'`) and only while it hides the base system from the viewer.
 */
export function HiddenZonePanel() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const zone = hiddenZone(view);
  if (!zone) return null;
  const empty = zone.unitIds.length === 0 && zone.leaderIds.length === 0;
  return (
    <Box
      data-testid="hidden-zone-panel"
      data-count={zone.unitIds.length + zone.leaderIds.length}
      sx={{ display: 'grid', gap: 0.5 }}
    >
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
        {t('rebellion.turn:zone.title')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('rebellion.turn:zone.explain')}
      </Typography>
      {empty ? (
        <Typography variant="body2">{t('rebellion.turn:zone.empty')}</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {zone.leaderIds.map((id) => (
            <Typography key={id} component="li" variant="body2">
              {t('rebellion.turn:list.leader', {
                name: leaderLabel(t, id),
                side: factionLabel(t, 'rebels'),
              })}
            </Typography>
          ))}
          {zone.unitIds.map((id) => (
            <Typography key={id} component="li" variant="body2">
              {t('rebellion.turn:list.unit', {
                name: unitLabel(t, view, id),
                side: factionLabel(t, 'rebels'),
              })}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
