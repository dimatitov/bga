import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { TableScreenProps } from '@/games/types';
import { phaseName } from '../../board';
import { AiStatusChip } from '../../table/components/AiStatusChip';
import { useCoreBoard } from '../model/coreContext';
import { hasPassed, isGameOver, markers, visibleRebelBaseSystemId } from '../model/viewModel';
import { MapLegend } from '../sidebar/MapLegend';
import { coreFactionName, coreSystemName } from '../sidebar/coreLogMessage';

/**
 * «Партия» tab of the `core-v1` sidebar (SWR-005 plan-frontend §3.4, §7; Worker P2): id, sides, time,
 * reputation, phase, who has passed, the rebel base (only what the server shows — «неизвестна» otherwise), rules
 * slice, platform status (+ the slice disclaimer while `prototype`), the AI placeholder (AI games) and the map
 * legend (`map-legend`, TC-C-19). `game-info`, `game-info-status[data-status]`.
 */
export function CoreGameInfoPanel({ status }: { status: TableScreenProps['status'] }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const settings = view.settings;
  const { time, reputation } = markers(view);
  const baseSystemId = visibleRebelBaseSystemId(view);
  const passed = (['rebels', 'empire'] as const).filter((s) => hasPassed(view, s));
  const shownStatus = isGameOver(view) ? 'completed' : status;
  const rows: [string, string][] = [
    [t('rebellion.session:info.gameId'), view.id],
    [t('rebellion.session:info.side'), coreFactionName(t, view.viewer)],
    [
      t('rebellion.session:info.opponent'),
      settings.opponentType === 'ai' && settings.aiDifficulty !== null
        ? t('rebellion.session:info.opponentAi', {
            difficulty: t(`rebellion.common:difficulty.${settings.aiDifficulty}`),
          })
        : t('rebellion.session:info.opponentHuman'),
    ],
    [t('rebellion.match:info.time'), String(time)],
    [t('rebellion.match:info.reputation'), String(reputation)],
    [t('rebellion.match:info.phase'), phaseName(t, view.phase)],
    [
      t('rebellion.match:info.passed'),
      passed.length > 0
        ? passed.map((s) => coreFactionName(t, s)).join(', ')
        : t('rebellion.match:passed.none'),
    ],
    [
      t('rebellion.session:info.base'),
      baseSystemId
        ? t('rebellion.session:info.baseKnown', { system: coreSystemName(t, baseSystemId, view) })
        : t('rebellion.session:info.baseUnknown'),
    ],
    [t('rebellion.match:info.rules'), t('rebellion.match:info.rulesValue')],
    [t('rebellion.session:info.version'), String(view.version)],
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
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
              {v}
            </Typography>
          </Box>
        ))}
        <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>
          {t('rebellion.session:info.status')}
        </Typography>
        <Box component="dd" data-testid="game-info-status" data-status={shownStatus} sx={{ m: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t(`common:sessionStatus.${shownStatus}`)}
          </Typography>
          {(shownStatus === 'prototype' || shownStatus === 'completed') && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('rebellion.common:prototype.coreV1')}
            </Typography>
          )}
        </Box>
      </Box>
      {settings.opponentType === 'ai' ? (
        <Box sx={{ mt: 2 }}>
          <AiStatusChip />
        </Box>
      ) : null}
      <Divider sx={{ my: 2 }} />
      <MapLegend />
    </Box>
  );
}
