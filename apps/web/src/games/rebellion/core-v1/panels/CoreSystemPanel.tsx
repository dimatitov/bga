import BoltIcon from '@mui/icons-material/Bolt';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { KeyButton, StatusBadge } from '@/shared/ui';
import { ForceGlyph } from '../../ui/ForceGlyph';
import { ForceMarkerList } from '../manifest/ForceMarkerList';
import { InspectorHeading } from '../manifest/InspectorHeading';
import { useCoreBoard } from '../model/coreContext';
import { forcesBySystem } from '../model/forces';
import { useCoreUiStore } from '../model/coreUiStore';
import {
  activatedSystemId,
  canActivate,
  isContested,
  systemById,
  visibleRebelBaseSystemId,
} from '../model/viewModel';
import { factionLabel, leaderLabel, regionLabel, systemLabel } from './labels';
import { useTurnCommands } from './useTurnCommands';

const T = terminalTokens;

/**
 * Selected system (plan-frontend §7; SWR-009 MF inspector look): crosshair + name (amber) + region; remote /
 * activated / base badges and the contested note (words, not colour only); the DOM group markers of the system
 * (`ForceMarkerList` — the keyboard path to the Unit Manifest, QD-2) and its leaders. With an armed leader:
 * «Activate <system> with <leader>» when the server lists the system, otherwise the neutral «not a valid target»
 * (the reason comes only from a 422).
 */
export function CoreSystemPanel({ systemId }: { systemId: string }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const armed = useCoreUiStore((s) => s.armedLeaderId);
  const { activate, isPending } = useTurnCommands();
  const markersLabelId = useId();
  const system = systemById(view, systemId);
  if (!system) return null;
  const name = systemLabel(t, view, systemId);
  const forces = forcesBySystem(view).get(systemId) ?? { groups: [], leaders: [] };
  const activated = activatedSystemId(view) === systemId;
  const isBase = visibleRebelBaseSystemId(view) === systemId;

  return (
    <Box data-testid="system-panel" data-system-id={systemId} sx={{ display: 'grid', gap: '10px' }}>
      <InspectorHeading name={name} sub={regionLabel(t, view, system.regionId)} />
      {(system.remote || activated || isBase) && (
        <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {system.remote && (
            <StatusBadge tone="neutral">{t('rebellion.turn:context.remote')}</StatusBadge>
          )}
          {activated && (
            <StatusBadge tone="green">{t('rebellion.turn:context.activated')}</StatusBadge>
          )}
          {isBase && (
            <StatusBadge tone="amber">{t('rebellion.turn:context.rebelBase')}</StatusBadge>
          )}
        </Box>
      )}
      {isContested(view, systemId) && (
        <Typography
          variant="body2"
          data-testid="system-panel-contested"
          sx={{ color: T.color.amberText }}
        >
          {t('rebellion.turn:context.contested')}
        </Typography>
      )}
      <ForceMarkerList
        target={{ kind: 'system', systemId }}
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
              {t('rebellion.manifest:leader', { name: leaderLabel(t, l.id) })} ·{' '}
              {factionLabel(t, l.owner)}
            </Typography>
          ))}
        </Box>
      )}
      {forces.groups.length === 0 && (
        <Typography variant="body2" sx={{ color: T.color.warm }}>
          {t('rebellion.turn:context.noUnits')}
        </Typography>
      )}
      {armed !== null &&
        (canActivate(view, armed, systemId) ? (
          <KeyButton
            tone="primary"
            size="small"
            startIcon={<BoltIcon />}
            data-testid="system-panel-activate"
            disabled={isPending}
            onClick={() => void activate(armed, systemId)}
            sx={{ justifySelf: 'start' }}
          >
            {t('rebellion.turn:activate.withLeader', {
              system: name,
              leader: leaderLabel(t, armed),
            })}
          </KeyButton>
        ) : (
          <Typography
            variant="body2"
            sx={{ color: T.color.warm }}
            data-testid="system-panel-not-target"
          >
            {t('rebellion.turn:activate.notTarget')}
          </Typography>
        ))}
    </Box>
  );
}
