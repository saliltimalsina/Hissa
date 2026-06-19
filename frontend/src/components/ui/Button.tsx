import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Spinner from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button while truthy. */
  loading?: boolean;
  children: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B4DFF]';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-[#5B4DFF] text-white hover:bg-[#4C3FF0]',
  secondary: 'border border-[#D1D5DB] text-[#374151] bg-white hover:border-[#9CA3AF]',
  ghost: 'text-[#374151] hover:bg-[#F7F8FC]',
  danger: 'bg-[#EF4444] text-white hover:bg-[#DC2626]',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

/** Standard button with variants, sizes, loading state and a built-in focus ring. */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
