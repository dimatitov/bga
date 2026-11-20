import { compareStrings } from './text';

/**
 * Canonical JSON (QD-5): object keys sorted recursively (locale-independent), arrays in order, no whitespace;
 * strings, finite numbers, booleans and null as `JSON.stringify` writes them. Object properties whose value is
 * `undefined` are skipped (as in `JSON.stringify`). Anything that is not plain JSON data — `undefined` elsewhere,
 * non-finite numbers, bigint, functions, symbols, class instances, cycles — throws a `TypeError`.
 */
export function canonicalJson(value: unknown): string {
  return write(value, new Set<object>(), '$');
}

function write(value: unknown, seen: Set<object>, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value))
        throw new TypeError(`canonicalJson: non-finite number at ${path}`);
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value} at ${path}`);
  }

  const obj = value as object;
  if (seen.has(obj)) throw new TypeError(`canonicalJson: cycle at ${path}`);
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      // Array.from turns holes of a sparse array into `undefined` (→ TypeError) instead of skipping them.
      const items = Array.from(obj as unknown[], (item, i) => write(item, seen, `${path}[${i}]`));
      return `[${items.join(',')}]`;
    }
    const proto: unknown = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(`canonicalJson: not a plain object at ${path}`);
    }
    const record = obj as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort(compareStrings)) {
      const item = record[key];
      if (item === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${write(item, seen, `${path}.${key}`)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(obj);
  }
}

// ---- SHA-256 of the canonical text ----
// SHA-256 (FIPS 180-4) over the UTF-8 bytes of a string, in plain TypeScript: no platform crypto, no I/O, so the
// rules-kb subpath stays usable in any runtime. Used only for the rules set version (QD-5), not for security.
// Kept in this module (not in a separate `sha256` file) because rules-kb modules may import only `./[a-z-]+`
// specifiers (rules-kb boundaries test).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H0 = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

/** UTF-8 encoding; an unpaired surrogate becomes U+FFFD (as the WHATWG encoder does). */
export function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      } else {
        cp = 0xfffd;
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd;
    }
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** Lower-case hex SHA-256 of the UTF-8 encoding of `text`. Deterministic, pure. */
export function sha256Hex(text: string): string {
  const bytes = utf8Bytes(text);
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(total - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(total - 4, bitLength >>> 0);

  const h = Uint32Array.from(H0);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t += 1) {
      const x = w[t - 15]!;
      const y = w[t - 2]!;
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;
    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = h[0]! + a;
    h[1] = h[1]! + b;
    h[2] = h[2]! + c;
    h[3] = h[3]! + d;
    h[4] = h[4]! + e;
    h[5] = h[5]! + f;
    h[6] = h[6]! + g;
    h[7] = h[7]! + hh;
  }
  let hex = '';
  for (const word of h) hex += word.toString(16).padStart(8, '0');
  return hex;
}
