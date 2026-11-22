import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { Led } from './Led';
import { renderKit, rgb } from './renderKit';
import { StatusCard } from './StatusCard';

const EDGE = {
  green: terminalTokens.color.phosphor,
  amber: terminalTokens.color.amber,
  red: terminalTokens.color.red,
} as const;

describe('StatusCard (SWR-009 UI Kit status)', () => {
  it.each(['green', 'amber', 'red'] as const)('%s: 3px tone edge, title and text', (tone) => {
    renderKit(
      <StatusCard tone={tone} title="AI ready" icon={<Led state={tone} />} data-testid="card">
        3 actions
      </StatusCard>,
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveTextContent('AI ready');
    expect(card).toHaveTextContent('3 actions');
    const s = getComputedStyle(card);
    expect(s.borderLeftWidth).toBe('3px');
    expect(s.borderLeftColor).toBe(rgb(EDGE[tone]));
  });
});
