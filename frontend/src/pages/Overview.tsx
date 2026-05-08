import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../store';
import { fetchSnapshot, fetchIPOs, fetchPortfolio, streamBulkApply } from '../api';
import type { IPO } from '../types';

const B = 'rgba(14,15,12,0.08)';
const BR = 'rgba(14,15,12,0.12)';

function KPI({ label, value, sub, color, onClick }: {
  label: string; value: string | number; sub?: string; color?: string; onClick?: () => void;
}) {
  return (
    <div className="px-4 py-4 rounded-card flex flex-col gap-1"
      style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px`, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = '#f2f5ef'; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
      <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>{label}</div>
      <div className="text-2xl font-bold tabular" style={{ color: color || '#0e0f0c', lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="text-[11px] font-medium" style={{ color: '#868685' }}>{sub}</div>}
    </div>
  );
}

function useCountdown(targetDate: string) {
  const [remaining, setRemaining] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function tick() {
      const ms = new Date(targetDate).getTime() - Date.now();
      if (ms <= 0) { setRemaining('Closed'); setUrgent(false); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setUrgent(ms < 3 * 3600000);
      if (d > 0) setRemaining(`${d}d ${h}h`);
      else if (h > 0) setRemaining(`${h}h ${m}m`);
      else setRemaining(`${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return { remaining, urgent };
}

function shareTypeStyle(shareGroupName: string) {
  const g = (shareGroupName || '').toLowerCase();
  if (g.includes('mutual') || g.includes('fund')) return { bg: 'rgba(59,130,246,0.1)', color: '#1d4ed8' };
  if (g.includes('right')) return { bg: 'rgba(234,88,12,0.1)', color: '#c2410c' };
  if (g.includes('debenture') || g.includes('bond')) return { bg: 'rgba(109,40,217,0.1)', color: '#6d28d9' };
  return { bg: '#e2f6d5', color: '#163300' };
}

function IPOCard({ ipo, accountCount, onQuickApply }: {
  ipo: IPO; accountCount: number; onQuickApply: (ipo: IPO) => void;
}) {
  const { remaining, urgent } = useCountdown(ipo.issueCloseDate);
  const typeStyle = shareTypeStyle(ipo.shareGroupName);
  const appliedCount = Object.keys(ipo.appliedAccounts || {}).length;
  const isFullyApplied = appliedCount >= accountCount && accountCount > 0;
  const isPartial = appliedCount > 0 && !isFullyApplied;

  return (
    <div className="rounded-card p-4 flex flex-col gap-3"
      style={{
        background: '#fff',
        boxShadow: urgent
          ? 'rgba(208,50,56,0.3) 0 0 0 1.5px'
          : isFullyApplied
          ? 'rgba(5,77,40,0.25) 0 0 0 1.5px'
          : `${BR} 0 0 0 1px`,
      }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight" style={{ color: '#0e0f0c' }}>{ipo.companyName}</div>
          <div className="text-[11px] font-mono mt-0.5" style={{ color: '#868685' }}>{ipo.scrip}</div>
        </div>
        <span className="px-2 py-0.5 rounded-pill text-[10px] font-bold flex-shrink-0"
          style={typeStyle}>
          {ipo.shareGroupName || ipo.shareTypeName}
        </span>
      </div>

      {/* Countdown */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Closes in</div>
          <div className="text-xl font-bold tabular"
            style={{ color: urgent ? '#d03238' : remaining === 'Closed' ? '#868685' : '#0e0f0c' }}>
            {remaining}
          </div>
          <div className="text-[10px]" style={{ color: '#868685' }}>
            {new Date(ipo.issueCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Min/Max</div>
          <div className="text-sm font-bold tabular" style={{ color: '#0e0f0c' }}>
            {ipo.minUnit} / {ipo.maxUnit}
          </div>
          <div className="text-[10px]" style={{ color: '#868685' }}>kitta</div>
        </div>
      </div>

      {/* Apply status */}
      {accountCount > 0 && (
        <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${B}` }}>
          <div className="flex items-center gap-1.5">
            {isFullyApplied ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill"
                style={{ background: 'rgba(5,77,40,0.08)', color: '#054d28' }}>
                All {appliedCount} applied
              </span>
            ) : isPartial ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill"
                style={{ background: 'rgba(255,209,26,0.15)', color: '#b37d00' }}>
                {appliedCount}/{accountCount} applied
              </span>
            ) : remaining !== 'Closed' ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill"
                style={{ background: 'rgba(208,50,56,0.08)', color: '#d03238' }}>
                Not applied
              </span>
            ) : null}
          </div>

          {remaining !== 'Closed' && !isFullyApplied && (
            <button
              onClick={() => onQuickApply(ipo)}
              className="text-[10px] font-bold px-2.5 py-1 rounded"
              style={{ background: '#0e0f0c', color: '#9fe870', border: 'none', cursor: 'pointer' }}>
              Quick Apply
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QuickApplyModal({ ipo, onClose, onDone }: {
  ipo: IPO; onClose: () => void; onDone: () => void;
}) {
  const { accounts } = useApp();
  const [kitta, setKitta] = useState(ipo.minUnit);
  const [results, setResults] = useState<{ username: string; status: string; error?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    setRunning(true);
    setResults([]);
    try {
      for await (const ev of streamBulkApply(ipo.companyShareId, kitta)) {
        if (ev.type === 'progress' && ev.result) {
          setResults(r => [...r, {
            username: ev.result!.user_name,
            status: ev.result!.status,
            error: ev.result!.error_message,
          }]);
        }
        if (ev.type === 'complete') setDone(true);
      }
    } catch { /* silent */ } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(14,15,12,0.5)' }}>
      <div className="w-full max-w-md rounded-card p-5 space-y-4"
        style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold" style={{ color: '#0e0f0c' }}>Quick Apply</div>
            <div className="text-xs" style={{ color: '#868685' }}>{ipo.companyName}</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#868685', fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {!done && !running && (
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Kitta</label>
              <input type="number" min={ipo.minUnit} max={ipo.maxUnit} value={kitta}
                onChange={e => setKitta(parseInt(e.target.value) || ipo.minUnit)}
                className="rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c' }} />
              <div className="text-[10px]" style={{ color: '#868685' }}>
                Min: {ipo.minUnit} · Max: {ipo.maxUnit} · {accounts.length} accounts
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={run}
                className="text-xs font-bold px-3 py-1.5 rounded flex-1"
                style={{ background: '#0e0f0c', color: '#9fe870', border: 'none', cursor: 'pointer' }}>
                Apply to All {accounts.length} Accounts
              </button>
              <button onClick={onClose}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {(running || results.length > 0) && (
          <div className="space-y-2">
            <div className="max-h-48 overflow-y-auto space-y-1">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded"
                  style={{ background: '#f2f5ef' }}>
                  <span style={{ color: '#0e0f0c' }}>{r.username}</span>
                  <span style={{ color: r.status === 'success' ? '#054d28' : '#d03238' }}>
                    {r.status === 'success' ? 'Applied' : r.error || 'Failed'}
                  </span>
                </div>
              ))}
              {running && (
                <div className="text-xs text-center py-2" style={{ color: '#868685' }}>Applying…</div>
              )}
            </div>
            {done && (
              <div className="flex gap-2">
                <button onClick={() => { onDone(); onClose(); }}
                  className="text-xs font-semibold px-3 py-1.5 rounded flex-1"
                  style={{ background: '#9fe870', color: '#163300', border: 'none', cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Overview() {
  const {
    accounts, ipos, snapshots, snapshotSummary, portfolios, grandTotal, historyStats,
    navigate, setIPOs, setIPOLoading, ipoLoading, setSnapshots,
    setSnapshotLoading, snapshotLoading, setPortfolios, setPortfolioLoading,
    portfolioLoading, addLog,
  } = useApp();

  const [quickApplyIPO, setQuickApplyIPO] = useState<IPO | null>(null);

  const refreshAll = useCallback(async () => {
    if (!accounts.length) return;
    setSnapshotLoading(true);
    setIPOLoading(true);
    setPortfolioLoading(true);
    try {
      const [snap, ipoData, port] = await Promise.all([
        fetchSnapshot(), fetchIPOs(), fetchPortfolio(),
      ]);
      setSnapshots(snap.accounts, snap.summary);
      setIPOs(ipoData);
      setPortfolios(port.accounts, port.grand_total);
      addLog({ status: 'info', message: `Refreshed — ${ipoData.length} IPOs` });
    } catch (e: any) {
      addLog({ status: 'failed', message: `Refresh failed: ${e.message}` });
    } finally {
      setSnapshotLoading(false);
      setIPOLoading(false);
      setPortfolioLoading(false);
    }
  }, [accounts.length]);

  // Auto-refresh IPOs every 5 minutes
  useEffect(() => {
    if (!accounts.length) return;
    const id = setInterval(() => {
      fetchIPOs().then(data => setIPOs(data)).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [accounts.length]);

  const loading = snapshotLoading || ipoLoading || portfolioLoading;
  const fmt = (n: number) => n >= 1e7 ? `NPR ${(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `NPR ${(n / 1e5).toFixed(1)}L` : `NPR ${n.toLocaleString()}`;

  const noAccounts = accounts.length === 0;

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">

      {/* No accounts state */}
      {noAccounts && (
        <div className="flex flex-col items-center justify-center h-64 gap-4 rounded-card"
          style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px` }}>
          <div className="text-lg font-bold" style={{ color: '#0e0f0c' }}>Welcome to Capital OS</div>
          <div className="text-sm text-center max-w-xs" style={{ color: '#868685' }}>
            Add your MeroShare accounts to start tracking IPOs, portfolio, and applying in bulk.
          </div>
          <button onClick={() => navigate('accounts')}
            className="text-sm font-bold px-5 py-2.5 rounded"
            style={{ background: '#0e0f0c', color: '#9fe870', border: 'none', cursor: 'pointer' }}>
            Add Accounts
          </button>
        </div>
      )}

      {/* KPIs */}
      {!noAccounts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KPI label="Accounts" value={accounts.length} sub="MeroShare" onClick={() => navigate('accounts')} />
          <KPI label="Healthy" value={snapshotSummary?.healthy ?? '—'}
            color="#054d28" sub="DEMAT valid"
            onClick={() => navigate('accounts')} />
          <KPI label="Open IPOs" value={ipos.length}
            color={ipos.length > 0 ? '#163300' : '#868685'}
            sub="live now" onClick={() => navigate('ipo')} />
          <KPI label="Portfolio"
            value={grandTotal ? fmt(grandTotal) : '—'}
            sub="across all accounts" onClick={() => navigate('portfolio')} />
          <KPI label="Total Applied"
            value={historyStats?.total_applications ?? '—'}
            sub="all time" onClick={() => navigate('history')} />
          <KPI label="Allotted"
            value={historyStats?.allotted ?? '—'}
            color="#054d28"
            sub={historyStats ? `${historyStats.allotment_rate}% rate` : undefined}
            onClick={() => navigate('history')} />
        </div>
      )}

      {/* Open IPOs with countdowns */}
      {!noAccounts && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>
              Open IPOs
            </div>
            <button onClick={refreshAll} disabled={loading}
              className="text-[10px] font-semibold px-2.5 py-1 rounded disabled:opacity-40"
              style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
              {ipoLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {ipoLoading && ipos.length === 0 ? (
            <div className="rounded-card p-8 text-center text-sm" style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px`, color: '#868685' }}>
              Loading open IPOs…
            </div>
          ) : ipos.length === 0 ? (
            <div className="rounded-card p-8 text-center" style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px` }}>
              <div className="text-sm font-semibold mb-1" style={{ color: '#454745' }}>No open IPOs right now</div>
              <div className="text-xs" style={{ color: '#868685' }}>New IPOs will appear here automatically</div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ipos.map(ipo => (
                <IPOCard
                  key={ipo.companyShareId}
                  ipo={ipo}
                  accountCount={accounts.length}
                  onQuickApply={setQuickApplyIPO}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Account health table */}
      {!noAccounts && snapshots.length > 0 && (
        <div className="rounded-card overflow-hidden" style={{ boxShadow: `${BR} 0 0 0 1px` }}>
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ background: '#f2f5ef', borderBottom: `1px solid ${B}` }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>
              Account Health
            </span>
            <div className="flex gap-3 text-[10px]">
              {snapshotSummary && [
                { label: 'Healthy', v: snapshotSummary.healthy, c: '#054d28' },
                { label: 'Expiring', v: snapshotSummary.expiring, c: '#b37d00' },
                { label: 'Expired', v: snapshotSummary.expired, c: '#d03238' },
                { label: 'Failed', v: snapshotSummary.failed, c: '#868685' },
              ].map(s => (
                <span key={s.label} style={{ color: s.c }}>
                  <span className="font-bold">{s.v}</span> {s.label}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto" style={{ background: '#fff' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid ${B}` }}>
                  {['Name', 'Username', 'Status', 'Expiry', 'DEMAT'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-widest"
                      style={{ color: '#868685', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.slice(0, 10).map((s, i) => {
                  const sc = { healthy: '#054d28', expiring: '#b37d00', expired: '#d03238', auth_failed: '#d03238', error: '#d03238' }[s.status] || '#868685';
                  const sbg = { healthy: 'rgba(5,77,40,0.08)', expiring: 'rgba(255,209,26,0.12)', expired: 'rgba(208,50,56,0.08)', auth_failed: 'rgba(208,50,56,0.08)', error: 'rgba(208,50,56,0.08)' }[s.status] || '#f2f5ef';
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${B}` }}>
                      <td className="px-3 py-2 font-medium" style={{ color: '#0e0f0c' }}>{s.name || s.label}</td>
                      <td className="px-3 py-2 font-mono text-[11px]" style={{ color: '#868685' }}>{s.username}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-pill text-[10px] font-bold"
                          style={{ background: sbg, color: sc }}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular" style={{ color: s.days_to_expiry != null && s.days_to_expiry <= 30 ? '#b37d00' : '#454745' }}>
                        {s.days_to_expiry != null ? (s.days_to_expiry < 0 ? 'Expired' : `${s.days_to_expiry}d`) : s.expired_date || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]" style={{ color: '#868685' }}>
                        {s.demat ? `…${s.demat.slice(-6)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {snapshots.length > 10 && (
              <div className="px-3 py-2 text-xs" style={{ color: '#868685', borderTop: `1px solid ${B}` }}>
                +{snapshots.length - 10} more —{' '}
                <button onClick={() => navigate('accounts')} style={{ color: '#9fe870', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  view all
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Apply modal */}
      {quickApplyIPO && (
        <QuickApplyModal
          ipo={quickApplyIPO}
          onClose={() => setQuickApplyIPO(null)}
          onDone={() => {
            setQuickApplyIPO(null);
            fetchIPOs().then(data => setIPOs(data)).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
