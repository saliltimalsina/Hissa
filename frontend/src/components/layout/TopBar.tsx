import { Menu, Search, Bell } from 'lucide-react';
import { Icon } from '../ui';
import type { Account, AccountSnapshot, Page } from '../../types';

interface Props {
  accounts: Account[];
  onOpenCmd: () => void;
  /** Open the off-canvas nav drawer (below lg). */
  onOpenNav: () => void;
  notifications: number;
  onNavigate: (page: Page) => void;
  snapshots: Record<string, AccountSnapshot>;
  userEmail: string;
  userName?: string;
  onLogout: () => void;
}

export default function TopBar({ accounts, onOpenCmd, onOpenNav, notifications, onNavigate, snapshots, userEmail, userName, onLogout }: Props) {
  const issues = Object.values(snapshots).filter(s => ['auth_failed', 'expired', 'error'].includes(s.status));
  const expiring = Object.values(snapshots).filter(s => s.status === 'expiring');
  const verifiedCount = Object.keys(snapshots).length;
  // Every loaded account is "ready" — credentials live encrypted server-side.
  const completeAccounts = accounts.length;
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
    ? { dot: 'bg-danger', text: 'text-danger-fg', bg: 'bg-danger-bg' }
    : hasWarnings
      ? { dot: 'bg-warn', text: 'text-warn-fg', bg: 'bg-warn-bg' }
      : allHealthy
        ? { dot: 'bg-success', text: 'text-success', bg: 'bg-success-bg' }
        : { dot: 'bg-faint', text: 'text-muted', bg: 'bg-line-soft' };

  return (
    <header className="h-12 flex-shrink-0 flex items-center justify-between gap-3 px-3 sm:px-5 bg-white border-b border-line z-20">
      {/* Hamburger — opens the nav drawer below lg. */}
      <button
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="lg:hidden p-1.5 text-muted hover:text-ink transition-colors"
      >
        <Icon icon={Menu} size={18} />
      </button>

      {/* Center: command palette trigger */}
      <div className="flex-1 max-w-md">
        <button
          onClick={onOpenCmd}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-line rounded-md text-xs text-faint hover:border-border hover:text-muted transition-colors w-full"
        >
          <Icon icon={Search} size={14} strokeWidth={2} className="flex-shrink-0" />
          <span className="flex-1 text-left truncate">Search accounts, IPOs, actions...</span>
          <kbd className="hidden sm:block text-[10px] bg-white border border-line text-muted rounded px-1.5 py-0.5 font-mono font-medium">⌘K</kbd>
        </button>
      </div>

      {/* Right: status + actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* System health pill — clickable, routes to accounts */}
        <button
          onClick={() => onNavigate('accounts')}
          className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${statusColor.bg} ${statusColor.text} hover:opacity-80 transition-opacity`}
          title="View account health"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot} ${allHealthy || hasIssues || hasWarnings ? 'animate-pulse' : ''}`} />
          {statusText}
        </button>

        <button
          onClick={() => onNavigate('notifications')}
          className="relative p-1.5 text-faint hover:text-muted transition-colors"
          aria-label={`Notifications, ${notifications} unread`}
          title="View alerts"
        >
          <Icon icon={Bell} size={16} strokeWidth={1.8} />
          {notifications > 0 && (
            <span className="absolute top-0 right-0 w-4 h-4 bg-danger rounded-full text-[9px] text-white flex items-center justify-center font-bold">
              {notifications}
            </span>
          )}
        </button>

        {/* Divider */}
        <span className="w-px h-5 bg-line" />

        {/* User identity + logout */}
        <div className="flex items-center gap-2.5">
          <span className="hidden md:block text-xs text-muted max-w-[160px] truncate" title={userEmail}>
            {userName || userEmail}
          </span>
          <button
            onClick={onLogout}
            className="px-2.5 py-1 text-xs font-medium text-body border border-line rounded-md hover:border-border hover:text-ink transition-colors"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
