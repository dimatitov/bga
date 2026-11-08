import { useTranslation } from 'react-i18next';
import { SessionMessage } from './SessionMessage';

/** Game of the session is unknown here, has no table, or the server said `GAME_UNAVAILABLE` (Q-7, Q-20, D-SH-3). */
export function SessionUnsupported() {
  const { t } = useTranslation();
  return (
    <SessionMessage
      testId="session-unsupported"
      title={t('sessionHost:unsupported.title')}
      text={t('sessionHost:unsupported.text')}
    />
  );
}
