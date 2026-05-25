import { useApp } from '../../store';
import { fetchIPOs, fetchSnapshot } from '../../api';

export default function TopBar() {
  const { accounts, ipos, snapshotSummary, openCommand,
          setIPOs, setIPOLoading, ipoLoading,
          setSnapshots, setSnapshotLoading, snapshotLoading,
          addLog, navigate } = useApp();

  async function refreshAll() {
    if (!accounts.length) return;
    setSnapshotLoading(true);
    setIPOLoading(true);
    try {
      const [snap, ipoData] = await Promise.all([fetchSnapshot(), fetchIPOs()]);
      setSnapshots(snap.accounts, snap.summary);
      setIPOs(ipoData);
      addLog({ status: 'info', message: `Refreshed — ${ipoData.length} IPOs, ${snap.summary.healthy} healthy accounts` });
    } catch (e: any) {
      addLog({ status: 'failed', message: `Refresh failed: ${e.message}` });
    } finally {
      setSnapshotLoading(false);
      setIPOLoading(false);
    }
  }

  const loading = snapshotLoading || ipoLoading;
  const alertCount = (snapshotSummary?.expiring ?? 0) + (snapshotSummary?.expired ?? 0);

  return (
    <header className="h-12 flex-shrink-0 flex items-center px-4 gap-3"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid rgba(14,15,12,0.1)',
        zIndex: 50,
      }}>

      {/* Command search */}
      <button
        onClick={openCommand}
        className="flex items-center gap-2 px-3 py-1.5 rounded-pill flex-1 max-w-xs text-left"
        style={{
          background: '#f2f5ef',
          border: 'none',
          color: '#868685',
          transform: 'none',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = '#e8ebe6';
          (e.currentTarget as HTMLElement).style.transform = 'none';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = '#f2f5ef';
        }}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-xs flex-1 font-medium">Search or command…</span>
        <kbd className="text-[10px] px-1.5 py-0.5 rounded-lg font-mono font-semibold"
          style={{ background: '#e8ebe6', color: '#868685' }}>
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Live IPOs badge */}
      {ipos.length > 0 && (
        <button
          onClick={() => navigate('ipo')}
          className="flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-semibold"
          style={{ background: '#e2f6d5', color: '#163300', border: 'none' }}>
          <span className="w-1.5 h-1.5 rounded-full pulse" style={{ background: '#054d28' }} />
          {ipos.length} live IPO{ipos.length !== 1 ? 's' : ''}
        </button>
      )}

      {/* Expiry alert */}
      {alertCount > 0 && (
        <button
          onClick={() => navigate('notifications')}
          className="flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-semibold"
          style={{ background: 'rgba(255,209,26,0.15)', color: '#b37d00', border: '1px solid rgba(179,125,0,0.2)' }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {alertCount} expiry
        </button>
      )}

      {/* Refresh */}
      <button
        onClick={refreshAll}
        disabled={loading || !accounts.length}
        className="flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-semibold disabled:opacity-40"
        style={{ background: '#f2f5ef', color: '#454745', border: 'none' }}>
        <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {loading ? 'Loading…' : 'Refresh'}
      </button>

      {/* Commands */}
      <button
        onClick={openCommand}
        className="flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-semibold"
        style={{ background: '#0e0f0c', color: '#9fe870', border: 'none' }}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Commands
      </button>
    </header>
  );
}
