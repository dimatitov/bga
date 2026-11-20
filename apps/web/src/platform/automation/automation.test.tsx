import { AutomationFallbackCodeSchema } from '@bga/platform';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { createTestQueryClient } from '@/shared/test';
import type { SessionEnvelope } from '../sessions/api';
import { sessionKeys } from '../sessions/queries';
import { makeAutomationSummary, makeCommandOk, makeSessionEnvelope } from '../test/fakeGame';
import {
  consumeAutomationArm,
  noteSessionLoaded,
  promoteLoadArm,
  resetAutomation,
  resetAutomationStore,
  useAutomationStore,
} from './automationStore';
import { commitCommandResult } from './commitCommandResult';
import { automationFallbackReasonText } from './fallbackReason';

beforeEach(() => resetAutomationStore());

describe('automation store (SWR-006 plan-frontend §3.2)', () => {
  it('reset arms one run; consume is atomic (second call false); another session is ignored', () => {
    resetAutomation('s1');
    expect(consumeAutomationArm('s2')).toBe(false);
    expect(consumeAutomationArm('s1')).toBe(true);
    expect(consumeAutomationArm('s1')).toBe(false);
  });

  it('a load arms only when its data reached the cache (noteSessionLoaded → promoteLoadArm)', () => {
    resetAutomation('s1');
    consumeAutomationArm('s1');
    noteSessionLoaded('s1');
    expect(useAutomationStore.getState().autoRunArmed).toBe(false);
    promoteLoadArm('s1');
    expect(useAutomationStore.getState().autoRunArmed).toBe(true);
    noteSessionLoaded('other');
    expect(useAutomationStore.getState().loadArmPending).toBe(false);
  });
});

describe('commitCommandResult (plan-frontend §4.2)', () => {
  it('writes view + automation { pending, strategy } into detail, keeps the rest, invalidates lists', () => {
    const qc = createTestQueryClient();
    qc.setQueryData(sessionKeys.detail('s1'), makeSessionEnvelope({ status: 'active' }));
    qc.setQueryData(sessionKeys.list(), []);
    commitCommandResult(
      qc,
      's1',
      makeCommandOk({
        view: { v: 2 },
        automation: makeAutomationSummary({
          steps: 2,
          strategy: 'openai',
          pending: true,
          stopReason: 'stepLimit',
        }),
      }),
      'command',
    );
    expect(qc.getQueryData<SessionEnvelope>(sessionKeys.detail('s1'))).toEqual(
      makeSessionEnvelope({
        status: 'active',
        view: { v: 2 },
        automation: { pending: true, strategy: 'openai' },
      }),
    );
    expect(qc.getQueryState(sessionKeys.list())?.isInvalidated).toBe(true);
    expect(qc.getQueryState(sessionKeys.detail('s1'))?.isInvalidated).toBe(false);
  });

  it.each(['gameOver', 'conflict'] as const)('stopReason %s → detail invalidated', (stopReason) => {
    const qc = createTestQueryClient();
    qc.setQueryData(sessionKeys.detail('s1'), makeSessionEnvelope());
    commitCommandResult(
      qc,
      's1',
      makeCommandOk({
        automation: makeAutomationSummary({ steps: 1, strategy: 'bot', stopReason }),
      }),
      'run',
    );
    expect(qc.getQueryState(sessionKeys.detail('s1'))?.isInvalidated).toBe(true);
  });

  it('store: command arms and clears error/stalled; run never arms (pending → stalled); lastRun rules (Q-FE-5)', () => {
    const qc = createTestQueryClient();
    qc.setQueryData(sessionKeys.detail('s1'), makeSessionEnvelope());
    resetAutomation('s1');
    consumeAutomationArm('s1');

    const ai = makeAutomationSummary({
      steps: 3,
      strategy: 'bot',
      pending: true,
      stopReason: 'stepLimit',
    });
    commitCommandResult(qc, 's1', makeCommandOk({ events: ['e'], automation: ai }), 'run');
    let s = useAutomationStore.getState();
    expect(s).toMatchObject({ phase: 'stalled', autoRunArmed: false, seq: 1 });
    expect(s.lastRun).toEqual({ source: 'run', summary: ai, events: ['e'], seq: 1 });

    // A run with no steps keeps the last summary.
    commitCommandResult(
      qc,
      's1',
      makeCommandOk({ automation: makeAutomationSummary({ strategy: 'bot' }) }),
      'run',
    );
    s = useAutomationStore.getState();
    expect(s).toMatchObject({ phase: 'idle', seq: 1 });
    expect(s.lastRun?.seq).toBe(1);

    useAutomationStore.setState({ phase: 'error', error: new Error('x') });
    commitCommandResult(
      qc,
      's1',
      makeCommandOk({ automation: makeAutomationSummary({ strategy: 'bot' }) }),
      'command',
    );
    s = useAutomationStore.getState();
    expect(s).toMatchObject({ phase: 'idle', error: null, autoRunArmed: true, lastRun: null });
  });

  it('a response of another session updates the cache but not the store', () => {
    const qc = createTestQueryClient();
    qc.setQueryData(sessionKeys.detail('s2'), makeSessionEnvelope({ sessionId: 's2' }));
    resetAutomation('s1');
    consumeAutomationArm('s1');
    commitCommandResult(
      qc,
      's2',
      makeCommandOk({
        view: { late: true },
        automation: makeAutomationSummary({ steps: 1, strategy: 'bot', stopReason: 'humanTurn' }),
      }),
      'run',
    );
    expect(qc.getQueryData<SessionEnvelope>(sessionKeys.detail('s2'))?.view).toEqual({
      late: true,
    });
    expect(useAutomationStore.getState()).toMatchObject({ sessionId: 's1', lastRun: null, seq: 0 });
  });

  it('without a cached session the cache stays empty (no partial envelope)', () => {
    const qc = createTestQueryClient();
    commitCommandResult(qc, 's9', makeCommandOk(), 'command');
    expect(qc.getQueryData(sessionKeys.detail('s9'))).toBeUndefined();
  });
});

describe('automationFallbackReasonText (P-8, D-PO-3)', () => {
  const codes = AutomationFallbackCodeSchema.options;

  it.each(['ru', 'en'] as const)(
    '%s: a distinct non-empty text for every code; unknown → generic',
    async (lng) => {
      await i18n.changeLanguage(lng);
      const t = i18n.t.bind(i18n);
      const texts = codes.map((code) => automationFallbackReasonText(t, code));
      for (const [i, text] of texts.entries()) {
        expect(text, codes[i]).not.toBe('');
        expect(text, codes[i]).not.toContain('automation.reason');
      }
      expect(new Set(texts).size).toBe(codes.length);
      expect(automationFallbackReasonText(t, 'AI_SOMETHING_NEW')).toBe(
        t('sessionHost:automation.reason.unknown'),
      );
      expect(automationFallbackReasonText(t, 'AI_TIMEOUT')).toBe(
        lng === 'ru' ? 'нет ответа вовремя' : 'no answer in time',
      );
    },
  );
});

describe('P-9: the automation host is game-agnostic', () => {
  it('platform/automation/** names no game and imports no game package', () => {
    const sources = import.meta.glob<string>(['./*.ts', './*.tsx', '!./*.test.tsx'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(5);
    for (const [file, text] of files) {
      expect(text, file).not.toMatch(/rebellion|empire|rebels|forbidden|@bga\/game-|@\/games\//i);
    }
  });
});
