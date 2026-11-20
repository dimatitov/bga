import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { TableScreenProps } from '@/games/types';
import { useSessionAutomation } from '@/platform';
import { phaseName } from '../../board';
import { aiSideOf } from '../model/aiCommander';
import { useCoreBoard } from '../model/coreContext';
import { hasPassed, isGameOver, markers, visibleRebelBaseSystemId } from '../model/viewModel';
import { MapLegend } from '../sidebar/MapLegend';
import { coreFactionName, coreSystemName } from '../sidebar/coreLogMessage';

/**
 * «Партия» tab of the `core-v1` sidebar (SWR-005 plan-frontend §3.4, §7; Worker P2): id, sides, time,
 * reputation, phase, who has passed, the rebel base (only what the server shows — «неизвестна» otherwise), rules
 * slice, platform status (+ the slice disclaimer while `prototype`) and the map legend (`map-legend`, TC-C-19).
 * SWR-006 (plan-frontend §6.3): rows «Противник» (`game-info-opponent`) and, in an AI game, «AI Commander»
 * (`game-info-ai-commander[data-strategy]`: bot / OpenAI / «—») replace the old «не активен в прототипе» chip.
 * `game-info`, `game-info-status[data-status]`.
 */

type Row = { label: string; value: string; testId?: string; strategy?: string };
export function CoreGameInfoPanel({ status }: { status: TableScreenProps['status'] }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const automation = useSessionAutomation();
  const settings = view.settings;
  const aiGame = aiSideOf(settings) !== null;
  const strategy = automation?.strategy ?? null;
  const { time, reputation } = markers(view);
  const baseSystemId = visibleRebelBaseSystemId(view);
  const passed = (['rebels', 'empire'] as const).filter((s) => hasPassed(view, s));
  const shownStatus = isGameOver(view) ? 'completed' : status;
  const rows: Row[] = [
    { label: t('rebellion.session:info.gameId'), value: view.id },
    { label: t('rebellion.session:info.side'), value: coreFactionName(t, view.viewer) },
    {
      label: t('rebellion.session:info.opponent'),
      testId: 'game-info-opponent',
      value:
        aiGame && settings.aiDifficulty !== null
          ? t('rebellion.session:info.opponentAi', {
              difficulty: t(`rebellion.common:difficulty.${settings.aiDifficulty}`),
            })
          : t('rebellion.session:info.opponentHuman'),
    },
    ...(aiGame
      ? [
          {
            label: t('rebellion.match:ai.infoCommander'),
            testId: 'game-info-ai-commander',
            strategy: strategy ?? 'none',
            value:
              strategy === 'bot'
                ? t('rebellion.match:ai.infoCommanderBot')
                : strategy === 'openai'
                  ? t('rebellion.match:ai.infoCommanderOpenai')
                  : t('rebellion.match:ai.infoCommanderNone'),
          },
        ]
      : []),
    { label: t('rebellion.match:info.time'), value: String(time) },
    { label: t('rebellion.match:info.reputation'), value: String(reputation) },
    { label: t('rebellion.match:info.phase'), value: phaseName(t, view.phase) },
    {
      label: t('rebellion.match:info.passed'),
      value:
        passed.length > 0
          ? passed.map((s) => coreFactionName(t, s)).join(', ')
          : t('rebellion.match:passed.none'),
    },
    {
      label: t('rebellion.session:info.base'),
      value: baseSystemId
        ? t('rebellion.session:info.baseKnown', { system: coreSystemName(t, baseSystemId, view) })
        : t('rebellion.session:info.baseUnknown'),
    },
    { label: t('rebellion.match:info.rules'), value: t('rebellion.match:info.rulesValue') },
    { label: t('rebellion.session:info.version'), value: String(view.version) },
  ];
  return (
    <Box data-testid="game-info">
      <Box
        component="dl"
        sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.75, m: 0 }}
      >
        {rows.map((row) => (
          <Box key={row.label} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>
              {row.label}
            </Typography>
            <Typography
              component="dd"
              variant="body2"
              data-testid={row.testId}
              data-strategy={row.strategy}
              sx={{ m: 0, overflowWrap: 'anywhere' }}
            >
              {row.value}
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
      <Divider sx={{ my: 2 }} />
      <MapLegend />
    </Box>
  );
}
