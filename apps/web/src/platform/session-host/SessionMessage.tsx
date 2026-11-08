import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '../paths';

/** Full-screen message of the session host with a way out to the catalogue. */
export function SessionMessage(props: {
  testId: string;
  title: string;
  text?: string;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid={props.testId}
      sx={{
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 2,
        minHeight: '60vh',
        px: 2,
      }}
    >
      <Typography variant="h4" component="h1">
        {props.title}
      </Typography>
      {props.text ? <Typography color="text.secondary">{props.text}</Typography> : null}
      <Box sx={{ display: 'flex', gap: 2 }}>
        {props.actions}
        <Button component={RouterLink} to={paths.catalog} variant="contained">
          {t('common:notFound.toCatalog')}
        </Button>
      </Box>
    </Box>
  );
}
