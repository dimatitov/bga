import { i18n } from '@/shared/i18n';
import en from './locales/en.json';
import ru from './locales/ru.json';

/** Namespace of the diagnostics page. Its files are outside the eager `src/locales/*` glob (plan-frontend §7). */
export const DEV_AI_NS = 'devAi';

/** Registers `devAi` for ru and en when the lazy chunk loads (idempotent). */
export function registerDevAiI18n(): void {
  i18n.addResourceBundle('ru', DEV_AI_NS, ru, true, true);
  i18n.addResourceBundle('en', DEV_AI_NS, en, true, true);
}
