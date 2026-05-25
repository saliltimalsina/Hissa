import type { Account, AccountSnapshot, Page } from '../../types';

interface Props {
  accounts: Account[];
  onOpenCmd: () => void;
  notifications: number;
  onNavigate: (page: Page) => void;
  snapshots: Record<string, AccountSnapshot>;
}

export default function TopBar({ accounts, onOpenCmd, notifications, onNavigate, snapshots }: Props) {
  const issues = Object.values(snapshots).filter(s => ['auth_failed', 'expired', 'error'].includes(s.status));
  const expiring = Object.values(snapshots).filter(s => s.status === 'expiring');
  const verifiedCount = Object.keys(snapshots).length;
  const completeAccounts = accounts.filter(a => a.client_id > 0 && a.username && a.password && a.crn && a.pin > 0).length;
  const unverified = Math.max(0, completeAccounts - verifiedCount);

  const allHealthy = issues.length === 0 && expiring.length === 0 && unverified === 0 && completeAccounts > 0;
  const hasIssues = issues.length > 0;
  const hasWarnings = expiring.length > 0 || unverified > 0;

  const statusText = completeAccounts === 0
    ? 'No accounts'
    : hasIssues
      ? `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`
      : hasWarnings
        ? `${expiring.length + unverified} need attention`
        : 'All healthy';

  const statusColor = hasIssues
    ? { dot: 'bg-[#EF4444]', text: 'text-[#B91C1C]', bg: 'bg-[#FEE7E7]' }
    : hasWarnings
      ? { dot: 'bg-[#F59E0B]', text: 'text-[#92400E]', bg: 'bg-[#FEF6E0]' }
      : allHealthy
        ? { dot: 'bg-[#1F9D55]', text: 'text-[#1F9D55]', bg: 'bg-[#EAFBF1]' }
        : { dot: 'bg-[#9CA3AF]', text: 'text-[#6B7280]', bg: 'bg-[#F4F4F8]' };

  return (
    <header className="h-12 flex-shrink-0 flex items-center justify-between px-5 bg-white border-b border-[#ECECF2] z-20">
      {/* Center: command palette trigger */}
      <div className="flex-1 max-w-md">
        <button
          onClick={onOpenCmd}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#F7F8FC] border border-[#ECECF2] rounded-md text-xs text-[#9CA3AF] hover:border-[#D1D5DB] hover:text-[#6B7280] transition-colors w-full"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="flex-1 text-left">Search accounts, IPOs, actions...</span>
          <kbd className="text-[10px] bg-white border border-[#ECECF2] text-[#6B7280] rounded px-1.5 py-0.5 font-mono font-medium">⌘K</kbd>
        </button>
      </div>

      {/* Right: status + actions */}
      <div className="flex items-center gap-3">
        {/* System health pill — clickable, routes to accounts */}
        <button
          onClick={() => onNavigate('accounts')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${statusColor.bg} ${statusColor.text} hover:opacity-80 transition-opacity`}
          title="View account health"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot} ${allHealthy || hasIssues || hasWarnings ? 'animate-pulse' : ''}`} />
          {statusText}
        </button>

        <button className="relative p-1.5 text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {notifications > 0 && (
            <span className="absolute top-0 right-0 w-4 h-4 bg-[#EF4444] rounded-full text-[9px] text-white flex items-center justify-center font-bold">
              {notifications}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
