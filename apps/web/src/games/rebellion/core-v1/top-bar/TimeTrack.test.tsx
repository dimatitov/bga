import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { terminalTokens } from '@/shared/theme';
import { rgb } from '@/shared/ui/terminal/renderKit';
import { trackPercent, trackTicks } from './statusBarModel';
import { TimeTrack } from './TimeTrack';

describe('TimeTrack (SWR-005 P2, D-SW5-12, AC-12; SWR-009 C1 status bar)', () => {
  it('data attributes, visible text and aria-label «Время N из M…» (ru)', () => {
    render(<TimeTrack time={2} reputation={14} />);
    const track = screen.getByTestId('time-track');
    expect(track).toHaveAttribute('data-time', '2');
    expect(track).toHaveAttribute('data-reputation', '14');
    expect(track).toHaveTextContent('Время 2 · Репутация 14');
    expect(track).toHaveAccessibleName(
      'Время 2 из 14: Повстанцы побеждают, когда время дойдёт до репутации',
    );
    expect(screen.getByRole('group')).toBe(track);
  });

  it('scale: max(reputation, time, 16) ticks, time = diamond, reputation = ring at their positions, decorative', () => {
    const { rerender } = render(<TimeTrack time={1} reputation={14} />);
    const scale = screen.getByTestId('time-track-scale');
    expect(scale).toHaveAttribute('aria-hidden', 'true');
    expect(scale).toHaveAttribute('data-ticks', '16');
    expect(screen.getAllByTestId('time-track-tick')).toHaveLength(16);
    const time = screen.getByTestId('time-track-time-marker');
    const rep = screen.getByTestId('time-track-reputation-marker');
    expect(time).toHaveAttribute('data-shape', 'diamond');
    expect(rep).toHaveAttribute('data-shape', 'ring');
    expect(getComputedStyle(time).left).toBe('0%');
    expect(parseFloat(getComputedStyle(rep).left)).toBeCloseTo(trackPercent(14, 16), 3);
    // Colours come from the terminal tokens: red diamond, phosphor ring.
    expect(getComputedStyle(time).backgroundColor).toBe(rgb(terminalTokens.color.red));
    expect(getComputedStyle(rep).borderColor).toBe(rgb(terminalTokens.color.phosphor));
    rerender(<TimeTrack time={3} reputation={18} />);
    expect(screen.getByTestId('time-track-scale')).toHaveAttribute('data-ticks', '18');
    expect(screen.getAllByTestId('time-track-tick')).toHaveLength(18);
  });

  it('labels: «Время N» at the left end, «Репутация M» at the right end', () => {
    render(<TimeTrack time={4} reputation={11} />);
    expect(screen.getByTestId('time-track-time')).toHaveTextContent('Время 4');
    expect(screen.getByTestId('time-track-reputation')).toHaveTextContent('Репутация 11');
  });

  it('trackPercent / trackTicks: clamped to the scale', () => {
    expect(trackTicks(1, 14)).toBe(16);
    expect(trackTicks(20, 14)).toBe(20);
    expect(trackPercent(1, 16)).toBe(0);
    expect(trackPercent(16, 16)).toBe(100);
    expect(trackPercent(0, 16)).toBe(0);
    expect(trackPercent(99, 16)).toBe(100);
  });

  it('en text', async () => {
    await i18n.changeLanguage('en');
    render(<TimeTrack time={5} reputation={12} />);
    expect(screen.getByTestId('time-track')).toHaveTextContent('Time 5 · Reputation 12');
    expect(screen.getByTestId('time-track')).toHaveAccessibleName(
      'Time 5 of 12: the Rebels win when time reaches reputation',
    );
  });
});
