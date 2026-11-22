import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import { Link as RouterLink } from 'react-router';
import type { WebGameEntry } from '@/games/registry';
import { terminalTokens } from '@/shared/theme';
import { paths } from '../paths';
import { GameCover } from '../ui/GameCover';
import { GameMeta } from '../ui/GameMeta';
import { GameStatusChip } from '../ui/GameStatusChip';
import { useGameText } from '../ui/useGameText';

const T = terminalTokens;

/**
 * Catalogue card (ux §12.3): the whole card is one link to `/games/:gameId` (D-CAT-3) named by the game name,
 * described by status + description; accent stripe from the game's assets (D-V-5). SWR-009: bezel frame of a terminal
 * module, the accent as the top bezel, cover on the CRT surface.
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
        border: `${T.bezel.module}px solid ${T.color.bezel}`,
        borderTop: `${T.bezel.housing}px solid ${entry.cover?.accentColor ?? T.color.bezel}`,
        bgcolor: 'terminal.module',
        boxShadow: `inset 0 0 0 1px ${T.module.inset}`,
        transition: (theme) => theme.transitions.create(['border-color', 'background-color']),
        '&:hover': {
          borderLeftColor: T.key.hover.border,
          borderRightColor: T.key.hover.border,
          borderBottomColor: T.key.hover.border,
          bgcolor: 'terminal.moduleHead',
        },
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
        <Box
          sx={{
            position: 'relative',
            borderBottom: `1px solid ${T.module.headBorder}`,
            bgcolor: 'terminal.crt',
          }}
        >
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
          <Typography id={nameId} variant="h2" data-testid="game-card-name">
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
