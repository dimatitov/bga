import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { makeMovedView, makeView } from '../test/fixtures';
import { logMessage } from './logMessage';

describe('TC-WEB-13: logMessage', () => {
  const view = makeMovedView(makeView());
  const t = i18n.t.bind(i18n);

  beforeEach(async () => {
    await i18n.changeLanguage('ru');
  });

  it('GAME_CREATED', () => {
    expect(logMessage(view.log[0]!, t, view)).toBe('Партия создана');
  });

  it('PHASE_ADVANCED names actor, phase and round', () => {
    const text = logMessage(view.log[1]!, t, view);
    expect(text).toContain('Империя');
    expect(text).toContain('Назначение');
    expect(text).toContain('1');
  });

  it('PIECES_MOVED names actor, piece and both systems', () => {
    expect(logMessage(view.log[2]!, t, view)).toBe('Империя: Крейсер — Аурелис → Бревора');
  });

  it('TURN_ENDED / HANDOFF_ACCEPTED (SWR-004 hot-seat) name the sides', async () => {
    const at = '2026-11-08T10:03:00.000Z';
    expect(
      logMessage(
        { seq: 4, at, type: 'TURN_ENDED', actor: 'empire', payload: { toSide: 'rebels' } },
        t,
        view,
      ),
    ).toBe('Империя передаёт ход: Повстанцы');
    expect(
      logMessage({ seq: 5, at, type: 'HANDOFF_ACCEPTED', actor: 'rebels', payload: {} }, t, view),
    ).toBe('Повстанцы: ход принят');
    await i18n.changeLanguage('en');
    expect(
      logMessage(
        { seq: 4, at, type: 'TURN_ENDED', actor: 'empire', payload: { toSide: 'rebels' } },
        t,
        view,
      ),
    ).toBe(`Empire passes the turn to ${i18n.t('rebellion.common:faction.rebels')}`);
  });

  it('unknown event type → board:log.unknown', () => {
    const text = logMessage(
      { seq: 9, at: '2026-11-08T00:00:00.000Z', type: 'SOMETHING_NEW', actor: 'system' },
      t,
      view,
    );
    expect(text).toBe(i18n.t('rebellion.board:log.unknown', { type: 'SOMETHING_NEW' }));
  });

  it('English', async () => {
    await i18n.changeLanguage('en');
    expect(logMessage(view.log[2]!, t, view)).toBe('Empire: Capital ship — Aurelis → Brevora');
  });
});
