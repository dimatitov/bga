import Box from '@mui/material/Box';
import { factions } from '@bga/game-rebellion/assets';
import { type FactionId } from '@bga/game-rebellion/schema';
import { svgDataUrl } from '@/platform';

export interface FactionEmblemProps {
  faction: FactionId;
  /** Pixel size; a responsive object (`{ xs: 40, sm: 56 }`) is allowed. Default 56. */
  size?: number | { xs?: number; sm?: number; md?: number };
}

/**
 * Original abstract faction emblem from the `@bga/game-rebellion/assets` registry as a local `data:` URL
 * (D-SW4-5; no network requests). Decorative: the faction name is always next to it in text.
 */
export function FactionEmblem({ faction, size = 56 }: FactionEmblemProps) {
  return (
    <Box
      component="img"
      src={svgDataUrl(factions[faction].emblemSvg)}
      alt=""
      aria-hidden
      data-faction={faction}
      sx={{ width: size, height: size, flexShrink: 0, display: 'block' }}
    />
  );
}
