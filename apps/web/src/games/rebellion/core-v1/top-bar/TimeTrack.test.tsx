import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { TimeTrack } from './TimeTrack';

describe('TimeTrack (SWR-005 P2, D-SW5-12, AC-12)', () => {
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

  it('scale: max(reputation, 16) ticks, two markers of different shape (diamond + ring), decorative', () => {
    const { container, rerender } = render(<TimeTrack time={1} reputation={14} />);
    const scale = screen.getByTestId('time-track-scale');
    expect(scale).toHaveAttribute('aria-hidden', 'true');
    // 1 axis + 16 ticks
    expect(scale.querySelectorAll('line')).toHaveLength(17);
    expect(scale.querySelectorAll('circle')).toHaveLength(1);
    expect(scale.querySelectorAll('path')).toHaveLength(1);
    rerender(<TimeTrack time={3} reputation={18} />);
    expect(container.querySelectorAll('[data-testid="time-track-scale"] line')).toHaveLength(19);
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
