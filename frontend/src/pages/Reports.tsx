import { useState, useEffect, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import type { Account, AccountReport, ReportApplication } from '../types';
import { Icon, Spinner } from '../components/ui';

interface Props {
  accounts: Account[];
  reports: AccountReport[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  fetchedAt: number | null;
}

const STALE_MS = 10 * 60 * 1000;

function timeAgo(ts: number | null): string {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

interface FlatRow extends ReportApplication {
  accountUsername: string;
  accountLabel: string;
}

function isAllotted(s: ReportApplication): boolean {
  const allot = (s.alloted || '').toLowerCase().trim();
  if (allot === 'yes') return true;
  if (allot === 'no') return false;
  const status = (s.statusName || '').toLowerCase();
  if (status.includes('not alloted') || status.includes('not allotted')) return false;
  return (status.includes('alloted') || status.includes('allotted')) && !status.includes('not');
}

function isNotAllotted(s: ReportApplication): boolean {
  const allot = (s.alloted || '').toLowerCase().trim();
  if (allot === 'no') return true;
  const status = (s.statusName || '').toLowerCase();
  return status.includes('not alloted') || status.includes('not allotted');
}

const STATUS_PILL = (s: ReportApplication): { bg: string; text: string; label: string } => {
  const status = (s.statusName || '').toLowerCase();
  if (isNotAllotted(s)) return { bg: 'bg-danger-bg', text: 'text-danger-fg', label: 'Not Allotted' };
  if (isAllotted(s)) return { bg: 'bg-success-bg', text: 'text-success', label: 'Allotted' };
  if (status.includes('pending') || status.includes('completed')) return { bg: 'bg-warn-bg', text: 'text-warn-fg', label: s.statusName || 'Pending' };
  if (status.includes('edit')) return { bg: 'bg-brand-tint', text: 'text-brand', label: s.statusName || 'Editable' };
  return { bg: 'bg-line-soft', text: 'text-muted', label: s.statusName || '—' };
};

export default function Reports({ accounts, reports, loading, error, onRefresh, fetchedAt }: Props) {
  const [filter, setFilter] = useState<'all' | 'alloted' | 'not_alloted' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'account'>('all');
  // Null = "no explicit pick yet" → fall back to the first report (derived
  // during render, avoiding a setState-in-effect to seed the selection).
  const [picked, setPicked] = useState<string | null>(null);
  const selectedAccount =
    picked && reports.some(r => r.username === picked)
      ? picked
      : (reports[0]?.username ?? '');
  const setSelectedAccount = setPicked;

  // Auto-refresh on mount if stale.
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (didAutoRefresh.current) return;
    if (accounts.length === 0 || loading) return;
    didAutoRefresh.current = true;
    const isStale = !fetchedAt || (Date.now() - fetchedAt) > STALE_MS;
    if (isStale) onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flat: FlatRow[] = useMemo(() => {
    const all: FlatRow[] = [];
    reports.forEach(r => {
      r.applications.forEach(a => {
        all.push({ ...a, accountUsername: r.username, accountLabel: r.label });
      });
    });
    return all.sort((a, b) => (b.applicantFormId || 0) - (a.applicantFormId || 0));
  }, [reports]);

  const filtered = flat.filter(r => {
    if (filter !== 'all') {
      const status = (r.statusName || '').toLowerCase();
      if (filter === 'alloted' && !isAllotted(r)) return false;
      if (filter === 'not_alloted' && !isNotAllotted(r)) return false;
      if (filter === 'pending' && (isAllotted(r) || isNotAllotted(r) || !(status.includes('pending') || status.includes('completed') || status.includes('edit')))) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.companyName?.toLowerCase().includes(q) && !r.scrip?.toLowerCase().includes(q) && !r.accountLabel.toLowerCase().includes(q) && !r.accountUsername.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats
  const totalApplications = flat.length;
  const allotted = flat.filter(isAllotted).length;
  const notAllotted = flat.filter(isNotAllotted).length;
  const pending = totalApplications - allotted - notAllotted;
  const totalBlocked = flat.reduce((sum, r) => sum + (r.transactionAmount || 0), 0);

  function formatNPR(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-display text-ink">Reports</h1>
          <p className="text-sm text-muted mt-1">IPO application history and allotment results</p>
        </div>
        {loading ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Spinner size="sm" />
            Updating
          </span>
        ) : fetchedAt ? (
          <button onClick={onRefresh} className="text-xs text-muted hover:text-brand transition-colors">
            Updated {timeAgo(fetchedAt)}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="px-4 py-3 bg-danger-bg border border-danger/30 rounded-lg text-sm text-danger-fg">
          {error}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-overline text-muted mb-3">Total Applications</p>
          <p className="text-metric text-ink">{totalApplications}</p>
          <p className="text-xs text-faint mt-2.5 font-medium">{accounts.length} accounts</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-overline text-muted mb-3">Allotted</p>
          <p className="text-metric text-success">{allotted}</p>
          <p className="text-xs text-success mt-2.5 font-medium">{totalApplications > 0 ? Math.round((allotted / totalApplications) * 100) : 0}% hit rate</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-overline text-muted mb-3">Not Allotted</p>
          <p className="text-metric text-danger-fg">{notAllotted}</p>
          <p className="text-xs text-danger-fg mt-2.5 font-medium">Amount released</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-overline text-muted mb-3">Pending / Active</p>
          <p className="text-metric text-warn-fg">{pending}</p>
          <p className="text-xs text-warn-fg mt-2.5 font-medium">NPR {formatNPR(totalBlocked)} blocked</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1 w-fit">
        <button onClick={() => setView('all')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${view === 'all' ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>
          All Accounts
        </button>
        <button onClick={() => setView('account')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${view === 'account' ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>
          By Account
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-3 border-b border-line-soft flex items-center gap-3">
          {/* Filter pills */}
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
            {([
              { id: 'all', label: 'All', count: totalApplications },
              { id: 'alloted', label: 'Allotted', count: allotted },
              { id: 'not_alloted', label: 'Not Allotted', count: notAllotted },
              { id: 'pending', label: 'Pending', count: pending },
            ] as const).map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  filter === f.id
                    ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {f.label} <span className="text-faint font-medium">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 relative">
            <Icon icon={Search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search company, scrip, account..."
              className="w-full bg-surface border border-transparent rounded-lg pl-9 pr-3 py-1.5 text-sm text-ink placeholder-faint focus:outline-none focus:border-brand focus:bg-white"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {flat.length === 0 && !loading ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-muted">No application history yet</p>
              <p className="text-xs text-faint mt-1">Apply for an IPO to see results here</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-muted">No matching applications</p>
            </div>
          ) : view === 'account' ? (
            <div className="flex min-h-[400px]">
              <div className="w-56 flex-shrink-0 border-r border-line-soft">
                {reports.map(r => {
                  const acctApps = filtered.filter(f => f.accountUsername === r.username);
                  const acctAllotted = acctApps.filter(isAllotted).length;
                  return (
                    <button
                      key={r.username}
                      onClick={() => setSelectedAccount(r.username)}
                      className={`w-full text-left px-4 py-3 border-b border-line-soft transition-colors ${
                        selectedAccount === r.username ? 'bg-brand-tint border-l-2 border-l-brand' : 'hover:bg-brand-subtle'
                      }`}
                    >
                      <p className="text-sm font-semibold text-ink truncate">{r.label}</p>
                      <p className="text-[11px] text-faint mt-0.5 tabular">{r.username}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                        <span className="text-muted">{acctApps.length} apps</span>
                        {acctAllotted > 0 && <span className="text-success font-semibold">· {acctAllotted} won</span>}
                        {r.error && <span className="text-danger-fg">· error</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 overflow-x-auto">
                {(() => {
                  const acctApps = filtered.filter(f => f.accountUsername === selectedAccount);
                  if (acctApps.length === 0) {
                    return (
                      <div className="px-6 py-16 text-center">
                        <p className="text-sm text-muted">No applications for this account</p>
                      </div>
                    );
                  }
                  return (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted bg-surface">
                          <th className="px-5 py-3 text-left font-semibold text-xs uppercase tracking-wider">Company</th>
                          <th className="px-3 py-3 text-right font-semibold text-xs uppercase tracking-wider">Kitta</th>
                          <th className="px-3 py-3 text-right font-semibold text-xs uppercase tracking-wider">Amount</th>
                          <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider">Status</th>
                          <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider">Block Status</th>
                          <th className="px-5 py-3 text-left font-semibold text-xs uppercase tracking-wider">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acctApps.map((r, i) => {
                          const pill = STATUS_PILL(r);
                          return (
                            <tr key={i} className="border-b border-line-soft hover:bg-brand-subtle transition-colors">
                              <td className="px-5 py-3">
                                <p className="font-semibold text-ink">{r.companyName}</p>
                                <p className="text-xs text-faint mt-0.5 font-mono">{r.scrip} · {r.shareGroupName || r.shareTypeName}</p>
                              </td>
                              <td className="px-3 py-3 text-right tabular text-ink font-medium">
                                {r.appliedKitta || '—'}
                                {r.allotedQuantity !== undefined && r.allotedQuantity !== null && (r.allotedQuantity ?? 0) > 0 && (
                                  <p className="text-[11px] text-success font-semibold mt-0.5">+{r.allotedQuantity} alloted</p>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right tabular text-ink">
                                {r.transactionAmount ? `${formatNPR(r.transactionAmount)}` : '—'}
                              </td>
                              <td className="px-3 py-3">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${pill.bg} ${pill.text}`}>
                                  {pill.label}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-xs text-muted">{r.blockAmountStatus || '—'}</td>
                              <td className="px-5 py-3 text-xs text-muted max-w-xs">
                                <p className="truncate" title={r.meroshareRemark || ''}>{r.meroshareRemark || '—'}</p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted bg-surface">
                  <th className="px-5 py-3 text-left font-semibold text-xs uppercase tracking-wider">Company</th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider">Account</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs uppercase tracking-wider">Kitta</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs uppercase tracking-wider">Amount</th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider">Block Status</th>
                  <th className="px-5 py-3 text-left font-semibold text-xs uppercase tracking-wider">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const pill = STATUS_PILL(r);
                  return (
                    <tr key={i} className="border-b border-line-soft hover:bg-brand-subtle transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-ink">{r.companyName}</p>
                        <p className="text-xs text-faint mt-0.5 font-mono">{r.scrip} · {r.shareGroupName || r.shareTypeName}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-ink font-medium text-xs">{r.accountLabel}</p>
                        <p className="text-[11px] text-faint mt-0.5 tabular">{r.accountUsername}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular text-ink font-medium">
                        {r.appliedKitta || '—'}
                        {r.allotedQuantity !== undefined && r.allotedQuantity !== null && (r.allotedQuantity ?? 0) > 0 && (
                          <p className="text-[11px] text-success font-semibold mt-0.5">+{r.allotedQuantity} alloted</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular text-ink">
                        {r.transactionAmount ? `${formatNPR(r.transactionAmount)}` : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${pill.bg} ${pill.text}`}>
                          {pill.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">
                        {r.blockAmountStatus || '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted max-w-xs">
                        <p className="truncate" title={r.meroshareRemark || ''}>{r.meroshareRemark || '—'}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Per-account errors */}
      {reports.some(r => r.error) && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">Fetch Errors</p>
          <div className="space-y-2">
            {reports.filter(r => r.error).map(r => (
              <div key={r.username} className="flex items-center justify-between text-xs">
                <span className="text-ink font-medium">{r.label}</span>
                <span className="text-danger-fg">{r.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
