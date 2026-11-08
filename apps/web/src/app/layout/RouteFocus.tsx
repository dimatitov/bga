import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

const MAX_ATTEMPTS = 20;

/**
 * D-A-8: on route change move focus to the page `<h1>` (waits for lazy pages to render it). The initial load is
 * skipped by remembering the last handled pathname, not with a "first run" flag: under React StrictMode (dev, e2e)
 * effects run twice on mount, and the flag let the second run poll for `#main h1` on the initial load and steal
 * the focus from whatever the user had focused meanwhile (SWR-005 INTEGRATION, flaky SWR-004 TC-VA-10).
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const previous = handled.current;
    handled.current = pathname;
    if (previous === null || previous === pathname) return;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryFocus = () => {
      const heading = document.querySelector<HTMLElement>('#main h1');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: false });
        return;
      }
      if (++attempts < MAX_ATTEMPTS) timer = setTimeout(tryFocus, 50);
    };
    timer = setTimeout(tryFocus, 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
