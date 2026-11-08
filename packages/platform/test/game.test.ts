import { describe, expect, it } from 'vitest';
import { GameAssetsSchema, GameDefinitionSchema, GameIdSchema, type GameDefinition } from '../src';

const DEF: GameDefinition = {
  id: 'some-game',
  name: 'Some Game',
  descriptionKey: 'some-game.meta:description',
  coverAltKey: 'some-game.meta:coverAlt',
  status: 'available',
  supportedPlayers: [1, 2, 4],
  supportsAI: false,
};

describe('GameIdSchema', () => {
  it.each(['star-wars-rebellion', 'forbidden-stars', 'a', 'g2', 'x-1-y'])('accepts %s', (id) => {
    expect(GameIdSchema.safeParse(id).success).toBe(true);
  });
  it.each(['', 'Foo', 'foo bar', '-a', 'a-', 'a--b', 'a_b', 'a/b', 'x'.repeat(65)])(
    'rejects %j',
    (id) => {
      expect(GameIdSchema.safeParse(id).success).toBe(false);
    },
  );
});

describe('GameDefinitionSchema', () => {
  it('accepts a full definition; description / coverAltKey / coverImage are optional', () => {
    expect(GameDefinitionSchema.parse(DEF)).toEqual(DEF);
    const { coverAltKey: _alt, ...minimal } = DEF;
    expect(GameDefinitionSchema.safeParse(minimal).success).toBe(true);
    expect(
      GameDefinitionSchema.safeParse({ ...DEF, description: 'Описание', coverImage: 'x.svg' })
        .success,
    ).toBe(true);
  });

  it('i18n keys must be namespace-qualified <ns>:<key> (Decisions R-1)', () => {
    for (const descriptionKey of ['description', 'games.some.description', 'a:b c', ':x']) {
      expect(GameDefinitionSchema.safeParse({ ...DEF, descriptionKey }).success).toBe(false);
    }
    expect(GameDefinitionSchema.safeParse({ ...DEF, coverAltKey: 'coverAlt' }).success).toBe(false);
  });

  it('rejects unknown status, bad players list, extra keys', () => {
    expect(GameDefinitionSchema.safeParse({ ...DEF, status: 'beta' }).success).toBe(false);
    expect(GameDefinitionSchema.safeParse({ ...DEF, supportedPlayers: [] }).success).toBe(false);
    expect(GameDefinitionSchema.safeParse({ ...DEF, supportedPlayers: [2, 2] }).success).toBe(
      false,
    );
    expect(GameDefinitionSchema.safeParse({ ...DEF, supportedPlayers: [3, 2] }).success).toBe(
      false,
    );
    expect(GameDefinitionSchema.safeParse({ ...DEF, supportedPlayers: [0] }).success).toBe(false);
    expect(GameDefinitionSchema.safeParse({ ...DEF, name: '' }).success).toBe(false);
    expect(GameDefinitionSchema.safeParse({ ...DEF, logo: 'x' }).success).toBe(false);
  });
});

describe('GameAssetsSchema', () => {
  const assets = {
    cover: { svg: '<svg viewBox="0 0 640 360"></svg>', width: 640, height: 360 },
    accentColor: '#AA00ff',
  };
  it('accepts cover + accent colour and game-specific extra fields', () => {
    expect(GameAssetsSchema.safeParse(assets).success).toBe(true);
    expect(GameAssetsSchema.safeParse({ ...assets, visualTokens: { a: 1 } }).success).toBe(true);
  });
  it('rejects a non-SVG cover and a malformed colour', () => {
    expect(
      GameAssetsSchema.safeParse({ ...assets, cover: { ...assets.cover, svg: '<img>' } }).success,
    ).toBe(false);
    expect(GameAssetsSchema.safeParse({ ...assets, accentColor: 'red' }).success).toBe(false);
  });
});
