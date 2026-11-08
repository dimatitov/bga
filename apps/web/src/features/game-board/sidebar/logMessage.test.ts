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

  it('unknown event type → board:log.unknown', () => {
    const text = logMessage(
      { seq: 9, at: '2026-11-08T00:00:00.000Z', type: 'SOMETHING_NEW', actor: 'system' },
      t,
      view,
    );
    expect(text).toBe(i18n.t('board:log.unknown', { type: 'SOMETHING_NEW' }));
  });

  it('English', async () => {
    await i18n.changeLanguage('en');
    expect(logMessage(view.log[2]!, t, view)).toBe('Empire: Capital ship — Aurelis → Brevora');
  });
});
