import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEV_AI_TABLE_DIAGNOSTICS_KEY,
  resetDevAiTableDiagnostics,
  useDevAiTableDiagnostics,
} from './diagnosticsFlag';

describe('table diagnostics opt-in flag (SWR-008 plan-frontend §2.1 G-2, D-11)', () => {
  beforeEach(() => {
    resetDevAiTableDiagnostics();
    localStorage.clear();
  });

  it('the key is frozen by the plan', () => {
    expect(DEV_AI_TABLE_DIAGNOSTICS_KEY).toBe('bga.dev.aiTableDiagnostics.v1');
  });

  it('off by default; setEnabled persists {"state":{"enabled":…},"version":1}', () => {
    expect(useDevAiTableDiagnostics.getState().enabled).toBe(false);
    useDevAiTableDiagnostics.getState().setEnabled(true);
    expect(useDevAiTableDiagnostics.getState().enabled).toBe(true);
    expect(localStorage.getItem(DEV_AI_TABLE_DIAGNOSTICS_KEY)).toBe(
      '{"state":{"enabled":true},"version":1}',
    );
    useDevAiTableDiagnostics.getState().setEnabled(false);
    expect(localStorage.getItem(DEV_AI_TABLE_DIAGNOSTICS_KEY)).toBe(
      '{"state":{"enabled":false},"version":1}',
    );
  });

  it('a stored value is read back on hydration (a new page load)', async () => {
    localStorage.setItem(DEV_AI_TABLE_DIAGNOSTICS_KEY, '{"state":{"enabled":true},"version":1}');
    await useDevAiTableDiagnostics.persist.rehydrate();
    expect(useDevAiTableDiagnostics.getState().enabled).toBe(true);
  });

  it.each([
    ['not JSON', 'yes'],
    ['a non-boolean', '{"state":{"enabled":"true"},"version":1}'],
    ['no state', '{"version":1}'],
  ])('%s in storage → off', async (_label, raw) => {
    localStorage.setItem(DEV_AI_TABLE_DIAGNOSTICS_KEY, raw);
    await useDevAiTableDiagnostics.persist.rehydrate().catch(() => undefined);
    expect(useDevAiTableDiagnostics.getState().enabled).toBe(false);
  });
});
