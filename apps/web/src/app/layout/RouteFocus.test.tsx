import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteFocus } from './RouteFocus';

function Page({ title }: { title: string }) {
  return (
    <main id="main">
      <RouteFocus />
      <h1>{title}</h1>
      <button type="button">action</button>
    </main>
  );
}

function renderRoutes() {
  const router = createMemoryRouter(
    [
      { path: '/a', element: <Page title="A" /> },
      { path: '/b', element: <Page title="B" /> },
    ],
    { initialEntries: ['/a'] },
  );
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  return router;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RouteFocus (D-A-8)', () => {
  it('initial load under StrictMode: does not move the focus to the h1 (no focus theft)', () => {
    renderRoutes();
    const button = document.querySelector('button')!;
    button.focus();
    act(() => vi.advanceTimersByTime(2000));
    expect(document.activeElement).toBe(button);
  });

  it('route change: focuses the new page h1', async () => {
    const router = renderRoutes();
    await act(async () => {
      await router.navigate('/b');
    });
    act(() => vi.advanceTimersByTime(100));
    expect(document.activeElement).toBe(document.querySelector('h1'));
    expect(document.activeElement).toHaveTextContent('B');
  });
});
