import { statusMeta, toneClasses } from '../../lib/status';
import type { StatusTone } from '../../lib/status';

interface StatusPillProps {
  /** A status string (mapped via statusMeta). Mutually exclusive with `tone`. */
  status?: string;
  /** Explicit tone when not driving from a status string. */
  tone?: StatusTone;
  /** Override label (defaults to the status's canonical label or children). */
  label?: string;
  /** Render a leading colored dot. */
  dot?: boolean;
  className?: string;
}

/**
 * Status badge. Pass `status` to derive label + colors from statusMeta(), or
 * `tone` + `label` for an ad-hoc pill. Matches the inline pill styling used in
 * Accounts/Reports.
 */
export default function StatusPill({ status, tone, label, dot = false, className = '' }: StatusPillProps) {
  const meta = status !== undefined ? statusMeta(status) : null;
  const resolvedTone: StatusTone = tone ?? meta?.tone ?? 'neutral';
  const colors = meta ?? toneClasses(resolvedTone);
  const text = label ?? meta?.label ?? '—';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${colors.pill} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />}
      {text}
    </span>
  );
}
