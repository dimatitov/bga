import { registerUiKitI18n } from './i18n';
import { UiKitPage } from './UiKitPage';

/**
 * Lazy route module of `/dev/ui-kit` (react-router `lazy`, SWR-009 S / A-7). Imported only from the
 * `import.meta.env.DEV` branch of `app/router.tsx`, so neither this chunk nor its `devUiKit` strings exist in a
 * production build (checked by `check:bundle`: `dev-ui-kit-*` rules and the `apps/web/src/dev/**` module check).
 */
registerUiKitI18n();

export function Component() {
  return <UiKitPage />;
}
