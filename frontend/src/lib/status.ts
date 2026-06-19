// Shared status → presentation mapping. Centralizes the label + color tokens
// that were previously duplicated as ad-hoc STATUS_PILL / STATUS_DOT maps in
// Accounts, Reports, IPOEngine. Tone names map to the design tokens defined in
// tailwind.config.js (success / warn / danger / info / neutral).

export type StatusTone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

export interface StatusMeta {
  /** Human-readable label. */
  label: string;
  /** Semantic tone — drives pill/dot colors. */
  tone: StatusTone;
  /** Pill background + foreground utility classes (matches current look). */
  pill: string;
  /** Solid dot color utility class. */
  dot: string;
}

const TONE_PILL: Record<StatusTone, string> = {
  success: 'bg-[#EAFBF1] text-[#1F9D55]',
  warn: 'bg-[#FEF6E0] text-[#92400E]',
  danger: 'bg-[#FEE7E7] text-[#B91C1C]',
  info: 'bg-[#F4F3FF] text-[#5B4DFF]',
  neutral: 'bg-[#F4F4F8] text-[#6B7280]',
};

const TONE_DOT: Record<StatusTone, string> = {
  success: 'bg-[#1F9D55]',
  warn: 'bg-[#F59E0B]',
  danger: 'bg-[#EF4444]',
  info: 'bg-[#5B4DFF]',
  neutral: 'bg-[#9CA3AF]',
};

// Canonical labels + tones for the statuses the app produces. Keys cover both
// account health statuses and application/apply-result statuses.
const STATUS_TABLE: Record<string, { label: string; tone: StatusTone }> = {
  // Account health
  healthy: { label: 'Healthy', tone: 'success' },
  expiring: { label: 'Expiring', tone: 'warn' },
  expired: { label: 'Expired', tone: 'danger' },
  auth_failed: { label: 'Auth Failed', tone: 'danger' },
  error: { label: 'Error', tone: 'danger' },

  // Apply / application results
  success: { label: 'Success', tone: 'success' },
  already_applied: { label: 'Already Applied', tone: 'info' },
  allotted: { label: 'Allotted', tone: 'success' },
  not_allotted: { label: 'Not Allotted', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  retrying: { label: 'Retrying', tone: 'warn' },
  pending: { label: 'Pending', tone: 'warn' },
  queued: { label: 'Queued', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

/** Title-case an unknown status key as a sensible fallback label. */
function humanize(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Map a status string to its label + tone + ready-to-use color classes.
 * Unknown statuses fall back to a neutral pill with a humanized label.
 */
export function statusMeta(status: string | null | undefined): StatusMeta {
  const key = (status || '').toLowerCase().trim();
  const entry = STATUS_TABLE[key];
  const tone: StatusTone = entry?.tone ?? 'neutral';
  const label = entry?.label ?? (key ? humanize(key) : '—');
  return { label, tone, pill: TONE_PILL[tone], dot: TONE_DOT[tone] };
}

/** Color classes for a tone without a specific status (used by StatusPill). */
export function toneClasses(tone: StatusTone): { pill: string; dot: string } {
  return { pill: TONE_PILL[tone], dot: TONE_DOT[tone] };
}
