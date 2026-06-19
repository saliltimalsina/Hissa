interface ToggleProps {
  /** Controlled on/off state. */
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name for the switch. */
  label: string;
  /** When true, the visible `label` is rendered only to assistive tech. */
  hideLabel?: boolean;
  className?: string;
}

/**
 * Controlled switch. Renders a real <button role="switch"> with aria-checked,
 * so it's keyboard-operable (Space/Enter) and announced correctly. Matches the
 * existing 9x5 pill toggle used on the Automation page.
 */
export default function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  hideLabel = true,
  className = '',
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B4DFF] ${
        checked ? 'bg-[#5B4DFF]' : 'bg-[#D1D5DB]'
      } ${className}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
      {!hideLabel && <span className="sr-only-text">{label}</span>}
    </button>
  );
}
