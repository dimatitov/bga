import Box from '@mui/material/Box';
import { CardZoneSection } from './CardZoneSection';
import type { ZoneModel } from './model/handModel';

/**
 * The opponent's zones (plan-frontend §3.1, §5.2): only `count` per zone; cards are listed only when the server sent
 * them (`cards !== null`: the revealed base, the end of the game). `data-count` = the sum of the counts.
 */
export function OpponentCounts({ zones }: { zones: ZoneModel[] }) {
  const total = zones.reduce((sum, z) => sum + z.count, 0);
  return (
    <Box data-testid="card-hand-opponent-count" data-count={total}>
      {zones.map((zone) => (
        <CardZoneSection key={zone.id} zone={zone} />
      ))}
    </Box>
  );
}
