import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { StatusCard } from '@/shared/ui/terminal';

/** Legacy game (created before SWR-010, `view.cards === null`): «В этой партии карты не отслеживаются» (S-7, AC-16). */
export function CardsNotTracked({ viewer }: { viewer: string }) {
  const { t } = useTranslation();
  return (
    <Box data-testid="card-hand" data-tracked="false" data-viewer={viewer}>
      <StatusCard
        tone="amber"
        data-testid="card-hand-legacy"
        title={t('rebellion.cards:legacy.title')}
      >
        <Typography variant="body2" sx={{ color: terminalTokens.color.paper }}>
          {t('rebellion.cards:legacy.text')}
        </Typography>
      </StatusCard>
    </Box>
  );
}
