import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { useTranslation } from 'react-i18next';
import { MOBILE_SHEET, mq, terminalTokens } from '@/shared/theme';
import { StatusBadge } from '@/shared/ui/terminal';
import { rebellionPalette } from '../../theme/palette';
import { FactionEmblem } from '../../ui/FactionEmblem';
import { hasPassed } from '../model/viewModel';

const T = terminalTokens;

/**
 * Side cell of the status bar (SWR-005 plan-frontend §7; SWR-009 design «Текущая сторона / Повстанцы · Вы»): the
 * active side's emblem in a ring of its colour, the overline «Текущая сторона» and the side name, «· Вы» when it is the
 * viewer's side in an AI game. Hot-seat adds «против второго игрока» (an AI game names its opponent in the AI
 * Commander box). `turn-indicator[data-side][data-mine]`.
 */
export function TurnIndicator({ view }: { view: PlayerViewCore }) {
  const { t } = useTranslation();
  const settings = view.settings;
  const ai = settings.opponentType === 'ai';
  const side = view.activeSide;
  const mine = side === view.viewer;
  const sideName = t(`rebellion.common:faction.${side}`);
  return (
    <Box
      data-testid="turn-indicator"
      data-side={side}
      data-mine={mine ? 'true' : 'false'}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        minWidth: 0,
        [mq.down(MOBILE_SHEET)]: { gap: '7px' },
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          flex: 'none',
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: `2px solid ${rebellionPalette.faction[side]}`,
          display: 'grid',
          placeItems: 'center',
          // Compact mark on phones (fix round 1): 22 px ring, 13 px emblem.
          [mq.down(MOBILE_SHEET)]: { width: 22, height: 22, '& img': { width: 13, height: 13 } },
        }}
      >
        <FactionEmblem faction={side} size={18} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="meta" component="span" sx={{ display: 'block' }}>
          {t('rebellion.session:console.currentSide')}
        </Typography>
        <Typography
          component="strong"
          data-testid="turn-indicator-side"
          sx={{
            display: 'block',
            fontSize: 15,
            fontWeight: 700,
            color: T.color.paper,
            // One line: «Повстанцы · Вы» never wraps; ellipsis only if the cell is really too narrow.
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            [mq.down(MOBILE_SHEET)]: { fontSize: 13, lineHeight: '18px' },
          }}
        >
          {ai && mine ? t('rebellion.session:console.sideYou', { side: sideName }) : sideName}
        </Typography>
        {!ai && (
          <Typography
            component="span"
            sx={{ display: 'block', fontSize: T.type.meta.size, color: T.color.warm }}
          >
            {t('rebellion.match:turn.vsHuman')}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * Who has passed for the rest of the command phase (R-6, `view.passed`): one badge per side «Империя: пас».
 * Nothing when nobody has passed or the game is over. `passed-indicator[data-rebels][data-empire]`.
 */
export function PassedIndicator({ view }: { view: PlayerViewCore }) {
  const { t } = useTranslation();
  const sides = (['rebels', 'empire'] as const).filter((s) => hasPassed(view, s));
  if (view.outcome || sides.length === 0) return null;
  return (
    <Box
      data-testid="passed-indicator"
      data-rebels={String(view.passed.rebels)}
      data-empire={String(view.passed.empire)}
      role="group"
      aria-label={t('rebellion.match:passed.label')}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
    >
      {sides.map((s) => (
        <StatusBadge key={s} tone="amber" data-testid={`passed-${s}`}>
          {t('rebellion.match:passed.side', { side: t(`rebellion.common:faction.${s}`) })}
        </StatusBadge>
      ))}
    </Box>
  );
}
