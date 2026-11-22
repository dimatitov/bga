import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSelectionStore } from '../../board/model/selectionStore';
import { CS_CORUSCANT, makeCoreView } from '../../test/coreFixtures';
import { useCoreUiStore } from '../model/coreUiStore';
import { renderCore, resetCoreStores } from '../panels/test/harness';
import { SHEET_COLLAPSED_PX, SHEET_OPEN_HEIGHT } from './ManifestSheet';
import { SHEET_QUERY, UnitInspector } from './UnitInspector';

/** jsdom has no layout: emulate the viewport width for `matchMedia` (min/max-width queries only). */
function stubViewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const matches =
      (max === null || width <= Number(max[1])) && (min === null || width >= Number(min[1]));
    return {
      matches: (max !== null || min !== null) && matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  });
}

beforeEach(resetCoreStores);

describe('ManifestSheet — bottom sheet below 760 px (SWR-009 MF, AC-13)', () => {
  it('the query is «< 760 px»', () => {
    expect(SHEET_QUERY).toBe('(max-width:759.95px)');
  });

  it('375 px: variant sheet, fixed at the bottom, toggle 48 px with aria-expanded; context panel stays in the rail', async () => {
    stubViewport(375);
    const { user } = renderCore(<UnitInspector />, makeCoreView());
    useSelectionStore.getState().selectSystem(CS_CORUSCANT);
    await user.click(await screen.findByTestId(`map-marker-${CS_CORUSCANT}-empire-space`));

    const manifest = await screen.findByTestId('unit-manifest');
    expect(manifest).toHaveAttribute('data-variant', 'sheet');
    const sheet = screen.getByTestId('unit-manifest-sheet');
    expect(sheet).toHaveStyle({ position: 'fixed', bottom: '0px' });
    // jsdom drops `min()` values; the constant is what the sheet uses when open.
    expect(SHEET_OPEN_HEIGHT).toBe('min(70vh, 620px)');
    expect(sheet).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('core-context-panel')).toBeInTheDocument();
    // The invoking marker keeps the focus (sheet is not modal) and shows the pressed state.
    const marker = screen.getByTestId(`map-marker-${CS_CORUSCANT}-empire-space`);
    expect(marker).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(marker);

    const toggle = screen.getByTestId('unit-manifest-sheet-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveStyle({ height: '48px' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(sheet).toHaveStyle({ height: `${SHEET_COLLAPSED_PX}px` });
    expect(screen.queryByTestId('unit-manifest-close')).not.toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('unit-manifest-close')).toBeVisible();
  });

  it('Esc inside the sheet closes the manifest and returns the focus to the marker', async () => {
    stubViewport(375);
    const { user } = renderCore(<UnitInspector />, makeCoreView());
    useSelectionStore.getState().selectSystem(CS_CORUSCANT);
    await user.click(await screen.findByTestId(`map-marker-${CS_CORUSCANT}-empire-ground`));
    await user.click(await screen.findByTestId('unit-manifest-sheet-toggle'));
    await user.keyboard('{Escape}');
    expect(useCoreUiStore.getState().manifest).toBeNull();
    expect(screen.queryByTestId('unit-manifest-sheet')).toBeNull();
    // The selection stays (Esc did not reach the table handler).
    expect(useSelectionStore.getState().selection).toEqual({
      kind: 'system',
      systemId: CS_CORUSCANT,
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByTestId(`map-marker-${CS_CORUSCANT}-empire-ground`),
      ),
    );
  });

  it('≥ 760 px: the manifest replaces the context panel in the rail (variant rail, no sheet)', async () => {
    stubViewport(1024);
    renderCore(<UnitInspector />, makeCoreView());
    useSelectionStore.getState().selectSystem(CS_CORUSCANT);
    useCoreUiStore.getState().openManifest({ kind: 'system', systemId: CS_CORUSCANT });
    expect(await screen.findByTestId('unit-manifest')).toHaveAttribute('data-variant', 'rail');
    expect(screen.queryByTestId('unit-manifest-sheet')).toBeNull();
    expect(screen.queryByTestId('core-context-panel')).toBeNull();
  });
});
