interface Segment<T extends string> {
  value: T;
  label: string;
  /** Optional trailing count badge (e.g. filter pills with counts). */
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<Segment<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible group label. */
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Single-select segmented control (the "Aggregate / By Account" and filter-pill
 * toggles used across Portfolio/Reports). Each segment is a button with
 * aria-pressed; the group carries role="group".
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'sm',
  className = '',
}: SegmentedControlProps<T>) {
  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 bg-surface rounded-lg p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`${pad} rounded-md font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]' : 'text-muted hover:text-ink'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && <span className="ml-1 text-faint font-medium">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
