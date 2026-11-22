import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessagePanel } from './MessagePanel';

describe('MessagePanel (SWR-009 N)', () => {
  it('keeps the page h1, says the status in words next to a decorative LED and passes props to the outer box', () => {
    render(
      <MessagePanel
        data-testid="msg"
        led="amber"
        status="Code 404"
        title="Not found"
        text="Nothing here"
        actions={<button type="button">Back</button>}
      />,
    );
    const outer = screen.getByTestId('msg');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Not found');
    expect(outer).toHaveTextContent('Code 404');
    expect(outer).toHaveTextContent('Nothing here');
    const led = outer.querySelector('[data-state="amber"]');
    expect(led).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('renders as another element when asked (route error is the <main>)', () => {
    render(<MessagePanel component="main" id="main" led="red" status="Fault" title="Error" />);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});
