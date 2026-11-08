import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { PieceGlyph } from '@/shared/ui';
import { useGamesList } from '../hooks/useGamesList';
import { recentItemText } from '../lib/summaryText';

/** «Недавние партии» — up to 5, newest first, shown only when there are ≥ 2 games (A-1, D-M-3). */
export function RecentGamesList() {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const { games, recent } = useGamesList();

  if (games.length < 2) return null;

  return (
    <Box component="section" aria-labelledby={titleId}>
      <Typography id={titleId} variant="overline" component="h2" color="text.secondary">
        {t('setup:recent.title')}
      </Typography>
      <List dense data-testid="recent-games" disablePadding>
        {recent.map((game) => (
          <ListItem key={game.gameId} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={`/games/${encodeURIComponent(game.gameId)}`}
              data-testid={`recent-game-${game.gameId}`}
              data-game-id={game.gameId}
              sx={{ borderRadius: 1, minHeight: 40 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                <PieceGlyph kind="unit" owner={game.setup.humanFaction} size={14} />
              </ListItemIcon>
              <ListItemText primary={recentItemText(t, game, i18n.language)} />
              <ChevronRightIcon fontSize="small" aria-hidden="true" />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
