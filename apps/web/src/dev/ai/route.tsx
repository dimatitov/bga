import { DevAiPage } from './DevAiPage';
import { registerDevAiI18n } from './i18n';

/**
 * Lazy route module of `/dev/ai` (react-router `lazy`). Imported only from the `import.meta.env.DEV` branch of
 * `app/router.tsx`, so neither this chunk nor its `devAi` strings exist in a production build.
 */
registerDevAiI18n();

export function Component() {
  return <DevAiPage />;
}
