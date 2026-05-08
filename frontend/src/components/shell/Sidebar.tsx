import { useApp } from '../../store';
import { useAuth } from '../../auth';
import type { Page } from '../../types';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'overview',      label: 'Overview',       icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'accounts',      label: 'Accounts',        icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'ipo',           label: 'IPO Engine',      icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'portfolio',     label: 'Portfolio',       icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'history',       label: 'History',         icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'automation',    label: 'Automation',      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'notifications', label: 'Notifications',   icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'settings',      label: 'Settings',        icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function Sidebar() {
  const { currentPage, navigate, accounts, ipos, snapshotSummary } = useApp();
  const { user, logout } = useAuth();
  const expiringCount = snapshotSummary?.expiring ?? 0;
  const liveIPOs = ipos.length;

  return (
    <aside className="w-52 flex-shrink-0 flex flex-col"
      style={{ background: '#0e0f0c', borderRight: '1px solid rgba(255,255,255,0.08)' }}>

      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-7 h-7 rounded-pill flex items-center justify-center flex-shrink-0"
          style={{ background: '#9fe870' }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="#163300" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-tight text-white">Hissa</div>
          <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Your MeroShare, automated.</div>
        </div>
      </div>

      {/* Account pill */}
      {accounts.length > 0 && (
        <div className="mx-3 mt-3 px-3 py-1.5 rounded-pill flex items-center justify-between"
          style={{ background: 'rgba(159,232,112,0.1)', border: '1px solid rgba(159,232,112,0.2)' }}>
          <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>accounts</span>
          <span className="text-xs font-bold tabular" style={{ color: '#9fe870' }}>{accounts.length}</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = currentPage === item.id;
          const badge = item.id === 'notifications' && expiringCount > 0
            ? expiringCount
            : item.id === 'ipo' && liveIPOs > 0
            ? liveIPOs
            : null;

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-card text-left"
              style={{
                background: active ? 'rgba(159,232,112,0.12)' : 'transparent',
                color: active ? '#9fe870' : 'rgba(255,255,255,0.5)',
                transform: 'none', // override global button scale for nav items
                border: active ? '1px solid rgba(159,232,112,0.2)' : '1px solid transparent',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)';
                  (e.currentTarget as HTMLElement).style.transform = 'none';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)';
                }
              }}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="text-xs font-semibold flex-1">{item.label}</span>
              {badge !== null && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-pill tabular"
                  style={{
                    background: item.id === 'notifications' ? 'rgba(255,209,26,0.15)' : 'rgba(159,232,112,0.15)',
                    color: item.id === 'notifications' ? '#ffd11a' : '#9fe870',
                  }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2 px-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
            style={{ background: '#9fe870', color: '#163300' }}>
            {(user?.name || user?.email || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {user?.name || user?.email}
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-80"
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
