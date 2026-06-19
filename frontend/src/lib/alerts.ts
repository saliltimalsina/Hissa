import type { AccountSnapshot, HistoryRow } from '../types';

export type AlertType = 'error' | 'warn' | 'info' | 'success';

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  desc: string;
  // Sortable timestamp (ms). Health alerts have no real timestamp, so they use 0
  // and sort below dated history alerts.
  ts: number;
  tsLabel: string;
}

function relTime(ms: number): string {
  if (!ms) return '';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Derive operational alerts from REAL client signals: account health snapshots
 * (already computed app-wide) and recent failed applications from history.
 * Returns newest-first. Never fabricates anything — an empty input yields [].
 */
export function deriveAlerts(
  snapshots: Record<string, AccountSnapshot>,
  recentFailures: HistoryRow[],
): Alert[] {
  const alerts: Alert[] = [];

  // ── Account health ────────────────────────────────────────────────────────
  for (const s of Object.values(snapshots)) {
    const who = s.label || s.username;
    if (s.status === 'expired') {
      alerts.push({
        id: `health-expired-${s.username}`,
        type: 'error',
        title: 'Account expired',
        desc: `${who} — credentials have expired. Renew to resume applying.`,
        ts: 0,
        tsLabel: 'Account health',
      });
    } else if (s.status === 'auth_failed') {
      alerts.push({
        id: `health-auth-${s.username}`,
        type: 'error',
        title: 'Authentication failed',
        desc: `${who} — ${s.error || 'login failed. Re-check credentials.'}`,
        ts: 0,
        tsLabel: 'Account health',
      });
    } else if (s.status === 'error') {
      alerts.push({
        id: `health-error-${s.username}`,
        type: 'error',
        title: 'Account error',
        desc: `${who} — ${s.error || 'health check failed.'}`,
        ts: 0,
        tsLabel: 'Account health',
      });
    } else if (s.status === 'expiring') {
      const days = s.days_to_expiry;
      alerts.push({
        id: `health-expiring-${s.username}`,
        type: 'warn',
        title: days != null ? `Account expiring in ${days} day${days === 1 ? '' : 's'}` : 'Account expiring soon',
        desc: `${who} — renew before it expires to avoid interruptions.`,
        ts: 0,
        tsLabel: 'Account health',
      });
    }
  }

  // ── Recent application failures ─────────────────────────────────────────────
  for (const r of recentFailures) {
    if (r.status !== 'failed') continue;
    const ms = r.applied_at ? new Date(r.applied_at).getTime() : 0;
    const name = r.company_name || r.scrip || `Company ${r.company_id}`;
    alerts.push({
      id: `fail-${r.id}`,
      type: 'error',
      title: 'Application failed',
      desc: `${name} — ${r.account_username}${r.error_message ? `: ${r.error_message}` : ''}`,
      ts: Number.isNaN(ms) ? 0 : ms,
      tsLabel: relTime(Number.isNaN(ms) ? 0 : ms),
    });
  }

  return alerts.sort((a, b) => b.ts - a.ts);
}
