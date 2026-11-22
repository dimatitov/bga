import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { Readout } from './Readout';
import { renderKit, rgb } from './renderKit';

describe('Readout (SWR-009 UI Kit)', () => {
  it('meta label + metric value (phosphor 22px)', () => {
    renderKit(<Readout label="Round" value="03" valueVariant="metric" data-testid="r" />);
    const r = screen.getByTestId('r');
    expect(r).toHaveTextContent('Round03');
    const value = screen.getByText('03');
    expect(getComputedStyle(value).fontSize).toBe('22px');
    expect(getComputedStyle(value).color).toBe(rgb(terminalTokens.color.phosphor));
    expect(getComputedStyle(screen.getByText('Round')).textTransform).toBe('uppercase');
  });
});
