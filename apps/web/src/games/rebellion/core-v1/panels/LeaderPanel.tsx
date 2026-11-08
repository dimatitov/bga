import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useCoreBoard } from '../model/coreContext';
import { leaderById } from '../model/viewModel';
import { factionLabel, leaderLabel, leaderPlace } from './labels';

/** Selected leader (plan-frontend §7): name, side, «in the pool» / «in <system>» / hidden zone. */
export function LeaderPanel({ leaderId }: { leaderId: string }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const leader = leaderById(view, leaderId);
  if (!leader) return null;
  return (
    <Box data-testid="leader-panel" data-leader-id={leaderId} sx={{ display: 'grid', gap: 0.5 }}>
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
        {leaderLabel(t, leaderId)}
      </Typography>
      <Typography variant="body2">
        {t('rebellion.turn:context.side', { side: factionLabel(t, leader.owner) })}
      </Typography>
      <Typography variant="body2">{leaderPlace(t, view, leader)}</Typography>
      {!leader.canActivate && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('rebellion.turn:context.cannotActivate')}
        </Typography>
      )}
    </Box>
  );
}
