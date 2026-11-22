import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { terminalTokens } from '@/shared/theme';
import { StatusBadge } from '@/shared/ui/terminal';
import { rebellionPalette } from '../../theme/palette';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { outcomeOf } from '../model/viewModel';
import { outcomeReasonText, outcomeWinnerText } from '../sidebar/coreLogMessage';

const T = terminalTokens;

/**
 * Game-over banner (SWR-005 plan-frontend §7, D-SW5-14; AC-07): over the top of the map, NOT modal — the map and
 * the log stay explorable. Winner «Победа Повстанцев» + reason, «Партия завершена…», «← К игре». No turn buttons
 * here (the turn controls/panel show «Партия завершена» themselves, `legalActions` is `[]`). Focus moves to the
 * heading once per session (`coreUiStore.lastOutcomeSeen`). Data only from `view.outcome`.
 * SWR-009 (plan §2 C1): a UI Kit dialog surface (bezel, flat shadow) with a 4 px top edge of the winner's colour, a
 * «Партия окончена» badge and a default key «← К игре».
 * `game-over-banner[data-winner][data-reason]`, `game-over-title`.
 */
export function OutcomeBanner({ backHref }: { backHref: string }) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const outcome = outcomeOf(view);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lastOutcomeSeen = useCoreUiStore((s) => s.lastOutcomeSeen);
  const markOutcomeSeen = useCoreUiStore((s) => s.markOutcomeSeen);
  const hasOutcome = outcome !== null;

  useEffect(() => {
    if (!hasOutcome || lastOutcomeSeen !== null) return;
    titleRef.current?.focus();
    markOutcomeSeen(view.version);
  }, [hasOutcome, lastOutcomeSeen, markOutcomeSeen, view.version]);

  if (!outcome) return null;
  const color = rebellionPalette.faction[outcome.winner];
  return (
    <Box
      component="section"
      role="region"
      aria-labelledby="game-over-title"
      data-testid="game-over-banner"
      data-winner={outcome.winner}
      data-reason={outcome.reason}
      sx={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2,
        width: 'min(560px, calc(100% - 24px))',
        p: { xs: 1.5, sm: 2 },
        display: 'grid',
        gap: 1,
        bgcolor: T.color.dialog,
        color: T.color.paper,
        border: `2px solid ${T.dialog.border}`,
        borderTop: `4px solid ${color}`,
        borderRadius: `${T.radius}px`,
        boxShadow: T.dialog.shadow,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <EmojiEventsOutlinedIcon aria-hidden sx={{ color }} />
        <Typography
          ref={titleRef}
          id="game-over-title"
          data-testid="game-over-title"
          component="h2"
          variant="h2"
          tabIndex={-1}
          sx={{ flex: 1, minWidth: 0 }}
        >
          {outcomeWinnerText(t, outcome.winner)}
        </Typography>
        <StatusBadge tone="neutral">{t('rebellion.match:ai.state.over')}</StatusBadge>
      </Box>
      <Typography data-testid="game-over-reason" variant="body1">
        {outcomeReasonText(t, outcome.reason)}
      </Typography>
      <Typography variant="body2" sx={{ color: T.color.warm }}>
        {t('rebellion.match:outcome.over')}
      </Typography>
      <Box>
        {/* A link styled as the UI Kit default key (theme: outlined + inherit). */}
        <Button
          component={RouterLink}
          to={backHref}
          variant="outlined"
          color="inherit"
          startIcon={<ArrowBackIcon />}
          data-testid="game-over-back"
        >
          {t('rebellion.match:outcome.back')}
        </Button>
      </Box>
    </Box>
  );
}
