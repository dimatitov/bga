// Flat config. Boundary rules (AC-12, R-15, TC-ARCH-01/02) are `no-restricted-imports` per area.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const AI_AND_SERVER = ['openai', 'openai/*', '@nestjs/*', '@prisma/*'];
const REACT_UI = ['react', 'react-*', 'react/*', 'react-dom/*', '@mui/*', 'konva', 'konva/*'];

/**
 * Web: dynamic `import()` must obey the same boundary as static imports (review #3).
 * Forbidden: @swr/game-core[/…], @swr/game-data and any subpath except `/layout`, paths into packages/.
 */
const WEB_DYNAMIC_IMPORTS = [
  {
    selector:
      'ImportExpression[source.value=/^@swr\\/game-core(\\/.*)?$|^@swr\\/game-data(\\/(?!layout$).*)?$|(^|\\/)packages\\//]',
    message:
      'Dynamic import of game-core / the game-data scenario is forbidden in web (AC-12; the scenario holds secrets).',
  },
  {
    // A computed specifier could hide any of the above.
    selector: 'ImportExpression[source.type!="Literal"]',
    message: 'Dynamic import() in web must use a string literal specifier (boundary check).',
  },
];

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

/** Build a `no-restricted-imports` rule from gitignore-style groups. */
function restrict(groups, message, paths = []) {
  return ['error', { paths, patterns: [{ group: groups, message }] }];
}

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
      'packages/*/*.{ts,mts,mjs}',
      'packages/*/test/**/*.ts',
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

  // ---- Architecture boundaries ----
  {
    files: ['packages/contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        ['@swr/*', ...REACT_UI, ...AI_AND_SERVER, 'node:*'],
        'contracts depends only on zod.',
      ),
    },
  },
  {
    files: ['packages/game-core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        [
          '@swr/game-data',
          '@swr/game-data/*',
          ...REACT_UI,
          ...AI_AND_SERVER,
          'node:*',
          '**/apps/**',
          '**/game-data/**',
        ],
        'game-core is pure TS and imports only @swr/contracts (game-data only in tests).',
      ),
      // R-1: determinism — time and ids come from ctx.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'game-core is deterministic: take time from ctx.now.',
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'game-core is deterministic: use ctx.now.' },
        {
          object: 'Math',
          property: 'random',
          message: 'game-core is deterministic: no randomness.',
        },
      ],
    },
  },
  {
    files: ['packages/game-data/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        ['@swr/game-core', '@swr/game-core/*', ...REACT_UI, ...AI_AND_SERVER, 'node:*'],
        'game-data is plain data (depends only on @swr/contracts types).',
      ),
    },
  },
  {
    files: ['packages/game-data/src/layout.ts'],
    rules: {
      'no-restricted-imports': restrict(
        ['./scenario', './index', '.', './', '@swr/*', ...REACT_UI, ...AI_AND_SERVER, 'node:*'],
        'layout must not pull the scenario (rebel base!) into the web bundle.',
      ),
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': restrict(
        [
          '@swr/game-core',
          '@swr/game-core/*',
          '@swr/game-data/*',
          '!@swr/game-data/layout',
          '@prisma/*',
          '@nestjs/*',
          'openai',
          'openai/*',
          '**/packages/**',
        ],
        'Rules live on the server: web imports only @swr/contracts and @swr/game-data/layout (AC-12).',
        [
          {
            name: '@swr/game-data',
            message: 'Only @swr/game-data/layout is allowed in web (the scenario holds secrets).',
          },
        ],
      ),
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
  {
    // Test-only check that every game-data key has a translation (plan-frontend §0.1, §7.4).
    files: ['apps/web/src/**/*.i18n.test.ts'],
    rules: {
      'no-restricted-imports': restrict(
        ['@swr/game-core', '@swr/game-core/*', '@prisma/*', '@nestjs/*', 'openai', 'openai/*'],
        'web tests may read the scenario but never game-core.',
      ),
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        ['react', 'react-*', 'react/*', '@mui/*', 'openai', 'openai/*'],
        'api: no UI libraries; OpenAI is out of scope in SWR-002.',
      ),
    },
  },
  prettier,
);
