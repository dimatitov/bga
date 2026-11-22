import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { ForceGlyph } from '../../ui/ForceGlyph';
import { InspectorHeading } from '../manifest/InspectorHeading';
import { useCoreBoard } from '../model/coreContext';
import { leaderById } from '../model/viewModel';
import { factionLabel, leaderLabel, leaderPlace } from './labels';

const T = terminalTokens;

/** Selected leader (plan-frontend §7; SWR-009 inspector look): name, side, «in the pool» / «in <system>» / zone. */
export function LeaderPanel({ leaderId }: { leaderId: string }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const leader = leaderById(view, leaderId);
  if (!leader) return null;
  return (
    <Box data-testid="leader-panel" data-leader-id={leaderId} sx={{ display: 'grid', gap: '6px' }}>
      <InspectorHeading name={leaderLabel(t, leaderId)} />
      <Typography
        variant="body2"
        sx={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.color.paper }}
      >
        <ForceGlyph owner={leader.owner} kind="leader" />
        {t('rebellion.turn:context.side', { side: factionLabel(t, leader.owner) })}
      </Typography>
      <Typography variant="body2" sx={{ color: T.color.paper }}>
        {leaderPlace(t, view, leader)}
      </Typography>
      {!leader.canActivate && (
        <Typography variant="body2" sx={{ color: T.color.warm }}>
          {t('rebellion.turn:context.cannotActivate')}
        </Typography>
      )}
    </Box>
  );
}
