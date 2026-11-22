import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/platform/paths';
import { MessagePanel } from '@/platform/ui/MessagePanel';

/** Unknown address (`not-found`): terminal message panel with the way back to the catalogue. */
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <MessagePanel
      data-testid="not-found"
      led="amber"
      status={t('common:terminal.code404')}
      title={t('common:notFound.title')}
      text={t('common:notFound.text')}
      actions={
        <Button component={RouterLink} to={paths.catalog} variant="contained">
          {t('common:notFound.toCatalog')}
        </Button>
      }
    />
  );
}
