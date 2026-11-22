import Button from '@mui/material/Button';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import type { LedState } from '@/shared/ui';
import { paths } from '../paths';
import { MessagePanel } from '../ui/MessagePanel';

/** Full-screen message of the session host with a way out to the catalogue (terminal panel, SWR-009 N). */
export function SessionMessage(props: {
  testId: string;
  title: string;
  text?: string;
  actions?: ReactNode;
  /** Status line + LED of the panel (e.g. «Код 404» amber, «Сбой» red). */
  status: string;
  led: LedState;
}) {
  const { t } = useTranslation();
  return (
    <MessagePanel
      data-testid={props.testId}
      led={props.led}
      status={props.status}
      title={props.title}
      text={props.text}
      actions={
        <>
          {props.actions}
          <Button component={RouterLink} to={paths.catalog} variant="contained">
            {t('common:notFound.toCatalog')}
          </Button>
        </>
      }
    />
  );
}
