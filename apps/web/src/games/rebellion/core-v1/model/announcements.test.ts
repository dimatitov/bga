import type { PlayerEvent } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import { announcementI18n, announcementsFor, endsGame, type Announcement } from './announcements';

const AT = '2026-11-08T10:00:00.000Z';
let seq = 0;
const ev = <T extends PlayerEvent>(e: Omit<T, 'seq' | 'at'>): PlayerEvent =>
  ({ ...e, seq: ++seq, at: AT }) as PlayerEvent;

describe('announcements — response events → descriptors (AC-06, AC-08)', () => {
  it('a player pass followed by the AI auto-pass, end of the phase, new round', () => {
    const events: PlayerEvent[] = [
      ev({ type: 'PASSED', actor: 'rebels', payload: { auto: false } }),
      ev({ type: 'PASSED', actor: 'empire', payload: { auto: true } }),
      ev({ type: 'LEADERS_RETURNED', actor: 'system', payload: { leaderIds: ['leia', 'vader'] } }),
      ev({ type: 'TIME_ADVANCED', actor: 'system', payload: { from: 1, to: 2 } }),
      ev({ type: 'PHASE_STARTED', actor: 'system', payload: { round: 2, phase: 'command' } }),
    ];
    expect(announcementsFor(events, 'rebels')).toEqual<Announcement[]>([
      { kind: 'autoPass', side: 'empire' },
      { kind: 'leadersReturned', count: 2 },
      { kind: 'newRound', round: 2 },
    ]);
    expect(endsGame(events)).toBe(false);
  });

  it("the opponent's manual pass and auto finish are announced; own events are not", () => {
    const events: PlayerEvent[] = [
      ev({
        type: 'SYSTEM_ACTIVATED',
        actor: 'empire',
        payload: { leaderId: 'vader', systemId: null },
      }),
      ev({ type: 'ACTIVATION_FINISHED', actor: 'empire', payload: { auto: false } }),
      ev({ type: 'ACTIVATION_FINISHED', actor: 'rebels', payload: { auto: true } }),
      ev({ type: 'PASSED', actor: 'rebels', payload: { auto: false } }),
      ev({ type: 'LEADERS_RETURNED', actor: 'system', payload: { leaderIds: [] } }),
    ];
    expect(announcementsFor(events, 'empire')).toEqual<Announcement[]>([
      { kind: 'autoFinish', side: 'rebels' },
      { kind: 'opponentPassed', side: 'rebels' },
    ]);
  });

  it('reveal and game over (order kept: ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER, Q-41)', () => {
    const events: PlayerEvent[] = [
      ev({ type: 'ACTIVATION_FINISHED', actor: 'empire', payload: { auto: false } }),
      ev({ type: 'BASE_REVEALED', actor: 'system', payload: { systemId: 'yavin' } }),
      ev({
        type: 'GAME_OVER',
        actor: 'system',
        payload: { winner: 'empire', reason: 'rebelBaseCaptured' },
      }),
    ];
    expect(announcementsFor(events, 'empire')).toEqual<Announcement[]>([
      { kind: 'baseRevealed', systemId: 'yavin' },
      { kind: 'gameOver', winner: 'empire', reason: 'rebelBaseCaptured' },
    ]);
    expect(endsGame(events)).toBe(true);
  });

  it('mock events and an empty response announce nothing', () => {
    expect(announcementsFor([], 'rebels')).toEqual([]);
    expect(
      announcementsFor(
        [
          ev({
            type: 'PIECES_MOVED',
            actor: 'rebels',
            payload: { pieceIds: ['u'], fromSystemId: null, toSystemId: 'hoth' },
          }),
          ev({ type: 'GAME_CREATED', actor: 'system', payload: { scenarioId: 'core-v1' } }),
        ],
        'empire',
      ),
    ).toEqual([]);
  });
});

describe('announcementI18n — keys in rebellion.match:announce.* with id values', () => {
  it.each<[Announcement, string, Record<string, string | number>]>([
    [{ kind: 'autoPass', side: 'empire' }, 'autoPass', { side: 'empire' }],
    [{ kind: 'autoFinish', side: 'rebels' }, 'autoFinish', { side: 'rebels' }],
    [{ kind: 'opponentPassed', side: 'rebels' }, 'opponentPassed', { side: 'rebels' }],
    [{ kind: 'leadersReturned', count: 3 }, 'leadersReturned', { count: 3 }],
    [{ kind: 'newRound', round: 4 }, 'newRound', { round: 4 }],
    [{ kind: 'baseRevealed', systemId: 'hoth' }, 'baseRevealed', { systemId: 'hoth' }],
    [
      { kind: 'gameOver', winner: 'rebels', reason: 'timeReachedReputation' },
      'gameOver',
      { winner: 'rebels', reason: 'timeReachedReputation' },
    ],
  ])('%o', (a, kind, values) => {
    expect(announcementI18n(a)).toEqual({ key: `rebellion.match:announce.${kind}`, values });
  });
});
