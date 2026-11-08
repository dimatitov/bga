import Alert from '@mui/material/Alert';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** "Coming soon" block (`game-coming-soon`) — game page of a coming_soon game and `/new` in place (Q-17, D-NS-2). */
export function ComingSoonNotice({ id, children }: { id?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Alert severity="info" id={id} data-testid="game-coming-soon" action={children}>
      {t('gamePage:comingSoon')}
    </Alert>
  );
}
