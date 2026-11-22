/**
 * SWR-005 Worker M — `<CoreBoardStage/>` DOM shell (jsdom has no layout: the Konva stage itself is covered by the
 * pure scene/label tests, `MapLayers.test.tsx` and by e2e). Checks the container contract and the machine-readable
 * map mirror (Q-37).
 * SWR-009 M — `<MapHousing/>` (AC-9, TC-CON-03, TC-MAP-05): display header with the real counters and zoom, CRT
 * screen with scanlines (no pointer events), permanent legend + zoom keys in the bottom bar; mirror attributes
 * `data-markers` / `data-ai-recent` (§5.4) — never the base system for the Empire (AC-8).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SessionAutomationState, SessionAutomationContext } from '@/platform';
import { i18n } from '@/shared/i18n';
import { useSettingsStore } from '@/shared/settings';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { useGlobalEscape } from '../../board/hooks/useBoardKeyboard';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useViewportStore } from '../../board/model/viewportStore';
import {
  CORE_SESSION_ID,
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_HOTH,
  CS_SULLUST,
  CS_YAVIN,
  aiRunEventsRedacted,
  empireRedactedView,
  makeCoreEmpireView,
  makeCoreView,
  makeSessionAutomationState,
  withLastRun,
} from '../../test/coreFixtures';
import { CoreBoardContext } from '../model/coreContext';
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { CoreBoardStage } from './CoreBoardStage';
import { MapHousing } from './MapHousing';

function GlobalEscape() {
  useGlobalEscape();
  return null;
}

function renderStage(
  view: PlayerViewCore,
  {
    housing = false,
    automation = null,
    globalEscape = false,
  }: {
    housing?: boolean;
    automation?: SessionAutomationState | null;
    /** Mounts the table's global Esc handler (`useGlobalEscape`) next to the stage. */
    globalEscape?: boolean;
  } = {},
) {
  return renderWithProviders({
    element: (
      <SessionAutomationContext.Provider value={automation}>
        <CoreBoardContext.Provider
          value={{ sessionId: CORE_SESSION_ID, view, send: vi.fn(), isPending: false }}
        >
          {globalEscape && <GlobalEscape />}
          {housing ? (
            <MapHousing overlay={<div data-testid="overlay-probe" />} />
          ) : (
            <CoreBoardStage />
          )}
        </CoreBoardContext.Provider>
      </SessionAutomationContext.Provider>
    ),
  });
}

beforeEach(() => {
  useViewportStore.setState({ gameId: null, byGame: {}, byGameSize: {}, bounds: null });
});

describe('CoreBoardStage', () => {
  it('renders the labelled, focusable board-canvas region and the caption', () => {
    renderStage(makeCoreView());
    const canvas = screen.getByTestId('board-canvas');
    expect(canvas).toHaveAttribute('role', 'region');
    expect(canvas).toHaveAttribute('tabindex', '0');
    expect(canvas).toHaveAttribute('data-rules-engine', 'core-v1');
    expect(canvas).toHaveAccessibleName(/.+/);
    expect(screen.getByTestId('map-caption')).toHaveAttribute('data-variant', 'core-v1');
    // zoom keys moved to the housing bar (SWR-009 §4)
    expect(screen.queryByTestId('zoom-fit')).toBeNull();
  });

  it('marks the visible rebel base and contested systems in the map mirror', () => {
    renderStage(makeCoreView({ contestedSystemIds: [CS_CORELLIA] }));
    expect(screen.getByTestId(`map-system-${CS_YAVIN}`)).toHaveAttribute('data-rebel-base', 'true');
    expect(screen.getByTestId(`map-system-${CS_CORELLIA}`)).toHaveAttribute(
      'data-contested',
      'true',
    );
    expect(screen.getByTestId(`map-system-${CS_YAVIN}`)).toHaveAttribute('data-remote', 'true');
    expect(screen.queryByTestId('map-hidden-zone')).toBeNull();
  });

  it('mirrors the group counters per system (data-markers) — the COUNT oracle', () => {
    renderStage(makeCoreView());
    expect(screen.getByTestId(`map-system-${CS_CORUSCANT}`)).toHaveAttribute(
      'data-markers',
      'empire:space:2,empire:ground:2',
    );
    expect(screen.getByTestId(`map-system-${CS_YAVIN}`)).toHaveAttribute(
      'data-markers',
      'rebels:space:1,rebels:ground:2',
    );
    expect(screen.getByTestId(`map-system-${CS_HOTH}`)).toHaveAttribute('data-markers', '');
    expect(screen.getByTestId(`map-system-${CS_HOTH}`)).toHaveAttribute('data-ai-recent', 'false');
  });

  it('Empire before the reveal: no base marker anywhere, the hidden zone instead', () => {
    renderStage(makeCoreEmpireView());
    expect(document.querySelector('[data-rebel-base]')).toBeNull();
    const zone = screen.getByTestId('map-hidden-zone');
    expect(zone).toHaveAttribute('data-count', '3');
    expect(zone).toHaveAttribute('data-markers', 'rebels:space:1,rebels:ground:2');
    expect(screen.getByTestId(`map-system-${CS_YAVIN}`)).toHaveAttribute('data-markers', '');
  });

  it('AI marks from the redacted last run: systems + the zone, never the base system (AC-8, AC-11)', () => {
    const view = empireRedactedView();
    renderStage(view, {
      automation: makeSessionAutomationState({ lastRun: withLastRun(aiRunEventsRedacted()) }),
    });
    const marked = [...document.querySelectorAll('[data-testid^="map-system-"]')]
      .filter((el) => el.getAttribute('data-ai-recent') === 'true')
      .map((el) => el.getAttribute('data-testid'));
    expect(marked).toEqual([`map-system-${CS_SULLUST}`, `map-system-${CS_HOTH}`]);
    expect(screen.getByTestId(`map-system-${CS_YAVIN}`)).toHaveAttribute('data-ai-recent', 'false');
    expect(screen.getByTestId('map-hidden-zone')).toHaveAttribute('data-ai-recent', 'true');
    // the zone mirror names no system
    const zone = screen.getByTestId('map-hidden-zone');
    expect(zone.getAttributeNames().join(' ')).not.toMatch(/system/);
  });

  it('no automation (hot seat / outside SessionHost): no AI marks', () => {
    renderStage(makeCoreView());
    expect(document.querySelector('[data-ai-recent="true"]')).toBeNull();
  });

  it('activates the session in the shared viewport store and sets content bounds with label insets', () => {
    renderStage(makeCoreView());
    const s = useViewportStore.getState();
    expect(s.gameId).toBe(CORE_SESSION_ID);
    expect(s.bounds).not.toBeNull();
    expect(s.contentInsets.left).toBeGreaterThan(0);
  });
});

describe('MapHousing', () => {
  it('display header: real counters of view.map, the count key, the LOD and zoom of the viewport', () => {
    renderStage(makeCoreView(), { housing: true });
    const header = screen.getByTestId('map-display-header');
    // fixture map: 6 systems, 5 undirected routes, 2 regions — numbers come from the view, not literals
    expect(header).toHaveAttribute('data-systems', '6');
    expect(header).toHaveAttribute('data-routes', '5');
    expect(header).toHaveAttribute('data-regions', '2');
    expect(header).toHaveTextContent('6 систем');
    expect(header).toHaveTextContent('5 связей');
    expect(header).toHaveTextContent(/Число = фигуры в группе/i);
    const zoom = Number(header.getAttribute('data-zoom'));
    expect(zoom).toBe(Math.round(useViewportStore.getState().viewport.scale * 100));
    expect(header).toHaveTextContent(`${zoom}%`);
  });

  it('screen: board-canvas + overlay + decorative scanlines without pointer events; bar: legend + zoom keys', () => {
    renderStage(makeCoreView(), { housing: true });
    const housing = screen.getByTestId('map-housing');
    const screenEl = within(housing).getByTestId('map-screen');
    expect(within(screenEl).getByTestId('board-canvas')).toBeInTheDocument();
    expect(within(screenEl).getByTestId('overlay-probe')).toBeInTheDocument();
    const scan = screenEl.querySelector('[data-decorative="scanlines"]')!;
    expect(scan).toHaveAttribute('aria-hidden', 'true');
    expect(getComputedStyle(scan).pointerEvents).toBe('none');
    const bar = within(housing).getByTestId('map-housing-bar');
    expect(within(bar).getByTestId('map-legend')).toBeInTheDocument();
    for (const id of ['zoom-in', 'zoom-out', 'zoom-fit', 'zoom-level']) {
      expect(within(bar).getByTestId(id)).toBeInTheDocument();
    }
    expect(within(bar).getByTestId('zoom-in')).toHaveAccessibleName(/.+/);
    // no raster anywhere in the housing (AC-2, TC-ST-05 DOM part)
    expect(housing.querySelector('img')).toBeNull();
  });

  it('en: plural counters', async () => {
    useSettingsStore.getState().setLanguage('en');
    try {
      renderStage(makeCoreView(), { housing: true });
      const header = screen.getByTestId('map-display-header');
      await waitFor(() => expect(header).toHaveTextContent('6 systems'));
      expect(header).toHaveTextContent('5 routes');
    } finally {
      useSettingsStore.getState().setLanguage('ru');
      await i18n.changeLanguage('ru');
    }
  });

  it('legend (fix round 1): one row of essential keys + «Легенда» toggle; the full list mounted, hidden until opened', () => {
    renderStage(makeCoreView(), { housing: true });
    const legend = screen.getByTestId('map-legend');
    expect(legend).toHaveAccessibleName('Легенда карты');
    for (const item of ['empire', 'rebels', 'ground', 'leader', 'target', 'selected', 'aiRecent']) {
      expect(within(legend).getByTestId(`map-legend-key-${item}`)).toBeVisible();
    }
    const full = within(legend).getByTestId('map-legend-full');
    const toggle = within(legend).getByTestId('map-legend-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', full.id);
    expect(full).not.toBeVisible();
    expect(within(full).getAllByTestId(/^map-legend-(?!key-)/)).toHaveLength(18);
  });

  it('legend Esc (review R-1): real keyboard Esc closes the open panel, focus stays on the toggle, selection kept', async () => {
    const user = userEvent.setup();
    useSelectionStore.getState().selectSystem(CS_CORUSCANT);
    renderStage(makeCoreView(), { housing: true, globalEscape: true });
    const legend = screen.getByTestId('map-legend');
    const toggle = within(legend).getByTestId('map-legend-toggle');
    const full = within(legend).getByTestId('map-legend-full');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(full).toBeVisible();
    expect(within(full).getByTestId('map-legend-remote')).toHaveTextContent(/Удалённая/);
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(full).not.toBeVisible();
    expect(toggle).toHaveFocus();
    expect(useSelectionStore.getState().selection).toEqual({
      kind: 'system',
      systemId: CS_CORUSCANT,
    });
    // closed legend: Esc is the global one again (clears the selection)
    await user.keyboard('{Escape}');
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
  });

  it('mirror marks captions culled at low zoom (data-label)', () => {
    renderStage(makeCoreView());
    for (const el of document.querySelectorAll('[data-testid^="map-system-"]')) {
      expect(['shown', 'hidden']).toContain(el.getAttribute('data-label'));
    }
  });
});
