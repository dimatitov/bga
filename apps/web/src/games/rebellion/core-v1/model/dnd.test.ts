import { describe, expect, it } from 'vitest';
import {
  decodeLeaderDrag,
  encodeLeaderDrag,
  hasLeaderDrag,
  isLeaderId,
  LEADER_DND_MIME,
  type DataTransferLike,
} from './dnd';

function fakeTransfer(initial: Record<string, string> = {}): DataTransferLike & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    get types() {
      return Object.keys(data);
    },
    getData: (f) => data[f] ?? '',
    setData: (f, v) => {
      data[f] = v;
    },
  };
}

describe('leader drag-and-drop payload', () => {
  it('round-trips a leader id under the private MIME type', () => {
    const dt = fakeTransfer();
    encodeLeaderDrag(dt, 'mon-mothma');
    expect(dt.data).toEqual({ [LEADER_DND_MIME]: 'mon-mothma' });
    expect(hasLeaderDrag(dt)).toBe(true);
    expect(decodeLeaderDrag(dt)).toBe('mon-mothma');
  });

  it('foreign drags (text, files), missing transfer and malformed ids are not leaders', () => {
    expect(hasLeaderDrag(fakeTransfer({ 'text/plain': 'vader' }))).toBe(false);
    expect(decodeLeaderDrag(fakeTransfer({ 'text/plain': 'vader' }))).toBeNull();
    expect(hasLeaderDrag(null)).toBe(false);
    expect(decodeLeaderDrag(undefined)).toBeNull();
    expect(decodeLeaderDrag(fakeTransfer({ [LEADER_DND_MIME]: '<script>' }))).toBeNull();
    expect(decodeLeaderDrag(fakeTransfer({ [LEADER_DND_MIME]: ' leia ' }))).toBe('leia');
  });

  it('refuses to encode an invalid id', () => {
    expect(() => encodeLeaderDrag(fakeTransfer(), '')).toThrow();
    expect(isLeaderId('Vader')).toBe(false);
    expect(isLeaderId('tagge')).toBe(true);
  });
});
