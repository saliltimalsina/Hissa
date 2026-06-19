import { useState, useEffect } from 'react';
import { Users, Zap, Plus, BarChart3 } from 'lucide-react';
import { Icon } from '../components/ui';
import type { Account, Page, IPO, AccountPortfolio, AccountSnapshot, HistoryStats } from '../types';

type Activity = { ts: number; type: 'apply' | 'verify' | 'sync' | 'error'; status: 'success' | 'failed' | 'info'; message: string };

interface Props {
  accounts: Account[];
  onNavigate: (page: Page) => void;
  snapshots: Record<string, AccountSnapshot>;
  ipos: IPO[];
  portfolios: AccountPortfolio[];
  portfoliosFetchedAt: number | null;
  iposFetchedAt: number | null;
  activity: Activity[];
  historyStats: HistoryStats | null;
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatNPR(n: number) {
  if (n >= 1_000_000) return `NPR ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `NPR ${(n / 1_000).toFixed(1)}K`;
  return `NPR ${n.toFixed(0)}`;
}

interface ActionCardProps {
  label: string;
  value: string | number;
  sub: string;
  variant: 'urgent' | 'warning' | 'good' | 'info' | 'neutral';
  cta?: string;
  onClick?: () => void;
}

function ActionCard({ label, value, sub, variant, cta, onClick }: ActionCardProps) {
  const styles = {
    urgent: { bg: 'bg-white', accent: 'text-danger-fg', dot: 'bg-danger', subColor: 'text-danger-fg', cta: 'text-danger-fg' },
    warning: { bg: 'bg-white', accent: 'text-warn-fg', dot: 'bg-warn', subColor: 'text-warn-fg', cta: 'text-warn-fg' },
    good: { bg: 'bg-white', accent: 'text-success', dot: 'bg-success', subColor: 'text-success', cta: 'text-success' },
    info: { bg: 'bg-white', accent: 'text-brand', dot: 'bg-brand', subColor: 'text-brand', cta: 'text-brand' },
    neutral: { bg: 'bg-white', accent: 'text-ink', dot: 'bg-faint', subColor: 'text-muted', cta: 'text-muted' },
  }[variant];

  return (
    <div
      onClick={onClick}
      className={`${styles.bg} rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${onClick ? 'cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow' : ''}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
        <p className="text-overline text-muted">{label}</p>
      </div>
      <p className={`text-metric-lg ${styles.accent}`}>{value}</p>
      <div className="flex items-center justify-between mt-3">
        <p className={`text-xs font-medium ${styles.subColor}`}>{sub}</p>
        {cta && onClick && (
          <span className={`text-xs font-semibold ${styles.cta}`}>{cta} →</span>
        )}
      </div>
    </div>
  );
}

export default function Overview({ accounts, onNavigate, snapshots, ipos, portfolios, portfoliosFetchedAt, iposFetchedAt, activity, historyStats }: Props) {
  const issues = Object.values(snapshots).filter(s => ['auth_failed', 'expired', 'error'].includes(s.status));
  const expiring = Object.values(snapshots).filter(s => s.status === 'expiring');
  const healthy = Object.values(snapshots).filter(s => s.status === 'healthy').length;
  const completeAccounts = accounts.length;
  const unverified = Math.max(0, completeAccounts - Object.keys(snapshots).length);

  const totalPortfolioValue = portfolios.reduce((s, p) => s + (p.total_value || 0), 0);

  // "Now" is read from state (seeded once on mount, refreshed each minute) so we
  // never call the impure Date.now() directly during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Closing-soon IPOs (≤2 days)
  const closingSoon = ipos.filter(ipo => {
    if (!ipo.issueCloseDate) return false;
    const days = Math.ceil((new Date(ipo.issueCloseDate).getTime() - now) / 86400000);
    return days >= 0 && days <= 2;
  });

  const needsAttention = issues.length + unverified;

  // Onboarding state
  if (accounts.length === 0) {
    return (
      <div className="p-4 sm:p-8 max-w-7xl">
        <h1 className="text-display text-ink mb-1">Overview</h1>
        <p className="text-sm text-muted mb-8">Capital snapshot across your accounts</p>

        <div className="bg-white rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-2xl">
          <div className="w-12 h-12 bg-brand-tint rounded-xl flex items-center justify-center mb-4">
            <Icon icon={Users} size={24} className="text-brand" />
          </div>
          <h2 className="text-title text-ink mb-1">Get started</h2>
          <p className="text-sm text-muted mb-6">Add your MeroShare credentials to begin managing IPO applications.</p>
          <ol className="space-y-3 text-sm text-body mb-6">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span>Add MeroShare credentials in <button onClick={() => onNavigate('accounts')} className="text-brand underline font-semibold">Accounts</button></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-line text-muted text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span>Run Health Check to verify each account</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-line text-muted text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span>Open IPO Engine and bulk apply</span>
            </li>
          </ol>
          <button
            onClick={() => onNavigate('accounts')}
            className="px-5 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Add Accounts →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-display text-ink">Overview</h1>
        <p className="text-sm text-muted mt-1">Capital snapshot across your accounts</p>
      </div>

      {/* Action-center cards: what needs attention */}
      <div>
        <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-4">Operational State</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ActionCard
            label="Accounts Attention"
            value={needsAttention}
            sub={needsAttention === 0 ? 'All accounts healthy' : `${issues.length} issues · ${unverified} unverified`}
            variant={needsAttention > 0 ? (issues.length > 0 ? 'urgent' : 'warning') : 'good'}
            cta={needsAttention > 0 ? 'Review' : undefined}
            onClick={needsAttention > 0 ? () => onNavigate('accounts') : undefined}
          />
          <ActionCard
            label="Closing Soon"
            value={closingSoon.length}
            sub={closingSoon.length > 0 ? `${closingSoon.length} ${closingSoon.length === 1 ? 'IPO' : 'IPOs'} closing in 2 days` : ipos.length > 0 ? `${ipos.length} open issues` : 'No IPOs open'}
            variant={closingSoon.length > 0 ? 'warning' : ipos.length > 0 ? 'info' : 'neutral'}
            cta={ipos.length > 0 ? 'Apply' : undefined}
            onClick={ipos.length > 0 ? () => onNavigate('ipo-engine') : undefined}
          />
          <ActionCard
            label="Portfolio Value"
            value={totalPortfolioValue > 0 ? formatNPR(totalPortfolioValue) : '—'}
            sub={portfoliosFetchedAt ? `Synced ${timeAgo(portfoliosFetchedAt)}` : 'Loading...'}
            variant="neutral"
            cta="View"
            onClick={() => onNavigate('portfolio')}
          />
          <ActionCard
            label="Last Sync"
            value={iposFetchedAt ? timeAgo(iposFetchedAt) : '—'}
            sub={`${completeAccounts} accounts · ${healthy} healthy`}
            variant="good"
          />
        </div>
      </div>

      {/* Application history — server-backed stats (not localStorage) */}
      {historyStats && historyStats.total_applications > 0 && (
        <div>
          <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-4">Application History</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-overline text-muted mb-2">Total Applications</p>
              <p className="text-metric text-ink">{historyStats.total_applications}</p>
              <p className="text-xs text-muted mt-2">{historyStats.unique_ipos} IPOs · {historyStats.unique_accounts} accounts</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-overline text-muted mb-2">Success Rate</p>
              <p className="text-metric text-success">{historyStats.success_rate}%</p>
              <p className="text-xs text-muted mt-2">{historyStats.success} ok · {historyStats.failed} failed</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-overline text-muted mb-2">Allotted</p>
              <p className="text-metric text-brand">{historyStats.allotted}</p>
              <p className="text-xs text-muted mt-2">{historyStats.allotment_rate}% allotment rate</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-overline text-muted mb-2">Failed</p>
              <p className="text-metric text-danger">{historyStats.failed}</p>
              <p className="text-xs text-muted mt-2">across all applications</p>
            </div>
          </div>
        </div>
      )}

      {/* 2-col layout: activity feed + quick actions/health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Activity feed */}
        <div className="col-span-2 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <p className="text-sm font-bold text-ink">Recent Activity</p>
            {activity.length > 0 && <span className="text-xs text-faint">{activity.length} events</span>}
          </div>
          <div className="divide-y divide-line-soft max-h-96 overflow-y-auto">
            {activity.length === 0 && (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-faint">No activity yet</p>
                <p className="text-xs text-faint mt-1">Verify accounts or apply for an IPO to see events here</p>
              </div>
            )}
            {activity.map((a, i) => {
              const color = a.status === 'success' ? 'bg-success' : a.status === 'failed' ? 'bg-danger' : 'bg-brand';
              return (
                <div key={i} className="px-5 py-3 flex items-start gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink font-medium truncate">{a.message}</p>
                    <p className="text-[11px] text-faint mt-0.5 capitalize">{a.type} · {timeAgo(a.ts)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          {/* Quick actions */}
          <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">Quick Actions</p>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate('ipo-engine')}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <Icon icon={Zap} size={16} />
                Place IPO Order
              </button>
              <button
                onClick={() => onNavigate('accounts')}
                className="w-full flex items-center gap-3 px-3 py-2.5 border border-line text-body rounded-lg text-sm font-medium hover:bg-surface transition-colors"
              >
                <Icon icon={Plus} size={16} className="text-faint" />
                Add Account
              </button>
              <button
                onClick={() => onNavigate('portfolio')}
                className="w-full flex items-center gap-3 px-3 py-2.5 border border-line text-body rounded-lg text-sm font-medium hover:bg-surface transition-colors"
              >
                <Icon icon={BarChart3} size={16} className="text-faint" />
                View Portfolio
              </button>
            </div>
          </div>

          {/* Health summary */}
          <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">Health</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  Healthy
                </span>
                <span className="text-sm font-bold text-ink tabular">{healthy}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink">
                  <span className="w-1.5 h-1.5 rounded-full bg-warn" />
                  Expiring
                </span>
                <span className="text-sm font-bold text-ink tabular">{expiring.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                  Failed
                </span>
                <span className="text-sm font-bold text-ink tabular">{issues.length}</span>
              </div>
              <div className="flex items-center justify-between pt-2.5 border-t border-line-soft">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-faint" />
                  Unverified
                </span>
                <span className="text-sm font-bold text-muted tabular">{unverified}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
