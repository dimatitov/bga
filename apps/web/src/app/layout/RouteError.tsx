import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import { MessagePanel } from '@/platform/ui/MessagePanel';

/** Root `errorElement`: failed lazy chunk of a game screen or an unexpected route error (D-SH-5). */
export function RouteError() {
  const { t } = useTranslation();
  return (
    <MessagePanel
      component="main"
      id="main"
      data-testid="route-error"
      minHeight="100dvh"
      led="red"
      status={t('common:terminal.fault')}
      title={t('common:routeError.title')}
      text={t('common:routeError.text')}
      actions={
        <Button variant="contained" onClick={() => window.location.reload()}>
          {t('common:routeError.reload')}
        </Button>
      }
    />
  );
}
