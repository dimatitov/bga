import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '../paths';
import { MessagePanel } from '../ui/MessagePanel';

/** Unknown `gameId` on `/games/:gameId[/new]` (and old SWR-002 URLs) → link to the catalogue. */
export function GameNotFound() {
  const { t } = useTranslation();
  return (
    <MessagePanel
      data-testid="game-not-found"
      minHeight="50vh"
      led="amber"
      status={t('common:terminal.code404')}
      title={t('gamePage:notFound.title')}
      text={t('gamePage:notFound.text')}
      actions={
        <Button component={RouterLink} to={paths.catalog} variant="contained">
          {t('common:notFound.toCatalog')}
        </Button>
      }
    />
  );
}
