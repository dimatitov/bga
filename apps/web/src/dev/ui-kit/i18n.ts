import { i18n } from '@/shared/i18n';
import en from './locales/en.json';
import ru from './locales/ru.json';

/** Namespace of the UI Kit showcase. Its files are outside the eager `src/locales/*` glob (like `devAi`). */
export const UI_KIT_NS = 'devUiKit';

/** Registers `devUiKit` for ru and en when the lazy chunk loads (idempotent). */
export function registerUiKitI18n(): void {
  i18n.addResourceBundle('ru', UI_KIT_NS, ru, true, true);
  i18n.addResourceBundle('en', UI_KIT_NS, en, true, true);
}
