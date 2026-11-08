/**
 * SWR-005 Worker M — `<CoreBoardStage/>` DOM shell (jsdom has no layout: the Konva stage itself is covered by the
 * pure scene/label tests and by e2e). Checks the container contract and the machine-readable map mirror (Q-37).
 */
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test/renderWithProviders';
import { useViewportStore } from '../../board/model/viewportStore';
import {
  CORE_SESSION_ID,
  CS_CORELLIA,
  CS_YAVIN,
  makeCoreEmpireView,
  makeCoreView,
} from '../../test/coreFixtures';
import { CoreBoardContext } from '../model/coreContext';
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { CoreBoardStage } from './CoreBoardStage';

function renderStage(view: PlayerViewCore) {
  return renderWithProviders({
    element: (
      <CoreBoardContext.Provider
        value={{ sessionId: CORE_SESSION_ID, view, send: vi.fn(), isPending: false }}
      >
        <CoreBoardStage />
      </CoreBoardContext.Provider>
    ),
  });
}

beforeEach(() => {
  useViewportStore.setState({ gameId: null, byGame: {}, byGameSize: {}, bounds: null });
});

describe('CoreBoardStage', () => {
  it('renders the labelled, focusable board-canvas region with zoom controls and the caption', () => {
    renderStage(makeCoreView());
    const canvas = screen.getByTestId('board-canvas');
    expect(canvas).toHaveAttribute('role', 'region');
    expect(canvas).toHaveAttribute('tabindex', '0');
    expect(canvas).toHaveAttribute('data-rules-engine', 'core-v1');
    expect(canvas).toHaveAccessibleName(/.+/);
    expect(screen.getByTestId('zoom-fit')).toBeInTheDocument();
    expect(screen.getByTestId('map-caption')).toHaveAttribute('data-variant', 'core-v1');
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

  it('Empire before the reveal: no base marker anywhere, the hidden zone instead', () => {
    renderStage(makeCoreEmpireView());
    expect(document.querySelector('[data-rebel-base]')).toBeNull();
    expect(screen.getByTestId('map-hidden-zone')).toHaveAttribute('data-count', '3');
  });

  it('activates the session in the shared viewport store and sets content bounds with label insets', () => {
    renderStage(makeCoreView());
    const s = useViewportStore.getState();
    expect(s.gameId).toBe(CORE_SESSION_ID);
    expect(s.bounds).not.toBeNull();
    expect(s.contentInsets.left).toBeGreaterThan(0);
  });
});
