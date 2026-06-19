import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toggle from './Toggle';

describe('Toggle', () => {
  it('renders a switch with the accessible label and aria-checked state', () => {
    render(<Toggle checked={false} onChange={() => {}} label="Enable rule" />);
    const sw = screen.getByRole('switch', { name: 'Enable rule' });
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects the checked state via aria-checked', () => {
    render(<Toggle checked onChange={() => {}} label="Enable rule" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('invokes onChange with the flipped value on click', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Enable rule" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('invokes onChange when activated with the Enter key', async () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} label="Enable rule" />);
    const sw = screen.getByRole('switch');
    sw.focus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does not fire onChange when disabled', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} disabled label="Enable rule" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
