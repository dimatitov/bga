// SWR-010 TC-REG-03 (AC-2) / plan-backend §13 W1: the cards sources are game-agnostic and depend only on zod;
// the subpath exports the frozen API of §11.1 and is not re-exported from the package root.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as root from '../../src';
import * as api from '../../src/cards';

const SRC = fileURLToPath(new URL('../../src/cards/', import.meta.url));
const PKG = fileURLToPath(new URL('../../package.json', import.meta.url));
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

/** Game words (apps/api architecture test GAME_TERMS) and the game's card concepts. */
const GAME_WORDS =
  /rebel|empire|imperial|rebellion|swr|ruleset|gameMode|faction|probe|location|coruscant|\bbase\b/i;

describe('cards boundaries', () => {
  it('has the planned source files', () => {
    expect(files.sort()).toEqual([
      'engine.ts',
      'index.ts',
      'invariants.ts',
      'schema.ts',
      'shuffle.ts',
      'visibility.ts',
    ]);
  });

  it.each(files)('%s: no game names or concepts; imports only zod and relative modules', (f) => {
    const text = readFileSync(join(SRC, f), 'utf8');
    expect(text).not.toMatch(GAME_WORDS);
    expect(text).not.toMatch(/node:/);
    expect(text).not.toMatch(/@bga\//);
    const specifiers = [...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1]);
    for (const s of specifiers) expect(s).toMatch(/^(zod|\.\/[a-z-]+)$/);
    expect(text).not.toMatch(/\bimport\s*\(/);
    expect(text).not.toMatch(/\brequire\s*\(/);
    expect(text).not.toMatch(/Math\.random|Date\.now|new Date/);
  });

  it('exports the frozen API of plan-backend §11.1', () => {
    for (const fn of [
      'createPile',
      'shuffleZone',
      'drawCards',
      'moveCard',
      'playCard',
      'discardCard',
      'revealCard',
      'returnCard',
      'registerCard',
      'restorePile',
      'checkCardInvariants',
      'projectZones',
      'seedFromString',
      'seededShuffle',
    ] as const) {
      expect(typeof api[fn]).toBe('function');
    }
    for (const schema of [
      'CardIdSchema',
      'CardInstanceIdSchema',
      'CardI18nKeySchema',
      'CardSideSchema',
      'CardScopeSchema',
      'CardSourceRefSchema',
      'CardVerificationSchema',
      'CardCatalogStatusSchema',
      'CardEffectStatusSchema',
      'CardParamValueSchema',
      'CardEffectSchema',
      'CardTypeDefinitionSchema',
      'CardDefinitionSchema',
      'CardCatalogSchema',
      'CardInstanceSchema',
      'CardZoneKindSchema',
      'CardZoneVisibilitySchema',
      'CardAuthoritySchema',
      'CardZonePolicySchema',
      'CardZoneStateSchema',
      'CardPileSchema',
      'CardRefViewSchema',
      'CardZoneViewSchema',
    ] as const) {
      expect(typeof api[schema].safeParse).toBe('function');
    }
    expect(api.CARD_ID_PATTERN.test('a-1')).toBe(true);
  });

  it('is a subpath only: not re-exported from the package root; package.json exports ./cards', () => {
    expect('createPile' in root).toBe(false);
    expect('CardPileSchema' in root).toBe(false);
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { exports: Record<string, unknown> };
    expect(pkg.exports['./cards']).toEqual({
      '@bga/source': './src/cards/index.ts',
      types: './dist/cards/index.d.ts',
      default: './dist/cards/index.js',
    });
  });
});
