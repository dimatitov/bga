/**
 * SWR-005 (P2, TC-C-08, plan-frontend §8): + `rebellion.match` (top bar, outcome, core log, announcements) and the
 * namespaces of Workers M (`rebellion.data`, `rebellion.map`) and P1 (`rebellion.turn`);
 * every core data id (`core-ids.ts`) has a name, every core event type a log text, every announcement kind,
 * outcome reason/winner and phase a text; `command` is «Приказы» (Q-FE-8).
 *
 * TC-WEB-12 + R-14 for the Rebellion namespaces (`rebellion.*`, SWR-003 plan-frontend §5.2): ru/en key sets match
 * (modulo plural suffixes), every system/region/piece key of the mock scenario has a translation, every game
 * error `messageKey` is translated in `rebellion.errors`. Test-only import of the scenario (allowed for
 * `*.i18n.test.ts`, ESLint B-10).
 */
import { rebellionDefinition } from '@bga/game-rebellion/definition';
import { mockScenario } from '@bga/game-rebellion/scenario';
import { factions } from '@bga/game-rebellion/assets';
import {
  CORE_LEADER_IDS,
  CORE_REGION_IDS,
  CORE_SYSTEM_IDS,
  CORE_UNIT_TYPE_KEYS,
  CoreViewEventSchema,
  FactionIdSchema,
  GameModeSchema,
  GameRulesetSchema,
  OpponentTypeSchema,
  OutcomeReasonSchema,
  PhaseSchema,
  REBELLION_ERROR_MESSAGE_KEYS,
} from '@bga/game-rebellion/schema';
import type { Announcement } from './core-v1/model/announcements';
import { describe, expect, it } from 'vitest';
import { i18n, resources } from '@/shared/i18n';
import { REBELLION_ERRORS_NS } from './i18n';

const TABLE_NAMESPACES = [
  'rebellion.meta',
  'rebellion.common',
  'rebellion.setup',
  'rebellion.session',
  'rebellion.board',
  'rebellion.gameData',
  'rebellion.errors',
  'rebellion.list',
  // SWR-005: P2 `match`; Worker M `data`, `map`; Worker P1 `turn`.
  'rebellion.match',
  'rebellion.data',
  'rebellion.map',
  'rebellion.turn',
] as const;

/** Exhaustive list of announcement kinds (FE-0 contract `rebellion.match:announce.<kind>`). */
const ANNOUNCEMENT_KINDS = Object.keys({
  autoPass: true,
  autoFinish: true,
  opponentPassed: true,
  leadersReturned: true,
  newRound: true,
  baseRevealed: true,
  gameOver: true,
} satisfies Record<Announcement['kind'], true>);

/** Translation stored in exactly this language (no fallback); nested keys follow i18next's `.` separator. */
function stored(lng: 'ru' | 'en', ns: string, key: string): unknown {
  return i18n.getResource(lng, ns, key) as unknown;
}
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

function lookup(ns: string, lng: 'ru' | 'en', key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
      resources[lng]?.[ns],
    );
}

describe('Rebellion locales (rebellion.*)', () => {
  it.each(TABLE_NAMESPACES)(
    '%s: ru and en have the same keys (plural forms normalised), no empty texts',
    (ns) => {
      const norm = (lng: 'ru' | 'en') =>
        [...new Set(flatKeys(resources[lng]?.[ns]).map((k) => k.replace(PLURAL, '')))].sort();
      expect(norm('ru').length).toBeGreaterThan(0);
      expect(norm('en')).toEqual(norm('ru'));
      for (const lng of ['ru', 'en'] as const) {
        for (const key of flatKeys(resources[lng]?.[ns])) {
          const v = lookup(ns, lng, key);
          expect(typeof v, `${lng} ${ns}:${key}`).toBe('string');
          expect(v, `${lng} ${ns}:${key}`).not.toBe('');
        }
      }
    },
  );

  it('ru plural keys have one/few/many/other, en plural keys have one/other', () => {
    for (const ns of TABLE_NAMESPACES) {
      const ru = flatKeys(resources.ru?.[ns]).filter((k) => PLURAL.test(k));
      const bases = new Set(ru.map((k) => k.replace(PLURAL, '')));
      for (const b of bases) {
        for (const f of ['one', 'few', 'many', 'other'])
          expect(ru, `ru ${ns}:${b}_${f}`).toContain(`${b}_${f}`);
        for (const f of ['one', 'other'])
          expect(typeof lookup(ns, 'en', `${b}_${f}`), `en ${ns}:${b}_${f}`).toBe('string');
      }
    }
  });

  it('every system, region and piece type of the scenario has ru and en names (A-12, R-14)', () => {
    const keys = [
      ...mockScenario.systems.map((s) => s.nameKey),
      ...mockScenario.systems.map((s) => `regions.${s.regionId}`),
      ...mockScenario.regions.map((r) => r.nameKey),
      ...mockScenario.pieces.map((p) => `pieces.${p.typeKey}`),
    ];
    for (const key of keys) {
      for (const lng of ['ru', 'en'] as const) {
        expect(typeof lookup('rebellion.gameData', lng, key), `${lng} gameData:${key}`).toBe(
          'string',
        );
      }
    }
  });

  it('en texts contain no Cyrillic (TC-E2E-26)', () => {
    for (const ns of TABLE_NAMESPACES) {
      for (const key of flatKeys(resources.en?.[ns])) {
        expect(String(lookup(ns, 'en', key)), `en ${ns}:${key}`).not.toMatch(/[А-Яа-яЁё]/);
      }
    }
  });

  it('every Rebellion error messageKey has ru and en text in rebellion.errors (PA-5)', () => {
    for (const messageKey of Object.values(REBELLION_ERROR_MESSAGE_KEYS)) {
      const name = messageKey.replace(/^errors\./, '');
      for (const lng of ['ru', 'en'] as const) {
        expect(typeof lookup(REBELLION_ERRORS_NS, lng, name), `${lng} ${name}`).toBe('string');
      }
    }
  });

  it('definition descriptionKey/coverAltKey resolve to non-empty ru and en texts (R-1)', () => {
    for (const lng of ['ru', 'en'] as const) {
      const t = i18n.getFixedT(lng);
      for (const key of [rebellionDefinition.descriptionKey, rebellionDefinition.coverAltKey]) {
        expect(key, 'definition key').toBeDefined();
        const text = t(key ?? '');
        expect(text, `${lng} ${key}`).not.toBe(key);
        expect(text.length, `${lng} ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('SWR-004 setup form: keys for every FactionId, OpponentType, GameRuleset, GameMode (TC-C-22)', () => {
    const t = (lng: 'ru' | 'en') => i18n.getFixedT(lng);
    for (const lng of ['ru', 'en'] as const) {
      const keys: string[] = [];
      for (const f of FactionIdSchema.options) {
        const visual = factions[f];
        keys.push(visual.nameKey, visual.shortNameKey, visual.taglineKey);
        for (const kind of OpponentTypeSchema.options)
          keys.push(`rebellion.setup:newGame.opponentCaption.${kind}.${f}`);
      }
      for (const r of GameRulesetSchema.options) keys.push(`rebellion.common:ruleset.${r}`);
      for (const m of GameModeSchema.options) keys.push(`rebellion.common:mode.${m}`);
      keys.push(
        'rebellion.common:prototype.badge',
        'rebellion.common:prototype.full',
        'rebellion.common:prototype.coreV1',
        'rebellion.common:prototype.legacy',
      );
      for (const key of keys) {
        const text = t(lng)(key);
        expect(text, `${lng} ${key}`).not.toBe(key);
        expect(text.length, `${lng} ${key}`).toBeGreaterThan(0);
      }
    }
    expect(t('en')('rebellion.common:faction.rebels')).toBe('Rebels');
    expect(t('ru')('rebellion.common:faction.rebels')).toBe('Повстанцы');
  });
});

describe('SWR-005 core-v1 locales (TC-C-08, plan-frontend §8)', () => {
  it.each(['rebellion.match', 'rebellion.data', 'rebellion.map', 'rebellion.turn'])(
    '%s exists in ru and en',
    (ns) => {
      expect(resources.ru?.[ns], `ru ${ns}`).toBeDefined();
      expect(resources.en?.[ns], `en ${ns}`).toBeDefined();
    },
  );

  it('every core data id has ru and en names in rebellion.data (systems, regions, leaders, unit types)', () => {
    const keys = [
      ...CORE_SYSTEM_IDS.map((id) => `systems.${id}`),
      ...CORE_REGION_IDS.map((id) => `regions.${id}`),
      ...CORE_LEADER_IDS.map((id) => `leaders.${id}.name`),
      ...CORE_UNIT_TYPE_KEYS.map((key) => `pieceTypes.${key}`),
    ];
    for (const key of keys) {
      for (const lng of ['ru', 'en'] as const) {
        const v = stored(lng, 'rebellion.data', key);
        expect(typeof v, `${lng} data:${key}`).toBe('string');
        expect(v, `${lng} data:${key}`).not.toBe('');
      }
    }
  });

  it('every core event type has match:log.<TYPE> (ru, en); auto variants for PASSED / ACTIVATION_FINISHED', () => {
    const types = CoreViewEventSchema.options.map((o) => o.shape.type.value);
    expect(types.length).toBeGreaterThanOrEqual(11);
    const keys = [
      ...types.map((type) => `log.${type}`),
      'log.PASSED_auto',
      'log.ACTIVATION_FINISHED_auto',
      'log.hiddenZone',
      'log.autoTag',
      'log.autoHint',
      'log.unknown',
    ];
    for (const key of keys) {
      for (const lng of ['ru', 'en'] as const) {
        expect(typeof stored(lng, 'rebellion.match', key), `${lng} match:${key}`).toBe('string');
      }
    }
  });

  it('announcements, outcome winners/reasons, phases have texts; side grammar variants exist for both factions', () => {
    for (const lng of ['ru', 'en'] as const) {
      const t = i18n.getFixedT(lng);
      const keys = [
        ...ANNOUNCEMENT_KINDS.filter((k) => k !== 'leadersReturned').map(
          (k) => `rebellion.match:announce.${k}`,
        ),
        ...OutcomeReasonSchema.options.map((r) => `rebellion.match:outcome.reason.${r}`),
        ...FactionIdSchema.options.map((f) => `rebellion.match:outcome.winner.${f}`),
        ...PhaseSchema.options.map((p) => `rebellion.common:phase.${p}`),
      ];
      for (const key of keys) expect(t(key), `${lng} ${key}`).not.toBe(key);
      expect(t('rebellion.match:announce.leadersReturned', { count: 2 })).not.toMatch(/announce/);
      for (const f of FactionIdSchema.options) {
        for (const key of [
          'log.PASSED',
          'log.PASSED_auto',
          'log.ACTIVATION_FINISHED',
          'log.ACTIVATION_FINISHED_auto',
          'log.HANDOFF_ACCEPTED',
          'announce.autoPass',
          'announce.autoFinish',
          'announce.opponentPassed',
        ]) {
          expect(typeof stored(lng, 'rebellion.match', `${key}_${f}`), `${lng} ${key}_${f}`).toBe(
            'string',
          );
        }
      }
    }
  });

  it('Q-FE-8: phase `command` is «Приказы» in ru (also for old sessions and the handoff screen)', () => {
    expect(i18n.getFixedT('ru')('rebellion.common:phase.command')).toBe('Приказы');
    expect(i18n.getFixedT('ru')('rebellion.common:phase.assignment')).toBe('Назначение');
    expect(i18n.getFixedT('ru')('rebellion.common:phase.refresh')).toBe('Обновление');
  });
});
