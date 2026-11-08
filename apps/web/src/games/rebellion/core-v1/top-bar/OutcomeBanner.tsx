import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { rebellionPalette } from '../../theme/palette';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { outcomeOf } from '../model/viewModel';
import { outcomeReasonText, outcomeWinnerText } from '../sidebar/coreLogMessage';

/**
 * Game-over banner (SWR-005 plan-frontend §7, D-SW5-14; AC-07): over the top of the map, NOT modal — the map and
 * the log stay explorable. Winner «Победа Повстанцев» + reason, «Партия завершена…», «← К игре». No turn buttons
 * here (the turn controls/panel show «Партия завершена» themselves, `legalActions` is `[]`). Focus moves to the
 * heading once per session (`coreUiStore.lastOutcomeSeen`). Data only from `view.outcome`.
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
    <Paper
      component="section"
      role="region"
      aria-labelledby="game-over-title"
      data-testid="game-over-banner"
      data-winner={outcome.winner}
      data-reason={outcome.reason}
      elevation={6}
      sx={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2,
        width: 'min(560px, calc(100% - 24px))',
        p: { xs: 1.5, sm: 2 },
        borderTop: 4,
        borderColor: color,
        display: 'grid',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EmojiEventsOutlinedIcon aria-hidden sx={{ color }} />
        <Typography
          ref={titleRef}
          id="game-over-title"
          data-testid="game-over-title"
          component="h2"
          variant="h6"
          tabIndex={-1}
        >
          {outcomeWinnerText(t, outcome.winner)}
        </Typography>
      </Box>
      <Typography data-testid="game-over-reason" variant="body1">
        {outcomeReasonText(t, outcome.reason)}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('rebellion.match:outcome.over')}
      </Typography>
      <Box>
        <Button
          component={RouterLink}
          to={backHref}
          startIcon={<ArrowBackIcon />}
          variant="outlined"
          size="small"
          data-testid="game-over-back"
        >
          {t('rebellion.match:outcome.back')}
        </Button>
      </Box>
    </Paper>
  );
}
