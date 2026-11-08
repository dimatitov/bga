/**
 * SWR-005 P2 (plan-frontend §12, AC-06/08/10): texts of the `core-v1` log and of the response announcements.
 * Names of systems / leaders / units belong to `rebellion.data` (Worker M) — expectations take them from the
 * namespace (with the same id fallback), so the test does not depend on the exact wording there.
 */
import type { CoreViewEvent } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import {
  CS_CORELLIA,
  CS_SULLUST,
  CS_YAVIN,
  L_LEIA,
  L_VADER,
  U_RT_SULLUST,
  U_TRANSPORT,
  makeCoreView,
} from '../../test/coreFixtures';
import { announcementsFor } from '../model/announcements';
import {
  announcementText,
  coreLeaderName,
  coreLogMessage,
  coreSystemName,
  coreUnitName,
  isAutoEvent,
} from './coreLogMessage';

const ru = i18n.getFixedT('ru');
const en = i18n.getFixedT('en');
const AT = '2026-11-08T10:00:00.000Z';
const view = makeCoreView();

const sys = (t: typeof ru, id: string) =>
  t(`systems.${id}`, { ns: 'rebellion.data', defaultValue: id });
const leader = (t: typeof ru, id: string) =>
  t(`leaders.${id}.name`, { ns: 'rebellion.data', defaultValue: id });

function ev(e: Omit<CoreViewEvent, 'seq' | 'at'>, seq = 10): CoreViewEvent {
  return { seq, at: AT, ...e } as CoreViewEvent;
}

describe('coreLogMessage (SWR-005 P2, TC-C-09)', () => {
  it('every core event type has a localized text (ru, en), no keys / «undefined» leak', () => {
    const events: CoreViewEvent[] = [
      ev({ type: 'GAME_CREATED', actor: 'system', payload: { scenarioId: 'core-v1' } }),
      ev({ type: 'HANDOFF_ACCEPTED', actor: 'empire', payload: {} }),
      ev({ type: 'PHASE_STARTED', actor: 'system', payload: { round: 2, phase: 'command' } }),
      ev({
        type: 'SYSTEM_ACTIVATED',
        actor: 'rebels',
        payload: { leaderId: L_LEIA, systemId: CS_CORELLIA },
      }),
      ev({
        type: 'PIECES_MOVED',
        actor: 'rebels',
        payload: { pieceIds: [U_TRANSPORT], fromSystemId: CS_SULLUST, toSystemId: CS_CORELLIA },
      }),
      ev({ type: 'ACTIVATION_FINISHED', actor: 'rebels', payload: { auto: false } }),
      ev({ type: 'PASSED', actor: 'rebels', payload: { auto: false } }),
      ev({ type: 'LEADERS_RETURNED', actor: 'system', payload: { leaderIds: [L_LEIA] } }),
      ev({ type: 'TIME_ADVANCED', actor: 'system', payload: { from: 1, to: 2 } }),
      ev({ type: 'BASE_REVEALED', actor: 'system', payload: { systemId: CS_YAVIN } }),
      ev({
        type: 'GAME_OVER',
        actor: 'system',
        payload: { winner: 'rebels', reason: 'timeReachedReputation' },
      }),
    ];
    for (const t of [ru, en]) {
      for (const e of events) {
        const text = coreLogMessage(e, t, view);
        expect(text, e.type).not.toMatch(/rebellion\.|undefined|\{\{|log\./);
        expect(text.length, e.type).toBeGreaterThan(0);
      }
    }
    for (const e of events) {
      expect(coreLogMessage(e, en, view), e.type).not.toMatch(/[А-Яа-яЁё]/);
    }
  });

  it('exact ru texts: activation, move, phase, time, leaders, reveal, game over', () => {
    expect(
      coreLogMessage(
        ev({
          type: 'SYSTEM_ACTIVATED',
          actor: 'rebels',
          payload: { leaderId: L_LEIA, systemId: CS_CORELLIA },
        }),
        ru,
        view,
      ),
    ).toBe(`Повстанцы: ${leader(ru, L_LEIA)} активирует систему ${sys(ru, CS_CORELLIA)}`);
    expect(
      coreLogMessage(
        ev({
          type: 'PIECES_MOVED',
          actor: 'rebels',
          payload: {
            pieceIds: [U_TRANSPORT, U_RT_SULLUST],
            fromSystemId: CS_SULLUST,
            toSystemId: CS_CORELLIA,
          },
        }),
        ru,
        view,
      ),
    ).toBe(
      `Повстанцы: ${coreUnitName(ru, U_TRANSPORT, view)}, ${coreUnitName(ru, U_RT_SULLUST, view)} — ` +
        `${sys(ru, CS_SULLUST)} → ${sys(ru, CS_CORELLIA)}`,
    );
    expect(
      coreLogMessage(
        ev({ type: 'PHASE_STARTED', actor: 'system', payload: { round: 3, phase: 'command' } }),
        ru,
      ),
    ).toBe('Раунд 3: фаза «Приказы»');
    expect(
      coreLogMessage(
        ev({ type: 'TIME_ADVANCED', actor: 'system', payload: { from: 1, to: 2 } }),
        ru,
      ),
    ).toBe('Маркер времени: 1 → 2');
    expect(
      coreLogMessage(
        ev({
          type: 'LEADERS_RETURNED',
          actor: 'system',
          payload: { leaderIds: [L_LEIA, L_VADER] },
        }),
        ru,
      ),
    ).toBe(`Лидеры вернулись в пулы: ${leader(ru, L_LEIA)}, ${leader(ru, L_VADER)}`);
    expect(
      coreLogMessage(
        ev({ type: 'LEADERS_RETURNED', actor: 'system', payload: { leaderIds: [] } }),
        ru,
      ),
    ).toBe('Лидеры вернулись в пулы');
    expect(
      coreLogMessage(
        ev({ type: 'BASE_REVEALED', actor: 'system', payload: { systemId: CS_YAVIN } }),
        ru,
        view,
      ),
    ).toBe(`База Повстанцев раскрыта: ${sys(ru, CS_YAVIN)}`);
    expect(
      coreLogMessage(
        ev({
          type: 'GAME_OVER',
          actor: 'system',
          payload: { winner: 'empire', reason: 'rebelBaseCaptured' },
        }),
        ru,
      ),
    ).toMatch(/^Партия окончена\. Победа Империи: База Повстанцев захвачена/);
    expect(
      coreLogMessage(
        ev({
          type: 'GAME_OVER',
          actor: 'system',
          payload: { winner: 'rebels', reason: 'timeReachedReputation' },
        }),
        en,
      ),
    ).toBe('Game over. Rebel victory: Time reached reputation');
  });

  it('AI auto-pass / auto-finish (AM-BE-4, AC-08): «Империя (AI) пасует», side grammar per faction; isAutoEvent', () => {
    const autoPass = ev({ type: 'PASSED', actor: 'empire', payload: { auto: true } });
    expect(isAutoEvent(autoPass)).toBe(true);
    expect(coreLogMessage(autoPass, ru)).toBe('Империя (AI) пасует');
    expect(coreLogMessage(autoPass, en)).toBe('Empire (AI) passes');
    expect(
      coreLogMessage(ev({ type: 'PASSED', actor: 'rebels', payload: { auto: true } }), ru),
    ).toBe('Повстанцы (AI) пасуют');
    const humanPass = ev({ type: 'PASSED', actor: 'rebels', payload: { auto: false } });
    expect(isAutoEvent(humanPass)).toBe(false);
    expect(coreLogMessage(humanPass, ru)).toBe('Повстанцы пасуют');
    expect(
      coreLogMessage(
        ev({ type: 'ACTIVATION_FINISHED', actor: 'empire', payload: { auto: true } }),
        ru,
      ),
    ).toBe('Империя (AI) завершает активацию');
    expect(
      coreLogMessage(
        ev({ type: 'ACTIVATION_FINISHED', actor: 'rebels', payload: { auto: false } }),
        ru,
      ),
    ).toBe('Повстанцы завершают активацию');
  });

  it('hidden rebel-base zone (AC-10): a null system is «скрытая зона», never an id lookup', () => {
    const toZone = ev({
      type: 'PIECES_MOVED',
      actor: 'rebels',
      payload: { pieceIds: ['u-x'], fromSystemId: CS_CORELLIA, toSystemId: null },
    });
    expect(coreLogMessage(toZone, ru, view)).toBe(
      `Повстанцы: юнит — ${sys(ru, CS_CORELLIA)} → скрытая зона`,
    );
    const fromZone = ev({
      type: 'PIECES_MOVED',
      actor: 'rebels',
      payload: { pieceIds: ['u-x'], fromSystemId: null, toSystemId: CS_CORELLIA },
    });
    expect(coreLogMessage(fromZone, en, view)).toBe(
      `Rebels: unit — hidden zone → ${sys(en, CS_CORELLIA)}`,
    );
    const activatedZone = ev({
      type: 'SYSTEM_ACTIVATED',
      actor: 'empire',
      payload: { leaderId: L_VADER, systemId: null },
    });
    expect(coreLogMessage(activatedZone, ru, view)).toBe(
      `Империя: ${leader(ru, L_VADER)} активирует систему скрытая зона`,
    );
    expect(coreSystemName(ru, null)).toBe('скрытая зона');
  });

  it('unknown event type → rebellion.match:log.unknown; unknown leader / system fall back to the id', () => {
    expect(coreLogMessage({ seq: 1, at: AT, type: 'COMBAT', actor: 'system' }, ru)).toBe(
      'Событие: COMBAT',
    );
    expect(coreLeaderName(ru, 'no-such-leader')).toBe('no-such-leader');
    expect(coreSystemName(ru, 'no-such-system')).toBe('no-such-system');
    expect(coreUnitName(ru, 'no-such-unit', view)).toBe('юнит');
  });
});

describe('announcementText (FE-0 contract rebellion.match:announce.*)', () => {
  it('every announcement kind renders a full sentence in ru and en', () => {
    const events: CoreViewEvent[] = [
      ev({ type: 'PASSED', actor: 'empire', payload: { auto: true } }, 1),
      ev({ type: 'ACTIVATION_FINISHED', actor: 'empire', payload: { auto: true } }, 2),
      ev({ type: 'PASSED', actor: 'empire', payload: { auto: false } }, 3),
      ev(
        { type: 'LEADERS_RETURNED', actor: 'system', payload: { leaderIds: [L_LEIA, L_VADER] } },
        4,
      ),
      ev({ type: 'TIME_ADVANCED', actor: 'system', payload: { from: 1, to: 2 } }, 5),
      ev({ type: 'BASE_REVEALED', actor: 'system', payload: { systemId: CS_YAVIN } }, 6),
      ev(
        {
          type: 'GAME_OVER',
          actor: 'system',
          payload: { winner: 'rebels', reason: 'timeReachedReputation' },
        },
        7,
      ),
    ];
    const list = announcementsFor(events, 'rebels');
    expect(list.map((a) => a.kind)).toEqual([
      'autoPass',
      'autoFinish',
      'opponentPassed',
      'leadersReturned',
      'newRound',
      'baseRevealed',
      'gameOver',
    ]);
    const ruTexts = list.map((a) => announcementText(a, ru, view));
    expect(ruTexts).toEqual([
      'Империя (AI) пасует — авто: AI Commander ещё не реализован',
      'Империя (AI) завершает активацию — авто',
      'Империя пасует',
      'Новый раунд: 2 лидера вернулись в пулы',
      'Раунд 2: маркер времени сдвинут',
      `База Повстанцев раскрыта: ${sys(ru, CS_YAVIN)}`,
      'Партия окончена. Победа Повстанцев: Время дошло до репутации',
    ]);
    for (const a of list) {
      const text = announcementText(a, en, view);
      expect(text).not.toMatch(/[А-Яа-яЁё]|rebellion\.|\{\{|undefined/);
    }
    expect(announcementText({ kind: 'leadersReturned', count: 1 }, en)).toBe(
      'New round: 1 leader returned to the pool',
    );
    expect(announcementText({ kind: 'leadersReturned', count: 5 }, ru)).toBe(
      'Новый раунд: 5 лидеров вернулись в пулы',
    );
  });
});
