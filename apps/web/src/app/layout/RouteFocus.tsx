import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

const MAX_ATTEMPTS = 20;

/** D-A-8: on route change move focus to the page `<h1>` (waits for lazy pages to render it). */
export function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
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
