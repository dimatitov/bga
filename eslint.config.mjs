// Flat config. Architecture boundaries (SWR-003 plan-backend §1.8, B-1…B-17) are `no-restricted-imports`
// per area; checked by scripts/eslint-boundaries.test.mjs (part of `pnpm test`).
// NOTE: for one file ESLint applies only the LAST matching block's options of a rule, so narrower blocks
// below repeat the restrictions of the wider ones (composed from the constants).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const AI_AND_SERVER = ['openai', 'openai/*', '@nestjs/*', '@prisma/*'];
const REACT_UI = ['react', 'react-*', 'react/*', 'react-dom/*', '@mui/*', 'konva', 'konva/*'];

/** Any game package, bare or with any subpath. */
const ANY_GAME_PKG = '^@bga/game-[^/]+(/.*)?$';
/** Game package entry points web may import: ./definition ./schema ./board ./assets (Q-8: not the bare package). */
const GAME_NOT_WEB = '^@bga/game-[^/]+(/(?!(definition|schema|board|assets)$).*)?$';
/** Server registry may import only ./definition and ./server of a game. */
const GAME_NOT_REGISTRY = '^@bga/game-[^/]+(/(?!(definition|server)$).*)?$';
/** Server-only game entry points that even web i18n tests must not read (they may read ./scenario). */
const GAME_RULES_SERVER_AI = '^@bga/game-[^/]+/(rules|server|ai)(/.*)?$';
/** Relative imports from web into the api sources (only the registry consistency test may read definitions). */
const WEB_TO_API_SRC = '(^|/)api/src/';

/**
 * Sibling subpaths of a game package (`../<sub>`), for the per-subpath layering rules. SWR-005: also
 * `../../<sub>` so that nested folders (`rules/core/**`, `scenario/core/**`) cannot bypass them.
 */
const sibling = (...names) =>
  names.flatMap((n) => [`../${n}`, `../${n}/*`, `../../${n}`, `../../${n}/*`]);

/**
 * Build a `no-restricted-imports` rule.
 * @param {{ groups?: string[], regexes?: string[], paths?: object[] }} spec
 */
function restrict(message, { groups = [], regexes = [], paths = [] } = {}) {
  const patterns = [];
  if (groups.length > 0) patterns.push({ group: groups, message });
  for (const regex of regexes) patterns.push({ regex, message });
  return ['error', { paths, patterns }];
}

/** Q-21 / AC-9: no `import()` with a computed specifier anywhere (tests excepted). */
const COMPUTED_DYNAMIC_IMPORT = {
  selector: 'ImportExpression[source.type!="Literal"]',
  message:
    'Dynamic import() must use a string literal specifier (no loading of games by name, AC-9).',
};

/**
 * Web: dynamic `import()` must obey the same boundary as static imports.
 * Forbidden: game package entry points other than definition/schema/board/assets, paths into packages/.
 */
const WEB_DYNAMIC_IMPORTS = [
  {
    selector:
      'ImportExpression[source.value=/^@bga\\/game-[a-z0-9-]+(\\/(?!(definition|schema|board|assets)$).*)?$|(^|\\/)packages\\//]',
    message:
      'Dynamic import of game rules / scenario / server / ai is forbidden in web (the scenario holds secrets).',
  },
  COMPUTED_DYNAMIC_IMPORT,
];

// ---- web restriction sets ----
const WEB_MESSAGE =
  'web imports from game packages only ./definition, ./schema, ./board, ./assets; never server code (AC-5, Q-8).';
const WEB_GROUPS = ['@prisma/*', '@nestjs/*', 'openai', 'openai/*', '**/packages/**'];
const WEB = { groups: WEB_GROUPS, regexes: [GAME_NOT_WEB, WEB_TO_API_SRC] };

// ---- api restriction sets ----
const API_GROUPS = ['react', 'react-*', 'react/*', '@mui/*', 'openai', 'openai/*'];
/** SWR-005B §8: the AI layer may import the openai SDK, but never games, sessions, the registry or dev code. */
const API_AI_GROUPS = [
  'react',
  'react-*',
  'react/*',
  '@mui/*',
  '**/packages/**',
  '../sessions/*',
  '../game-registry/*',
  '../dev/*',
  '../../sessions/*',
  '../../game-registry/*',
  '../../dev/*',
];
/** SWR-005B §2.4: apps/api/src reads the environment only in config/env.ts. */
const NO_PROCESS_ENV = [
  'error',
  {
    object: 'process',
    property: 'env',
    message:
      'Read configuration through AppConfig (apps/api/src/config/env.ts is the only reader).',
  },
  {
    object: 'process',
    property: 'loadEnvFile',
    message: '.env is loaded only by apps/api/src/config/env.ts.',
  },
];

// ---- game package restriction sets (B-2) ----
const GAME_SRC_MESSAGE =
  'A game package depends only on @bga/platform and zod; game subpaths are layered (plan-backend §1.8).';
const GAME_SRC_GROUPS = [
  '@bga/api',
  '@bga/web',
  ...REACT_UI,
  ...AI_AND_SERVER,
  'node:*',
  '**/apps/**',
  '**/platform/src/**',
  '**/games/**',
  // any relative path leaving the package (src/<subpath>/file → ../../../…)
  '../../../*',
];
const gameSrc = (...extraGroups) => ({
  groups: [...GAME_SRC_GROUPS, ...extraGroups],
  regexes: [ANY_GAME_PKG],
});

const DETERMINISM = {
  syntax: {
    selector: "NewExpression[callee.name='Date']",
    message: 'game rules are deterministic: take time from ctx.now.',
  },
  properties: [
    { object: 'Date', property: 'now', message: 'game rules are deterministic: use ctx.now.' },
    { object: 'Math', property: 'random', message: 'game rules are deterministic: no randomness.' },
  ],
};

/** User-facing JSX attributes whose string values must come from i18n (review #2). */
const UI_TEXT_ATTRS =
  '/^(aria-label|aria-description|aria-roledescription|aria-valuetext|aria-placeholder|title|placeholder|alt|label)$/';
const HAS_LETTER = '/\\p{L}/u';
const NO_UI_LITERALS_MESSAGE = 'No literal UI text in JSX: use i18n (t(...)).';
/** Direct string values of an expression slot: `'x'`, `c ? 'x' : …`, `c && 'x'`, `` `x${y}` ``. */
function literalSlots(parent) {
  return [
    `${parent} > Literal[value=${HAS_LETTER}]`,
    `${parent} > ConditionalExpression > Literal[value=${HAS_LETTER}]`,
    `${parent} > LogicalExpression > Literal[value=${HAS_LETTER}]`,
    `${parent} > TemplateLiteral > TemplateElement[value.raw=${HAS_LETTER}]`,
  ];
}
const JSX_UI_LITERALS = [
  'JSXText[value=/[\\p{L}\\p{N}]/u]',
  // <x aria-label="Text" />
  `JSXAttribute[name.name=${UI_TEXT_ATTRS}] > Literal[value=${HAS_LETTER}]`,
  // <x title={'Text'} />, <x label={c ? 'A' : 'B'} />
  ...literalSlots(`JSXAttribute[name.name=${UI_TEXT_ATTRS}] > JSXExpressionContainer`),
  // children: <p>{'Text'}</p>, <>{c && 'Text'}</>
  ...literalSlots(':matches(JSXElement, JSXFragment) > JSXExpressionContainer'),
].map((selector) => ({ selector, message: NO_UI_LITERALS_MESSAGE }));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-e2e/**',
      '**/.tmp/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'scripts/**',
      'docs/**',
      '.claude/**',
      '.codex/**',
      '.agents/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  // Node-side files: configs, scripts, api, tests of packages, e2e.
  {
    files: [
      '*.{js,mjs,cjs,ts,mts}',
      'apps/api/**/*.{ts,mts,mjs}',
      'apps/web/*.{ts,mjs}',
      'packages/platform/*.{ts,mts,mjs}',
      'packages/games/*/*.{ts,mts,mjs}',
      'packages/platform/test/**/*.ts',
      'packages/games/*/test/**/*.ts',
      'e2e/**/*.ts',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  // Nest relies on runtime class references for DI (emitDecoratorMetadata):
  // `import type` of an injected class would break DI, so allow value imports in api src.
  {
    files: ['apps/api/src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },

  // ---- Architecture boundaries (plan-backend §1.8) ----
  // B-1: platform depends only on zod.
  {
    files: ['packages/platform/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        '@bga/platform depends only on zod; it never imports games.',
        {
          groups: ['@bga/*', ...REACT_UI, ...AI_AND_SERVER, 'node:*', '**/games/**', '**/apps/**'],
          regexes: [ANY_GAME_PKG],
        },
      ),
    },
  },
  // B-2: game packages depend only on @bga/platform and zod.
  {
    files: ['packages/games/*/src/**/*.ts'],
    rules: { 'no-restricted-imports': restrict(GAME_SRC_MESSAGE, gameSrc()) },
  },
  // B-3: web-reachable subpaths are self-contained (board can never pull the scenario into the web bundle).
  {
    files: ['packages/games/*/src/{definition,schema,board,assets}/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'definition/schema/board/assets are web-reachable: they must not import other subpaths.',
        gameSrc('../*', '../../*'),
      ),
    },
  },
  // B-4: the scenario is data and sees only ../schema.
  {
    files: ['packages/games/*/src/scenario/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'scenario is data: it may import only ../schema.',
        gameSrc(...sibling('rules', 'server', 'ai', 'board', 'assets', 'definition')),
      ),
    },
  },
  // B-5: rules are pure and deterministic (scenario only in tests).
  {
    files: ['packages/games/*/src/rules/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'rules are pure: they may import only ../schema and @bga/platform (scenario only in tests).',
        gameSrc(...sibling('scenario', 'server', 'ai', 'board', 'assets', 'definition')),
      ),
      'no-restricted-syntax': ['error', DETERMINISM.syntax, COMPUTED_DYNAMIC_IMPORT],
      'no-restricted-properties': ['error', ...DETERMINISM.properties],
    },
  },
  // B-6: AI strategy configuration is data.
  {
    files: ['packages/games/*/src/ai/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'ai is configuration data: it may import only ../schema.',
        gameSrc(...sibling('rules', 'scenario', 'server', 'board', 'assets')),
      ),
    },
  },
  // B-7: the server module wires definition + schema + rules + scenario (+ ai).
  {
    files: ['packages/games/*/src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'server must not import web-only board/assets.',
        gameSrc(...sibling('board', 'assets')),
      ),
    },
  },
  // B-8: web — only definition/schema/board/assets of games; no server code.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': restrict(WEB_MESSAGE, WEB),
      'no-restricted-syntax': ['error', ...WEB_DYNAMIC_IMPORTS],
    },
  },
  {
    // Literal UI text in JSX is forbidden: all UI text goes through i18n (spec UX requirements).
    // Text children, user-facing attributes (aria-label, title, placeholder, alt, label) and string
    // literals in child expression containers. data-testid, className, role, etc. stay allowed.
    // This block replaces `no-restricted-syntax` for .tsx, so it repeats the dynamic-import selectors.
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['apps/web/src/**/*.test.tsx', 'apps/web/src/test/**'],
    rules: {
      'no-restricted-syntax': ['error', ...WEB_DYNAMIC_IMPORTS, ...JSX_UI_LITERALS],
    },
  },
  // B-9: shared web code knows no game — only the registry (`@/games/registry`).
  {
    files: ['apps/web/src/{app,shared,platform}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict(
        'Platform web code (app/shared/platform) must not import game packages, game folders or features — only @/games/registry (AC-5).',
        {
          groups: [
            ...WEB_GROUPS,
            '@/games/*',
            '!@/games/registry',
            '**/games/*',
            '!**/games/registry',
            '@/features/*',
            '**/features/*',
          ],
          regexes: [ANY_GAME_PKG, WEB_TO_API_SRC],
        },
      ),
    },
  },
  // B-17: a web game folder sees neither other games nor the registry (only `@/games/types`).
  {
    files: ['apps/web/src/games/*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict(
        'A web game folder must not import the registry or other games (from @/games/* only @/games/types); from game packages only definition/schema/board/assets — rules/scenario/server/ai are server-only.',
        { groups: [...WEB_GROUPS, '@/games/*', '!@/games/types'], regexes: WEB.regexes },
      ),
    },
  },
  {
    files: ['apps/web/src/games/forbidden-stars/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict(
        'Forbidden Stars web code may import only @bga/platform and @bga/game-forbidden-stars/{definition,assets}.',
        {
          groups: [...WEB_GROUPS, '@/games/*', '!@/games/types'],
          regexes: [
            ...WEB.regexes,
            '^@bga/(?!platform$|game-forbidden-stars/(definition|assets)$)',
          ],
        },
      ),
    },
  },
  // B-16: the only web file that may read api sources — the registry consistency test (Q-25), definitions only.
  {
    files: ['apps/web/src/games/registry.consistency.test.ts'],
    rules: {
      'no-restricted-imports': restrict(WEB_MESSAGE, {
        groups: WEB_GROUPS,
        regexes: [GAME_NOT_WEB, '(^|/)api/src/(?!game-registry/definitions$)'],
      }),
    },
  },
  // B-10: web i18n tests may read a game scenario (translation coverage) but never rules/server/ai.
  {
    files: ['apps/web/src/**/*.i18n.test.ts'],
    rules: {
      'no-restricted-imports': restrict('web tests may read the scenario but never game rules.', {
        groups: ['@prisma/*', '@nestjs/*', 'openai', 'openai/*'],
        regexes: [GAME_RULES_SERVER_AI],
      }),
    },
  },
  // B-11: api — no UI libraries; OpenAI is out of scope.
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict('api: no UI libraries; OpenAI is out of scope.', {
        groups: API_GROUPS,
      }),
    },
  },
  // B-12: shared server code never imports games (only via ../game-registry).
  {
    files: [
      'apps/api/src/{sessions,common,persistence,health}/**/*.ts',
      'apps/api/src/{app.module,app.factory,main}.ts',
    ],
    rules: {
      'no-restricted-imports': restrict(
        'Shared server code must not import game packages — use the game registry (AC-5).',
        { groups: [...API_GROUPS, '**/packages/**'], regexes: [ANY_GAME_PKG] },
      ),
    },
  },
  // SWR-005B §8: the AI layer (only place where `openai` may be imported) sees no games, sessions or dev code.
  {
    files: ['apps/api/src/ai/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'apps/api/src/ai is game-agnostic: no game packages, sessions, game-registry or dev code.',
        { groups: API_AI_GROUPS, regexes: [ANY_GAME_PKG] },
      ),
    },
  },
  // SWR-005B §8: dev-only diagnostics talk to the AI layer, never to openai or games directly.
  {
    files: ['apps/api/src/dev/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'dev code must not import openai or game packages (use the AI layer).',
        { groups: [...API_GROUPS, '**/packages/**'], regexes: [ANY_GAME_PKG] },
      ),
    },
  },
  // SWR-005B §2.4: process.env / process.loadEnvFile only in config/env.ts.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/config/env.ts'],
    rules: { 'no-restricted-properties': NO_PROCESS_ENV },
  },
  // B-13: the server registry sees only ./definition and ./server of a game.
  {
    files: ['apps/api/src/game-registry/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'game-registry may import only @bga/game-*/definition and @bga/game-*/server.',
        { groups: [...API_GROUPS, '**/packages/**'], regexes: [GAME_NOT_REGISTRY] },
      ),
    },
  },
  // SWR-005B §8: api tests never import the openai SDK (they go through ai/providers/openai-client.ts + fake fetch).
  {
    files: ['apps/api/test/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'api tests must not import openai directly (use openai-client.ts with a fake fetch).',
        { groups: ['openai', 'openai/*'] },
      ),
    },
  },
  // B-14: the fake game of the session-service tests must not lean on a real game (AC-5(a)).
  {
    files: ['apps/api/test/support/fake-game.ts'],
    rules: {
      'no-restricted-imports': restrict(
        'fake-game must not import a real game package or openai.',
        {
          groups: ['**/packages/**', 'openai', 'openai/*'],
          regexes: [ANY_GAME_PKG],
        },
      ),
    },
  },
  // B-15: Q-21 — no computed import() in api/packages sources (web: WEB_DYNAMIC_IMPORTS; rules: B-5 block).
  {
    files: [
      'apps/api/src/**/*.ts',
      'packages/platform/src/**/*.ts',
      'packages/games/*/src/**/*.ts',
    ],
    ignores: ['**/*.test.ts', '**/test/**', 'packages/games/*/src/rules/**'],
    rules: { 'no-restricted-syntax': ['error', COMPUTED_DYNAMIC_IMPORT] },
  },
  prettier,
);
