import { useState, useEffect, useMemo, useRef } from 'react';
import type { Account, AccountReport, ReportApplication } from '../types';

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
  if (isNotAllotted(s)) return { bg: 'bg-[#FEE7E7]', text: 'text-[#B91C1C]', label: 'Not Allotted' };
  if (isAllotted(s)) return { bg: 'bg-[#EAFBF1]', text: 'text-[#1F9D55]', label: 'Allotted' };
  if (status.includes('pending') || status.includes('completed')) return { bg: 'bg-[#FEF6E0]', text: 'text-[#92400E]', label: s.statusName || 'Pending' };
  if (status.includes('edit')) return { bg: 'bg-[#F4F3FF]', text: 'text-[#5B4DFF]', label: s.statusName || 'Editable' };
  return { bg: 'bg-[#F4F4F8]', text: 'text-[#6B7280]', label: s.statusName || '—' };
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
    <div className="p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Reports</h1>
          <p className="text-sm text-[#6B7280] mt-1">IPO application history and allotment results</p>
        </div>
        {loading ? (
          <span className="flex items-center gap-1.5 text-xs text-[#6B7280]">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
            Updating
          </span>
        ) : fetchedAt ? (
          <button onClick={onRefresh} className="text-xs text-[#6B7280] hover:text-[#5B4DFF] transition-colors">
            Updated {timeAgo(fetchedAt)}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="px-4 py-3 bg-[#FEE7E7] border border-[#fbd4d4] rounded-lg text-sm text-[#B91C1C]">
          {error}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Total Applications</p>
          <p className="text-[28px] font-bold text-[#111827] tabular leading-none tracking-tight">{totalApplications}</p>
          <p className="text-xs text-[#9CA3AF] mt-2.5 font-medium">{accounts.length} accounts</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Allotted</p>
          <p className="text-[28px] font-bold text-[#1F9D55] tabular leading-none tracking-tight">{allotted}</p>
          <p className="text-xs text-[#1F9D55] mt-2.5 font-medium">{totalApplications > 0 ? Math.round((allotted / totalApplications) * 100) : 0}% hit rate</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Not Allotted</p>
          <p className="text-[28px] font-bold text-[#B91C1C] tabular leading-none tracking-tight">{notAllotted}</p>
          <p className="text-xs text-[#B91C1C] mt-2.5 font-medium">Amount released</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Pending / Active</p>
          <p className="text-[28px] font-bold text-[#92400E] tabular leading-none tracking-tight">{pending}</p>
          <p className="text-xs text-[#92400E] mt-2.5 font-medium">NPR {formatNPR(totalBlocked)} blocked</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-white border border-[#ECECF2] rounded-lg p-1 w-fit">
        <button onClick={() => setView('all')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${view === 'all' ? 'bg-[#5B4DFF] text-white' : 'text-[#6B7280] hover:text-[#111827]'}`}>
          All Accounts
        </button>
        <button onClick={() => setView('account')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${view === 'account' ? 'bg-[#5B4DFF] text-white' : 'text-[#6B7280] hover:text-[#111827]'}`}>
          By Account
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#F4F4F8] flex items-center gap-3">
          {/* Filter pills */}
          <div className="flex items-center gap-1 bg-[#F7F8FC] rounded-lg p-1">
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
                    ? 'bg-white text-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                {f.label} <span className="text-[#9CA3AF] font-medium">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search company, scrip, account..."
              className="w-full bg-[#F7F8FC] border border-transparent rounded-lg pl-9 pr-3 py-1.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#5B4DFF] focus:bg-white"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {flat.length === 0 && !loading ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-[#6B7280]">No application history yet</p>
              <p className="text-xs text-[#9CA3AF] mt-1">Apply for an IPO to see results here</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-[#6B7280]">No matching applications</p>
            </div>
          ) : view === 'account' ? (
            <div className="flex min-h-[400px]">
              <div className="w-56 flex-shrink-0 border-r border-[#F4F4F8]">
                {reports.map(r => {
                  const acctApps = filtered.filter(f => f.accountUsername === r.username);
                  const acctAllotted = acctApps.filter(isAllotted).length;
                  return (
                    <button
                      key={r.username}
                      onClick={() => setSelectedAccount(r.username)}
                      className={`w-full text-left px-4 py-3 border-b border-[#F4F4F8] transition-colors ${
                        selectedAccount === r.username ? 'bg-[#F4F3FF] border-l-2 border-l-[#5B4DFF]' : 'hover:bg-[#FAFAFF]'
                      }`}
                    >
                      <p className="text-sm font-semibold text-[#111827] truncate">{r.label}</p>
                      <p className="text-[11px] text-[#9CA3AF] mt-0.5 tabular">{r.username}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                        <span className="text-[#6B7280]">{acctApps.length} apps</span>
                        {acctAllotted > 0 && <span className="text-[#1F9D55] font-semibold">· {acctAllotted} won</span>}
                        {r.error && <span className="text-[#B91C1C]">· error</span>}
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
                        <p className="text-sm text-[#6B7280]">No applications for this account</p>
                      </div>
                    );
                  }
                  return (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[#6B7280] bg-[#F7F8FC]">
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
                            <tr key={i} className="border-b border-[#F4F4F8] hover:bg-[#FAFAFF] transition-colors">
                              <td className="px-5 py-3">
                                <p className="font-semibold text-[#111827]">{r.companyName}</p>
                                <p className="text-xs text-[#9CA3AF] mt-0.5 font-mono">{r.scrip} · {r.shareGroupName || r.shareTypeName}</p>
                              </td>
                              <td className="px-3 py-3 text-right tabular text-[#111827] font-medium">
                                {r.appliedKitta || '—'}
                                {r.allotedQuantity !== undefined && r.allotedQuantity !== null && (r.allotedQuantity ?? 0) > 0 && (
                                  <p className="text-[11px] text-[#1F9D55] font-semibold mt-0.5">+{r.allotedQuantity} alloted</p>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right tabular text-[#111827]">
                                {r.transactionAmount ? `${formatNPR(r.transactionAmount)}` : '—'}
                              </td>
                              <td className="px-3 py-3">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${pill.bg} ${pill.text}`}>
                                  {pill.label}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-xs text-[#6B7280]">{r.blockAmountStatus || '—'}</td>
                              <td className="px-5 py-3 text-xs text-[#6B7280] max-w-xs">
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
                <tr className="text-[#6B7280] bg-[#F7F8FC]">
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
                    <tr key={i} className="border-b border-[#F4F4F8] hover:bg-[#FAFAFF] transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-[#111827]">{r.companyName}</p>
                        <p className="text-xs text-[#9CA3AF] mt-0.5 font-mono">{r.scrip} · {r.shareGroupName || r.shareTypeName}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[#111827] font-medium text-xs">{r.accountLabel}</p>
                        <p className="text-[11px] text-[#9CA3AF] mt-0.5 tabular">{r.accountUsername}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular text-[#111827] font-medium">
                        {r.appliedKitta || '—'}
                        {r.allotedQuantity !== undefined && r.allotedQuantity !== null && (r.allotedQuantity ?? 0) > 0 && (
                          <p className="text-[11px] text-[#1F9D55] font-semibold mt-0.5">+{r.allotedQuantity} alloted</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular text-[#111827]">
                        {r.transactionAmount ? `${formatNPR(r.transactionAmount)}` : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${pill.bg} ${pill.text}`}>
                          {pill.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-[#6B7280]">
                        {r.blockAmountStatus || '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-[#6B7280] max-w-xs">
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
          <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">Fetch Errors</p>
          <div className="space-y-2">
            {reports.filter(r => r.error).map(r => (
              <div key={r.username} className="flex items-center justify-between text-xs">
                <span className="text-[#111827] font-medium">{r.label}</span>
                <span className="text-[#B91C1C]">{r.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
