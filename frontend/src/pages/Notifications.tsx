import { useApp } from '../store';

export default function Notifications() {
  const { snapshots, accounts, navigate } = useApp();

  const expiring = snapshots.filter(s => s.status === 'expiring');
  const expired = snapshots.filter(s => s.status === 'expired');
  const failed = snapshots.filter(s => s.status === 'auth_failed' || s.status === 'error');

  type Alert = { username: string; label: string; type: 'expired' | 'expiring' | 'failed'; days?: number; error?: string };
  const alerts: Alert[] = [
    ...expired.map(s => ({ username: s.username, label: s.label, type: 'expired' as const, days: s.days_to_expiry })),
    ...expiring.map(s => ({ username: s.username, label: s.label, type: 'expiring' as const, days: s.days_to_expiry })),
    ...failed.map(s => ({ username: s.username, label: s.label, type: 'failed' as const, error: s.error })),
  ];

  const colorMap = { expired: 'var(--danger)', expiring: 'var(--warning)', failed: 'var(--danger)' };
  const bgMap = { expired: 'var(--danger-dim)', expiring: 'var(--warning-dim)', failed: 'var(--danger-dim)' };
  const labelMap = { expired: 'Expired', expiring: 'Expiring Soon', failed: 'Auth Failed' };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-5">
        <div className="mb-5">
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Notifications</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Account expiry alerts and system warnings</p>
        </div>

        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--success-dim)', border: '1px solid rgba(74,222,128,0.2)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--success)" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>All clear</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {accounts.length === 0
                ? 'Add accounts and run a health check'
                : snapshots.length === 0
                ? 'Run a health check to see account status'
                : 'No expiry or auth issues detected'}
            </p>
            {accounts.length > 0 && snapshots.length === 0 && (
              <button onClick={() => navigate('accounts')}
                className="mt-2 px-4 py-2 rounded text-xs font-semibold"
                style={{ background: '#9fe870', color: '#163300' }}>
                Run Health Check
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Expired', count: expired.length, type: 'expired' as const },
                { label: 'Expiring', count: expiring.length, type: 'expiring' as const },
                { label: 'Auth Failed', count: failed.length, type: 'failed' as const },
              ].map(item => (
                <div key={item.type} className="px-4 py-3 rounded-lg"
                  style={{ background: item.count > 0 ? bgMap[item.type] : 'var(--surface-2)', border: `1px solid ${item.count > 0 ? colorMap[item.type] + '33' : 'var(--border)'}` }}>
                  <div className="text-2xl font-bold tabular" style={{ color: item.count > 0 ? colorMap[item.type] : 'var(--text-3)' }}>
                    {item.count}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Alert list */}
            {alerts.map((alert, i) => (
              <div key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-lg"
                style={{ background: 'var(--surface-2)', border: `1px solid ${colorMap[alert.type]}33` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: bgMap[alert.type] }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={colorMap[alert.type]} strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{alert.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: bgMap[alert.type], color: colorMap[alert.type] }}>
                      {labelMap[alert.type]}
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {alert.type === 'expired' && 'Account demat expired — renewal required to apply for IPOs'}
                    {alert.type === 'expiring' && `Expires in ${alert.days} day${alert.days !== 1 ? 's' : ''} — renew soon`}
                    {alert.type === 'failed' && `Authentication error: ${alert.error || 'unknown'}`}
                  </div>
                </div>
                <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{alert.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
