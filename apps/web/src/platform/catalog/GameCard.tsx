import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import { Link as RouterLink } from 'react-router';
import type { WebGameEntry } from '@/games/registry';
import { paths } from '../paths';
import { GameCover } from '../ui/GameCover';
import { GameMeta } from '../ui/GameMeta';
import { GameStatusChip } from '../ui/GameStatusChip';
import { useGameText } from '../ui/useGameText';

/**
 * Catalogue card (ux §12.3): the whole card is one link to `/games/:gameId` (D-CAT-3) named by the game name,
 * described by status + description; accent stripe from the game's assets (D-V-5).
 */
export function GameCard({ entry }: { entry: WebGameEntry }) {
  const { definition } = entry;
  const text = useGameText(entry);
  const nameId = useId();
  const statusId = useId();
  const descriptionId = useId();
  return (
    <Card
      component="li"
      variant="outlined"
      sx={{
        listStyle: 'none',
        borderTop: 4,
        borderTopColor: entry.cover?.accentColor ?? 'divider',
        transition: (theme) => theme.transitions.create(['box-shadow', 'border-color']),
        '&:hover': { boxShadow: 6, borderColor: 'primary.main' },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={paths.game(definition.id)}
        data-testid={`game-card-${definition.id}`}
        data-game-id={definition.id}
        data-status={definition.status}
        aria-labelledby={nameId}
        aria-describedby={`${statusId} ${descriptionId}`}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        <Box sx={{ position: 'relative' }}>
          <GameCover
            src={text.coverSrc}
            alt={text.coverAlt}
            status={definition.status}
            data-testid="game-card-cover"
          />
          <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
            <GameStatusChip
              id={statusId}
              status={definition.status}
              data-testid="game-card-status"
            />
          </Box>
        </Box>
        <Stack spacing={1} sx={{ p: 2, flex: 1 }}>
          <Typography id={nameId} variant="h6" component="h2" data-testid="game-card-name">
            {text.name}
          </Typography>
          <Typography
            id={descriptionId}
            variant="body2"
            color="text.secondary"
            data-testid="game-card-description"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {text.description}
          </Typography>
          <GameMeta definition={definition} testIdPrefix="game-card" />
        </Stack>
      </CardActionArea>
    </Card>
  );
}
