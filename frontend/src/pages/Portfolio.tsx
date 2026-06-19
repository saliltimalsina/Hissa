import { useState, useEffect, useRef } from 'react';
import type { Account, AccountPortfolio, Holding } from '../types';
import { Spinner } from '../components/ui';

interface Props {
  accounts: Account[];
  portfolios: AccountPortfolio[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  fetchedAt: number | null;
}

const STALE_MS = 5 * 60 * 1000;

function timeAgo(ts: number | null): string {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

interface MergedHolding extends Holding {
  accounts: string[];
  totalQty: number;
  totalValue: number;
}

export default function Portfolio({ accounts, portfolios, loading, error, onRefresh, fetchedAt }: Props) {
  const [view, setView] = useState<'aggregate' | 'account'>('aggregate');
  // Null = "no explicit pick yet" → fall back to the first portfolio (derived
  // during render, so we never need a setState-in-effect to seed it).
  const [picked, setPicked] = useState<string | null>(null);
  const selectedAccount =
    picked && portfolios.some(p => p.username === picked)
      ? picked
      : (portfolios[0]?.username ?? '');
  const setSelectedAccount = setPicked;

  // Auto-refresh on mount if stale. The refresh runs from the effect but its
  // setState happens inside the (async) onRefresh handler, not synchronously.
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (didAutoRefresh.current) return;
    if (accounts.length === 0 || loading) return;
    didAutoRefresh.current = true;
    const isStale = !fetchedAt || (Date.now() - fetchedAt) > STALE_MS;
    if (isStale) onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge all holdings across accounts
  const merged: Record<string, MergedHolding> = {};
  portfolios.forEach(p => {
    p.holdings.forEach(h => {
      if (!merged[h.script]) {
        merged[h.script] = { ...h, accounts: [], totalQty: 0, totalValue: 0 };
      }
      merged[h.script].accounts.push(p.label || p.username);
      merged[h.script].totalQty += h.currentBalance;
      merged[h.script].totalValue += h.valueOfLastTransPrice;
    });
  });
  const mergedList = Object.values(merged).sort((a, b) => b.totalValue - a.totalValue);

  const totalValue = portfolios.reduce((s, p) => s + p.total_value, 0);
  const totalHoldings = mergedList.length;

  const activePortfolio = portfolios.find(p => p.username === selectedAccount);

  function formatNPR(n: number) {
    if (n >= 1_000_000) return `NPR ${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `NPR ${(n / 1_000).toFixed(1)}K`;
    return `NPR ${n.toFixed(0)}`;
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-4 sm:px-8 py-6 border-b border-line flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-display text-ink">Portfolio</h1>
          <p className="text-body text-muted mt-1">Multi-account wealth aggregation</p>
        </div>
        {loading ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Spinner size="sm" />
            Updating
          </span>
        ) : fetchedAt ? (
          <button onClick={onRefresh} className="text-xs text-muted hover:text-brand transition-colors" title="Refresh now">
            Updated {timeAgo(fetchedAt)}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-2 bg-danger/10 border border-danger/20 rounded text-xs text-danger">
          {error}
        </div>
      )}

      {/* Stats row */}
      {portfolios.length > 0 && (
        <div className="px-6 py-3 border-b border-line flex items-center gap-8 flex-shrink-0">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Total Value</p>
            <p className="text-2xl font-bold text-ink tabular mt-1 tracking-tight">{formatNPR(totalValue)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Holdings</p>
            <p className="text-2xl font-bold text-ink tabular mt-1 tracking-tight">{totalHoldings}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Accounts</p>
            <p className="text-2xl font-bold text-ink tabular mt-1 tracking-tight">{portfolios.filter(p => !p.error).length}</p>
          </div>

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 bg-white border border-border rounded p-1">
            <button onClick={() => setView('aggregate')} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${view === 'aggregate' ? 'bg-brand text-white' : 'text-muted hover:text-body'}`}>
              Aggregate
            </button>
            <button onClick={() => setView('account')} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${view === 'account' ? 'bg-brand text-white' : 'text-muted hover:text-body'}`}>
              By Account
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {portfolios.length === 0 && !loading && !error && (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <p className="text-sm text-muted">No portfolio data</p>
              <p className="text-xs text-faint mt-1">Load accounts first, then click "Load Portfolio"</p>
            </div>
          </div>
        )}

        {portfolios.length > 0 && view === 'aggregate' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface border-b border-line">
              <tr className="text-muted">
                <th className="px-6 py-2.5 text-left font-medium">Script</th>
                <th className="px-3 py-2.5 text-left font-medium">Name</th>
                <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                <th className="px-3 py-2.5 text-right font-medium">LTP</th>
                <th className="px-3 py-2.5 text-right font-medium">Value</th>
                <th className="px-3 py-2.5 text-right font-medium">Prev Close</th>
                <th className="px-6 py-2.5 text-left font-medium">Accounts</th>
              </tr>
            </thead>
            <tbody>
              {mergedList.map((h, i) => {
                const priceDiff = parseFloat(h.lastTransactionPrice) - parseFloat(h.previousClosingPrice);
                const positive = priceDiff >= 0;
                return (
                  <tr key={i} className="border-b border-line-soft hover:bg-brand-subtle transition-colors">
                    <td className="px-6 py-2.5 font-semibold text-ink font-mono">{h.script}</td>
                    <td className="px-3 py-2.5 text-body max-w-xs truncate">{h.scriptDesc}</td>
                    <td className="px-3 py-2.5 text-right tabular text-ink font-medium">{h.totalQty.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular text-ink">{h.lastTransactionPrice}</td>
                    <td className="px-3 py-2.5 text-right tabular text-ink font-medium">{formatNPR(h.totalValue)}</td>
                    <td className={`px-3 py-2.5 text-right tabular ${positive ? 'text-success' : 'text-danger'}`}>
                      {h.previousClosingPrice}
                    </td>
                    <td className="px-6 py-2.5 text-muted">{h.accounts.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {portfolios.length > 0 && view === 'account' && (
          <div className="flex flex-col sm:flex-row h-full">
            {/* Account list */}
            <div className="w-full sm:w-52 flex-shrink-0 border-b sm:border-b-0 sm:border-r border-line overflow-y-auto max-h-48 sm:max-h-none">
              {portfolios.map(p => (
                <button
                  key={p.username}
                  onClick={() => setSelectedAccount(p.username)}
                  className={`w-full text-left px-4 py-3 border-b border-line transition-colors ${
                    selectedAccount === p.username ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-white'
                  }`}
                >
                  <p className="text-xs font-medium text-ink truncate">{p.label || p.username}</p>
                  <p className="text-[10px] text-muted mt-0.5 tabular">
                    {p.error ? <span className="text-danger">Error</span> : formatNPR(p.total_value)}
                  </p>
                </button>
              ))}
            </div>

            {/* Holdings for selected account */}
            <div className="flex-1 overflow-auto">
              {activePortfolio && (
                activePortfolio.error ? (
                  <div className="p-6 text-sm text-danger">{activePortfolio.error}</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface border-b border-line">
                      <tr className="text-muted">
                        <th className="px-6 py-2.5 text-left font-medium">Script</th>
                        <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                        <th className="px-3 py-2.5 text-right font-medium">LTP</th>
                        <th className="px-3 py-2.5 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePortfolio.holdings.map((h, i) => (
                        <tr key={i} className="border-b border-line-soft hover:bg-brand-subtle transition-colors">
                          <td className="px-6 py-2.5 font-semibold text-ink font-mono">{h.script}</td>
                          <td className="px-3 py-2.5 text-right tabular text-ink">{h.currentBalance.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right tabular text-ink">{h.lastTransactionPrice}</td>
                          <td className="px-3 py-2.5 text-right tabular text-ink font-medium">{formatNPR(h.valueOfLastTransPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
