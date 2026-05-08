import { useState } from 'react';
import { useApp } from '../store';
import { fetchPortfolio } from '../api';
import type { Holding } from '../types';

type View = 'aggregate' | 'account';

interface AggHolding extends Holding {
  accounts: string[];
  totalQty: number;
  totalValue: number;
}

export default function Portfolio() {
  const { accounts, portfolios, grandTotal, setPortfolios, setPortfolioLoading, portfolioLoading, addLog } = useApp();
  const [view, setView] = useState<View>('account');
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'value' | 'qty' | 'script'>('value');
  const [filter, setFilter] = useState('');

  async function load() {
    if (!accounts.length) return;
    setPortfolioLoading(true);
    try {
      const data = await fetchPortfolio();
      setPortfolios(data.accounts, data.grand_total);
      addLog({ status: 'info', message: `Portfolio loaded — NPR ${data.grand_total.toLocaleString()} across ${data.accounts.length} accounts` });
    } catch (e: any) {
      addLog({ status: 'failed', message: `Portfolio load failed: ${e.message}` });
    } finally {
      setPortfolioLoading(false);
    }
  }

  function fmtNPR(v: number) {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  }

  // Build aggregate holdings
  const aggMap: Record<string, AggHolding> = {};
  portfolios.forEach(port => {
    if (port.error) return;
    port.holdings.forEach(h => {
      if (!aggMap[h.script]) {
        aggMap[h.script] = { ...h, accounts: [], totalQty: 0, totalValue: 0 };
      }
      aggMap[h.script].accounts.push(port.label);
      aggMap[h.script].totalQty += h.currentBalance;
      aggMap[h.script].totalValue += h.valueOfLastTransPrice;
    });
  });

  let aggHoldings = Object.values(aggMap);
  if (filter) aggHoldings = aggHoldings.filter(h => h.script.toLowerCase().includes(filter.toLowerCase()) || h.scriptDesc?.toLowerCase().includes(filter.toLowerCase()));
  aggHoldings.sort((a, b) =>
    sortBy === 'value' ? b.totalValue - a.totalValue
    : sortBy === 'qty' ? b.totalQty - a.totalQty
    : a.script.localeCompare(b.script)
  );

  const displayPort = view === 'account' && selectedAccount
    ? portfolios.find(p => p.username === selectedAccount)
    : null;

  const totalHoldings = aggHoldings.length;
  const totalAccounts = portfolios.filter(p => !p.error).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Portfolio</h1>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {totalAccounts > 0
              ? `${totalAccounts} accounts · ${totalHoldings} scripts · NPR ${fmtNPR(grandTotal)}`
              : 'Aggregated holdings across all accounts'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['aggregate', 'account'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                style={{
                  background: view === v ? 'var(--surface-3)' : 'var(--surface)',
                  color: view === v ? 'var(--text)' : 'var(--text-3)',
                }}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={portfolioLoading || !accounts.length}
            className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40 flex items-center gap-1.5"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <svg className={`w-3 h-3 ${portfolioLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {portfolioLoading ? 'Loading…' : 'Load Portfolio'}
          </button>
        </div>
      </div>

      {portfolios.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <svg className="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="var(--text-2)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            {accounts.length === 0 ? 'Add accounts first' : 'Click "Load Portfolio" to fetch holdings'}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Account list sidebar (account view) */}
          {view === 'account' && (
            <div className="w-48 flex-shrink-0 border-r overflow-y-auto"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                  Accounts
                </span>
              </div>
              {portfolios.map(port => (
                <button key={port.username}
                  onClick={() => setSelectedAccount(port.username)}
                  className="w-full flex flex-col gap-0.5 px-3 py-2.5 text-left border-b transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    background: selectedAccount === port.username ? '#e2f6d5' : 'transparent',
                    borderLeft: selectedAccount === port.username ? '2px solid #9fe870' : '2px solid transparent',
                  }}
                  onMouseEnter={e => { if (selectedAccount !== port.username) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (selectedAccount !== port.username) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <span className="text-xs font-medium" style={{ color: selectedAccount === port.username ? '#163300' : 'var(--text)' }}>
                    {port.label}
                  </span>
                  <span className="text-[10px] tabular" style={{ color: 'var(--text-3)' }}>
                    {port.error ? 'Error' : `NPR ${fmtNPR(port.total_value)}`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Main holdings table */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Controls */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by script…"
                className="px-2.5 py-1 rounded text-xs outline-none"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text)', width: 180 }}
              />
              <div className="flex items-center gap-1">
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Sort:</span>
                {(['value', 'qty', 'script'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className="px-2 py-0.5 rounded text-[11px] capitalize"
                    style={{
                      background: sortBy === s ? 'var(--surface-3)' : 'transparent',
                      color: sortBy === s ? 'var(--text)' : 'var(--text-3)',
                    }}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              {view === 'aggregate' && (
                <span className="text-[11px] tabular" style={{ color: 'var(--text-3)' }}>
                  {aggHoldings.length} scripts · NPR {fmtNPR(grandTotal)} total
                </span>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left px-4 py-2 font-semibold sticky top-0 z-10"
                      style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>Script</th>
                    <th className="text-right px-4 py-2 font-semibold sticky top-0 z-10"
                      style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>Qty</th>
                    <th className="text-right px-4 py-2 font-semibold sticky top-0 z-10"
                      style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>Last Price</th>
                    <th className="text-right px-4 py-2 font-semibold sticky top-0 z-10"
                      style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>Value (NPR)</th>
                    {view === 'aggregate' && (
                      <th className="text-right px-4 py-2 font-semibold sticky top-0 z-10"
                        style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>Accounts</th>
                    )}
                    <th className="text-right px-4 py-2 font-semibold sticky top-0 z-10"
                      style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>% of Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {(view === 'aggregate' ? aggHoldings : (displayPort?.holdings ?? [])).map((h: any, i: number) => {
                    const isAgg = view === 'aggregate';
                    const qty = isAgg ? h.totalQty : h.currentBalance;
                    const val = isAgg ? h.totalValue : h.valueOfLastTransPrice;
                    const total = isAgg ? grandTotal : (displayPort?.total_value ?? 1);
                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                    const price = parseFloat(h.lastTransactionPrice) || 0;
                    const prevPrice = parseFloat(h.previousClosingPrice) || 0;
                    const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

                    return (
                      <tr key={`${h.script}-${i}`}
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold" style={{ color: 'var(--text)' }}>{h.script}</div>
                          <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{h.scriptDesc}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular" style={{ color: 'var(--text-2)' }}>
                          {qty.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular">
                          <div style={{ color: 'var(--text)' }}>
                            {price > 0 ? price.toLocaleString() : '—'}
                          </div>
                          {change !== 0 && (
                            <div className="text-[10px]" style={{ color: change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular font-medium" style={{ color: 'var(--text)' }}>
                          {fmtNPR(val)}
                        </td>
                        {isAgg && (
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
                              {(h as AggHolding).accounts.length}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(pct) * 2)}%`, background: '#9fe870' }} />
                            </div>
                            <span className="tabular text-[11px]" style={{ color: 'var(--text-3)' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
