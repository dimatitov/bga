import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '@/shared/test';
import { announce, notify } from './feedbackStore';

function Blank() {
  return null;
}

describe('FeedbackHost', () => {
  it('notify → snackbar `feedback` + same text in the single live-region (R-12)', async () => {
    mockFetch({});
    const onRetry = vi.fn();
    const { user } = renderWithProviders({ element: <Blank /> });
    expect(screen.getAllByTestId('live-region')).toHaveLength(1);
    expect(screen.getByTestId('live-region')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('live-region')).toHaveAttribute('role', 'status');

    act(() =>
      notify({
        severity: 'error',
        message: 'Сбой',
        action: { label: 'Повторить', onClick: onRetry },
      }),
    );
    const snackbar = await screen.findByTestId('feedback');
    expect(snackbar).toHaveTextContent('Сбой');
    expect(snackbar).toHaveAttribute('data-severity', 'error');
    expect(screen.getByTestId('live-region')).toHaveTextContent('Сбой');

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('announce → live-region only', () => {
    mockFetch({});
    renderWithProviders({ element: <Blank /> });
    act(() => announce('Перемещение отменено'));
    expect(screen.getByTestId('live-region')).toHaveTextContent('Перемещение отменено');
    expect(screen.queryByTestId('feedback')).not.toBeInTheDocument();
  });
});
