/**
 * SWR-006 W9: path-aware scanner of Empire-addressed bodies for the hidden base id (copy of the SWR-005 W6b scanner
 * in `hidden-info-core.int.test.ts`, which is not exported). The base id may appear ONLY in:
 *   - the static catalogue `view.map.systems[*]` (id, nameKey, adjacency);
 *   - the Empire's `view.legalActions[*]` (`systemIds`, own `MOVE_PIECES` from/to);
 *   - the Empire's OWN units / leaders / activation and its own events (`actor: 'empire'`);
 *   - `error.details` echoing a value the Empire itself sent in that request.
 * Anything else (a key, an exact value or a substring) is reported with its path.
 */

/** Every path where `needle` occurs: as a key, an exact value or inside a string. */
export function occurrences(value: unknown, needle: string, path = '$'): string[] {
  if (typeof value === 'string') return value.includes(needle) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => occurrences(v, needle, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(k.includes(needle) ? [`${path}.${k}(key)`] : []),
      ...occurrences(v, needle, `${path}.${k}`),
    ]);
  }
  return [];
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}

const STATIC_MAP = /^\$\.view\.map\.systems\[\d+\]\.(id|nameKey|adjacentSystemIds\[\d+\])$/;
const EMPIRE_LEGAL = /^\$\.view\.legalActions\[\d+\]\.(systemIds\[\d+\]|fromSystemId|toSystemId)$/;

interface Owned {
  owner?: string;
  actor?: string;
  side?: string;
}

/** Paths of an Empire-addressed `body` where the base id is NOT allowed. */
export function baseLeaks(body: unknown, baseId: string, request?: unknown): string[] {
  const b = body as {
    view?: { units?: Owned[]; leaders?: Owned[]; log?: Owned[]; activation?: Owned | null };
    events?: Owned[];
  };
  const own = (list: Owned[] | undefined, i: string) => {
    const item = list?.[Number(i)];
    return (item?.owner ?? item?.actor) === 'empire';
  };
  const echoed = new Set(request === undefined ? [] : stringsOf(request));
  return occurrences(body, baseId).filter((path) => {
    if (STATIC_MAP.test(path) || EMPIRE_LEGAL.test(path)) return false;
    let m = /^\$\.view\.(units|leaders)\[(\d+)\]\.location\.systemId$/.exec(path);
    if (m) return !own(b.view?.[m[1] as 'units' | 'leaders'], m[2] ?? '');
    if (path === '$.view.activation.location.systemId')
      return b.view?.activation?.side !== 'empire';
    m = /^\$\.view\.log\[(\d+)\]\.payload\./.exec(path);
    if (m) return !own(b.view?.log, m[1] ?? '');
    m = /^\$\.events\[(\d+)\]\.payload\./.exec(path);
    if (m) return !own(b.events, m[1] ?? '');
    if (/^\$\.error\.details\.\w+$/.test(path)) {
      const value = path
        .split('.')
        .slice(1)
        .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], body);
      return !(typeof value === 'string' && echoed.has(value));
    }
    return true;
  });
}
