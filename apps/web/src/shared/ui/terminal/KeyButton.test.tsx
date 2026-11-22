import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { KeyButton } from './KeyButton';
import { renderKit, rgb } from './renderKit';

const k = terminalTokens.key;

describe('KeyButton (SWR-009 TC-TK-08)', () => {
  it.each([
    ['default', k.default],
    ['primary', k.primary],
    ['warning', k.warning],
    ['danger', k.danger],
  ] as const)('%s tone → theme key colours', (tone, colors) => {
    renderKit(<KeyButton tone={tone}>Go</KeyButton>);
    const s = getComputedStyle(screen.getByRole('button', { name: 'Go' }));
    expect(s.backgroundColor).toBe(rgb(colors.bg));
    expect(s.borderTopColor).toBe(rgb(colors.border));
    expect(s.color).toBe(rgb(colors.text));
  });

  it('selected → aria-pressed + amber selected look; LED before the label; click works', async () => {
    const onClick = vi.fn();
    renderKit(
      <KeyButton selected led="green" onClick={onClick}>
        Leia
      </KeyButton>,
    );
    const key = screen.getByRole('button', { name: 'Leia' });
    expect(key).toHaveAttribute('aria-pressed', 'true');
    expect(getComputedStyle(key).backgroundColor).toBe(rgb(k.selected.bg));
    expect(key.querySelector('[data-state="green"]')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(key);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('selected={false} → aria-pressed="false"; no prop → no aria-pressed', () => {
    renderKit(
      <>
        <KeyButton selected={false}>A</KeyButton>
        <KeyButton>B</KeyButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'B' })).not.toHaveAttribute('aria-pressed');
  });

  it('disabled → disabled attribute, lowered opacity, no click', async () => {
    const onClick = vi.fn();
    renderKit(
      <KeyButton disabled onClick={onClick}>
        Pass
      </KeyButton>,
    );
    const key = screen.getByRole('button', { name: 'Pass' });
    expect(key).toBeDisabled();
    expect(getComputedStyle(key).opacity).toBe(String(k.disabled.opacity));
    await userEvent.click(key).catch(() => {});
    expect(onClick).not.toHaveBeenCalled();
  });
});
