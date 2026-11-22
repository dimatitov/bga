import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetSettingsStore, useSettingsStore } from '@/shared/settings';
import { terminalTokens } from '@/shared/theme';
import { Led } from './Led';
import { LED_COLORS, type LedState } from './ledColors';
import { renderKit, rgb } from './renderKit';

afterEach(() => resetSettingsStore());

describe('Led (SWR-009 TC-TK-07)', () => {
  it.each(['green', 'amber', 'red', 'off'] as const)(
    '%s: own token colour, aria-hidden, data-state; the meaning is in the text next to it',
    (state: LedState) => {
      renderKit(
        <p>
          <Led state={state} data-testid="led" /> Ready
        </p>,
      );
      const led = screen.getByTestId('led');
      expect(led).toHaveAttribute('aria-hidden', 'true');
      expect(led).toHaveAttribute('data-state', state);
      expect(getComputedStyle(led).backgroundColor).toBe(rgb(LED_COLORS[state].fill));
      expect(led.closest('p')).toHaveTextContent('Ready');
    },
  );

  it('the four states have four different fills', () => {
    expect(new Set(Object.values(LED_COLORS).map((c) => c.fill)).size).toBe(4);
    expect(LED_COLORS.green.fill).toBe(terminalTokens.color.phosphor);
    expect(LED_COLORS.red.fill).toBe(terminalTokens.color.red);
  });

  it('blink is on by default motion and off with the reduce-motion setting', () => {
    const { unmount } = renderKit(<Led state="amber" blink data-testid="led" />);
    expect(screen.getByTestId('led')).toHaveAttribute('data-blink', 'true');
    unmount();
    useSettingsStore.setState({ reduceMotion: true });
    renderKit(<Led state="amber" blink data-testid="led" />);
    expect(screen.getByTestId('led')).toHaveAttribute('data-blink', 'false');
  });
});
