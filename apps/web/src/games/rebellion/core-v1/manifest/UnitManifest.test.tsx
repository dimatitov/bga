import { CORE_REGION_IDS, CORE_SYSTEM_IDS } from '@bga/game-rebellion/schema';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { useSelectionStore } from '../../board/model/selectionStore';
import {
  CS_ALDERAAN,
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_SULLUST,
  CS_YAVIN,
  empireRedactedView,
  L_DODONNA,
  L_LEIA,
  makeCoreActivationView,
  makeCoreView,
  U_SD,
  U_ST1,
  U_XWING,
  withUnits,
} from '../../test/coreFixtures';
import { type ManifestRequest, useCoreUiStore } from '../model/coreUiStore';
import { renderCore, resetCoreStores } from '../panels/test/harness';
import { UnitInspector } from './UnitInspector';
import { UnitManifest } from './UnitManifest';

beforeEach(resetCoreStores);

const sys = (systemId: string, group: ManifestRequest['group'] = null): ManifestRequest => ({
  target: { kind: 'system', systemId },
  group,
});
const ZONE: ManifestRequest = { target: { kind: 'zone' }, group: null };

function renderManifest(view = makeCoreView(), request = sys(CS_CORUSCANT), onClose = vi.fn()) {
  const utils = renderCore(
    <UnitManifest request={request} variant="rail" onClose={onClose} />,
    view,
  );
  return { ...utils, onClose, root: screen.getByTestId('unit-manifest') };
}

describe('UnitManifest — states (SWR-009 MF, AC-7)', () => {
  it('fleetGround (Coruscant): name, region, faction chip, groups with «type × N» rows, total', () => {
    const { root } = renderManifest();
    expect(root).toHaveAttribute('data-system-id', CS_CORUSCANT);
    expect(root).not.toHaveAttribute('data-zone');
    expect(root).toHaveAttribute('data-state', 'fleetGround');
    expect(root).toHaveAttribute('data-restricted', 'false');
    expect(root).toHaveAttribute('data-total', '4');
    expect(root).toHaveAttribute('data-variant', 'rail');
    expect(root).toHaveAccessibleName(i18n.t('rebellion.data:systems.coruscant'));
    expect(root).toHaveTextContent(i18n.t('rebellion.data:systems.coruscant'));
    expect(within(root).getByText('Империя')).toHaveAttribute('data-faction', 'empire');

    const fleet = screen.getByTestId('unit-manifest-group-empire-space');
    expect(fleet).toHaveAttribute('data-count', '2');
    expect(fleet).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('unit-manifest-group-empire-ground')).toHaveAttribute(
      'data-count',
      '2',
    );
    const row = screen.getByTestId('unit-manifest-row-empire-unit.empire.stormtrooper');
    expect(row).toHaveAttribute('data-count', '2');
    expect(row).toHaveTextContent('Штурмовик × 2');
    expect(
      screen.getByTestId('unit-manifest-row-empire-unit.empire.star-destroyer'),
    ).toHaveTextContent('Звёздный разрушитель × 1');
    expect(screen.getByTestId('unit-manifest-total')).toHaveTextContent('4');
  });

  it('fix 1: region line is the region name alone (no «Регион:» prefix); the group list scrolls inside', () => {
    const { root } = renderManifest();
    const region = i18n.t('rebellion.data:regions.r1');
    expect(within(root).getByText(`· ${region}`)).toBeInTheDocument();
    // Fix 2: the rail header is compact — name, region and faction chip share one row.
    const nameRow = within(root).getByRole('heading', {
      name: i18n.t('rebellion.data:systems.coruscant'),
    }).parentElement?.parentElement;
    expect(nameRow).toContainElement(within(root).getByText('Империя'));
    expect(nameRow).toHaveTextContent(region);
    expect(root.textContent).not.toMatch(/Регион:|Region:/);
    expect(root).toHaveStyle({ overflow: 'hidden', maxHeight: '100%' });
    expect(screen.getByTestId('unit-manifest-body')).toHaveStyle({
      overflowY: 'auto',
      minHeight: '0px',
    });
  });

  it('fleet: one group; both: groups of both sides and both chips', () => {
    const base = makeCoreView();
    const one = withUnits(base, [
      {
        ...base.units.find((u) => u.id === U_SD)!,
        location: { kind: 'system', systemId: CS_ALDERAAN },
      },
    ]);
    const { unmount } = renderManifest(one, sys(CS_ALDERAAN));
    expect(screen.getByTestId('unit-manifest')).toHaveAttribute('data-state', 'fleet');
    expect(screen.getByTestId('unit-manifest')).toHaveAttribute('data-arenas', 'space');
    expect(screen.getAllByTestId(/^unit-manifest-group-/)).toHaveLength(1);
    unmount();

    const both = withUnits(
      base,
      base.units.map((u) =>
        u.id === U_XWING
          ? { ...u, location: { kind: 'system' as const, systemId: CS_CORUSCANT } }
          : u,
      ),
    );
    renderManifest(both, sys(CS_CORUSCANT));
    const root = screen.getByTestId('unit-manifest');
    expect(root).toHaveAttribute('data-state', 'both');
    expect(screen.getByTestId('unit-manifest-group-rebels-space')).toHaveAttribute(
      'data-count',
      '1',
    );
    expect(root.querySelectorAll('[data-faction]')).toHaveLength(2);
  });

  it('leader: the leader line, total 0; empty: «no markers · visible units: 0», name still visible', () => {
    const { unmount } = renderManifest(makeCoreActivationView(), sys(CS_CORELLIA));
    expect(screen.getByTestId('unit-manifest')).toHaveAttribute('data-state', 'leader');
    expect(screen.getByTestId(`unit-manifest-leader-${L_LEIA}`)).toHaveTextContent('Лея');
    expect(screen.getByTestId('unit-manifest-total')).toHaveTextContent('0');
    unmount();

    renderManifest(makeCoreView(), sys(CS_CORELLIA));
    const root = screen.getByTestId('unit-manifest');
    expect(root).toHaveAttribute('data-state', 'empty');
    expect(root).toHaveTextContent(i18n.t('rebellion.manifest:empty'));
    expect(root).toHaveTextContent(i18n.t('rebellion.data:systems.corellia'));
    expect(screen.queryAllByTestId(/^unit-manifest-group-/)).toHaveLength(0);
  });

  it('base badge only when the server shows the base (Rebels at Yavin)', () => {
    renderManifest(makeCoreView(), sys(CS_YAVIN));
    expect(screen.getByTestId('unit-manifest')).toHaveTextContent(
      i18n.t('rebellion.manifest:base'),
    );
  });

  it('selected group: amber edge (data-selected) on exactly the requested group', () => {
    renderManifest(makeCoreView(), sys(CS_CORUSCANT, { owner: 'empire', arena: 'ground' }));
    const ground = screen.getByTestId('unit-manifest-group-empire-ground');
    expect(ground).toHaveAttribute('data-selected', 'true');
    expect(ground).toHaveStyle({ borderLeftWidth: '3px', borderLeftStyle: 'solid' });
    expect(screen.getByTestId('unit-manifest-group-empire-space')).toHaveAttribute(
      'data-selected',
      'false',
    );
  });

  it('plural of units: ru 1 единица / 2 единицы / 5 единиц; en 1 unit / 2 units', async () => {
    const base = makeCoreView();
    const st = base.units.find((u) => u.id === U_ST1)!;
    const five = withUnits(base, [
      ...base.units,
      ...[1, 2, 3].map((n) => ({ ...st, id: `extra-${n}` })),
    ]);
    const { unmount } = renderManifest(five, sys(CS_CORUSCANT));
    expect(screen.getByTestId('unit-manifest-group-empire-ground')).toHaveTextContent('5 единиц');
    expect(screen.getByTestId('unit-manifest-group-empire-space')).toHaveTextContent('2 единицы');
    unmount();
    // Sullust: one transport → «1 единица».
    renderManifest(makeCoreView(), sys(CS_SULLUST));
    expect(screen.getByTestId('unit-manifest-group-rebels-space')).toHaveTextContent('1 единица');
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(screen.getByTestId('unit-manifest-group-rebels-space')).toHaveTextContent('1 unit'),
    );
    expect(screen.getByTestId('unit-manifest')).not.toHaveTextContent(/[А-Яа-яЁё]/);
  });

  it('en plural: 2 units', async () => {
    renderManifest();
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(screen.getByTestId('unit-manifest-group-empire-space')).toHaveTextContent('2 units'),
    );
  });

  it('Close calls onClose', async () => {
    const { user, onClose } = renderManifest();
    await user.click(screen.getByTestId('unit-manifest-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('UnitManifest — restricted zone (AC-8, plan §3.5 (d))', () => {
  /** Every system and region name of the core map in ru and en. */
  function forbiddenNames(): string[] {
    const names: string[] = [];
    for (const lng of ['ru', 'en'] as const) {
      const t = i18n.getFixedT(lng);
      for (const id of CORE_SYSTEM_IDS) names.push(t(`rebellion.data:systems.${id}`));
      for (const id of CORE_REGION_IDS) names.push(t(`rebellion.data:regions.${id}`));
    }
    expect(names).toHaveLength(2 * (32 + 8));
    return names;
  }

  function attributesOf(root: HTMLElement): string {
    return [root, ...root.querySelectorAll('*')]
      .flatMap((el) => [...el.attributes].map((a) => `${a.name}=${a.value}`))
      .join('\n');
  }

  it.each(['ru', 'en'] as const)(
    '%s: zone manifest shows only server units; no system / region name, id or data-system-id',
    async (lng) => {
      const view = empireRedactedView();
      renderManifest(view, ZONE);
      await act(() => i18n.changeLanguage(lng));
      const root = screen.getByTestId('unit-manifest');
      await waitFor(() =>
        expect(root).toHaveTextContent(i18n.getFixedT(lng)('rebellion.manifest:restricted.title')),
      );
      expect(root).toHaveAttribute('data-zone', 'hidden');
      expect(root).not.toHaveAttribute('data-system-id');
      expect(root).toHaveAttribute('data-restricted', 'true');
      expect(root).toHaveAttribute('data-state', 'restricted');
      expect(root).toHaveAttribute('data-total', '3');
      expect(root).toHaveTextContent(i18n.t('rebellion.manifest:restricted.title'));
      expect(screen.getByTestId(`unit-manifest-leader-${L_DODONNA}`)).toBeInTheDocument();
      expect(root.querySelector('[data-system-id]')).toBeNull();

      const text = root.textContent ?? '';
      const attrs = attributesOf(root);
      for (const name of forbiddenNames()) {
        expect(text, name).not.toContain(name);
        expect(attrs, name).not.toContain(name);
      }
      for (const s of view.map.systems)
        expect(attrs, s.id).not.toMatch(new RegExp(`\\b${s.id}\\b`));
      for (const r of view.map.regions) expect(attrs, r.id).not.toMatch(new RegExp(`=${r.id}\\b`));
    },
  );
});

describe('UnitInspector — manifest vs context panel, Close returns focus (AC-7)', () => {
  it('manifest only when it matches the selection; Close → context panel and focus on the invoking marker', async () => {
    const { user } = renderCore(<UnitInspector />, makeCoreView());
    expect(screen.getByTestId('core-context-panel')).toBeInTheDocument();
    useSelectionStore.getState().selectSystem(CS_CORUSCANT);
    const marker = await screen.findByTestId(`map-marker-${CS_CORUSCANT}-empire-ground`);
    await user.click(marker);
    const root = await screen.findByTestId('unit-manifest');
    expect(screen.queryByTestId('core-context-panel')).toBeNull();
    expect(screen.getByTestId('unit-manifest-group-empire-ground')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(document.activeElement).toBe(root);

    await user.click(screen.getByTestId('unit-manifest-close'));
    expect(useCoreUiStore.getState().manifest).toBeNull();
    expect(screen.queryByTestId('unit-manifest')).toBeNull();
    expect(screen.getByTestId('system-panel')).toHaveAttribute('data-system-id', CS_CORUSCANT);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByTestId(`map-marker-${CS_CORUSCANT}-empire-ground`),
      ),
    );
  });

  it('opened from the map (no marker): Close focuses the system panel', async () => {
    const { user } = renderCore(<UnitInspector />, makeCoreView());
    useSelectionStore.getState().selectSystem(CS_SULLUST);
    useCoreUiStore.getState().openManifest({ kind: 'system', systemId: CS_SULLUST });
    await user.click(await screen.findByTestId('unit-manifest-close'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('system-panel')));
  });

  it('a different selection shows the context panel (manifest of another system is not shown)', async () => {
    renderCore(<UnitInspector />, makeCoreView());
    useSelectionStore.getState().selectSystem(CS_SULLUST);
    useCoreUiStore.getState().openManifest({ kind: 'system', systemId: CS_CORUSCANT });
    expect(await screen.findByTestId('system-panel')).toHaveAttribute('data-system-id', CS_SULLUST);
    expect(screen.queryByTestId('unit-manifest')).toBeNull();
  });

  it('zone markers open the restricted manifest (Empire before the reveal)', async () => {
    const { user } = renderCore(<UnitInspector />, empireRedactedView());
    useSelectionStore.getState().selectZone();
    const panel = await screen.findByTestId('hidden-zone-panel');
    expect(panel).toHaveAttribute('data-count', '4');
    expect(screen.getByTestId('map-marker-zone-rebels-space')).toHaveAttribute('data-count', '1');
    expect(screen.getByTestId('map-marker-zone-rebels-ground')).toHaveAttribute('data-count', '2');
    await user.click(screen.getByTestId('map-marker-zone-rebels-ground'));
    const root = await screen.findByTestId('unit-manifest');
    expect(root).toHaveAttribute('data-zone', 'hidden');
    expect(screen.getByTestId('unit-manifest-group-rebels-ground')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });
});
