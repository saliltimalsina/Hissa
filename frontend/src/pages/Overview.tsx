import type { Account, Page, IPO, AccountPortfolio, AccountSnapshot } from '../types';

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
    urgent: { bg: 'bg-white', accent: 'text-[#B91C1C]', dot: 'bg-[#EF4444]', subColor: 'text-[#B91C1C]', cta: 'text-[#B91C1C]' },
    warning: { bg: 'bg-white', accent: 'text-[#92400E]', dot: 'bg-[#F59E0B]', subColor: 'text-[#92400E]', cta: 'text-[#92400E]' },
    good: { bg: 'bg-white', accent: 'text-[#1F9D55]', dot: 'bg-[#1F9D55]', subColor: 'text-[#1F9D55]', cta: 'text-[#1F9D55]' },
    info: { bg: 'bg-white', accent: 'text-[#5B4DFF]', dot: 'bg-[#5B4DFF]', subColor: 'text-[#5B4DFF]', cta: 'text-[#5B4DFF]' },
    neutral: { bg: 'bg-white', accent: 'text-[#111827]', dot: 'bg-[#9CA3AF]', subColor: 'text-[#6B7280]', cta: 'text-[#6B7280]' },
  }[variant];

  return (
    <div
      onClick={onClick}
      className={`${styles.bg} rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${onClick ? 'cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow' : ''}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
        <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-[32px] font-bold tabular leading-none tracking-tight ${styles.accent}`}>{value}</p>
      <div className="flex items-center justify-between mt-3">
        <p className={`text-xs font-medium ${styles.subColor}`}>{sub}</p>
        {cta && onClick && (
          <span className={`text-xs font-semibold ${styles.cta}`}>{cta} →</span>
        )}
      </div>
    </div>
  );
}

export default function Overview({ accounts, onNavigate, snapshots, ipos, portfolios, portfoliosFetchedAt, iposFetchedAt, activity }: Props) {
  const issues = Object.values(snapshots).filter(s => ['auth_failed', 'expired', 'error'].includes(s.status));
  const expiring = Object.values(snapshots).filter(s => s.status === 'expiring');
  const healthy = Object.values(snapshots).filter(s => s.status === 'healthy').length;
  const completeAccounts = accounts.length;
  const unverified = Math.max(0, completeAccounts - Object.keys(snapshots).length);

  const totalPortfolioValue = portfolios.reduce((s, p) => s + (p.total_value || 0), 0);

  // Closing-soon IPOs (≤2 days)
  const closingSoon = ipos.filter(ipo => {
    if (!ipo.issueCloseDate) return false;
    const days = Math.ceil((new Date(ipo.issueCloseDate).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 2;
  });

  const needsAttention = issues.length + unverified;

  // Onboarding state
  if (accounts.length === 0) {
    return (
      <div className="p-8 max-w-7xl">
        <h1 className="text-2xl font-bold text-[#111827] tracking-tight mb-1">Overview</h1>
        <p className="text-sm text-[#6B7280] mb-8">Capital snapshot across your accounts</p>

        <div className="bg-white rounded-xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-w-2xl">
          <div className="w-12 h-12 bg-[#F4F3FF] rounded-xl flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-[#5B4DFF]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#111827] mb-1">Get started</h2>
          <p className="text-sm text-[#6B7280] mb-6">Add your MeroShare credentials to begin managing IPO applications.</p>
          <ol className="space-y-3 text-sm text-[#374151] mb-6">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[#5B4DFF] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span>Add MeroShare credentials in <button onClick={() => onNavigate('accounts')} className="text-[#5B4DFF] underline font-semibold">Accounts</button></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[#ECECF2] text-[#6B7280] text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span>Run Health Check to verify each account</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[#ECECF2] text-[#6B7280] text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span>Open IPO Engine and bulk apply</span>
            </li>
          </ol>
          <button
            onClick={() => onNavigate('accounts')}
            className="px-5 py-2.5 bg-[#5B4DFF] hover:bg-[#4C3FF0] text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Add Accounts →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Overview</h1>
        <p className="text-sm text-[#6B7280] mt-1">Capital snapshot across your accounts</p>
      </div>

      {/* Action-center cards: what needs attention */}
      <div>
        <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-4">Operational State</p>
        <div className="grid grid-cols-4 gap-4">
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

      {/* 2-col layout: activity feed + quick actions/health */}
      <div className="grid grid-cols-3 gap-6">

        {/* Activity feed */}
        <div className="col-span-2 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F4F4F8] flex items-center justify-between">
            <p className="text-sm font-bold text-[#111827]">Recent Activity</p>
            {activity.length > 0 && <span className="text-xs text-[#9CA3AF]">{activity.length} events</span>}
          </div>
          <div className="divide-y divide-[#F4F4F8] max-h-96 overflow-y-auto">
            {activity.length === 0 && (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-[#9CA3AF]">No activity yet</p>
                <p className="text-xs text-[#9CA3AF] mt-1">Verify accounts or apply for an IPO to see events here</p>
              </div>
            )}
            {activity.map((a, i) => {
              const color = a.status === 'success' ? 'bg-[#1F9D55]' : a.status === 'failed' ? 'bg-[#EF4444]' : 'bg-[#5B4DFF]';
              return (
                <div key={i} className="px-5 py-3 flex items-start gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#111827] font-medium truncate">{a.message}</p>
                    <p className="text-[11px] text-[#9CA3AF] mt-0.5 capitalize">{a.type} · {timeAgo(a.ts)}</p>
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
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">Quick Actions</p>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate('ipo-engine')}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#5B4DFF] hover:bg-[#4C3FF0] text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                Place IPO Order
              </button>
              <button
                onClick={() => onNavigate('accounts')}
                className="w-full flex items-center gap-3 px-3 py-2.5 border border-[#ECECF2] text-[#374151] rounded-lg text-sm font-medium hover:bg-[#F7F8FC] transition-colors"
              >
                <svg className="w-4 h-4 text-[#9CA3AF]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 010-2h6V3a1 1 0 011-1z" />
                </svg>
                Add Account
              </button>
              <button
                onClick={() => onNavigate('portfolio')}
                className="w-full flex items-center gap-3 px-3 py-2.5 border border-[#ECECF2] text-[#374151] rounded-lg text-sm font-medium hover:bg-[#F7F8FC] transition-colors"
              >
                <svg className="w-4 h-4 text-[#9CA3AF]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
                View Portfolio
              </button>
            </div>
          </div>

          {/* Health summary */}
          <div className="bg-white rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">Health</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-[#111827]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1F9D55]" />
                  Healthy
                </span>
                <span className="text-sm font-bold text-[#111827] tabular">{healthy}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-[#111827]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                  Expiring
                </span>
                <span className="text-sm font-bold text-[#111827] tabular">{expiring.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-[#111827]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                  Failed
                </span>
                <span className="text-sm font-bold text-[#111827] tabular">{issues.length}</span>
              </div>
              <div className="flex items-center justify-between pt-2.5 border-t border-[#F4F4F8]">
                <span className="flex items-center gap-2 text-sm text-[#6B7280]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF]" />
                  Unverified
                </span>
                <span className="text-sm font-bold text-[#6B7280] tabular">{unverified}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
