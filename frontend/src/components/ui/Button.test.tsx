import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Apply</Button>);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('applies the variant class', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('bg-danger');
  });

  it('disables and sets aria-busy while loading', () => {
    render(<Button loading>Saving</Button>);
    // The spinner contributes an "Loading" label, so match by aria-busy.
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('Saving');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('does not fire onClick while loading', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
