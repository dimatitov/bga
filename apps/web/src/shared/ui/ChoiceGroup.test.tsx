import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceGroup, type ChoiceOption } from './ChoiceGroup';

type V = 'a' | 'b' | 'c' | 'd';

const OPTIONS: ChoiceOption<V>[] = [
  { value: 'a', label: 'A', testId: 'opt-a' },
  { value: 'b', label: 'B', testId: 'opt-b', disabled: true, badge: 'soon', describedBy: 'hint' },
  { value: 'c', label: 'C', testId: 'opt-c' },
  { value: 'd', label: 'D', testId: 'opt-d', disabled: true },
];

function Harness({
  initial = 'a',
  disabled,
  onChange,
}: {
  initial?: V | null;
  disabled?: boolean;
  onChange?: (v: V) => void;
}) {
  const [value, setValue] = useState<V | null>(initial);
  return (
    <>
      <button type="button">before</button>
      <span id="label">Group</span>
      <span id="hint">Not supported yet</span>
      <ChoiceGroup
        labelledBy="label"
        value={value}
        disabled={disabled}
        onChange={(v) => {
          onChange?.(v);
          setValue(v);
        }}
        options={OPTIONS}
        data-testid="group"
      />
      <button type="button">after</button>
    </>
  );
}

describe('ChoiceGroup (SWR-004 §2.6 extensions, TC-C-21)', () => {
  it('radiogroup with a name; checked option has aria-checked + data-selected; one tab stop', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Group' });
    expect(group).toHaveAttribute('data-testid', 'group');
    expect(screen.getByTestId('opt-a')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opt-a')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('opt-c')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('opt-c')).not.toHaveAttribute('data-selected');
    const stops = ['opt-a', 'opt-b', 'opt-c', 'opt-d'].filter(
      (id) => screen.getByTestId(id).tabIndex === 0,
    );
    expect(stops).toEqual(['opt-a']);
  });

  it('disabled option: aria-disabled, described, badge shown, never a tab stop, click does not select', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const b = screen.getByTestId('opt-b');
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription('Not supported yet');
    expect(b).toHaveTextContent('soon');
    expect(b.tabIndex).toBe(-1);
    await userEvent.click(b);
    expect(onChange).not.toHaveBeenCalled();
    expect(b).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('opt-a')).toHaveAttribute('aria-checked', 'true');
  });

  it('arrows skip disabled options (both directions, wrapping); Tab leaves the group in one step', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.tab();
    expect(screen.getByTestId('opt-a')).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('opt-c')).toHaveFocus();
    expect(screen.getByTestId('opt-c')).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowDown}'); // d is disabled → wraps to a
    expect(screen.getByTestId('opt-a')).toHaveFocus();
    expect(screen.getByTestId('opt-a')).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowLeft}'); // d disabled → c
    expect(screen.getByTestId('opt-c')).toHaveFocus();
    await user.keyboard('{ArrowUp}'); // b disabled → a
    expect(screen.getByTestId('opt-a')).toHaveFocus();
    expect(screen.getByTestId('opt-b')).toHaveAttribute('aria-checked', 'false');

    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByTestId('opt-a')).toHaveFocus();
  });

  it('Space selects the focused option; nothing selected → the first available option is the tab stop', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    expect(screen.getByTestId('opt-a').tabIndex).toBe(0);
    await user.tab();
    await user.tab();
    expect(screen.getByTestId('opt-a')).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByTestId('opt-a')).toHaveAttribute('aria-checked', 'true');
  });

  it('disabled group: aria-disabled on the group, options are not interactive', async () => {
    const onChange = vi.fn();
    render(<Harness disabled onChange={onChange} />);
    expect(screen.getByTestId('group')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('opt-c')).toBeDisabled();
    // pointer-events are off on a disabled button — force the click to prove no handler fires
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByTestId('opt-c'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
