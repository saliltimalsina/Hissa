import { useApp } from '../store';

function fmtStatus(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

export default function Reports() {
  const { log, portfolios, grandTotal } = useApp();

  const applied = log.filter(e => e.status === 'success' || e.status === 'failed');
  const successful = applied.filter(e => e.status === 'success');
  const failed = applied.filter(e => e.status === 'failed');
  const rate = applied.length > 0 ? Math.round((successful.length / applied.length) * 100) : 0;

  function exportLog() {
    const rows = ['time,username,status,message', ...log.map(e => `${e.time},${e.username || ''},${e.status},"${e.message || ''}"`).reverse()];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'activity-log.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function exportPortfolio() {
    const rows = ['account,script,qty,value'];
    portfolios.forEach(p => {
      p.holdings.forEach(h => {
        rows.push(`${p.label},${h.script},${h.currentBalance},${h.valueOfLastTransPrice}`);
      });
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'portfolio.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function fmtNPR(v: number) {
    if (v >= 1_000_000) return `NPR ${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `NPR ${(v / 1_000).toFixed(1)}K`;
    return `NPR ${v.toLocaleString()}`;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Reports</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Activity logs and export</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Operations', val: applied.length, color: '#163300' },
            { label: 'Successful', val: successful.length, color: 'var(--success)' },
            { label: 'Failed', val: failed.length, color: failed.length > 0 ? 'var(--danger)' : 'var(--text-3)' },
            { label: 'Success Rate', val: `${rate}%`, color: rate >= 80 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)' },
          ].map(item => (
            <div key={item.label} className="px-4 py-3 rounded-lg"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>{item.label}</div>
              <div className="text-2xl font-bold tabular" style={{ color: item.color }}>{item.val}</div>
            </div>
          ))}
        </div>

        {/* Export panel */}
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-4 py-2.5 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Export</span>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3" style={{ background: 'var(--surface)' }}>
            <button onClick={exportLog} disabled={log.length === 0}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-left disabled:opacity-40 transition-colors"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#9fe870'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="var(--text-2)" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>Activity Log</div>
                <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{log.length} entries → CSV</div>
              </div>
            </button>
            <button onClick={exportPortfolio} disabled={portfolios.length === 0}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-left disabled:opacity-40 transition-colors"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#9fe870'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="var(--text-2)" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <div>
                <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>Portfolio Holdings</div>
                <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{grandTotal > 0 ? fmtNPR(grandTotal) : 'Load portfolio first'} → CSV</div>
              </div>
            </button>
          </div>
        </div>

        {/* Activity log table */}
        {log.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Activity Log ({log.length})
              </span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Time', 'Status', 'Message'].map(h => (
                      <th key={h} className="text-left px-4 py-2 font-semibold"
                        style={{ color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {log.map(entry => {
                    const c = entry.status === 'success' ? 'var(--success)' : entry.status === 'failed' ? 'var(--danger)' : '#163300';
                    return (
                      <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <td className="px-4 py-2 tabular font-mono" style={{ color: 'var(--text-3)' }}>{entry.time}</td>
                        <td className="px-4 py-2">
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ color: c, background: c + '22' }}>
                            {fmtStatus(entry.status)}
                          </span>
                        </td>
                        <td className="px-4 py-2" style={{ color: 'var(--text-2)' }}>
                          {entry.message || entry.error || `${entry.username || ''} ${entry.status}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
