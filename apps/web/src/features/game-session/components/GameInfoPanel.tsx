import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { PlayerView } from '@swr/contracts';
import { useTranslation } from 'react-i18next';
import { AiStatusChip } from '@/features/ai-opponent';
import { factionName } from '@/features/game-board';

/** "Game" tab (D-L-4): ids, sides, version, base info, AI placeholder. */
export function GameInfoPanel({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const opp = view.setup.opponent;
  const baseSystem = view.rebelBase.systemId
    ? view.systems.find((s) => s.id === view.rebelBase.systemId)
    : undefined;
  const rows: [string, string][] = [
    [t('session:info.gameId'), view.id],
    [t('session:info.side'), factionName(t, view.setup.humanFaction)],
    [
      t('session:info.opponent'),
      opp.kind === 'ai'
        ? t('session:info.opponentAi', { difficulty: t(`common:difficulty.${opp.difficulty}`) })
        : t('session:info.opponentHuman'),
    ],
    [t('session:info.version'), String(view.version)],
    [
      t('session:info.base'),
      baseSystem
        ? t('session:info.baseKnown', { system: t(baseSystem.nameKey, { ns: 'gameData' }) })
        : t('session:info.baseUnknown'),
    ],
  ];
  return (
    <Box data-testid="game-info">
      <Box
        component="dl"
        sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.75, m: 0 }}
      >
        {rows.map(([k, v]) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>
              {k}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, wordBreak: 'break-all' }}>
              {v}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 2 }}>
        <AiStatusChip />
      </Box>
    </Box>
  );
}
