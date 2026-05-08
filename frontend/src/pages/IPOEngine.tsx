import { useState, useRef, useEffect } from 'react';
import { useApp } from '../store';
import { fetchIPOs, streamMultiApply } from '../api';
import type { ApplyResult } from '../types';

interface AllocRow {
  accountId: number;
  username: string;
  label: string;
  broker_name?: string;
  allocations: Record<number, number>;
}

interface StreamRow {
  username: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  company_id?: number;
}

function daysLeft(dateStr: string) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function IPOEngine() {
  const { accounts, ipos, snapshots, setIPOs, setIPOLoading, ipoLoading, addLog } = useApp();

  const [selectedIPOs, setSelectedIPOs] = useState<Set<number>>(new Set());
  const [allocRows, setAllocRows] = useState<AllocRow[]>([]);
  const [stream, setStream] = useState<StreamRow[]>([]);
  const [streamTotal, setStreamTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [filter] = useState<'all' | 'eligible'>('all');
  const abortRef = useRef<AbortController | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Init alloc rows when accounts change
  useEffect(() => {
    setAllocRows(accounts.map(a => {
      const snap = snapshots.find(s => s.username === a.username);
      return {
        accountId: a.id,
        username: a.username,
        label: snap?.name || a.label || a.username,
        broker_name: a.broker_name,
        allocations: {},
      };
    }));
  }, [accounts, snapshots]);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [stream]);

  async function loadIPOs() {
    if (!accounts.length) return;
    setIPOLoading(true);
    try {
      const data = await fetchIPOs();
      setIPOs(data);
      addLog({ status: 'info', message: `Loaded ${data.length} open IPOs` });
    } catch (e: any) {
      addLog({ status: 'failed', message: `IPO fetch failed: ${e.message}` });
    } finally {
      setIPOLoading(false);
    }
  }

  function toggleIPO(id: number) {
    setSelectedIPOs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setKitta(accountId: number, companyShareId: number, val: number) {
    setAllocRows(prev => prev.map(r =>
      r.accountId !== accountId ? r : { ...r, allocations: { ...r.allocations, [companyShareId]: val } }
    ));
  }

  function fillAll(companyShareId: number, val: number) {
    setAllocRows(prev => prev.map(r => ({ ...r, allocations: { ...r.allocations, [companyShareId]: val } })));
  }

  function fillMin() {
    selectedIPOs.forEach(id => {
      const ipo = ipos.find(i => i.companyShareId === id);
      if (ipo) fillAll(id, ipo.minUnit);
    });
  }

  function fillMax() {
    selectedIPOs.forEach(id => {
      const ipo = ipos.find(i => i.companyShareId === id);
      if (ipo) fillAll(id, ipo.maxUnit);
    });
  }

  function clearAll() {
    setAllocRows(prev => prev.map(r => ({ ...r, allocations: {} })));
  }

  async function execute() {
    if (!accounts.length || selectedIPOs.size === 0) return;

    const selectedIpoList = ipos.filter(i => selectedIPOs.has(i.companyShareId));

    // Build multi-alloc payload
    const allocations: { account_id: number; company_id: number; kitta: number }[] = [];
    allocRows.forEach((row) => {
      selectedIpoList.forEach(ipo => {
        const kitta = row.allocations[ipo.companyShareId] || 0;
        if (kitta > 0) {
          allocations.push({ account_id: row.accountId, company_id: ipo.companyShareId, kitta });
        }
      });
    });

    if (allocations.length === 0) {
      addLog({ status: 'info', message: 'No kitta allocated — fill the matrix first' });
      return;
    }

    setStream([]);
    setStreamTotal(allocations.length);
    setRunning(true);
    setDone(false);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      for await (const event of streamMultiApply(allocations, ctrl.signal)) {
        if (event.type === 'start') {
          setStreamTotal(event.total ?? allocations.length);
        } else if (event.type === 'progress' && event.result) {
          const r = event.result as ApplyResult;
          setStream(prev => [...prev, {
            username: r.user_name,
            status: r.status as 'success' | 'failed',
            error: r.error_message,
            company_id: r.company_id,
          }]);
          addLog({
            status: r.status === 'success' ? 'success' : 'failed',
            username: r.user_name,
            company_id: r.company_id,
            message: r.status === 'success'
              ? `${r.user_name} applied ${r.kitta_amount} kitta`
              : `${r.user_name} failed — ${r.error_message}`,
          });
        } else if (event.type === 'complete') {
          setDone(true);
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') addLog({ status: 'failed', message: e.message });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const successCount = stream.filter(r => r.status === 'success').length;
  const failCount = stream.filter(r => r.status === 'failed').length;
  const successRate = stream.length > 0 ? Math.round((successCount / stream.length) * 100) : 0;

  const selectedIpoList = ipos.filter(i => selectedIPOs.has(i.companyShareId));
  const displayRows = filter === 'eligible' ? allocRows : allocRows;

  const totalAllocations = allocRows.reduce((sum, row) =>
    sum + selectedIpoList.reduce((s2, ipo) => s2 + (row.allocations[ipo.companyShareId] || 0), 0), 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>IPO Engine</h1>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {selectedIPOs.size > 0
              ? `${selectedIPOs.size} IPO${selectedIPOs.size > 1 ? 's' : ''} selected · ${accounts.length} accounts · ${totalAllocations} total kittas`
              : `${ipos.length} open IPOs · ${accounts.length} accounts`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIPOs.size > 0 && (
            <>
              <button onClick={fillMin}
                className="px-3 py-1.5 rounded text-xs font-medium"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                Fill Min
              </button>
              <button onClick={fillMax}
                className="px-3 py-1.5 rounded text-xs font-medium"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                Fill Max
              </button>
              <button onClick={clearAll}
                className="px-3 py-1.5 rounded text-xs font-medium"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                Clear
              </button>
            </>
          )}
          <button onClick={loadIPOs} disabled={ipoLoading || !accounts.length}
            className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40 flex items-center gap-1.5"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <svg className={`w-3 h-3 ${ipoLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {ipoLoading ? 'Loading…' : 'Load IPOs'}
          </button>
          {running ? (
            <button onClick={cancel}
              className="px-4 py-1.5 rounded-pill text-xs font-semibold"
              style={{ background: 'var(--danger-dim)', border: '1px solid rgba(208,50,56,0.3)', color: 'var(--danger)' }}>
              Cancel
            </button>
          ) : (
            <div className="relative group">
              <button
                onClick={selectedIPOs.size > 0 && totalAllocations > 0 ? execute : undefined}
                className="px-4 py-1.5 rounded-pill text-xs font-semibold transition-all"
                style={{
                  background: selectedIPOs.size > 0 && totalAllocations > 0 ? '#9fe870' : 'var(--surface-3)',
                  color: selectedIPOs.size > 0 && totalAllocations > 0 ? '#163300' : 'var(--text-3)',
                  boxShadow: selectedIPOs.size > 0 && totalAllocations > 0 ? '0 0 12px rgba(159,232,112,0.5)' : 'none',
                  cursor: selectedIPOs.size > 0 && totalAllocations > 0 ? 'pointer' : 'default',
                }}>
                Execute Allocation →
              </button>
              {!(selectedIPOs.size > 0 && totalAllocations > 0) && (
                <div className="absolute right-0 top-full mt-1.5 px-2.5 py-1.5 rounded-card text-[11px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: '#0e0f0c', color: 'rgba(255,255,255,0.85)', zIndex: 50 }}>
                  {selectedIPOs.size === 0 ? 'Select an IPO first' : 'Enter kitta amounts in the matrix'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: IPO List */}
        <div className="w-64 flex-shrink-0 flex flex-col border-r overflow-y-auto"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="px-3 py-2 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              IPOs ({ipos.length})
            </span>
            {selectedIPOs.size > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: '#e2f6d5', color: '#163300' }}>
                {selectedIPOs.size} selected
              </span>
            )}
          </div>
          {ipos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
              <svg className="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="var(--text-2)" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {accounts.length === 0 ? 'Add accounts first' : 'Click "Load IPOs" to fetch'}
              </p>
            </div>
          ) : ipos.map(ipo => {
            const dl = daysLeft(ipo.issueCloseDate);
            const selected = selectedIPOs.has(ipo.companyShareId);
            const urgentColor = dl !== null && dl <= 1 ? 'var(--danger)' : dl !== null && dl <= 3 ? 'var(--warning)' : 'var(--success)';
            return (
              <button
                key={ipo.companyShareId}
                onClick={() => toggleIPO(ipo.companyShareId)}
                className="flex flex-col gap-1 px-3 py-2.5 text-left border-b transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  background: selected ? '#e2f6d5' : 'transparent',
                  borderLeft: selected ? '2px solid #9fe870' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-medium leading-tight" style={{ color: selected ? '#163300' : 'var(--text)' }}>
                    {ipo.companyName}
                  </span>
                  <span className="text-[10px] flex-shrink-0" style={{ color: urgentColor }}>
                    {dl === null ? '—' : dl === 0 ? 'Today' : `${dl}d`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{ipo.shareGroupName || ipo.shareTypeName}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>·</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{ipo.minUnit}–{ipo.maxUnit}k</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Allocation Matrix + Console */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Allocation Matrix */}
          <div className="flex-1 overflow-auto">
            {selectedIPOs.size === 0 || accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <svg className="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="var(--text-2)" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                    {accounts.length === 0 ? 'Add accounts to begin' : 'Select IPOs to build allocation matrix'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                    {accounts.length === 0
                      ? 'Configure accounts in the Accounts page'
                      : 'Click IPOs on the left to select them for allocation'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-4 py-2.5 font-semibold sticky left-0 z-10"
                        style={{ color: 'var(--text-3)', background: 'var(--surface-2)', minWidth: 160 }}>
                        Account
                      </th>
                      {selectedIpoList.map(ipo => (
                        <th key={ipo.companyShareId} className="px-3 py-2.5 font-semibold text-center"
                          style={{ color: 'var(--text-2)', minWidth: 120 }}>
                          <div style={{ color: '#163300' }}>{ipo.companyName.split(' ')[0]}</div>
                          <div className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
                            min {ipo.minUnit}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => (
                      <tr key={row.accountId}
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <td className="px-4 py-2 sticky left-0"
                          style={{ background: 'inherit', borderRight: '1px solid var(--border)' }}>
                          <div className="font-medium" style={{ color: 'var(--text)' }}>{row.label}</div>
                          <div style={{ color: 'var(--text-3)', fontSize: 10 }}>
                            {row.broker_name ? (
                              <><span>{row.broker_name}</span><span style={{ opacity: 0.4 }}> · </span><span className="font-mono">{row.username}</span></>
                            ) : (
                              <span className="font-mono">{row.username}</span>
                            )}
                          </div>
                        </td>
                        {selectedIpoList.map(ipo => {
                          const val = row.allocations[ipo.companyShareId] || 0;
                          return (
                            <td key={ipo.companyShareId} className="px-3 py-1.5 text-center">
                              <input
                                type="number"
                                min={0}
                                max={ipo.maxUnit}
                                value={val || ''}
                                onChange={e => setKitta(row.accountId, ipo.companyShareId, parseInt(e.target.value) || 0)}
                                placeholder={String(ipo.minUnit)}
                                className="w-16 text-center rounded py-1 text-xs outline-none tabular"
                                style={{
                                  background: val > 0 ? '#e2f6d5' : 'var(--surface-3)',
                                  border: `1px solid ${val > 0 ? 'rgba(159,232,112,0.5)' : 'var(--border)'}`,
                                  color: val > 0 ? '#163300' : 'var(--text-3)',
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Execution Console */}
          {(running || done || stream.length > 0) && (
            <div className="flex-shrink-0 border-t" style={{ borderColor: 'var(--border)', maxHeight: 240 }}>
              <div className="flex items-center justify-between px-4 py-2 border-b"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                    Execution Console
                  </span>
                  {running && (
                    <span className="flex items-center gap-1.5 text-[11px]" style={{ color: '#9fe870' }}>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {stream.length}/{streamTotal} processed
                    </span>
                  )}
                  {done && (
                    <span className="flex items-center gap-2 text-[11px]">
                      <span style={{ color: '#054d28' }}>✓ {successCount} applied</span>
                      {failCount > 0 && <span style={{ color: 'var(--danger)' }}>✗ {failCount} failed</span>}
                      <span style={{ color: 'var(--text-3)' }}>({successRate}%)</span>
                    </span>
                  )}
                </div>
                {done && (
                  <button onClick={() => { setStream([]); setDone(false); }}
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ color: 'var(--text-3)', background: 'var(--surface-3)' }}>
                    Clear
                  </button>
                )}
              </div>
              {/* Progress bar */}
              {(running || done) && streamTotal > 0 && (
                <div className="h-0.5 relative" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full transition-all duration-500"
                    style={{ width: `${(stream.length / streamTotal) * 100}%`, background: '#9fe870' }} />
                </div>
              )}
              <div ref={consoleRef} className="overflow-y-auto font-mono" style={{ maxHeight: 180, background: '#0e0f0c' }}>
                {stream.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-1 row-in text-[11px]">
                    <span style={{ color: row.status === 'success' ? '#9fe870' : '#f87171' }}>
                      {row.status === 'success' ? '✓' : '✗'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.75)' }}>{row.username}</span>
                    {row.error && <span style={{ color: '#f87171' }}>— {row.error}</span>}
                    {row.status === 'success' && <span style={{ color: 'rgba(255,255,255,0.35)' }}>applied successfully</span>}
                  </div>
                ))}
                {running && (
                  <div className="px-4 py-1 text-[11px] flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full pulse" style={{ background: '#9fe870' }} />
                    Processing…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
