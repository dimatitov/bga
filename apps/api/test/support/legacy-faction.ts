/**
 * SWR-004 helper for the v1-upgrade tests: JSON paths of string values that are the legacy (v1) faction id
 * or a legacy piece typeKey. Listed among the TC-A-04 grep exclusions (tests of the v1 fixtures).
 */
const LEGACY_FACTION = 'rebellion';

export function legacyFactionValues(value: unknown, path = '$'): string[] {
  if (value === LEGACY_FACTION) return [path];
  if (typeof value === 'string' && value.includes(`.${LEGACY_FACTION}.`)) return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => legacyFactionValues(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => legacyFactionValues(v, `${path}.${k}`));
  }
  return [];
}
