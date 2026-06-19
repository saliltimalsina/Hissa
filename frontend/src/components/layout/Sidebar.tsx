import { LayoutGrid, Zap, BarChart3, Users, FileText, Workflow, Bell, Settings as SettingsIcon, TrendingUp, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from '../ui';
import type { Page } from '../../types';

interface NavItem {
  id: Page;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_PRIMARY: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'ipo-engine', label: 'IPO Engine', icon: Zap },
  { id: 'portfolio', label: 'Portfolio', icon: BarChart3 },
  { id: 'accounts', label: 'Accounts', icon: Users },
  { id: 'reports', label: 'Reports', icon: FileText },
];

const NAV_SECONDARY: NavItem[] = [
  // Distinct from Settings — Automation gets the Workflow glyph, Settings the gear.
  { id: 'automation', label: 'Automation', icon: Workflow },
  { id: 'notifications', label: 'Alerts', icon: Bell },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
  /** Off-canvas drawer open state (below lg). */
  open?: boolean;
  onClose?: () => void;
}

function NavButton({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: (p: Page) => void }) {
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
        active
          ? 'bg-brand-tint text-brand font-semibold'
          : 'text-muted font-medium hover:bg-surface hover:text-ink'
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand" />}
      <span className={`flex-shrink-0 transition-colors ${active ? 'text-brand' : 'text-faint group-hover:text-muted'}`}>
        <Icon icon={item.icon} />
      </span>
      <span>{item.label}</span>
    </button>
  );
}

export default function Sidebar({ current, onNavigate, open = false, onClose }: Props) {
  const sections: NavSection[] = [
    { label: 'Operate', items: NAV_PRIMARY.filter(i => ['overview', 'ipo-engine', 'portfolio'].includes(i.id)) },
    { label: 'Manage', items: [...NAV_PRIMARY.filter(i => i.id === 'accounts'), ...NAV_SECONDARY.filter(i => ['automation', 'notifications'].includes(i.id))] },
    { label: 'Analyze', items: NAV_PRIMARY.filter(i => i.id === 'reports') },
    { label: 'System', items: NAV_SECONDARY.filter(i => i.id === 'settings') },
  ];

  return (
    <>
      {/* Scrim — only below lg while the drawer is open. */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={`w-52 flex-shrink-0 flex flex-col bg-white border-r border-line z-40
          fixed inset-y-0 left-0 transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="px-4 py-4 border-b border-line">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center flex-shrink-0 text-white">
                <Icon icon={TrendingUp} size={16} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-bold text-ink leading-none">Hissa</p>
                <p className="text-[10px] text-muted leading-none mt-0.5">Investment Terminal</p>
              </div>
            </div>
            {/* Drawer close — only below lg. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="lg:hidden p-1 text-faint hover:text-ink"
            >
              <Icon icon={X} />
            </button>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" aria-label="Primary">
          {sections.map(sec => (
            <div key={sec.label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-faint uppercase tracking-wider">{sec.label}</p>
              <div className="space-y-0.5">
                {sec.items.map(item => (
                  <NavButton key={item.id} item={item} active={current === item.id} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
