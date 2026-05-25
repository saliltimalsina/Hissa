import { useState, useEffect } from 'react';
import type { Account, AccountPortfolio, Holding } from '../types';

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
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  useEffect(() => {
    if (portfolios.length > 0 && !selectedAccount) setSelectedAccount(portfolios[0].username);
  }, [portfolios, selectedAccount]);

  // Auto-refresh on mount if stale
  useEffect(() => {
    if (accounts.length === 0 || loading) return;
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
    <div className="h-full flex flex-col bg-[#F7F8FC]">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[#ECECF2] flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Portfolio</h1>
          <p className="text-sm text-[#6B7280] mt-1">Multi-account wealth aggregation</p>
        </div>
        {loading ? (
          <span className="flex items-center gap-1.5 text-xs text-[#6b7280]">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
            Updating
          </span>
        ) : fetchedAt ? (
          <button onClick={onRefresh} className="text-xs text-[#6b7280] hover:text-[#5B4DFF] transition-colors" title="Refresh now">
            Updated {timeAgo(fetchedAt)}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-2 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded text-xs text-[#EF4444]">
          {error}
        </div>
      )}

      {/* Stats row */}
      {portfolios.length > 0 && (
        <div className="px-6 py-3 border-b border-[#ECECF2] flex items-center gap-8 flex-shrink-0">
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide font-semibold">Total Value</p>
            <p className="text-2xl font-bold text-[#111827] tabular mt-1 tracking-tight">{formatNPR(totalValue)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide font-semibold">Holdings</p>
            <p className="text-2xl font-bold text-[#111827] tabular mt-1 tracking-tight">{totalHoldings}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide font-semibold">Accounts</p>
            <p className="text-2xl font-bold text-[#111827] tabular mt-1 tracking-tight">{portfolios.filter(p => !p.error).length}</p>
          </div>

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 bg-[#ffffff] border border-[#D1D5DB] rounded p-1">
            <button onClick={() => setView('aggregate')} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${view === 'aggregate' ? 'bg-[#5B4DFF] text-white' : 'text-[#6b7280] hover:text-[#374151]'}`}>
              Aggregate
            </button>
            <button onClick={() => setView('account')} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${view === 'account' ? 'bg-[#5B4DFF] text-white' : 'text-[#6b7280] hover:text-[#374151]'}`}>
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
              <p className="text-sm text-[#6b7280]">No portfolio data</p>
              <p className="text-xs text-[#D1D5DB] mt-1">Load accounts first, then click "Load Portfolio"</p>
            </div>
          </div>
        )}

        {portfolios.length > 0 && view === 'aggregate' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#F7F8FC] border-b border-[#ECECF2]">
              <tr className="text-[#6b7280]">
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
                  <tr key={i} className="border-b border-[#F4F4F8] hover:bg-[#FAFAFF] transition-colors">
                    <td className="px-6 py-2.5 font-semibold text-[#111827] font-mono">{h.script}</td>
                    <td className="px-3 py-2.5 text-[#374151] max-w-xs truncate">{h.scriptDesc}</td>
                    <td className="px-3 py-2.5 text-right tabular text-[#111827] font-medium">{h.totalQty.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular text-[#111827]">{h.lastTransactionPrice}</td>
                    <td className="px-3 py-2.5 text-right tabular text-[#111827] font-medium">{formatNPR(h.totalValue)}</td>
                    <td className={`px-3 py-2.5 text-right tabular ${positive ? 'text-[#1F9D55]' : 'text-[#EF4444]'}`}>
                      {h.previousClosingPrice}
                    </td>
                    <td className="px-6 py-2.5 text-[#6b7280]">{h.accounts.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {portfolios.length > 0 && view === 'account' && (
          <div className="flex h-full">
            {/* Account list */}
            <div className="w-52 flex-shrink-0 border-r border-[#ECECF2] overflow-y-auto">
              {portfolios.map(p => (
                <button
                  key={p.username}
                  onClick={() => setSelectedAccount(p.username)}
                  className={`w-full text-left px-4 py-3 border-b border-[#ECECF2] transition-colors ${
                    selectedAccount === p.username ? 'bg-[#5B4DFF]/10 border-l-2 border-l-[#5B4DFF]' : 'hover:bg-[#ffffff]'
                  }`}
                >
                  <p className="text-xs font-medium text-[#111827] truncate">{p.label || p.username}</p>
                  <p className="text-[10px] text-[#6b7280] mt-0.5 tabular">
                    {p.error ? <span className="text-[#EF4444]">Error</span> : formatNPR(p.total_value)}
                  </p>
                </button>
              ))}
            </div>

            {/* Holdings for selected account */}
            <div className="flex-1 overflow-auto">
              {activePortfolio && (
                activePortfolio.error ? (
                  <div className="p-6 text-sm text-[#EF4444]">{activePortfolio.error}</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#F7F8FC] border-b border-[#ECECF2]">
                      <tr className="text-[#6b7280]">
                        <th className="px-6 py-2.5 text-left font-medium">Script</th>
                        <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                        <th className="px-3 py-2.5 text-right font-medium">LTP</th>
                        <th className="px-3 py-2.5 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePortfolio.holdings.map((h, i) => (
                        <tr key={i} className="border-b border-[#F4F4F8] hover:bg-[#FAFAFF] transition-colors">
                          <td className="px-6 py-2.5 font-semibold text-[#111827] font-mono">{h.script}</td>
                          <td className="px-3 py-2.5 text-right tabular text-[#111827]">{h.currentBalance.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right tabular text-[#111827]">{h.lastTransactionPrice}</td>
                          <td className="px-3 py-2.5 text-right tabular text-[#111827] font-medium">{formatNPR(h.valueOfLastTransPrice)}</td>
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
