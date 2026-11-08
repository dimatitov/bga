import { beforeEach, describe, expect, it } from 'vitest';
import {
  CS_CORELLIA,
  CS_SULLUST,
  CS_YAVIN,
  L_DODONNA,
  L_LEIA,
  makeCoreActivationView,
  makeCoreView,
  U_RT_BASE,
  U_RT_SULLUST,
  U_TRANSPORT,
  U_XWING,
} from '../../test/coreFixtures';
import { useCoreUiStore } from './coreUiStore';

const store = () => useCoreUiStore.getState();

beforeEach(() => store().reset());

describe('coreUiStore — armed leader (AC-12)', () => {
  it('arm / re-arm / disarm', () => {
    store().arm(L_LEIA);
    expect(store().armedLeaderId).toBe(L_LEIA);
    store().arm(L_DODONNA);
    expect(store().armedLeaderId).toBe(L_DODONNA);
    store().disarm();
    expect(store().armedLeaderId).toBeNull();
    store().disarm();
    expect(store().armedLeaderId).toBeNull();
  });

  it('arming the same leader twice does not notify subscribers', () => {
    store().arm(L_LEIA);
    let calls = 0;
    const unsub = useCoreUiStore.subscribe(() => calls++);
    store().arm(L_LEIA);
    unsub();
    expect(calls).toBe(0);
  });

  it('reconcile keeps a leader the server still lists and drops one it no longer lists', () => {
    store().arm(L_LEIA);
    store().reconcile(makeCoreView());
    expect(store().armedLeaderId).toBe(L_LEIA);
    // Leia activated a system: ACTIVATE_SYSTEM is gone.
    store().reconcile(makeCoreActivationView());
    expect(store().armedLeaderId).toBeNull();
  });
});

describe('coreUiStore — move draft', () => {
  beforeEach(() => store().reconcile(makeCoreActivationView()));

  it('toggle / set / clear one source / clear all', () => {
    store().toggleDraftPiece(CS_SULLUST, U_TRANSPORT);
    store().toggleDraftPiece(CS_SULLUST, U_RT_SULLUST);
    store().toggleDraftPiece(CS_YAVIN, U_XWING);
    expect(store().moveDraft).toEqual({
      [CS_SULLUST]: [U_TRANSPORT, U_RT_SULLUST],
      [CS_YAVIN]: [U_XWING],
    });
    store().toggleDraftPiece(CS_SULLUST, U_TRANSPORT);
    expect(store().moveDraft[CS_SULLUST]).toEqual([U_RT_SULLUST]);
    store().toggleDraftPiece(CS_SULLUST, U_RT_SULLUST);
    expect(CS_SULLUST in store().moveDraft).toBe(false);

    store().setDraft(CS_YAVIN, [U_XWING, U_RT_BASE]);
    expect(store().moveDraft[CS_YAVIN]).toEqual([U_XWING, U_RT_BASE]);
    store().setDraft(CS_SULLUST, [U_TRANSPORT]);
    store().clearDraft(CS_YAVIN);
    expect(store().moveDraft).toEqual({ [CS_SULLUST]: [U_TRANSPORT] });
    store().clearDraft(CS_YAVIN);
    expect(store().moveDraft).toEqual({ [CS_SULLUST]: [U_TRANSPORT] });
    store().setDraft(CS_SULLUST, []);
    expect(store().moveDraft).toEqual({});
    store().setDraft(CS_SULLUST, [U_TRANSPORT]);
    store().clearDraft();
    expect(store().moveDraft).toEqual({});
  });

  it('clearDraft() on an empty draft does not notify subscribers (409 path)', () => {
    let calls = 0;
    const unsub = useCoreUiStore.subscribe(() => calls++);
    store().clearDraft();
    unsub();
    expect(calls).toBe(0);
  });

  it('reconcile with the same activation drops ids the server no longer lists', () => {
    store().setDraft(CS_SULLUST, [U_TRANSPORT, U_RT_SULLUST]);
    store().setDraft(CS_YAVIN, [U_XWING]);
    const after = makeCoreActivationView({
      version: 5,
      legalActions: [
        {
          type: 'MOVE_PIECES',
          fromSystemId: CS_SULLUST,
          toSystemId: CS_CORELLIA,
          pieces: [{ pieceId: U_TRANSPORT, transportCapacity: 4, requiresTransport: false }],
        },
        { type: 'FINISH_ACTIVATION' },
      ],
    });
    store().reconcile(after);
    expect(store().moveDraft).toEqual({ [CS_SULLUST]: [U_TRANSPORT] });
    // Nothing to change → same object.
    const before = store().moveDraft;
    store().reconcile(after);
    expect(store().moveDraft).toBe(before);
  });

  it('reconcile with a different activation (or none) drops the whole draft', () => {
    store().setDraft(CS_SULLUST, [U_TRANSPORT]);
    store().reconcile(makeCoreView());
    expect(store().moveDraft).toEqual({});
    expect(store().draftActivation).toBeNull();
    store().reconcile(makeCoreActivationView());
    expect(store().draftActivation).toBe(`rebels:${L_LEIA}:${CS_CORELLIA}`);
  });
});

describe('coreUiStore — outcome focus and reset', () => {
  it('markOutcomeSeen remembers the version; reset clears everything', () => {
    store().markOutcomeSeen(40);
    store().markOutcomeSeen(40);
    expect(store().lastOutcomeSeen).toBe(40);
    store().arm(L_LEIA);
    store().reconcile(makeCoreActivationView());
    store().setDraft(CS_SULLUST, [U_TRANSPORT]);
    store().reset();
    expect(store()).toMatchObject({
      armedLeaderId: null,
      moveDraft: {},
      draftActivation: null,
      lastOutcomeSeen: null,
    });
  });
});
