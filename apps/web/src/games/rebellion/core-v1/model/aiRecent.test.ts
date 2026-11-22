import { describe, expect, it } from 'vitest';
import {
  aiRunEventsRedacted,
  CORE_HOT_SEAT,
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_HOTH,
  CS_SULLUST,
  CS_YAVIN,
  empireRedactedView,
  L_LEIA,
  L_VADER,
  makeCoreView,
  U_SD,
  withLastRun,
} from '../../test/coreFixtures';
import { aiRecentMarks } from './aiRecent';

const AT = '2026-11-08T10:00:00.000Z';

describe('aiRecentMarks (SWR-009 K-5, AC-11, QD-3)', () => {
  it('null outside an AI game or without a last run', () => {
    expect(aiRecentMarks(null, makeCoreView())).toBeNull();
    expect(
      aiRecentMarks(withLastRun([]), makeCoreView({ settings: { ...CORE_HOT_SEAT } })),
    ).toBeNull();
  });

  it('Rebels vs AI Empire: AI activation + move mark systems in order of first appearance, deduplicated', () => {
    const run = withLastRun([
      {
        seq: 5,
        at: AT,
        type: 'SYSTEM_ACTIVATED',
        actor: 'empire',
        payload: { leaderId: L_VADER, systemId: CS_CORELLIA },
      },
      {
        seq: 6,
        at: AT,
        type: 'PIECES_MOVED',
        actor: 'empire',
        payload: { pieceIds: [U_SD], fromSystemId: CS_CORUSCANT, toSystemId: CS_CORELLIA },
      },
    ]);
    expect(aiRecentMarks(run, makeCoreView())).toEqual({
      systemIds: [CS_CORELLIA, CS_CORUSCANT],
      zone: false,
    });
  });

  it("the player's own events, system events, unknown systems and unparsable events never mark", () => {
    const run = withLastRun(
      [
        {
          seq: 5,
          at: AT,
          type: 'SYSTEM_ACTIVATED',
          actor: 'rebels',
          payload: { leaderId: L_LEIA, systemId: CS_SULLUST },
        },
        { seq: 6, at: AT, type: 'BASE_REVEALED', actor: 'system', payload: { systemId: CS_YAVIN } },
        {
          seq: 7,
          at: AT,
          type: 'SYSTEM_ACTIVATED',
          actor: 'empire',
          payload: { leaderId: L_VADER, systemId: 'not-on-this-map' },
        },
        { type: 'SYSTEM_ACTIVATED', actor: 'empire', payload: { systemId: CS_HOTH } },
        'garbage',
      ],
      { source: 'command' },
    );
    expect(aiRecentMarks(run, makeCoreView())).toEqual({ systemIds: [], zone: false });
  });

  it('Empire vs AI Rebels (redacted): null systems mark the zone; the base system is never returned', () => {
    const view = empireRedactedView();
    const marks = aiRecentMarks(withLastRun(aiRunEventsRedacted()), view)!;
    expect(marks).toEqual({ systemIds: [CS_SULLUST, CS_HOTH], zone: true });
    expect(marks.systemIds).not.toContain(CS_YAVIN);
    expect(JSON.stringify(marks)).not.toContain(CS_YAVIN);
  });

  it('a null system is ignored when no hidden zone is shown (base known)', () => {
    const view = makeCoreView({
      settings: { ...makeCoreView().settings, opponentFaction: 'rebels', playerFaction: 'empire' },
    });
    const marks = aiRecentMarks(withLastRun(aiRunEventsRedacted()), view)!;
    expect(marks.zone).toBe(false);
  });
});
