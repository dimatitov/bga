import { beforeEach, describe, expect, it } from 'vitest';
import {
  CS_YAVIN,
  L_LEIA,
  L_RIEEKAN,
  makeCoreActivationView,
  makeCoreEmpireView,
  makeCoreView,
  U_SD,
} from '../../test/coreFixtures';
import { useCoreUiStore } from '../../core-v1/model/coreUiStore';
import { makeView, P_E1, S_A } from '../test/fixtures';
import { useDragStore } from './dragStore';
import { resetBoardState } from './resetBoardState';
import { NO_SELECTION, useSelectionStore } from './selectionStore';

const sel = () => useSelectionStore.getState();

beforeEach(() => {
  useSelectionStore.setState({ gameId: null, selection: NO_SELECTION, sidebarTab: 'log' });
  useCoreUiStore.getState().reset();
});

describe('selectionStore — core-v1 kinds (SWR-005 plan-frontend §3.2)', () => {
  it('selects a leader and the hidden zone; repeated selection is a no-op', () => {
    sel().selectLeader(L_LEIA);
    expect(sel().selection).toEqual({ kind: 'leader', leaderId: L_LEIA });
    const before = sel().selection;
    sel().selectLeader(L_LEIA);
    expect(sel().selection).toBe(before);
    sel().selectZone();
    expect(sel().selection).toEqual({ kind: 'zone' });
    const zone = sel().selection;
    sel().selectZone();
    expect(sel().selection).toBe(zone);
  });

  it('reconciles system / unit / leader against a core view', () => {
    const view = makeCoreView();
    sel().selectSystem(CS_YAVIN);
    sel().reconcile(view);
    expect(sel().selection).toEqual({ kind: 'system', systemId: CS_YAVIN });
    sel().selectPiece(U_SD);
    sel().reconcile(view);
    expect(sel().selection).toEqual({ kind: 'piece', pieceId: U_SD });
    sel().reconcile(makeCoreView({ units: [] }));
    expect(sel().selection).toBe(NO_SELECTION);
    sel().selectLeader(L_LEIA);
    sel().reconcile(makeCoreActivationView());
    expect(sel().selection).toEqual({ kind: 'leader', leaderId: L_LEIA });
    sel().reconcile(makeCoreView({ leaders: [] }));
    expect(sel().selection).toBe(NO_SELECTION);
    sel().selectSystem('gone');
    sel().reconcile(view);
    expect(sel().selection).toBe(NO_SELECTION);
  });

  it('the zone survives only while the server hides the base', () => {
    sel().selectZone();
    sel().reconcile(makeCoreEmpireView());
    expect(sel().selection).toEqual({ kind: 'zone' });
    sel().reconcile(makeCoreEmpireView({ rebelBase: { systemId: CS_YAVIN, revealed: true } }));
    expect(sel().selection).toBe(NO_SELECTION);
  });

  it('mock views: leader / zone selections do not exist there; system / piece unchanged', () => {
    const view = makeView();
    sel().selectPiece(P_E1);
    sel().reconcile(view);
    expect(sel().selection).toEqual({ kind: 'piece', pieceId: P_E1 });
    sel().selectSystem(S_A);
    sel().reconcile(view);
    expect(sel().selection).toEqual({ kind: 'system', systemId: S_A });
    sel().selectLeader(L_RIEEKAN);
    sel().reconcile(view);
    expect(sel().selection).toBe(NO_SELECTION);
    sel().selectZone();
    sel().reconcile(view);
    expect(sel().selection).toBe(NO_SELECTION);
  });
});

describe('resetBoardState — also clears the core turn flow', () => {
  it('selection, active game, drag and coreUiStore are reset', () => {
    sel().activateGame('s-1');
    sel().selectLeader(L_LEIA);
    useCoreUiStore.getState().arm(L_LEIA);
    useCoreUiStore.getState().setDraft(CS_YAVIN, [U_SD]);
    resetBoardState('s-1');
    expect(sel().gameId).toBeNull();
    expect(sel().selection).toBe(NO_SELECTION);
    expect(useDragStore.getState().drag).toBeNull();
    expect(useCoreUiStore.getState()).toMatchObject({ armedLeaderId: null, moveDraft: {} });
  });
});
