type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

interface SpinnerProps {
  /** Visual size. Defaults to 'sm' (matches the common h-4/h-5 inline spinners). */
  size?: SpinnerSize;
  /** Visually-hidden status label announced to assistive tech. */
  label?: string;
  className?: string;
}

const SIZE: Record<SpinnerSize, string> = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3 w-3',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

/**
 * Accessible loading spinner. Replaces the duplicated `animate-spin` SVGs.
 * Renders role="status" with a visually-hidden label so the loading state is
 * announced. Color is inherited from `currentColor`.
 */
export default function Spinner({ size = 'sm', label = 'Loading', className = '' }: SpinnerProps) {
  return (
    <span role="status" className={`inline-flex ${className}`}>
      <svg className={`animate-spin ${SIZE[size]}`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span className="sr-only-text">{label}</span>
    </span>
  );
}
