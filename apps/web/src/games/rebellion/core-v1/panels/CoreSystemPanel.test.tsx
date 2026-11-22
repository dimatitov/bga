import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { useSelectionStore } from '../../board/model/selectionStore';
import {
  CORE_SYSTEM_IDS_FIXTURE,
  CS_CORUSCANT,
  CS_SULLUST,
  CS_YAVIN,
  empireRedactedView,
  L_LEIA,
  makeCoreActivationView,
  makeCoreView,
} from '../../test/coreFixtures';
import { UnitInspector } from '../manifest/UnitInspector';
import { useCoreUiStore } from '../model/coreUiStore';
import { forcesBySystem } from '../model/forces';
import { CoreSystemPanel } from './CoreSystemPanel';
import { renderCore, resetCoreStores } from './test/harness';

beforeEach(resetCoreStores);

describe('CoreSystemPanel — inspector + DOM group markers (SWR-009 MF, AC-6, QD-2, QD-5)', () => {
  it.each([
    ['Rebels view', makeCoreView()],
    ['Empire redacted view', empireRedactedView()],
    ['activation view', makeCoreActivationView()],
  ])(
    '%s: markers of every system = forcesBySystem oracle (testid, data-count, glyph)',
    (_, view) => {
      const oracle = forcesBySystem(view);
      for (const systemId of CORE_SYSTEM_IDS_FIXTURE) {
        const { unmount } = renderCore(<CoreSystemPanel systemId={systemId} />, view);
        const groups = oracle.get(systemId)?.groups ?? [];
        const markers = screen.queryAllByTestId(/^map-marker-/);
        expect(
          markers.map((m) => [m.dataset.testid, m.dataset.count]),
          systemId,
        ).toEqual(
          groups.map((g) => [`map-marker-${systemId}-${g.owner}-${g.arena}`, String(g.count)]),
        );
        for (const m of markers) {
          expect(m).toHaveAttribute('aria-pressed', 'false');
          expect(m).toHaveAccessibleName();
          expect(m.querySelector('svg[data-shape]')).toHaveAttribute(
            'data-shape',
            m.dataset.arena === 'space' ? 'triangle' : 'square',
          );
        }
        unmount();
      }
    },
  );

  it('inspector look: system name (amber heading), region, words for remote / base', () => {
    renderCore(<CoreSystemPanel systemId={CS_YAVIN} />, makeCoreView());
    const panel = screen.getByTestId('system-panel');
    expect(panel).toHaveAttribute('data-system-id', CS_YAVIN);
    expect(
      screen.getByRole('heading', { name: i18n.t('rebellion.data:systems.yavin') }),
    ).toBeVisible();
    expect(panel).toHaveTextContent(i18n.t('rebellion.turn:context.remote'));
    expect(panel).toHaveTextContent(i18n.t('rebellion.turn:context.rebelBase'));
    // Fix 1: the region name already says «регион …» — no «Регион:» prefix.
    expect(screen.getByText(i18n.t('rebellion.data:regions.r2'))).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/Регион:/);
  });

  it('Empire redacted view: the base system has no base badge and no markers of the zone units', () => {
    renderCore(<CoreSystemPanel systemId={CS_YAVIN} />, empireRedactedView());
    const panel = screen.getByTestId('system-panel');
    expect(panel).not.toHaveTextContent(i18n.t('rebellion.turn:context.rebelBase'));
    expect(screen.queryAllByTestId(/^map-marker-/)).toHaveLength(0);
    expect(panel).toHaveTextContent(i18n.t('rebellion.turn:context.noUnits'));
  });

  it('Tab to a marker + Enter opens the manifest of the system with its group selected (QD-2)', async () => {
    const { user } = renderCore(<UnitInspector />, makeCoreView());
    useSelectionStore.getState().selectSystem(CS_SULLUST);
    const marker = await screen.findByTestId(`map-marker-${CS_SULLUST}-rebels-ground`);
    marker.focus();
    await user.keyboard('{Enter}');
    const manifest = await screen.findByTestId('unit-manifest');
    expect(manifest).toHaveAttribute('data-system-id', CS_SULLUST);
    expect(useCoreUiStore.getState().manifest).toEqual({
      target: { kind: 'system', systemId: CS_SULLUST },
      group: { owner: 'rebels', arena: 'ground' },
    });
    expect(screen.getByTestId('unit-manifest-group-rebels-ground')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('QD-5: with an armed leader a marker does not open the manifest; the activation key stays', async () => {
    const { user } = renderCore(<UnitInspector />, makeCoreView());
    useCoreUiStore.getState().arm(L_LEIA);
    useSelectionStore.getState().selectSystem(CS_CORUSCANT);
    const marker = await screen.findByTestId(`map-marker-${CS_CORUSCANT}-empire-space`);
    expect(marker.getAttribute('aria-label')).not.toMatch(/манифест/i);
    await user.click(marker);
    expect(useCoreUiStore.getState().manifest).toBeNull();
    expect(screen.queryByTestId('unit-manifest')).toBeNull();
    expect(useSelectionStore.getState().selection).toEqual({
      kind: 'system',
      systemId: CS_CORUSCANT,
    });
    expect(screen.getByTestId('system-panel-activate')).toBeEnabled();
  });

  it('armed leader + manifest already open: the inspector shows the system panel (activation), not the manifest', async () => {
    renderCore(<UnitInspector />, makeCoreView());
    useSelectionStore.getState().selectSystem(CS_CORUSCANT);
    useCoreUiStore.getState().openManifest({ kind: 'system', systemId: CS_CORUSCANT });
    expect(await screen.findByTestId('unit-manifest')).toBeInTheDocument();
    useCoreUiStore.getState().arm(L_LEIA);
    expect(await screen.findByTestId('system-panel-activate')).toBeInTheDocument();
    expect(screen.queryByTestId('unit-manifest')).toBeNull();
  });
});
