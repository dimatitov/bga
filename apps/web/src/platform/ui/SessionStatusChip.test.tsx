import { SessionStatusSchema } from '@bga/platform';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { SessionStatusChip } from './SessionStatusChip';

const RU = { setup: 'Настройка', prototype: 'Прототип', active: 'Идёт', completed: 'Завершена' };
const EN = {
  setup: 'Setup',
  prototype: 'Prototype',
  active: 'In progress',
  completed: 'Completed',
};

describe('SessionStatusChip (AC-13, Q-21, plan-frontend §3)', () => {
  it.each(SessionStatusSchema.options)(
    '%s: word + icon + data-status (not colour only)',
    (status) => {
      render(<SessionStatusChip status={status} data-testid="chip" />);
      const chip = screen.getByTestId('chip');
      expect(chip).toHaveAttribute('data-status', status);
      expect(chip).toHaveTextContent(RU[status]);
      const icon = chip.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    },
  );

  it('every status has an English word', async () => {
    await act(() => i18n.changeLanguage('en'));
    for (const status of SessionStatusSchema.options) {
      const { unmount } = render(<SessionStatusChip status={status} data-testid="chip" />);
      expect(screen.getByTestId('chip')).toHaveTextContent(EN[status]);
      unmount();
    }
  });

  it('unknown status (newer server) → nothing rendered', () => {
    const { container } = render(<SessionStatusChip status="archived" data-testid="chip" />);
    expect(screen.queryByTestId('chip')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
