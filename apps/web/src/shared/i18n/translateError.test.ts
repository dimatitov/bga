import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { i18n } from './i18n';
import { translateError, translateUnknownError } from './translateError';

describe('translateError', () => {
  const t = i18n.t.bind(i18n);

  it('messageKey errors.<name> → errors:<name>', () => {
    expect(translateError(t, { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notAdjacent' })).toBe(
      'Системы не соседние: туда переместиться нельзя.',
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
});
