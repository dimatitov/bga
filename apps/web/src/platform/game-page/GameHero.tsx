import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import type { WebGameEntry } from '@/games/registry';
import { GameCover } from '../ui/GameCover';
import { GameMeta } from '../ui/GameMeta';
import { GameStatusChip } from '../ui/GameStatusChip';
import { useGameText } from '../ui/useGameText';

/** Hero (D-GP-1): cover left (≤ 420px), name (h1), status, meta, description; cover on top on narrow screens. */
export function GameHero({ entry, children }: { entry: WebGameEntry; children?: ReactNode }) {
  const { definition } = entry;
  const text = useGameText(entry);
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 420px) 1fr' },
        alignItems: 'start',
      }}
    >
      <Box
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          borderTop: 4,
          borderTopColor: entry.cover?.accentColor ?? 'divider',
        }}
      >
        <GameCover
          src={text.coverSrc}
          alt={text.coverAlt}
          status={definition.status}
          data-testid="game-page-cover"
        />
      </Box>
      <Stack spacing={2}>
        <Typography
          variant="h4"
          component="h1"
          data-testid="game-page-name"
          sx={{ fontWeight: 700 }}
        >
          {text.name}
        </Typography>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
        >
          <GameStatusChip status={definition.status} data-testid="game-page-status" />
          <GameMeta definition={definition} testIdPrefix="game-page" />
        </Stack>
        <Typography color="text.secondary" data-testid="game-page-description">
          {text.description}
        </Typography>
        {children}
      </Stack>
    </Box>
  );
}
