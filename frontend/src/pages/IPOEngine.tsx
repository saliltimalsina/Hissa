import { useState, useRef, useEffect, useCallback } from 'react';
import { Zap, Play, ChevronUp } from 'lucide-react';
import type { Account, IPO, ExecLog, AppliedIpo } from '../types';
import { apiStream, parseNdjson, getAppliedIpos } from '../lib/api';
import { Spinner, Icon } from '../components/ui';

// History statuses that mean "this account already applied to this IPO" — used to
// default-uncheck and badge accounts so we never silently double-apply. Mirrors
// the backend's terminal-status idempotency guard (success/already/allotment).
const APPLIED_STATUSES = new Set(['success', 'already_applied', 'allotted', 'not_allotted']);

type Activity = { type: 'apply' | 'verify' | 'sync' | 'error'; status: 'success' | 'failed' | 'info'; message: string };

interface Props {
  accounts: Account[];
  ipos: IPO[];
  loadingIpos: boolean;
  ipoError: string;
  onRefreshIpos: () => void;
  fetchedAt: number | null;
  onActivity: (entry: Activity) => void;
}

const STALE_MS = 5 * 60 * 1000; // 5 min

function timeAgo(ts: number | null): string {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

interface AllocRow {
  account: Account;
  included: boolean;
  alreadyApplied: boolean;
}

const LOG_STYLE: Record<string, string> = {
  success: 'text-success',
  failed: 'text-danger',
  retrying: 'text-warn',
  pending: 'text-body',
};

function formatDate(d: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-NP', { day: 'numeric', month: 'short' }); }
  catch { return d; }
}

function daysLeft(closeDate: string) {
  if (!closeDate) return null;
  const diff = Math.ceil((new Date(closeDate).getTime() - Date.now()) / 86400000);
  return diff;
}

export default function IPOEngine({ accounts, ipos, loadingIpos, ipoError, onRefreshIpos, fetchedAt, onActivity }: Props) {
  const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);

  // Per-IPO applied history: company_id -> { account_username: status }.
  // Used to flag/default-uncheck accounts that already applied (no double-apply).
  const [appliedByCompany, setAppliedByCompany] = useState<Record<number, Record<string, string>>>({});

  function appliedAccountsFor(companyId: number): Record<string, string> {
    return appliedByCompany[companyId] || {};
  }
  function hasAlreadyApplied(companyId: number, username: string): boolean {
    const status = appliedAccountsFor(companyId)[username];
    return status !== undefined && APPLIED_STATUSES.has(status);
  }

  const loadApplied = useCallback(async () => {
    try {
      const list = await getAppliedIpos();
      const map: Record<number, Record<string, string>> = {};
      list.forEach((ipo: AppliedIpo) => { map[ipo.company_id] = ipo.accounts || {}; });
      setAppliedByCompany(map);
    } catch (e) {
      // Non-fatal: without it we just don't pre-flag applied accounts.
      console.error('Failed to load applied-IPO history', e);
    }
  }, []);

  // Auto-refresh on mount if stale; always load applied history. Guarded so it
  // runs exactly once; all setState here happens inside async callbacks/props.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void loadApplied();
    if (accounts.length === 0 || loadingIpos) return;
    const isStale = !fetchedAt || (Date.now() - fetchedAt) > STALE_MS;
    if (isStale) onRefreshIpos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [kitta, setKitta] = useState(10);
  const [alloc, setAlloc] = useState<AllocRow[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [logs, setLogs] = useState<ExecLog[]>([]);
  const [execStats, setExecStats] = useState({ done: 0, total: 0, success: 0, failed: 0 });
  const [execDone, setExecDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  function selectIpo(ipo: IPO) {
    setSelectedIpo(ipo);
    setKitta(ipo.minUnit);
    setAlloc(accounts.map(a => {
      const alreadyApplied = hasAlreadyApplied(ipo.companyShareId, a.username);
      // Default-uncheck accounts that already applied to prevent silent double-apply.
      return { account: a, included: !alreadyApplied, alreadyApplied };
    }));
    setLogs([]);
    setExecStats({ done: 0, total: 0, success: 0, failed: 0 });
    setExecDone(false);
  }

  function toggleRow(i: number) {
    setAlloc(prev => prev.map((r, idx) => idx === i ? { ...r, included: !r.included } : r));
  }

  function toggleAll() {
    // "Select all" only targets accounts that have NOT already applied.
    const selectable = alloc.filter(r => !r.alreadyApplied);
    const anyIncluded = selectable.some(r => r.included);
    setAlloc(prev => prev.map(r => r.alreadyApplied ? r : ({ ...r, included: !anyIncluded })));
  }

  async function execute() {
    if (!selectedIpo) return;
    const includedAccounts = alloc.filter(r => r.included).map(r => r.account);
    if (includedAccounts.length === 0) return;
    const accountIds = includedAccounts.map(a => a.id);

    setExecuting(true);
    setExecDone(false);
    setLogs([]);
    setConsoleOpen(true);
    setExecStats({ done: 0, total: accountIds.length, success: 0, failed: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    function addLog(entry: ExecLog) {
      setLogs(prev => [...prev, entry]);
      setTimeout(() => consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }

    try {
      // No credentials sent — the server applies using the selected account ids.
      const res = await apiStream('/api/apply', {
        body: {
          company_id: selectedIpo.companyShareId,
          kitta,
          account_ids: accountIds,
          company_name: selectedIpo.companyName,
          scrip: selectedIpo.scrip,
        },
        signal: controller.signal,
      });

      await parseNdjson(res, (ev) => {
        if (ev.type === 'start') {
          const total = Number(ev.total) || 0;
          setExecStats(s => ({ ...s, total }));
        } else if (ev.type === 'progress') {
          const r = (ev.result ?? {}) as {
            status?: string;
            error_message?: string;
            user_name?: string;
          };
          const status = (r.status ?? 'pending') as 'success' | 'failed' | 'retrying' | 'pending';
          const msg = r.error_message || (status === 'success' ? 'Applied successfully' : '');
          const userName = r.user_name ?? '';
          addLog({
            ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
            username: userName,
            status,
            message: msg,
          });
          if (status === 'success' || status === 'failed') {
            onActivity({
              type: 'apply',
              status: status === 'success' ? 'success' : 'failed',
              message: `${selectedIpo?.companyName || 'IPO'} → ${userName}: ${msg || status}`,
            });
          }
          setExecStats(s => ({
            ...s,
            done: s.done + 1,
            success: s.success + (status === 'success' ? 1 : 0),
            failed: s.failed + (status === 'failed' ? 1 : 0),
          }));
        } else if (ev.type === 'complete') {
          setExecDone(true);
        }
      });
      // Refresh applied-history so the just-applied accounts flag immediately.
      void loadApplied();
    } catch (e: unknown) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      if (!isAbort) {
        const message = e instanceof Error ? e.message : 'Execution failed';
        addLog({ ts: new Date().toLocaleTimeString(), username: 'system', status: 'failed', message });
      }
    } finally {
      setExecuting(false);
      abortRef.current = null;
    }
  }

  function cancelExec() {
    abortRef.current?.abort();
    setExecuting(false);
  }

  const includedCount = alloc.filter(r => r.included).length;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Main 2-pane area — stacks on small screens. */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

        {/* LEFT — IPO list */}
        <div className="w-full lg:w-72 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-line overflow-hidden max-h-64 lg:max-h-none">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="text-xs font-semibold text-body uppercase tracking-wider">Open Issues</span>
            <div className="flex items-center gap-2">
              {loadingIpos ? (
                <span className="flex items-center gap-1 text-[10px] text-muted">
                  <Spinner size="xs" />
                  Updating
                </span>
              ) : fetchedAt ? (
                <button
                  onClick={onRefreshIpos}
                  className="text-[10px] text-muted hover:text-brand transition-colors"
                  title="Refresh now"
                >
                  {timeAgo(fetchedAt)}
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {ipoError && (
              <div className="m-3 px-3 py-2 bg-danger/10 border border-danger/20 rounded text-xs text-danger">
                {ipoError}
              </div>
            )}

            {accounts.length === 0 && !ipoError && (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-muted">No accounts loaded.</p>
                <p className="text-xs text-muted mt-1">Go to Accounts page first.</p>
              </div>
            )}

            {ipos.length === 0 && !loadingIpos && !ipoError && accounts.length > 0 && (
              <div className="px-4 py-8 text-center text-xs text-muted">
                Click Refresh to load open IPOs
              </div>
            )}

            {ipos.map(ipo => {
              const selected = selectedIpo?.companyShareId === ipo.companyShareId;
              const days = daysLeft(ipo.issueCloseDate);
              const urgent = days !== null && days <= 2;
              const appliedCount = accounts.filter(a => hasAlreadyApplied(ipo.companyShareId, a.username)).length;
              return (
                <button
                  key={ipo.companyShareId}
                  onClick={() => selectIpo(ipo)}
                  className={`w-full text-left px-4 py-3.5 border-b border-line transition-colors ${
                    selected
                      ? 'bg-brand/10 border-l-2 border-l-brand'
                      : 'hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{ipo.companyName}</p>
                      <p className="text-[10px] text-muted mt-0.5">{ipo.shareGroupName || ipo.shareTypeName}</p>
                      {ipo.action && (
                        <p className="text-[9px] text-warn-fg mt-0.5" title="MeroShare reports a prior action on this issue">
                          MeroShare: {ipo.action}
                        </p>
                      )}
                    </div>
                    {days !== null && (
                      <span className={`text-[10px] font-semibold flex-shrink-0 tabular ${urgent ? 'text-danger' : 'text-muted'}`}>
                        {days}d
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-muted">{ipo.minUnit}–{ipo.maxUnit} kittas</span>
                    <span className="text-[10px] text-muted">·</span>
                    <span className="text-[10px] text-muted">{formatDate(ipo.issueOpenDate)} → {formatDate(ipo.issueCloseDate)}</span>
                  </div>
                  {appliedCount > 0 && accounts.length > 0 && (
                    <div className="mt-1.5">
                      <span className="text-[10px] font-semibold text-success bg-success/10 rounded px-1.5 py-0.5">
                        {appliedCount}/{accounts.length} applied
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Allocation engine */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedIpo ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-white border border-border flex items-center justify-center mx-auto mb-3 text-muted">
                  <Icon icon={Zap} size={24} />
                </div>
                <p className="text-sm font-medium text-body">Select an IPO</p>
                <p className="text-xs text-muted mt-1">Choose from the list to build allocation</p>
              </div>
            </div>
          ) : (
            <>
              {/* Allocation header */}
              <div className="px-5 py-3 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
                <div>
                  <h2 className="text-title text-ink">{selectedIpo.companyName}</h2>
                  <p className="text-xs text-muted mt-1 font-medium">{selectedIpo.shareGroupName || selectedIpo.shareTypeName} · {includedCount} of {alloc.length} accounts selected</p>
                </div>
                <div className="flex items-center flex-wrap gap-3">
                  {/* Kitta input */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Kittas</span>
                    <input
                      type="number"
                      min={selectedIpo.minUnit}
                      max={selectedIpo.maxUnit}
                      value={kitta}
                      onChange={e => setKitta(Math.min(selectedIpo.maxUnit, Math.max(selectedIpo.minUnit, parseInt(e.target.value) || selectedIpo.minUnit)))}
                      disabled={executing}
                      aria-label="Kittas per account"
                      className="w-16 bg-white border border-border rounded px-2 py-1 text-xs text-ink text-center tabular focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                    />
                    <span className="text-xs text-muted">/{selectedIpo.maxUnit} max</span>
                  </div>

                  {/* Bulk actions */}
                  <button
                    onClick={() => setKitta(selectedIpo.minUnit)}
                    className="px-2 py-1 text-[10px] text-body border border-border rounded hover:border-faint transition-colors"
                  >
                    Min
                  </button>
                  <button
                    onClick={() => setKitta(selectedIpo.maxUnit)}
                    className="px-2 py-1 text-[10px] text-body border border-border rounded hover:border-faint transition-colors"
                  >
                    Max
                  </button>

                  {/* Execute */}
                  {executing ? (
                    <button
                      onClick={cancelExec}
                      className="px-3 py-1.5 bg-danger/20 text-danger border border-danger/30 rounded text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={execute}
                      disabled={includedCount === 0}
                      className="px-4 py-1.5 bg-brand hover:bg-brand-hover text-white rounded text-xs font-semibold disabled:opacity-40 transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <Icon icon={Play} size={12} />
                      Execute ({includedCount})
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {(executing || execDone) && execStats.total > 0 && (
                <div className="px-5 py-2 border-b border-line flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-brand-tint rounded-full h-1 flex overflow-hidden">
                      <div
                        className="h-1 bg-success transition-all duration-300"
                        style={{ width: `${(execStats.success / execStats.total) * 100}%` }}
                      />
                      <div
                        className="h-1 bg-danger transition-all duration-300"
                        style={{ width: `${(execStats.failed / execStats.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted tabular flex-shrink-0">
                      <span className="text-success">{execStats.success}</span> ok ·{' '}
                      <span className="text-danger">{execStats.failed}</span> fail ·{' '}
                      {execStats.done}/{execStats.total}
                    </span>
                  </div>
                </div>
              )}

              {/* Allocation table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface border-b border-line">
                    <tr className="text-muted">
                      <th className="px-5 py-2.5 text-left font-medium w-10">
                        <input
                          type="checkbox"
                          checked={alloc.every(r => r.included)}
                          onChange={toggleAll}
                          aria-label="Select all accounts"
                          className="accent-brand"
                        />
                      </th>
                      <th className="px-2 py-2.5 text-left font-medium">Account</th>
                      <th className="px-2 py-2.5 text-left font-medium">Group</th>
                      <th className="px-2 py-2.5 text-left font-medium">Username</th>
                      <th className="px-2 py-2.5 text-right font-medium">Kitta</th>
                      <th className="px-5 py-2.5 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alloc.map((row, i) => {
                      const log = logs.find(l => l.username === row.account.username);
                      return (
                        <tr
                          key={i}
                          className={`border-b border-line-soft transition-colors ${
                            row.included ? 'hover:bg-white' : 'opacity-40'
                          }`}
                        >
                          <td className="px-5 py-2.5">
                            <input
                              type="checkbox"
                              checked={row.included}
                              onChange={() => toggleRow(i)}
                              disabled={row.alreadyApplied}
                              aria-label={`Include ${row.account.label || row.account.username}`}
                              title={row.alreadyApplied ? 'Already applied — check to apply again' : undefined}
                              className="accent-brand disabled:opacity-40"
                            />
                          </td>
                          <td className="px-2 py-2.5 font-medium text-ink">
                            <span className="inline-flex items-center gap-1.5">
                              {row.account.label || `Account ${i + 1}`}
                              {row.alreadyApplied && (
                                <span className="text-[9px] font-semibold text-success bg-success/10 rounded px-1 py-0.5">
                                  applied
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-muted">
                            {row.account.group_name || '—'}
                          </td>
                          <td className="px-2 py-2.5 text-body tabular">{row.account.username}</td>
                          <td className="px-2 py-2.5 text-right tabular text-body">{kitta}</td>
                          <td className="px-5 py-2.5">
                            {log ? (
                              <span className={`font-medium capitalize ${LOG_STYLE[log.status]}`}>
                                {log.status}
                              </span>
                            ) : row.alreadyApplied ? (
                              <span className="text-success font-medium">applied</span>
                            ) : (
                              <span className={row.included ? 'text-muted' : 'text-faint'}>
                                {row.included ? 'queued' : 'skipped'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* BOTTOM — Execution console */}
      <div className={`flex-shrink-0 border-t border-line transition-all duration-300 ${consoleOpen ? 'h-52' : 'h-9'}`}>
        <button
          onClick={() => setConsoleOpen(o => !o)}
          aria-expanded={consoleOpen}
          className="w-full h-9 flex items-center justify-between px-4 hover:bg-white transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-semibold text-muted uppercase tracking-wider">Execution Console</span>
            {executing && (
              <span className="flex items-center gap-1 text-[10px] text-brand">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                Running
              </span>
            )}
            {execDone && (() => {
              const allOk = execStats.failed === 0 && execStats.success > 0;
              const allFailed = execStats.success === 0 && execStats.failed > 0;
              const color = allOk ? 'text-success' : allFailed ? 'text-danger' : 'text-warn';
              return (
                <span className={`text-[10px] ${color}`}>
                  Done · <span className="text-success">{execStats.success} ok</span> · <span className="text-danger">{execStats.failed} failed</span>
                </span>
              );
            })()}
          </div>
          <Icon icon={ChevronUp} size={12} className={`text-muted transition-transform ${consoleOpen ? 'rotate-180' : ''}`} />
        </button>

        {consoleOpen && (
          <div className="h-[calc(100%-36px)] overflow-y-auto bg-[#f0f2f7] px-4 py-2 font-mono text-[11px]">
            {logs.length === 0 && (
              <p className="text-muted">$ waiting for execution...</p>
            )}
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2 py-0.5">
                <span className="text-muted flex-shrink-0 tabular">{log.ts}</span>
                <span className={`flex-shrink-0 w-16 ${LOG_STYLE[log.status]}`}>
                  {log.status === 'success' ? '✓' : log.status === 'failed' ? '✕' : '~'} {log.status}
                </span>
                <span className="text-body font-semibold flex-shrink-0 tabular">{log.username}</span>
                {log.message && <span className="text-muted truncate">{log.message}</span>}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
