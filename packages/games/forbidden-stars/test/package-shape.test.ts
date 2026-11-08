import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameDefinitionSchema } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_STARS_GAME_ID, forbiddenStarsDefinition } from '../src/definition';

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('@bga/game-forbidden-stars package shape (AC-6)', () => {
  it('exports exactly ./definition and ./assets', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };
    expect(Object.keys(pkg.exports)).toEqual(['./definition', './assets']);
  });

  it('src contains only definition/ and assets/ (no rules, schemas, map or server)', () => {
    const entries = fs.readdirSync(path.join(PKG_DIR, 'src')).sort();
    expect(entries).toEqual(['assets', 'definition']);
  });

  it('definition is a valid coming_soon GameDefinition', () => {
    expect(GameDefinitionSchema.parse(forbiddenStarsDefinition)).toEqual(forbiddenStarsDefinition);
    expect(forbiddenStarsDefinition.id).toBe(FORBIDDEN_STARS_GAME_ID);
    expect(FORBIDDEN_STARS_GAME_ID).toBe('forbidden-stars');
    expect(forbiddenStarsDefinition.status).toBe('coming_soon');
    expect(forbiddenStarsDefinition.supportedPlayers).toEqual([2, 3, 4]);
    expect(forbiddenStarsDefinition.supportsAI).toBe(true);
    expect(forbiddenStarsDefinition.descriptionKey).toBe('forbidden-stars.meta:description');
    expect(forbiddenStarsDefinition.coverAltKey).toBe('forbidden-stars.meta:coverAlt');
  });
});
