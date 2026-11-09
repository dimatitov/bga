/**
 * SWR-005B W1 (AC-01, plan-backend §2.3): apps/api/.env.example lists exactly the schema variables, parses
 * with `parseEnv`, keeps the key empty and OpenAI off. TC-ENV-18, TC-ENV-19. (Reads .env.example only.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv as parseDotenv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ENV_KEYS, parseEnv } from '../src/config/env';
import { API_ROOT } from './global-setup';

const EXAMPLE = readFileSync(join(API_ROOT, '.env.example'), 'utf8');

function exampleKeys(text: string): string[] {
  return [...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);
}

/** Differences between the keys of an example file and the schema keys (both directions). */
function keyDiff(example: readonly string[], schema: readonly string[]) {
  return {
    missingInExample: schema.filter((k) => !example.includes(k)),
    notInSchema: example.filter((k) => !schema.includes(k)),
    duplicates: example.filter((k, i) => example.indexOf(k) !== i),
  };
}

const NO_DIFF = { missingInExample: [], notInSchema: [], duplicates: [] };

describe('.env.example ↔ env schema', () => {
  it('TC-ENV-18: the key set equals ENV_KEYS', () => {
    expect(keyDiff(exampleKeys(EXAMPLE), ENV_KEYS)).toEqual(NO_DIFF);
  });

  it('TC-ENV-18: parses with parseEnv; key empty; OPENAI_ENABLED=false', () => {
    const vars = parseDotenv(EXAMPLE);
    expect(vars.OPENAI_API_KEY).toBe('');
    expect(vars.OPENAI_ENABLED).toBe('false');
    const config = parseEnv(vars);
    expect(config.openai).toMatchObject({ enabled: false, apiKeyConfigured: false });
    expect(config.databaseUrl).toBe('file:./dev.db');
    expect(config.nodeEnv).toBe('development');
  });

  it('TC-ENV-18: the example models / limits are valid when OpenAI is switched on', () => {
    const vars = parseDotenv(EXAMPLE);
    const config = parseEnv({
      ...vars,
      OPENAI_ENABLED: 'true',
      OPENAI_API_KEY: 'sk-test-SENTINEL-x',
    });
    expect(config.openai.enabled).toBe(true);
  });

  it('TC-ENV-19: the comparison catches drift in both directions', () => {
    expect(
      keyDiff(exampleKeys(EXAMPLE), [...ENV_KEYS, 'NEW_REQUIRED_VAR']).missingInExample,
    ).toEqual(['NEW_REQUIRED_VAR']);
    const withoutTactical = EXAMPLE.replace(/^OPENAI_TACTICAL_MODEL=.*$/m, '');
    expect(keyDiff(exampleKeys(withoutTactical), ENV_KEYS).missingInExample).toEqual([
      'OPENAI_TACTICAL_MODEL',
    ]);
    expect(keyDiff(exampleKeys(`${EXAMPLE}\nEXTRA_VAR=1\n`), ENV_KEYS).notInSchema).toEqual([
      'EXTRA_VAR',
    ]);
  });

  it('contains no real-looking key (AC-10)', () => {
    expect(EXAMPLE).not.toMatch(/sk-(proj-)?[A-Za-z0-9]{20,}/);
  });
});
