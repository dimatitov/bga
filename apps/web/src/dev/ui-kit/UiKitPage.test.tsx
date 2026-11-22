import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { renderWithProviders } from '@/shared/test';
import en from './locales/en.json';
import ru from './locales/ru.json';

function flat(obj: unknown, prefix = ''): Record<string, unknown> {
  if (obj === null || typeof obj !== 'object') return { [prefix]: obj };
  return Object.assign(
    {},
    ...Object.entries(obj as Record<string, unknown>).map(([k, v]) =>
      flat(v, prefix ? `${prefix}.${k}` : k),
    ),
  ) as Record<string, unknown>;
}

async function openPage() {
  const view = renderWithProviders({ path: '/dev/ui-kit' });
  await screen.findByTestId('ui-kit-page');
  return view;
}

/** Prototype demo strings and game names that must never appear on the showcase (AC-16, brief S). */
const FORBIDDEN =
  /DEMO|SECTOR SCAN|DESIGN ITERATION|16:47|Rebellion|Star Wars|Empire|Rebel|Импер|Повстан|Корусант|Фелуци/i;

describe('/dev/ui-kit showcase (SWR-009 S, A-7)', () => {
  it('S-2: page renders every prototype section with its anchor and heading', async () => {
    await openPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('UI Kit');
    const ids = [
      'palette',
      'type',
      'controls',
      'signals',
      'panels',
      'dialogs',
      'markers',
      'legend',
    ];
    for (const id of ids) {
      const section = screen.getByTestId(`ui-kit-section-${id}`);
      expect(section).toHaveAttribute('id', id);
      expect(within(section).getAllByRole('heading', { level: 2 })[0]).toBeVisible();
    }
    const nav = screen.getByRole('navigation', { name: 'Разделы UI Kit' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(ids.map((id) => `#${id}`));
  });

  it('S-3: palette swatches show token values', async () => {
    await openPage();
    const swatch = screen.getByTestId('ui-kit-swatch-amber');
    expect(swatch).toHaveAttribute('data-color', terminalTokens.color.amber);
    expect(swatch).toHaveTextContent(terminalTokens.color.amber);
    expect(screen.getAllByTestId(/^ui-kit-swatch-/)).toHaveLength(12);
  });

  it('S-4: keys in every state come from the real KeyButton', async () => {
    await openPage();
    expect(screen.getByTestId('ui-kit-key-primary')).toHaveAttribute('data-tone', 'primary');
    expect(screen.getByTestId('ui-kit-key-warning')).toHaveAttribute('data-tone', 'warning');
    expect(screen.getByTestId('ui-kit-key-danger')).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByTestId('ui-kit-key-selected')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ui-kit-key-disabled')).toBeDisabled();
    expect(screen.getByTestId('ui-kit-key-focus')).toHaveClass('Mui-focusVisible');
    for (const k of ['normal', 'hover', 'pressed']) {
      expect(screen.getByTestId(`ui-kit-key-${k}`)).toHaveAttribute('data-tone', 'default');
    }
    expect(screen.getByTestId('ui-kit-input')).toHaveValue('Значение');
    expect(screen.getByTestId('ui-kit-switch')).toBeChecked();
  });

  it('S-5: LEDs, AI status cards, save badges, log, alerts, markers, legend', async () => {
    await openPage();
    for (const s of ['green', 'amber', 'red', 'off']) {
      expect(
        within(screen.getByTestId(`ui-kit-led-${s}`)).getByText(
          (_, el) => el?.getAttribute('data-state') === s,
        ),
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId('ui-kit-status-ready')).toHaveAttribute('data-tone', 'green');
    expect(screen.getByTestId('ui-kit-status-thinking')).toHaveAttribute('data-tone', 'amber');
    expect(screen.getByTestId('ui-kit-status-failed')).toHaveAttribute('data-tone', 'red');
    expect(screen.getByTestId('ui-kit-badges')).toHaveTextContent('Сохранено');
    expect(screen.getAllByTestId(/^ui-kit-log-entry-/)).toHaveLength(3);
    for (const s of ['info', 'warning', 'error']) {
      expect(screen.getByTestId(`ui-kit-alert-${s}`)).toHaveAttribute('role', 'alert');
    }
    expect(screen.getByTestId('ui-kit-marker-filledTriangle')).toHaveAttribute('data-count', '1');
    expect(screen.getByTestId('ui-kit-marker-pressed')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ui-kit-legend-dashed')).toHaveTextContent('Пунктирный контур');
    expect(screen.getAllByTestId(/^ui-kit-legend-/)).toHaveLength(8);
  });

  it('S-6: tabs switch the panel; the real Dialog opens and closes', async () => {
    const { user } = await openPage();
    const tabsBox = within(screen.getByTestId('ui-kit-tabs'));
    expect(tabsBox.getByRole('tab', { name: 'Первая' })).toHaveAttribute('aria-selected', 'true');
    const second = tabsBox.getByRole('tab', { name: 'Вторая' });
    await user.click(second);
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Вторая');

    await user.click(screen.getByTestId('ui-kit-dialog-open'));
    const dialog = await screen.findByRole('dialog', { name: 'Подтвердить действие?' });
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('S-7: no prototype demo strings or game names on the page', async () => {
    await openPage();
    expect(screen.getByTestId('ui-kit-page').textContent).not.toMatch(FORBIDDEN);
  });
});

describe('devUiKit namespace', () => {
  const ruFlat = flat(ru);
  const enFlat = flat(en);

  it('ru and en have identical keys and non-empty strings', () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(ruFlat).sort());
    for (const [key, value] of [...Object.entries(ruFlat), ...Object.entries(enFlat)]) {
      expect(typeof value, key).toBe('string');
      expect(value, key).not.toBe('');
    }
  });

  it('en has no Cyrillic; no demo strings or game names in either locale', () => {
    for (const [key, value] of Object.entries(enFlat)) {
      expect(String(value), key).not.toMatch(/[А-Яа-яЁё]/);
    }
    for (const [key, value] of [...Object.entries(ruFlat), ...Object.entries(enFlat)]) {
      expect(String(value), key).not.toMatch(FORBIDDEN);
    }
  });
});
