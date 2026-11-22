import { useTranslation } from 'react-i18next';
import { SessionMessage } from './SessionMessage';

/** `GET /api/sessions/:id` → 404 (D-SH-2). */
export function SessionNotFound() {
  const { t } = useTranslation();
  return (
    <SessionMessage
      testId="session-not-found"
      led="amber"
      status={t('common:terminal.code404')}
      title={t('sessionHost:notFound.title')}
      text={t('sessionHost:notFound.text')}
    />
  );
}
