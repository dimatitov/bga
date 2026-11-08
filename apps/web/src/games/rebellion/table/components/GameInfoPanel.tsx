import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { PlayerViewPlayer } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import type { TableScreenProps } from '@/games/types';
import { factionName } from '../../board';
import { AiStatusChip } from './AiStatusChip';

/**
 * "Game" tab (D-L-4): ids, sides, version, base info, AI placeholder (AI games only); SWR-004 AC-13: «Статус» row with the
 * platform status and, for a prototype, the full prototype text (not only a tooltip — touch has none).
 */
export function GameInfoPanel({
  view,
  status,
}: {
  view: PlayerViewPlayer;
  status: TableScreenProps['status'];
}) {
  const { t } = useTranslation();
  const opp = view.settings;
  const baseSystem = view.rebelBase.systemId
    ? view.systems.find((s) => s.id === view.rebelBase.systemId)
    : undefined;
  const rows: [string, string][] = [
    [t('rebellion.session:info.gameId'), view.id],
    [t('rebellion.session:info.side'), factionName(t, view.viewer)],
    [
      t('rebellion.session:info.opponent'),
      opp.opponentType === 'ai' && opp.aiDifficulty !== null
        ? t('rebellion.session:info.opponentAi', {
            difficulty: t(`rebellion.common:difficulty.${opp.aiDifficulty}`),
          })
        : t('rebellion.session:info.opponentHuman'),
    ],
    [t('rebellion.session:info.version'), String(view.version)],
    [
      t('rebellion.session:info.base'),
      baseSystem
        ? t('rebellion.session:info.baseKnown', {
            system: t(baseSystem.nameKey, { ns: 'rebellion.gameData' }),
          })
        : t('rebellion.session:info.baseUnknown'),
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
        <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>
          {t('rebellion.session:info.status')}
        </Typography>
        <Box component="dd" data-testid="game-info-status" data-status={status} sx={{ m: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t(`common:sessionStatus.${status}`)}
          </Typography>
          {status === 'prototype' && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('rebellion.common:prototype.full')}
            </Typography>
          )}
        </Box>
      </Box>
      {/* The AI placeholder only makes sense when the opponent is AI (hot-seat games have none, SWR-004). */}
      {opp.opponentType === 'ai' ? (
        <Box sx={{ mt: 2 }}>
          <AiStatusChip />
        </Box>
      ) : null}
    </Box>
  );
}
