import PeopleIcon from '@mui/icons-material/People';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { GameDefinition } from '@bga/platform';
import { useTranslation } from 'react-i18next';
import { formatPlayers } from './formatPlayers';

/** "2 игрока · AI-противник ✓" (D-CAT-6, Q-12). Icons are decorative; the text carries the meaning (D-A-12). */
export function GameMeta(props: {
  definition: GameDefinition;
  testIdPrefix: 'game-card' | 'game-page';
}) {
  const { t } = useTranslation();
  const { definition, testIdPrefix } = props;
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: 'center', flexWrap: 'wrap', color: 'text.secondary' }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <PeopleIcon fontSize="small" aria-hidden />
        <Typography variant="body2" data-testid={`${testIdPrefix}-players`}>
          {formatPlayers(t, definition.supportedPlayers)}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <SmartToyIcon fontSize="small" aria-hidden />
        <Typography
          variant="body2"
          data-testid={`${testIdPrefix}-ai`}
          data-supports-ai={String(definition.supportsAI)}
        >
          {t(definition.supportsAI ? 'common:ai.supported' : 'common:ai.none')}
        </Typography>
      </Stack>
    </Stack>
  );
}
