import { describe, expect, it } from 'vitest';
import { i18n, resources } from '@/shared/i18n';
import { describeRebellionSession } from './describeSession';
import { makeRebellionSummary } from './test/fixtures';

const ru = i18n.getFixedT('ru');
const en = i18n.getFixedT('en');

const HUMAN = {
  playerFaction: 'rebels',
  opponentFaction: 'empire',
  opponentType: 'human',
} as const;

describe('describeRebellionSession (D-GP-4/5, Q-13; SWR-004 AM-FE-9, TC-C-14)', () => {
  it('AI opponent with difficulty → parts faction / opponent (with difficulty) / progress (ru)', () => {
    expect(describeRebellionSession(makeRebellionSummary({ aiDifficulty: 'hard' }), ru)).toEqual([
      { key: 'faction', text: 'Империя' },
      { key: 'opponent', text: 'против AI (Сложная)' },
      { key: 'progress', text: 'Р2 · Приказы' },
      { key: 'engine', text: 'Старый прототип' },
    ]);
  });

  it('human opponent (aiDifficulty: null, Q-20) → no difficulty part (ru, en)', () => {
    const summary = makeRebellionSummary({
      ...HUMAN,
      aiDifficulty: null,
      round: 1,
      phase: 'assignment',
    });
    expect(describeRebellionSession(summary, ru)).toEqual([
      { key: 'faction', text: 'Повстанцы' },
      { key: 'opponent', text: 'против второго игрока' },
      { key: 'progress', text: 'Р1 · Назначение' },
      { key: 'engine', text: 'Старый прототип' },
    ]);
    expect(describeRebellionSession(summary, en)).toEqual([
      // faction words belong to rebellion.common (Worker B may rename them) — taken from the namespace
      { key: 'faction', text: en('rebellion.common:faction.rebels') },
      { key: 'opponent', text: 'vs second player' },
      { key: 'progress', text: 'R1 · Assignment' },
      { key: 'engine', text: 'Old prototype' },
    ]);
    const opponent = describeRebellionSession(summary, ru)[1]?.text ?? '';
    for (const word of ['Лёгкая', 'Обычная', 'Сложная', 'null'])
      expect(opponent).not.toContain(word);
  });

  it('AI opponent without difficulty (null) → «против AI» without parentheses', () => {
    const parts = describeRebellionSession(makeRebellionSummary({ aiDifficulty: null }), ru);
    expect(parts[1]).toEqual({ key: 'opponent', text: 'против AI' });
  });

  it('ruleset / mode are not shown (OQ-4)', () => {
    const parts = describeRebellionSession(makeRebellionSummary(), en);
    expect(parts.map((p) => p.key)).toEqual(['faction', 'opponent', 'progress', 'engine']);
    expect(parts.map((p) => p.text).join(' ')).not.toMatch(/base|digital/i);
  });

  it('SWR-005 core-v1 (AM-FE-7, TC-VA-09): progress «Время N · Репутация M · Приказы», no «Старый прототип» (ru, en)', () => {
    const summary = makeRebellionSummary({
      aiDifficulty: 'normal',
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      round: 3,
      phase: 'command',
      rulesEngine: 'core-v1',
      reputation: 14,
    });
    expect(describeRebellionSession(summary, ru)).toEqual([
      { key: 'faction', text: 'Повстанцы' },
      { key: 'opponent', text: 'против AI (Обычная)' },
      { key: 'progress', text: 'Время 3 · Репутация 14 · Приказы' },
    ]);
    expect(describeRebellionSession(summary, en)[2]).toEqual({
      key: 'progress',
      text: 'Time 3 · Reputation 14 · Command',
    });
  });

  it('SWR-005 finished core-v1 game: progress without phase + outcome part with the winner (AM-BE-8)', () => {
    const rebels = makeRebellionSummary(
      { rulesEngine: 'core-v1', round: 14, phase: 'refresh', reputation: 14, winner: 'rebels' },
      { status: 'completed' },
    );
    expect(describeRebellionSession(rebels, ru).slice(2)).toEqual([
      { key: 'progress', text: 'Время 14 · Репутация 14' },
      { key: 'outcome', text: 'Победа Повстанцев' },
    ]);
    const empire = makeRebellionSummary(
      { rulesEngine: 'core-v1', round: 5, phase: 'command', reputation: 12, winner: 'empire' },
      { status: 'completed' },
    );
    expect(describeRebellionSession(empire, en).slice(2)).toEqual([
      { key: 'progress', text: 'Time 5 · Reputation 12' },
      { key: 'outcome', text: 'Imperial victory' },
    ]);
  });

  it('core-v1 without reputation (defensive) → «Время N · <phase>»', () => {
    const summary = makeRebellionSummary({ rulesEngine: 'core-v1', round: 2, reputation: null });
    expect(describeRebellionSession(summary, ru)[2]).toEqual({
      key: 'progress',
      text: 'Время 2 · Приказы',
    });
  });

  it('invalid details → [] (the platform shows its generic text)', () => {
    const summary = makeRebellionSummary();
    summary.details = { playerFaction: 'sith', round: 0 };
    expect(describeRebellionSession(summary, ru)).toEqual([]);
    summary.details = {};
    expect(describeRebellionSession(summary, ru)).toEqual([]);
    // Legacy SWR-003 details shape is no longer accepted.
    summary.details = { humanFaction: 'empire', opponent: 'ai', round: 2, phase: 'command' };
    expect(describeRebellionSession(summary, ru)).toEqual([]);
  });

  it('rebellion.list: ru and en have the same non-empty keys; en has no Cyrillic (TC-C-22)', () => {
    const ruList = resources.ru?.['rebellion.list'] as Record<string, string> | undefined;
    const enList = resources.en?.['rebellion.list'] as Record<string, string> | undefined;
    expect(Object.keys(enList ?? {}).sort()).toEqual(Object.keys(ruList ?? {}).sort());
    expect(Object.keys(ruList ?? {}).length).toBeGreaterThan(0);
    for (const text of Object.values(ruList ?? {})) expect(text).not.toBe('');
    for (const text of Object.values(enList ?? {})) expect(text).not.toMatch(/^$|[А-Яа-яЁё]/);
  });
});
