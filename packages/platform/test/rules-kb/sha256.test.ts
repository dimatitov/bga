// SWR-008 C-5: the pure-TS SHA-256 of rules-kb equals node:crypto on UTF-8 input (QD-5 rules version).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/rules-kb';
import { utf8Bytes } from '../../src/rules-kb/canonical-json';

const nodeSha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256Hex (W1 DONE WHEN: equals node:crypto)', () => {
  it('known vectors (FIPS 180-4)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it.each([
    ['empty', ''],
    ['ASCII', 'The quick brown fox jumps over the lazy dog'],
    ['Cyrillic', 'Империя ищет базу Повстанцев — правила'],
    ['emoji / astral plane', 'rules \u{1F680}\u{1F30C} done'],
    ['lone high surrogate', 'a\ud800b'],
    ['lone low surrogate', 'a\udc00b'],
    ['trailing high surrogate', 'end\ud83d'],
    ['control and NUL', 'a\u0000\n\t\u007f'],
  ])('%s equals node:crypto', (_name, text) => {
    expect(sha256Hex(text)).toBe(nodeSha(text));
  });

  it('every length around the 64-byte block / 56-byte padding boundaries', () => {
    for (let n = 0; n <= 130; n += 1) {
      const text = 'x'.repeat(n);
      expect(sha256Hex(text)).toBe(nodeSha(text));
    }
    // multi-byte characters crossing the boundaries
    for (let n = 0; n <= 70; n += 1) {
      const text = 'ж'.repeat(n);
      expect(sha256Hex(text)).toBe(nodeSha(text));
    }
  });

  it('1 MB of mixed text equals node:crypto', () => {
    const unit = 'Rules line [game:x.y] — правило 42 \u{1F680}\n';
    const text = unit.repeat(Math.ceil(1_048_576 / unit.length)).slice(0, 1_048_576);
    expect(text.length).toBe(1_048_576);
    expect(sha256Hex(text)).toBe(nodeSha(text));
  });

  it('utf8Bytes equals Buffer.from(text, "utf8") (incl. unpaired surrogates → U+FFFD)', () => {
    for (const text of ['', 'abc', 'ёж', '\u{10FFFF}', 'a\ud800', '\udfff𐀀']) {
      expect([...utf8Bytes(text)]).toEqual([...Buffer.from(text, 'utf8')]);
    }
  });
});

describe('canonicalJson', () => {
  it('sorts keys recursively, keeps array order, writes no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: true, y: null }], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('escapes strings like JSON.stringify and skips undefined properties', () => {
    expect(canonicalJson({ s: 'a"b\\c\n\u0001ё', u: undefined })).toBe(
      `{"s":${JSON.stringify('a"b\\c\n\u0001ё')}}`,
    );
  });

  it('is independent of key insertion order and locale (code unit order)', () => {
    expect(canonicalJson({ ä: 1, z: 2, Z: 3, a: 4 })).toBe('{"Z":3,"a":4,"z":2,"ä":1}');
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['bigint', 1n],
    ['function', () => 1],
    ['undefined', undefined],
    ['array hole', [1, , 2]], // eslint-disable-line no-sparse-arrays
    ['undefined in array', [undefined]],
    ['Date', new Date(0)],
    ['Map', new Map()],
  ])('%s → TypeError', (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it('cycle → TypeError; a shared (non-cyclic) object is fine', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(TypeError);
    const shared = { x: 1 };
    expect(canonicalJson({ a: shared, b: [shared] })).toBe('{"a":{"x":1},"b":[{"x":1}]}');
  });
});
