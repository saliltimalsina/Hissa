import { useState, useEffect, useCallback } from 'react';
import { fetchHistory, fetchHistoryStats, checkAllotment } from '../api';
import type { HistoryRow, HistoryStats } from '../types';

const B = 'rgba(14,15,12,0.08)';
const BR = 'rgba(14,15,12,0.12)';

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="px-4 py-4 rounded-card flex flex-col gap-1"
      style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px` }}>
      <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>{label}</div>
      <div className="text-2xl font-bold tabular" style={{ color: color || '#0e0f0c', lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="text-[11px] font-medium" style={{ color: '#868685' }}>{sub}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  success:      { bg: 'rgba(5,77,40,0.08)',    color: '#054d28',  label: 'Applied' },
  failed:       { bg: 'rgba(208,50,56,0.08)',  color: '#d03238',  label: 'Failed' },
  allotted:     { bg: 'rgba(159,232,112,0.2)', color: '#163300',  label: 'Allotted' },
  not_allotted: { bg: 'rgba(179,125,0,0.1)',   color: '#b37d00',  label: 'Not Allotted' },
};

export default function History() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ checked: number; allotted: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([
        fetchHistory({ status: statusFilter || undefined, limit: 200 }),
        fetchHistoryStats(),
      ]);
      setRows(h.rows);
      setTotal(h.total);
      setStats(s);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleCheckAllotment() {
    setChecking(true);
    setCheckResult(null);
    try {
      const r = await checkAllotment();
      setCheckResult(r);
      load();
    } catch { /* silent */ } finally {
      setChecking(false);
    }
  }

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <KPI label="Total Applied" value={stats.total_applications} />
          <KPI label="Success" value={stats.success} color="#054d28" />
          <KPI label="Failed" value={stats.failed} color="#d03238" />
          <KPI label="Allotted" value={stats.allotted} color="#163300" sub="got shares" />
          <KPI label="Success Rate" value={`${stats.success_rate}%`} />
          <KPI label="Allotment Rate" value={`${stats.allotment_rate}%`} sub="of successful" />
          <KPI label="Unique IPOs" value={stats.unique_ipos} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm font-semibold" style={{ color: '#0e0f0c' }}>
          {total} application{total !== 1 ? 's' : ''}
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs rounded px-2.5 py-1.5 outline-none"
          style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#454745' }}>
          <option value="">All statuses</option>
          <option value="success">Applied</option>
          <option value="failed">Failed</option>
          <option value="allotted">Allotted</option>
          <option value="not_allotted">Not Allotted</option>
        </select>

        <div className="flex-1" />

        {checkResult && (
          <div className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'rgba(5,77,40,0.08)', color: '#054d28' }}>
            Checked {checkResult.checked} — {checkResult.allotted} allotted
          </div>
        )}

        <button
          onClick={handleCheckAllotment}
          disabled={checking}
          className="text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40"
          style={{ background: '#9fe870', color: '#163300', border: 'none', cursor: checking ? 'not-allowed' : 'pointer' }}>
          {checking ? 'Checking…' : 'Check Allotment'}
        </button>

        <button
          onClick={load}
          disabled={loading}
          className="text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40"
          style={{ background: '#0e0f0c', color: '#9fe870', border: 'none', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="rounded-card overflow-hidden" style={{ boxShadow: `${BR} 0 0 0 1px` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: '#f2f5ef', borderBottom: `1px solid ${B}` }}>
                {['Account', 'IPO', 'Scrip', 'Kitta', 'Status', 'Allotted', 'Applied At', 'Allotment Checked'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-widest"
                    style={{ color: '#868685', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm" style={{ color: '#868685' }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm" style={{ color: '#868685' }}>
                    No applications yet. Apply for an IPO in the IPO Engine.
                  </td>
                </tr>
              ) : rows.map(r => {
                const s = STATUS_STYLE[r.status] || { bg: '#f2f5ef', color: '#868685', label: r.status };
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${B}` }}>
                    <td className="px-3 py-2 font-medium" style={{ color: '#0e0f0c' }}>{r.account_username}</td>
                    <td className="px-3 py-2" style={{ color: '#454745' }}>{r.company_name || `ID ${r.company_id}`}</td>
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: '#868685' }}>{r.scrip || '—'}</td>
                    <td className="px-3 py-2 tabular font-semibold" style={{ color: '#0e0f0c' }}>{r.kitta}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-pill text-[10px] font-bold"
                        style={{ background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular" style={{ color: '#054d28' }}>
                      {r.allotted_kitta != null ? r.allotted_kitta : '—'}
                    </td>
                    <td className="px-3 py-2 tabular text-[11px]" style={{ color: '#868685' }}>{fmt(r.applied_at)}</td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: '#868685' }}>
                      {r.allotment_checked_at ? fmt(r.allotment_checked_at) : (
                        r.status === 'success' ? (
                          <span style={{ color: '#b37d00' }}>pending check</span>
                        ) : '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
