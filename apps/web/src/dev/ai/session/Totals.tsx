import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { type AiSessionDecisionsResponse } from '@bga/platform';
import { useTranslation } from 'react-i18next';
import { costGroupView, totalsDataAttrs } from './model';

const GROUPS = ['withRules', 'withoutRules', 'total'] as const;

/** Totals over ALL decisions of the session: with rules / without rules / total (plan-frontend §2.4). */
export function Totals({ totals }: { totals: AiSessionDecisionsResponse['totals'] }) {
  const { t, i18n } = useTranslation('devAi');
  const lng = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Box data-testid="dev-ai-session-totals" {...totalsDataAttrs(totals)}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
        {t('session.totals.title')}
      </Typography>
      <Box component="dl" sx={{ m: 0, display: 'grid', gap: 0.25, typography: 'body2' }}>
        {GROUPS.map((group) => {
          const view = costGroupView(totals[group], lng);
          return (
            <Box key={group} sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1 }}>
              <Box component="dt" sx={{ color: 'text.secondary' }}>
                {t(`session.totals.${group}`)}:
              </Box>
              <Box component="dd" sx={{ m: 0 }}>
                {t('session.totals.line', {
                  decisions: view.decisions,
                  cost: view.cost,
                  mean: view.mean ?? t('session.none'),
                })}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
