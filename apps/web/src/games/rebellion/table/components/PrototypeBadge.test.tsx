import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@/shared/test';
import { makeHandoffView } from '../../board/test/fixtures';
import { CORE_SESSION_ID, makeCoreHandoffView } from '../../test/coreFixtures';
import { HandoffScreen } from './HandoffScreen';
import { PrototypeBadge } from './PrototypeBadge';

describe('PrototypeBadge variants (SWR-005 P2, TC-C-14, AC-11, AC-13)', () => {
  it('core-v1: the slice text', () => {
    render(<PrototypeBadge status="prototype" variant="core-v1" />);
    const badge = screen.getByTestId('prototype-badge');
    expect(badge).toHaveAttribute('data-variant', 'core-v1');
    expect(badge).toHaveAttribute('data-status', 'prototype');
    expect(badge).toHaveTextContent(
      'Реальная карта; правила частично: раунд и активация. Бой, миссии, производство — позже',
    );
  });

  it('legacy: «Старый прототип: тестовые правила»', () => {
    render(<PrototypeBadge status="prototype" variant="legacy" />);
    const badge = screen.getByTestId('prototype-badge');
    expect(badge).toHaveAttribute('data-variant', 'legacy');
    expect(badge).toHaveTextContent('Старый прототип: тестовые правила');
  });

  it('generic (default): the SWR-004 text', () => {
    render(<PrototypeBadge status="prototype" />);
    const badge = screen.getByTestId('prototype-badge');
    expect(badge).toHaveAttribute('data-variant', 'generic');
    expect(badge).toHaveTextContent(i18n.t('rebellion.common:prototype.full'));
  });

  it('visibility: completed keeps core/legacy disclaimers; generic only for prototype; active → nothing', () => {
    const { rerender } = render(<PrototypeBadge status="completed" variant="core-v1" />);
    expect(screen.getByTestId('prototype-badge')).toHaveAttribute('data-status', 'completed');
    rerender(<PrototypeBadge status="completed" variant="generic" />);
    expect(screen.queryByTestId('prototype-badge')).not.toBeInTheDocument();
    rerender(<PrototypeBadge status="active" variant="core-v1" />);
    expect(screen.queryByTestId('prototype-badge')).not.toBeInTheDocument();
    rerender(<PrototypeBadge status="active" variant="legacy" />);
    expect(screen.queryByTestId('prototype-badge')).not.toBeInTheDocument();
  });

  it('en texts', async () => {
    render(<PrototypeBadge status="prototype" variant="legacy" />);
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByTestId('prototype-badge')).toHaveTextContent('Old prototype: test rules');
  });
});

describe('HandoffScreen badge by handoff-view rulesEngine (AM-FE-8, TC-C-14) and phase «Приказы» (Q-FE-8, TC-C-18)', () => {
  it('core-v1 handoff → core-v1 badge; phase word «Приказы»', () => {
    renderWithProviders({
      element: (
        <HandoffScreen
          sessionId={CORE_SESSION_ID}
          view={makeCoreHandoffView({ phase: 'command', round: 3 })}
          backHref="/games/star-wars-rebellion"
        />
      ),
    });
    const screenEl = screen.getByTestId('handoff-screen');
    expect(within(screenEl).getByTestId('prototype-badge')).toHaveAttribute(
      'data-variant',
      'core-v1',
    );
    expect(screen.getByTestId('handoff-round')).toHaveTextContent('Раунд 3 · Приказы');
  });

  it('mock-v1 handoff → legacy badge', () => {
    renderWithProviders({
      element: (
        <HandoffScreen
          sessionId="mock-1"
          view={makeHandoffView({ rulesEngine: 'mock-v1' })}
          backHref="/games/star-wars-rebellion"
        />
      ),
    });
    const badge = within(screen.getByTestId('handoff-screen')).getByTestId('prototype-badge');
    expect(badge).toHaveAttribute('data-variant', 'legacy');
    expect(badge).toHaveTextContent('Старый прототип: тестовые правила');
  });
});
