import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import type { SessionStatus } from '@bga/platform';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@/shared/test';
import { CORE_SESSION_ID, makeCoreView } from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { mapStats } from '../model/mapStats';
import { ConsoleFooter } from './ConsoleFooter';
import { ConsoleHeader } from './ConsoleHeader';

const BACK = '/games/star-wars-rebellion';

function renderConsole(view: PlayerViewCore, status: SessionStatus = 'prototype') {
  const ctx: CoreBoardContextValue = {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: false,
  };
  return renderWithProviders({
    element: (
      <CoreBoardContext.Provider value={ctx}>
        <ConsoleHeader backHref={BACK} />
        <ConsoleFooter status={status} />
      </CoreBoardContext.Provider>
    ),
  });
}

/** The view with its map cut to the first `n` systems (adjacency to removed systems dropped by `mapStats`). */
function withSystems(view: PlayerViewCore, n: number): PlayerViewCore {
  return { ...view, map: { ...view.map, systems: view.map.systems.slice(0, n) } };
}

describe('ConsoleHeader (SWR-009 C1, AC-9)', () => {
  it('«← К игре» link, brand, the real rules engine of the view, ⚙ settings — in this order', () => {
    const view = makeCoreView();
    renderConsole(view);
    const header = screen.getByTestId('console-header');
    expect(header.tagName).toBe('HEADER');
    expect(header).toHaveAccessibleName('Навигация стола');
    expect(header).toHaveAttribute('data-rules-engine', view.rulesEngine);
    const back = within(header).getByTestId('session-back-to-game');
    expect(back).toHaveAttribute('href', BACK);
    expect(back).toHaveAccessibleName('К игре');
    // QA-1 (AC-14): the key (icon-only below 600 px) is at least 44×44.
    expect(getComputedStyle(back).minWidth).toBe('44px');
    expect(getComputedStyle(back).minHeight).toBe('44px');
    expect(within(header).getByTestId('console-brand')).toHaveTextContent(
      'BGA / GALACTIC OPERATIONS',
    );
    expect(within(header).getByTestId('console-rules-engine')).toHaveTextContent(
      `Правила: ${view.rulesEngine.toUpperCase()}`,
    );
    const settings = within(header).getByTestId('session-settings');
    expect(settings).toHaveAttribute('href', '/settings');
    expect(settings).toHaveAccessibleName('Настройки');
    const order = [
      'session-back-to-game',
      'console-brand',
      'console-rules-engine',
      'session-settings',
    ];
    const els = order.map((id) => within(header).getByTestId(id));
    for (let i = 1; i < els.length; i++) {
      expect(
        els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        order[i],
      ).toBeTruthy();
    }
  });

  it('no mock-up decoration (SECTOR SCAN, DESIGN ITERATION, DEMO)', () => {
    renderConsole(makeCoreView());
    for (const id of ['console-header', 'console-footer']) {
      expect(screen.getByTestId(id).textContent).not.toMatch(/SECTOR SCAN|DESIGN ITERATION|DEMO/i);
    }
  });
});

describe('ConsoleFooter (SWR-009 C1, AC-9, AC-16)', () => {
  it('engine · N систем · M связей from mapStats(view.map) · «правила частичные» badge · autosave note', () => {
    const view = makeCoreView();
    const stats = mapStats(view.map);
    renderConsole(view);
    const footer = screen.getByTestId('console-footer');
    expect(footer).toHaveAttribute('data-systems', String(stats.systems));
    expect(footer).toHaveAttribute('data-routes', String(stats.routes));
    expect(within(footer).getByTestId('console-footer-engine')).toHaveTextContent(
      view.rulesEngine.toUpperCase(),
    );
    expect(within(footer).getByTestId('console-footer-map')).toHaveTextContent(
      i18n.t('rebellion.session:console.systems', { count: stats.systems }),
    );
    expect(within(footer).getByTestId('console-footer-map')).toHaveTextContent(
      i18n.t('rebellion.session:console.routes', { count: stats.routes }),
    );
    const badge = within(footer).getByTestId('prototype-badge');
    expect(badge).toHaveAttribute('data-variant', 'core-v1');
    expect(badge).toHaveAttribute('data-compact', 'true');
    expect(badge).toHaveTextContent('правила частичные');
    // The live save state is the status bar's (PA-2): no `save-status` in the footer.
    expect(within(footer).queryByTestId('save-status')).not.toBeInTheDocument();
    expect(within(footer).getByTestId('console-footer-autosave')).toHaveTextContent(
      'Автосохранение',
    );
  });

  it('the numbers follow the view (no literals): a smaller map → smaller counters', () => {
    const full = makeCoreView();
    const cut = withSystems(full, 3);
    const a = mapStats(full.map);
    const b = mapStats(cut.map);
    expect(b.systems).toBe(3);
    expect(b.systems).toBeLessThan(a.systems);
    const { unmount } = renderConsole(full);
    expect(screen.getByTestId('console-footer')).toHaveAttribute('data-systems', String(a.systems));
    unmount();
    renderConsole(cut);
    const footer = screen.getByTestId('console-footer');
    expect(footer).toHaveAttribute('data-systems', '3');
    expect(footer).toHaveAttribute('data-routes', String(b.routes));
    expect(within(footer).getByTestId('console-footer-map')).toHaveTextContent('3 системы');
  });

  it('ru plurals: 1 система / 5 систем / 21 связь', () => {
    expect(i18n.t('rebellion.session:console.systems', { count: 1 })).toBe('1 система');
    expect(i18n.t('rebellion.session:console.systems', { count: 5 })).toBe('5 систем');
    expect(i18n.t('rebellion.session:console.routes', { count: 21 })).toBe('21 связь');
    expect(i18n.t('rebellion.session:console.routes', { count: 69 })).toBe('69 связей');
  });

  it('active session (not a prototype) → no slice badge', () => {
    renderConsole(makeCoreView(), 'active');
    expect(screen.queryByTestId('prototype-badge')).not.toBeInTheDocument();
  });

  it('en: «Real map · rules partial», «systems», «routes»; no Cyrillic in header and footer', async () => {
    renderConsole(makeCoreView());
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(screen.getByTestId('prototype-badge')).toHaveTextContent('Real map · rules partial'),
    );
    expect(screen.getByTestId('console-footer-map')).toHaveTextContent(/systems · \d+ routes?/);
    for (const id of ['console-header', 'console-footer']) {
      expect(screen.getByTestId(id).textContent).not.toMatch(/[А-Яа-яЁё]/);
    }
  });
});
