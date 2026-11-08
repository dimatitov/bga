import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { buildResources, i18n, localeOf } from './i18n';
import { translateError, translateUnknownError } from './translateError';

describe('translateError', () => {
  const t = i18n.t.bind(i18n);

  it('messageKey errors.<name> → errors:<name>', () => {
    expect(translateError(t, { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' })).toBe(
      'Партия не найдена.',
    );
  });

  it('unknown messageKey → by code; unknown code → errors:unknown', () => {
    expect(translateError(t, { code: 'VERSION_CONFLICT', messageKey: 'errors.somethingNew' })).toBe(
      'Состояние партии обновилось. Повторите действие.',
    );
    expect(translateError(t, { code: 'WHAT', messageKey: 'errors.somethingNew' })).toBe(
      'Неизвестная ошибка.',
    );
    expect(translateError(t, {})).toBe('Неизвестная ошибка.');
  });

  it('follows the current language', async () => {
    await i18n.changeLanguage('en');
    expect(translateError(t, { messageKey: 'errors.versionConflict' })).toBe(
      'The game state has changed. Check the map and repeat your move.',
    );
  });

  it('translateUnknownError handles ApiError and arbitrary values', () => {
    expect(
      translateUnknownError(
        t,
        new ApiError({ status: null, code: 'NETWORK', messageKey: 'errors.network' }),
      ),
    ).toMatch(/^Сервер недоступен/);
    expect(translateUnknownError(t, new Error('boom'))).toBe('Неизвестная ошибка.');
  });

  it('gameNs (SWR-003 §5.4): <gameNs>:<name> first, then errors:<name>, then code', () => {
    i18n.addResourceBundle('ru', 'probe.errors', { notAdjacent: 'Игровой текст' }, true, true);
    try {
      expect(
        translateError(t, { messageKey: 'errors.notAdjacent' }, { gameNs: 'probe.errors' }),
      ).toBe('Игровой текст');
      expect(
        translateError(t, { messageKey: 'errors.network' }, { gameNs: 'probe.errors' }),
      ).toMatch(/^Сервер недоступен/);
      // Without gameNs a game-only key falls back to the code text (platform `errors` has no game keys).
      expect(translateError(t, { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notAdjacent' })).toBe(
        'Недопустимое действие.',
      );
    } finally {
      i18n.removeResourceBundle('ru', 'probe.errors');
    }
  });
});

describe('i18n resources (SWR-003 §5.1)', () => {
  it('platform locales → <ns>; game locales → <prefix>.<area>', () => {
    expect(localeOf('../../locales/ru/common.json')).toEqual({ lng: 'ru', ns: 'common' });
    expect(localeOf('../../games/rebellion/locales/en/board.json')).toEqual({
      lng: 'en',
      ns: 'rebellion.board',
    });
    expect(localeOf('../../games/forbidden-stars/locales/ru/meta.json')).toEqual({
      lng: 'ru',
      ns: 'forbidden-stars.meta',
    });
    expect(localeOf('readme.md')).toBeNull();
    expect(
      buildResources({ '../../games/x/locales/ru/meta.json': { default: { a: 'b' } } }),
    ).toEqual({ ru: { 'x.meta': { a: 'b' } } });
  });

  it('namespace with a dot resolves: rebellion.meta and forbidden-stars.meta descriptions', () => {
    expect(i18n.t('rebellion.meta:description')).toMatch(/AI/);
    expect(i18n.t('forbidden-stars.meta:coverAlt')).toMatch(/^Абстрактная обложка/);
    expect(i18n.t('description', { ns: 'rebellion.meta', lng: 'en' })).toMatch(/^A solo game/);
  });
});
