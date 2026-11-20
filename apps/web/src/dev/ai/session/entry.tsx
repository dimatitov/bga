import { registerDevAiI18n } from '../i18n';
import { DevAiSessionDiagnostics } from './DevAiSessionDiagnostics';

/**
 * Lazy dev chunk of the session host's AI decision panel (SWR-008 plan-frontend §2.2). Imported only from the
 * `import.meta.env.DEV` branch of `platform/session-host/SessionHost.tsx`, so neither this chunk nor its `devAi`
 * strings, testids or endpoint path exist in a production build (`check:bundle`).
 */
registerDevAiI18n();

export default DevAiSessionDiagnostics;
