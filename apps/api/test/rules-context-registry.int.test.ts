/**
 * SWR-008 W5 (plan-backend C-8, Q-BE-2, QD-3, TR-1): the rules context registry and its `node:fs` loader.
 * TC-INT-04 (load once, registry part), TC-INT-05 (broken knowledge base → `createApp` rejects), TC-INT-10 (bot →
 * nothing loaded), TC-CT-05 (a game without `rules` needs nothing), TC-SEL-09 (start-up part: `rulesMaxChars`
 * below the mandatory line). Fixture: `test/fixtures/tiny-kb` (game `fake`, pinned `fake:impl.engine-scope`).
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { inspect } from 'node:util';
import type { INestApplication } from '@nestjs/common';
import { createKnowledgeBaseRulesProvider, type KbEntryInput } from '@bga/platform/rules-kb';
import type {
  GameRulesSupport,
  KnowledgeBaseSource,
  RulesSelectionInput,
  ServerGameModule,
} from '@bga/platform';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ProductionOverridesError, createApp } from '../src/app.factory';
import type { AiCommanderConfig, AppConfig } from '../src/config/env';
import {
  KnowledgeBaseLoadError,
  readKnowledgeBaseDir,
  type KnowledgeBaseLoader,
} from '../src/rules-context/knowledge-base.loader';
import {
  RulesContextRegistry,
  RulesContextStartupError,
  createRulesContextRegistry,
  rulesContextEnabled,
} from '../src/rules-context/rules-context.registry';
import { RULES_CONTEXT_REGISTRY } from '../src/rules-context/rules-context.tokens';
import { API_ROOT } from './global-setup';
import { FAKE_GAME_ID, fakeGameDefinition, fakeGameModule } from './support/fake-game';
import { SENTINEL_KEY, createFakeFetch, enabledOpenAI } from './support/openai-fake-fetch';
import { createTestDb, removeTestDb, startApp, type TestDb } from './support/test-app';
import { REPO_ROOT, testConfig } from './support/test-config';

const TINY_KB_DIR = join(API_ROOT, 'test', 'fixtures', 'tiny-kb');
const TINY_KB_RELATIVE = relative(REPO_ROOT, TINY_KB_DIR).split('\\').join('/');
const ENGINE = 'fake:impl.engine-scope';
const OPENAI_ON: Partial<AiCommanderConfig> = { provider: 'openai', rulesContext: 'on' };

function tinyRules(knowledgeBaseDir: string = TINY_KB_DIR, pinned = [ENGINE]): GameRulesSupport {
  return {
    knowledgeBaseDir,
    createRulesContextProvider: (source) =>
      createKnowledgeBaseRulesProvider(source, {
        pinnedRuleIds: pinned,
        tagRules: { quiet: ['fake:move.wait'] },
      }),
  };
}

function withRules(rules: GameRulesSupport, module: ServerGameModule = fakeGameModule) {
  return { ...module, rules } as ServerGameModule;
}

/** Loader spy: counts calls, records directories, optionally rewrites the source (broken knowledge bases). */
function spyLoader(rewrite?: (source: KnowledgeBaseSource) => KnowledgeBaseSource) {
  const dirs: string[] = [];
  const loader: KnowledgeBaseLoader = (dir) => {
    dirs.push(dir);
    const source = readKnowledgeBaseDir(dir);
    return rewrite ? rewrite(structuredClone(source)) : source;
  };
  return { loader, dirs };
}

/** A loader that must never be called. */
const forbiddenLoader: KnowledgeBaseLoader = () => {
  throw new Error('the knowledge base must not be loaded');
};

function config(aiCommander: Partial<AiCommanderConfig>, extra: Partial<AppConfig> = {}) {
  return { ...testConfig({ aiCommander }), ...extra } as AppConfig;
}

function startupError(run: () => unknown): RulesContextStartupError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RulesContextStartupError);
    return error as RulesContextStartupError;
  }
  throw new Error('expected a RulesContextStartupError');
}

const SELECT: RulesSelectionInput = {
  actor: 'p2',
  phase: 'bot-turn',
  commandTypes: ['MOVE', 'WAIT'],
  tags: ['quiet'],
  maxChars: 6000,
};

const tempDirs: string[] = [];
function tinyCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'swr008-kb-'));
  tempDirs.push(dir);
  cpSync(TINY_KB_DIR, dir, { recursive: true });
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** The mandatory (pinned) line length of the tiny KB, from the provider itself. */
const REQUIRED_CHARS = tinyRules().createRulesContextProvider(
  readKnowledgeBaseDir(TINY_KB_DIR),
).requiredChars;

describe('readKnowledgeBaseDir (node:fs loader)', () => {
  it('reads manifest, entries/*.json in sorted file order (concatenated) and the optional files', () => {
    const source = readKnowledgeBaseDir(TINY_KB_DIR);
    expect((source.manifest as { gameId: string }).gameId).toBe('fake');
    const ids = (source.entries as { id: string }[]).map((e) => e.id);
    // notes.json < rules.json
    expect(ids).toEqual([
      ENGINE,
      'fake:turn.order',
      'fake:move.one-step',
      'fake:move.wait',
      'fake:turn.review',
      'fake:general.table',
    ]);
    expect(Array.isArray(source.discrepancies)).toBe(true);
    expect('coverage' in source).toBe(false);
  });

  it('missing / wrong files → KnowledgeBaseLoadError with directory, file and a fixed reason', () => {
    const cases: [string, (dir: string) => void, string, string][] = [
      ['no directory', (dir) => rmSync(dir, { recursive: true }), '.', 'directory not found'],
      [
        'no manifest',
        (dir) => rmSync(join(dir, 'manifest.json')),
        'manifest.json',
        'file not found',
      ],
      [
        'no entries dir',
        (dir) => rmSync(join(dir, 'entries'), { recursive: true }),
        'entries/',
        'directory not found',
      ],
      [
        'entries is a file',
        (dir) => {
          rmSync(join(dir, 'entries'), { recursive: true });
          writeFileSync(join(dir, 'entries'), '[]');
        },
        'entries/',
        'not a directory',
      ],
      [
        'entries file is not an array',
        (dir) => writeFileSync(join(dir, 'entries', 'rules.json'), '{"id":"fake:x.y"}'),
        'entries/rules.json',
        'must contain a JSON array',
      ],
      [
        'optional file is a directory',
        (dir) => cpSync(join(dir, 'entries'), join(dir, 'coverage.json'), { recursive: true }),
        'coverage.json',
        'not a file',
      ],
    ];
    for (const [label, breakIt, file, reason] of cases) {
      const dir = tinyCopy();
      breakIt(dir);
      let error: unknown;
      try {
        readKnowledgeBaseDir(dir);
      } catch (e) {
        error = e;
      }
      expect(error, label).toBeInstanceOf(KnowledgeBaseLoadError);
      expect((error as KnowledgeBaseLoadError).message, label).toBe(
        `rules knowledge base ${dir}: ${file}: ${reason}`,
      );
    }
  });

  it('broken JSON → "invalid JSON", the file content is never quoted', () => {
    const dir = tinyCopy();
    writeFileSync(join(dir, 'entries', 'rules.json'), '[{"text": "SENTINEL-KB-CONTENT" ,,]');
    let error: unknown;
    try {
      readKnowledgeBaseDir(dir);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(KnowledgeBaseLoadError);
    expect((error as Error).message).toBe(
      `rules knowledge base ${dir}: entries/rules.json: invalid JSON`,
    );
    expect(inspect(error)).not.toMatch(/SENTINEL-KB-CONTENT/);
  });

  it('non-.json files in entries/ are ignored', () => {
    const dir = tinyCopy();
    writeFileSync(join(dir, 'entries', 'README.md'), 'not json');
    expect((readKnowledgeBaseDir(dir).entries as unknown[]).length).toBe(6);
  });
});

describe('createRulesContextRegistry — when knowledge bases are loaded (Q-BE-2)', () => {
  it('TC-INT-10: provider bot → nothing is read, no provider (rules on or off)', () => {
    for (const rulesContext of ['on', 'off'] as const) {
      const registry = createRulesContextRegistry({
        config: config({ provider: 'bot', rulesContext }),
        modules: [withRules(tinyRules())],
        loader: forbiddenLoader,
      });
      expect(registry.gameIds).toEqual([]);
      expect(registry.forGame(FAKE_GAME_ID)).toBeNull();
    }
    expect(rulesContextEnabled(testConfig())).toBe(false);
  });

  it('provider openai + rules off → nothing is read (the off form of SWR-006)', () => {
    const registry = createRulesContextRegistry({
      config: config({ provider: 'openai', rulesContext: 'off' }),
      modules: [withRules(tinyRules())],
      loader: forbiddenLoader,
    });
    expect(registry.gameIds).toEqual([]);
    expect(registry.forGame(FAKE_GAME_ID)).toBeNull();
  });

  it('TC-CT-05: openai + on, a game without `rules` → no provider, nothing read, no error', () => {
    const registry = createRulesContextRegistry({
      config: config(OPENAI_ON),
      modules: [fakeGameModule],
      loader: forbiddenLoader,
    });
    expect(registry.gameIds).toEqual([]);
    expect(registry.forGame(FAKE_GAME_ID)).toBeNull();
  });

  it('TC-INT-04 (registry part): openai + on → exactly one load per game with rules; decisions read no files', () => {
    const spy = spyLoader();
    const registry = createRulesContextRegistry({
      config: config(OPENAI_ON),
      modules: [withRules(tinyRules())],
      loader: spy.loader,
    });
    expect(spy.dirs).toEqual([TINY_KB_DIR]);
    expect(registry).toBeInstanceOf(RulesContextRegistry);
    expect(registry.gameIds).toEqual([FAKE_GAME_ID]);
    const provider = registry.forGame(FAKE_GAME_ID);
    expect(provider).not.toBeNull();
    for (let i = 0; i < 20; i++) {
      expect(registry.forGame(FAKE_GAME_ID)).toBe(provider);
      provider!.selectRules(SELECT);
    }
    expect(spy.dirs).toHaveLength(1);
    expect(registry.forGame('unknown-game')).toBeNull();

    const result = provider!.selectRules(SELECT);
    expect(result.ruleIds[0]).toBe(ENGINE);
    expect(result.ruleIds).toContain('fake:move.wait');
    expect(result.ruleIds).not.toContain('fake:turn.review'); // needs-review (QD-4)
    expect(result.ruleIds).not.toContain('fake:general.table'); // ai: none
    expect(result.text).not.toMatch(/\[rebellion:/);
    expect(result.rulesVersion).toMatch(/^fake@1:[0-9a-f]{12}$/);
  });

  it('a repository-relative directory is resolved against knowledgeBaseRoot', () => {
    const spy = spyLoader();
    const registry = createRulesContextRegistry({
      config: config(OPENAI_ON),
      modules: [withRules(tinyRules(TINY_KB_RELATIVE))],
      loader: spy.loader,
    });
    expect(TINY_KB_RELATIVE).toBe('apps/api/test/fixtures/tiny-kb');
    expect(spy.dirs).toEqual([join(REPO_ROOT, TINY_KB_RELATIVE)]);
    expect(registry.gameIds).toEqual([FAKE_GAME_ID]);
  });

  it('knowledgeBaseRoot null: a relative directory fails; an absolute one does not need it', () => {
    const error = startupError(() =>
      createRulesContextRegistry({
        config: config(OPENAI_ON, { knowledgeBaseRoot: null }),
        modules: [withRules(tinyRules(TINY_KB_RELATIVE))],
        loader: forbiddenLoader,
      }),
    );
    expect(error.message).toBe(
      `rules knowledge base of game ${FAKE_GAME_ID}: knowledgeBaseRoot is not set, the relative directory ${TINY_KB_RELATIVE} cannot be resolved`,
    );
    const registry = createRulesContextRegistry({
      config: config(OPENAI_ON, { knowledgeBaseRoot: null }),
      modules: [withRules(tinyRules())],
    });
    expect(registry.gameIds).toEqual([FAKE_GAME_ID]);
  });
});

describe('createRulesContextRegistry — fail fast (TC-INT-05, QD-3, TC-SEL-09)', () => {
  function entries(source: KnowledgeBaseSource): KbEntryInput[] {
    return source.entries as KbEntryInput[];
  }

  const BROKEN: [string, (s: KnowledgeBaseSource) => KnowledgeBaseSource, RegExp][] = [
    [
      'duplicate id',
      (s) => ({ ...s, entries: [...entries(s), entries(s)[1]!] }),
      /KnowledgeBaseValidationError: .*ENTRY_ID_DUPLICATE/,
    ],
    [
      'unknown sourceId',
      (s) => {
        entries(s)[1]!.sources = [{ sourceId: 'NOPE', page: 2, section: 'Turn' }];
        return s;
      },
      /KnowledgeBaseValidationError: .*SOURCE_UNKNOWN/,
    ],
    [
      'schema violation (unknown field)',
      (s) => {
        (entries(s)[1] as Record<string, unknown>).secretField = 1;
        return s;
      },
      /KnowledgeBaseParseError: /,
    ],
    [
      'pinned entry needs-review (AM-BE-3)',
      (s) => {
        entries(s)[0]!.status = 'needs-review';
        entries(s)[0]!.rationale = 'Under review.';
        return s;
      },
      /KnowledgeBaseConfigError: .*pinned rule "fake:impl\.engine-scope" is not verified/,
    ],
    [
      'pinned entry missing',
      (s) => ({ ...s, entries: entries(s).filter((e) => e.id !== ENGINE) }),
      /KnowledgeBase(Validation|Config)Error: /,
    ],
  ];

  it('broken knowledge bases → RulesContextStartupError naming the game, the error and the rule/issue', () => {
    for (const [label, rewrite, pattern] of BROKEN) {
      const error = startupError(() =>
        createRulesContextRegistry({
          config: config(OPENAI_ON),
          modules: [withRules(tinyRules())],
          loader: spyLoader(rewrite).loader,
        }),
      );
      expect(error.message, label).toMatch(
        new RegExp(`^rules knowledge base of game ${FAKE_GAME_ID}: `),
      );
      expect(error.message, label).toMatch(pattern);
      expect(error.gameId).toBe(FAKE_GAME_ID);
    }
  });

  it('a loader error (broken JSON on disk) is wrapped with its file', () => {
    const dir = tinyCopy();
    writeFileSync(join(dir, 'manifest.json'), '{ "SENTINEL-KB-CONTENT": ');
    const error = startupError(() =>
      createRulesContextRegistry({
        config: config(OPENAI_ON),
        modules: [withRules(tinyRules(dir))],
      }),
    );
    expect(error.message).toBe(
      `rules knowledge base of game ${FAKE_GAME_ID}: KnowledgeBaseLoadError: rules knowledge base ${dir}: manifest.json: invalid JSON`,
    );
  });

  it('QD-3: rulesMaxChars below the mandatory engine-scope line fails at start; equal is fine', () => {
    expect(REQUIRED_CHARS).toBeGreaterThan(0);
    const error = startupError(() =>
      createRulesContextRegistry({
        config: config({ ...OPENAI_ON, rulesMaxChars: REQUIRED_CHARS - 1 }),
        modules: [withRules(tinyRules())],
      }),
    );
    expect(error.message).toBe(
      `rules knowledge base of game ${FAKE_GAME_ID}: rulesMaxChars ${REQUIRED_CHARS - 1} is below the ${REQUIRED_CHARS} characters of the mandatory rules`,
    );
    const registry = createRulesContextRegistry({
      config: config({ ...OPENAI_ON, rulesMaxChars: REQUIRED_CHARS }),
      modules: [withRules(tinyRules())],
    });
    const result = registry.forGame(FAKE_GAME_ID)!.selectRules({
      ...SELECT,
      maxChars: REQUIRED_CHARS,
    });
    expect(result.ruleIds).toEqual([ENGINE]);
  });

  it('TC-SEL-09: rulesMaxChars 0, -1, 1.5, NaN, above 12000 → start-up error, not an empty block', () => {
    for (const rulesMaxChars of [0, -1, 1.5, Number.NaN, 12_001]) {
      const error = startupError(() =>
        createRulesContextRegistry({
          config: config({ ...OPENAI_ON, rulesMaxChars }),
          modules: [withRules(tinyRules())],
        }),
      );
      expect(error.message, String(rulesMaxChars)).toBe(
        `rules knowledge base of game ${FAKE_GAME_ID}: rulesMaxChars must be an integer 1..12000`,
      );
    }
  });
});

describe('createApp with the rules context (TC-INT-04, TC-INT-05)', () => {
  const dbs: TestDb[] = [];
  const apps: INestApplication[] = [];
  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
    for (const db of dbs.splice(0)) removeTestDb(db);
  });

  /** OpenAI "on" with a sentinel key and a fake fetch that fails if ever called (no request at start). */
  function openaiOptions() {
    const fake = createFakeFetch(() => {
      throw new Error('no OpenAI request at start');
    });
    return { openai: enabledOpenAI(), fetch: fake };
  }

  it('TC-INT-05: every broken knowledge base rejects createApp before the app exists; no key in the error', async () => {
    const { openai, fetch } = openaiOptions();
    const variants: [
      string,
      Partial<AppConfig>,
      KnowledgeBaseLoader | undefined,
      GameRulesSupport,
    ][] = [
      ...BROKEN_FOR_APP.map(
        ([label, rewrite]) =>
          [label, {}, spyLoader(rewrite).loader, tinyRules()] as [
            string,
            Partial<AppConfig>,
            KnowledgeBaseLoader,
            GameRulesSupport,
          ],
      ),
      ['broken JSON', {}, undefined, tinyRules(brokenJsonCopy())],
      [
        'knowledgeBaseRoot null',
        { knowledgeBaseRoot: null },
        undefined,
        tinyRules(TINY_KB_RELATIVE),
      ],
      [
        'rulesMaxChars below the mandatory line (QD-3)',
        {
          aiCommander: {
            ...testConfig().aiCommander,
            ...OPENAI_ON,
            rulesMaxChars: REQUIRED_CHARS - 1,
          },
        },
        undefined,
        tinyRules(),
      ],
    ];
    for (const [label, extra, loader, rules] of variants) {
      const base = testConfig({ aiCommander: OPENAI_ON, openai });
      const promise = createApp({
        config: { ...base, ...extra } as AppConfig,
        logger: false,
        gameModules: [withRules(rules)],
        gameDefinitions: [fakeGameDefinition],
        ai: { openaiFetch: fetch.fetch },
        ...(loader ? { rules: { loader } } : {}),
      });
      const error = await promise.then(
        () => new Error(`expected createApp to reject (${label})`),
        (e: unknown) => e,
      );
      expect(error, label).toBeInstanceOf(RulesContextStartupError);
      for (const text of [(error as Error).message, inspect(error)]) {
        expect(text, label).not.toContain(SENTINEL_KEY);
        expect(text, label).not.toMatch(/SENTINEL-KB-CONTENT/);
      }
    }
    expect(fetch.calls).toHaveLength(0);
  });

  it('TC-INT-04: the app loads the knowledge base exactly once and exposes the registry', async () => {
    const db = createTestDb();
    dbs.push(db);
    const spy = spyLoader();
    const app = await startApp(db.url, {
      logger: false,
      gameModules: [withRules(tinyRules())],
      gameDefinitions: [fakeGameDefinition],
      config: { aiCommander: OPENAI_ON },
      rules: { loader: spy.loader },
    });
    apps.push(app);
    expect(spy.dirs).toEqual([TINY_KB_DIR]);
    const registry = app.get<RulesContextRegistry>(RULES_CONTEXT_REGISTRY);
    expect(registry.gameIds).toEqual([FAKE_GAME_ID]);
    registry.forGame(FAKE_GAME_ID)!.selectRules(SELECT);
    expect(spy.dirs).toHaveLength(1);
  });

  it('default modules with the bot commander: the registry is empty and nothing is read', async () => {
    const db = createTestDb();
    dbs.push(db);
    const app = await startApp(db.url, { logger: false, rules: { loader: forbiddenLoader } });
    apps.push(app);
    expect(app.get<RulesContextRegistry>(RULES_CONTEXT_REGISTRY).gameIds).toEqual([]);
  });

  it('the rules override is test-only: refused in production', async () => {
    await expect(
      createApp({
        config: testConfig({ nodeEnv: 'production' }),
        logger: false,
        rules: { loader: forbiddenLoader },
      }),
    ).rejects.toBeInstanceOf(ProductionOverridesError);
  });
});

/** Source rewrites reused by the createApp test (same cases as the registry test). */
const BROKEN_FOR_APP: [string, (s: KnowledgeBaseSource) => KnowledgeBaseSource][] = [
  [
    'duplicate id',
    (s) => ({ ...s, entries: [...(s.entries as unknown[]), (s.entries as unknown[])[1]] }),
  ],
  [
    'unknown sourceId',
    (s) => {
      (s.entries as KbEntryInput[])[1]!.sources = [{ sourceId: 'NOPE', page: 2, section: 'x' }];
      return s;
    },
  ],
  [
    'pinned needs-review',
    (s) => {
      const engine = (s.entries as KbEntryInput[])[0]!;
      engine.status = 'needs-review';
      engine.rationale = 'Under review.';
      return s;
    },
  ],
];

function brokenJsonCopy(): string {
  const dir = tinyCopy();
  writeFileSync(join(dir, 'entries', 'notes.json'), '[ SENTINEL-KB-CONTENT');
  return dir;
}
