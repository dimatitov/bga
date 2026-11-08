import BoltIcon from '@mui/icons-material/Bolt';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { FactionId } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import {
  activatedSystemId,
  canActivate,
  isContested,
  leadersAt,
  systemById,
  unitsAt,
  visibleRebelBaseSystemId,
} from '../model/viewModel';
import { factionLabel, leaderLabel, regionLabel, systemLabel, unitTypeLabel } from './labels';
import { useTurnCommands } from './useTurnCommands';

const SIDES: FactionId[] = ['rebels', 'empire'];

/**
 * Selected system (plan-frontend §7): region, remote / contested / activated / base markers (words, not colour
 * only), leaders and units per side. With an armed leader: «Activate <system> with <leader>» when the server lists
 * the system, otherwise the neutral «not a valid target» (the reason comes only from a 422).
 */
export function CoreSystemPanel({ systemId }: { systemId: string }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const armed = useCoreUiStore((s) => s.armedLeaderId);
  const { activate, isPending } = useTurnCommands();
  const system = systemById(view, systemId);
  if (!system) return null;
  const name = systemLabel(t, view, systemId);
  const units = unitsAt(view, systemId);
  const leaders = leadersAt(view, systemId);

  return (
    <Box data-testid="system-panel" data-system-id={systemId} sx={{ display: 'grid', gap: 1 }}>
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
        {name}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('rebellion.turn:context.region', { region: regionLabel(t, view, system.regionId) })}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {system.remote && (
          <Chip size="small" variant="outlined" label={t('rebellion.turn:context.remote')} />
        )}
        {activatedSystemId(view) === systemId && (
          <Chip size="small" color="primary" label={t('rebellion.turn:context.activated')} />
        )}
        {visibleRebelBaseSystemId(view) === systemId && (
          <Chip size="small" variant="outlined" label={t('rebellion.turn:context.rebelBase')} />
        )}
      </Box>
      {isContested(view, systemId) && (
        <Typography variant="body2" data-testid="system-panel-contested">
          {t('rebellion.turn:context.contested')}
        </Typography>
      )}
      {leaders.length > 0 && (
        <Typography variant="body2">
          {t('rebellion.turn:context.leaders', {
            names: leaders.map((l) => leaderLabel(t, l.id)).join(', '),
          })}
        </Typography>
      )}
      {SIDES.map((side) => {
        const own = units.filter((u) => u.owner === side);
        if (own.length === 0) return null;
        const counts = new Map<string, number>();
        for (const u of own) counts.set(u.typeKey, (counts.get(u.typeKey) ?? 0) + 1);
        return (
          <Box key={side}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('rebellion.turn:context.units', { side: factionLabel(t, side) })}
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {[...counts].map(([typeKey, count]) => (
                <Typography key={typeKey} component="li" variant="body2">
                  {t('rebellion.turn:context.unitCount', {
                    name: unitTypeLabel(t, typeKey),
                    count,
                  })}
                </Typography>
              ))}
            </Box>
          </Box>
        );
      })}
      {units.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('rebellion.turn:context.noUnits')}
        </Typography>
      )}
      {armed !== null &&
        (canActivate(view, armed, systemId) ? (
          <Button
            variant="contained"
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
          </Button>
        ) : (
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary' }}
            data-testid="system-panel-not-target"
          >
            {t('rebellion.turn:activate.notTarget')}
          </Typography>
        ))}
    </Box>
  );
}
