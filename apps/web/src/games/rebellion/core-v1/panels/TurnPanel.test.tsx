import type { PlayerEvent } from '@bga/game-rebellion/schema';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import {
  makeCoreActivationView,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreView,
} from '../../test/coreFixtures';
import { factionLabel } from './labels';
import { renderCore, resetCoreStores } from './test/harness';
import { TurnPanel } from './TurnPanel';
import { responseAnnouncements } from './useTurnCommands';

beforeEach(resetCoreStores);

const t = i18n.t;

describe('TurnPanel states (P1, plan-frontend §5.1, §9)', () => {
  it('idle: «your turn» text, pool, no move panel', () => {
    renderCore(<TurnPanel />, makeCoreView());
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'idle');
    expect(screen.getByTestId('turn-status')).toHaveTextContent(t('rebellion.turn:panel.yourTurn'));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      t('rebellion.turn:panel.title'),
    );
    expect(screen.queryByTestId('move-panel')).not.toBeInTheDocument();
  });

  it('R-6 rev.2: the opponent has passed → consecutive turns are explained', () => {
    renderCore(<TurnPanel />, makeCoreEmpireView());
    expect(screen.getByTestId('turn-status')).toHaveTextContent(
      t('rebellion.turn:panel.opponentPassed.rebels'),
    );
    expect(screen.getByTestId('leader-pool')).toBeInTheDocument();
  });

  it('waiting: not my turn → the side to play, no pool and no actions', () => {
    renderCore(<TurnPanel />, makeCoreView({ activeSide: 'empire', legalActions: [] }));
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'waiting');
    expect(screen.getByTestId('turn-status')).toHaveTextContent(
      t('rebellion.turn:panel.waiting', { side: factionLabel(t, 'empire') }),
    );
    expect(screen.queryByTestId('leader-pool')).not.toBeInTheDocument();
  });

  it('waiting after my own pass → «you passed»', () => {
    renderCore(
      <TurnPanel />,
      makeCoreView({
        activeSide: 'empire',
        passed: { rebels: true, empire: false },
        legalActions: [],
      }),
    );
    expect(screen.getByTestId('turn-status')).toHaveTextContent(
      t('rebellion.turn:panel.youPassed'),
    );
  });

  it('activation and over', () => {
    const { unmount } = renderCore(<TurnPanel />, makeCoreActivationView());
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'activation');
    expect(screen.getByTestId('move-panel')).toBeInTheDocument();
    unmount();
    renderCore(<TurnPanel />, makeCoreOutcomeView());
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'over');
    expect(screen.getByTestId('turn-status')).toHaveTextContent(t('rebellion.turn:panel.gameOver'));
    expect(screen.queryByTestId('leader-pool')).not.toBeInTheDocument();
  });
});

describe('responseAnnouncements', () => {
  const events: PlayerEvent[] = [
    {
      seq: 5,
      at: '2026-11-08T10:00:00.000Z',
      type: 'PASSED',
      actor: 'empire',
      payload: { auto: true },
    } as PlayerEvent,
  ];

  it('reads the AI auto-pass with the side name when the match key exists', () => {
    const texts = responseAnnouncements(
      ((key: string, values?: Record<string, unknown>) =>
        key === 'rebellion.match:announce.autoPass'
          ? `auto:${String(values?.side)}`
          : t(key, values)) as typeof t,
      () => true,
      makeCoreView(),
      events,
    );
    expect(texts).toEqual([`auto:${factionLabel(t, 'empire')}`]);
  });

  it('skips announcements whose key does not exist yet (no raw keys read out)', () => {
    expect(responseAnnouncements(t, () => false, makeCoreView(), events)).toEqual([]);
  });
});
