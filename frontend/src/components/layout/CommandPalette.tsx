import { useState, useEffect, useRef } from 'react';
import {
  LayoutGrid, Zap, BarChart3, Users, FileText, Workflow, Bell,
  Settings as SettingsIcon, ChevronRight, ArrowRight, Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from '../ui';
import type { Account, Page } from '../../types';

interface Command {
  id: string;
  label: string;
  description?: string;
  group: string;
  shortcut?: string;
  action: () => void;
  icon?: LucideIcon;
}

interface Props {
  onClose: () => void;
  onNavigate: (page: Page) => void;
  accounts: Account[];
}

export default function CommandPalette({ onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Element to restore focus to when the palette closes.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const COMMANDS: Command[] = [
    { id: 'nav-overview', label: 'Go to Overview', group: 'Navigate', action: () => onNavigate('overview'), icon: LayoutGrid },
    { id: 'nav-ipo', label: 'Go to IPO Engine', group: 'Navigate', description: 'Bulk apply execution', action: () => onNavigate('ipo-engine'), icon: Zap },
    { id: 'nav-portfolio', label: 'Go to Portfolio', group: 'Navigate', action: () => onNavigate('portfolio'), icon: BarChart3 },
    { id: 'nav-accounts', label: 'Go to Accounts', group: 'Navigate', action: () => onNavigate('accounts'), icon: Users },
    { id: 'nav-reports', label: 'Go to Reports', group: 'Navigate', action: () => onNavigate('reports'), icon: FileText },
    { id: 'nav-automation', label: 'Go to Automation', group: 'Navigate', action: () => onNavigate('automation'), icon: Workflow },
    { id: 'nav-notifications', label: 'Go to Alerts', group: 'Navigate', action: () => onNavigate('notifications'), icon: Bell },
    { id: 'nav-settings', label: 'Go to Settings', group: 'Navigate', action: () => onNavigate('settings'), icon: SettingsIcon },
    { id: 'act-ipo-engine', label: 'Open IPO Engine', group: 'Actions', description: 'Start bulk apply session', action: () => onNavigate('ipo-engine') },
    { id: 'act-accounts', label: 'Manage Accounts', group: 'Actions', description: 'Add, edit, health check', action: () => onNavigate('accounts') },
    { id: 'act-portfolio', label: 'Check Portfolio', group: 'Actions', description: 'Load aggregate holdings', action: () => onNavigate('portfolio') },
  ];

  const filtered = query.trim()
    ? COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()) ||
        c.group.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS;

  const groups = [...new Set(filtered.map(c => c.group))];

  const flatList = groups.flatMap(g => filtered.filter(c => c.group === g));

  const activeId = flatList[selected]?.id;

  useEffect(() => {
    // Remember the trigger so focus can be restored on close.
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => { restoreFocusRef.current?.focus?.(); };
  }, []);

  // Reset the highlighted row whenever the query changes.
  function onQueryChange(next: string) {
    setQuery(next);
    setSelected(0);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected(s => Math.min(s + 1, flatList.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(s => Math.max(s - 1, 0));
      }
      if (e.key === 'Enter' && flatList[selected]) {
        flatList[selected].action();
        onClose();
      }
      // Trap focus inside the dialog.
      if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flatList, selected, onClose]);

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      {/* Backdrop — keyboard-operable close target. */}
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg bg-white border border-border rounded-xl shadow-2xl overflow-hidden"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(129,140,248,0.1)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <Icon icon={Search} size={16} strokeWidth={2} className="text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search commands..."
            role="combobox"
            aria-expanded={flatList.length > 0}
            aria-controls="cmdk-listbox"
            aria-activedescendant={activeId ? `cmdk-opt-${activeId}` : undefined}
            aria-autocomplete="list"
            aria-label="Search commands"
            className="flex-1 bg-transparent text-sm text-ink placeholder-muted outline-none"
          />
          <kbd className="text-[10px] text-muted bg-brand-tint border border-border rounded px-1.5 py-0.5 font-mono">esc</kbd>
        </div>

        {/* Commands */}
        <div id="cmdk-listbox" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto py-2">
          {flatList.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-muted">No commands match "{query}"</p>
          )}
          {groups.map(group => {
            const items = filtered.filter(c => c.group === group);
            return (
              <div key={group}>
                <p className="px-4 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">{group}</p>
                {items.map(cmd => {
                  const idx = flatIdx++;
                  const isSelected = idx === selected;
                  return (
                    <button
                      key={cmd.id}
                      id={`cmdk-opt-${cmd.id}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => { cmd.action(); onClose(); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-brand-tint' : 'hover:bg-surface'
                      }`}
                    >
                      <span className="w-5 h-5 flex items-center justify-center text-muted flex-shrink-0">
                        <Icon icon={cmd.icon ?? ChevronRight} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink font-medium">{cmd.label}</p>
                        {cmd.description && (
                          <p className="text-xs text-muted truncate">{cmd.description}</p>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="text-[10px] text-muted bg-brand-tint border border-border rounded px-1.5 font-mono">
                          {cmd.shortcut}
                        </kbd>
                      )}
                      {isSelected && (
                        <Icon icon={ArrowRight} size={14} className="text-brand flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-line flex items-center gap-4 text-[10px] text-muted">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
