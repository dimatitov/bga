import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { CounterMarker } from '@/shared/ui';
import { useSelectionStore } from '../../board/model/selectionStore';
import { forceGlyphSpec } from '../../theme/glyphs';
import type { ForceGroup } from '../model/forces';
import { type ManifestTarget, useCoreUiStore } from '../model/coreUiStore';
import { factionLabel } from '../panels/labels';
import { markerTestId } from './manifestModel';
import { useManifestFocus } from './manifestFocus';

/**
 * DOM group markers of a system / the hidden zone (SWR-009 MF, AC-6, QD-2): one `CounterMarker` per side × arena with
 * the real number of figures — the keyboard path to the Unit Manifest (Tab → Enter). QD-5: while a leader is armed a
 * marker acts as the system itself (keeps the selection) and does not open the manifest.
 */
export function ForceMarkerList({
  target,
  groups,
  labelId,
}: {
  target: ManifestTarget;
  groups: readonly ForceGroup[];
  /** Id of the visible label naming the list. */
  labelId: string;
}) {
  const { t } = useTranslation();
  const armed = useCoreUiStore((s) => s.armedLeaderId);
  const manifest = useCoreUiStore((s) => s.manifest);
  const openManifest = useCoreUiStore((s) => s.openManifest);
  const selectSystem = useSelectionStore((s) => s.selectSystem);
  const selectZone = useSelectionStore((s) => s.selectZone);
  const focus = useManifestFocus();
  if (groups.length === 0) return null;

  const sameTarget =
    manifest !== null &&
    manifest.target.kind === target.kind &&
    (target.kind === 'zone' ||
      (manifest.target.kind === 'system' && manifest.target.systemId === target.systemId));

  const select = () => (target.kind === 'zone' ? selectZone() : selectSystem(target.systemId));

  return (
    <Box sx={{ display: 'grid', gap: '6px' }}>
      <Typography id={labelId} variant="meta" component="p" sx={{ m: 0 }}>
        {t('rebellion.manifest:markers.label')}
      </Typography>
      <Box
        role="list"
        aria-labelledby={labelId}
        sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}
      >
        {groups.map((g) => {
          const testId = markerTestId(target, g);
          const params = {
            side: factionLabel(t, g.owner),
            arena: t(`rebellion.manifest:arena.${g.arena}`),
            units: t('rebellion.manifest:units', { count: g.count }),
          };
          const pressed =
            armed === null &&
            sameTarget &&
            manifest.group !== null &&
            manifest.group.owner === g.owner &&
            (manifest.group.arena === 'all' || manifest.group.arena === g.arena);
          return (
            <Box role="listitem" key={testId} sx={{ display: 'inline-flex' }}>
              <CounterMarker
                data-testid={testId}
                data-owner={g.owner}
                data-arena={g.arena}
                glyph={forceGlyphSpec(g.owner, g.arena)}
                count={g.count}
                pressed={pressed}
                aria-label={t(
                  armed === null
                    ? 'rebellion.manifest:markers.open'
                    : 'rebellion.manifest:markers.plain',
                  params,
                )}
                onClick={() => {
                  select();
                  if (armed !== null) return; // QD-5: an armed leader turns the marker into its system.
                  focus.remember(testId);
                  openManifest(target, { owner: g.owner, arena: g.arena });
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
