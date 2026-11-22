import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { ForceGlyph } from '../../ui/ForceGlyph';
import { ForceMarkerList } from '../manifest/ForceMarkerList';
import { InspectorHeading } from '../manifest/InspectorHeading';
import { useCoreBoard } from '../model/coreContext';
import { zoneForces } from '../model/forces';
import { hiddenZone } from '../model/viewModel';
import { factionLabel, leaderLabel } from './labels';

const T = terminalTokens;

/**
 * The hidden rebel-base zone (plan-frontend §4, §7; D-SW5-11; SWR-009 MF): only what the server placed in it
 * (`location.kind === 'rebelBase'`) and only while it hides the base system from the viewer. Group markers
 * (`map-marker-zone-<side>-<arena>`) open the restricted Unit Manifest. Nothing here names a system or a region.
 */
export function HiddenZonePanel() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const markersLabelId = useId();
  const zone = hiddenZone(view);
  const forces = zoneForces(view);
  if (!zone || !forces) return null;
  const empty = zone.unitIds.length === 0 && zone.leaderIds.length === 0;
  return (
    <Box
      data-testid="hidden-zone-panel"
      data-count={zone.unitIds.length + zone.leaderIds.length}
      sx={{
        display: 'grid',
        gap: '10px',
        border: `1px dashed ${T.color.bezelLight}`,
        padding: '10px',
        backgroundColor: T.color.panel,
      }}
    >
      <InspectorHeading name={t('rebellion.turn:zone.title')} tone="paper" />
      <Typography variant="body2" sx={{ color: T.color.warm }}>
        {t('rebellion.turn:zone.explain')}
      </Typography>
      {empty ? (
        <Typography variant="body2" sx={{ color: T.color.paper }}>
          {t('rebellion.turn:zone.empty')}
        </Typography>
      ) : (
        <>
          <ForceMarkerList
            target={{ kind: 'zone' }}
            groups={forces.groups}
            labelId={markersLabelId}
          />
          {forces.leaders.length > 0 && (
            <Box
              component="ul"
              aria-label={t('rebellion.manifest:leaders')}
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: '4px' }}
            >
              {forces.leaders.map((l) => (
                <Typography
                  key={l.id}
                  component="li"
                  variant="body2"
                  sx={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.color.paper }}
                >
                  <ForceGlyph owner={l.owner} kind="leader" />
                  {t('rebellion.turn:list.leader', {
                    name: leaderLabel(t, l.id),
                    side: factionLabel(t, l.owner),
                  })}
                </Typography>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
