import { useState, useEffect, useRef } from 'react';
import type { Account, Page } from '../../types';

interface Command {
  id: string;
  label: string;
  description?: string;
  group: string;
  shortcut?: string;
  action: () => void;
  icon?: React.ReactNode;
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

  const COMMANDS: Command[] = [
    { id: 'nav-overview', label: 'Go to Overview', group: 'Navigate', action: () => onNavigate('overview'), icon: <GridIcon /> },
    { id: 'nav-ipo', label: 'Go to IPO Engine', group: 'Navigate', description: 'Bulk apply execution', action: () => onNavigate('ipo-engine'), icon: <ZapIcon /> },
    { id: 'nav-portfolio', label: 'Go to Portfolio', group: 'Navigate', action: () => onNavigate('portfolio'), icon: <ChartIcon /> },
    { id: 'nav-accounts', label: 'Go to Accounts', group: 'Navigate', action: () => onNavigate('accounts'), icon: <UsersIcon /> },
    { id: 'nav-reports', label: 'Go to Reports', group: 'Navigate', action: () => onNavigate('reports'), icon: <FileIcon /> },
    { id: 'nav-automation', label: 'Go to Automation', group: 'Navigate', action: () => onNavigate('automation'), icon: <CogIcon /> },
    { id: 'nav-notifications', label: 'Go to Alerts', group: 'Navigate', action: () => onNavigate('notifications'), icon: <BellIcon /> },
    { id: 'nav-settings', label: 'Go to Settings', group: 'Navigate', action: () => onNavigate('settings'), icon: <SettingsIcon /> },
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset the highlighted row whenever the query changes. Done in the change
  // handler (event-driven) rather than an effect, to avoid a cascading render.
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
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flatList, selected, onClose]);

  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[#ffffff] border border-[#D1D5DB] rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(129,140,248,0.1)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#ECECF2]">
          <svg className="w-4 h-4 text-[#6b7280] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-sm text-[#111827] placeholder-[#6b7280] outline-none"
          />
          <kbd className="text-[10px] text-[#6b7280] bg-[#F4F3FF] border border-[#D1D5DB] rounded px-1.5 py-0.5 font-mono">esc</kbd>
        </div>

        {/* Commands */}
        <div className="max-h-80 overflow-y-auto py-2">
          {flatList.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-[#6b7280]">No commands match "{query}"</p>
          )}
          {groups.map(group => {
            const items = filtered.filter(c => c.group === group);
            return (
              <div key={group}>
                <p className="px-4 py-1.5 text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider">{group}</p>
                {items.map(cmd => {
                  const idx = flatIdx++;
                  const isSelected = idx === selected;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => { cmd.action(); onClose(); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-[#F4F3FF]' : 'hover:bg-[#F7F8FC]'
                      }`}
                    >
                      <span className="w-5 h-5 flex items-center justify-center text-[#6b7280] flex-shrink-0">
                        {cmd.icon || <DefaultIcon />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#111827] font-medium">{cmd.label}</p>
                        {cmd.description && (
                          <p className="text-xs text-[#6b7280] truncate">{cmd.description}</p>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="text-[10px] text-[#6b7280] bg-[#F4F3FF] border border-[#D1D5DB] rounded px-1.5 font-mono">
                          {cmd.shortcut}
                        </kbd>
                      )}
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-[#5B4DFF] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[#ECECF2] flex items-center gap-4 text-[10px] text-[#6b7280]">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function GridIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
function ZapIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>;
}
function ChartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22" /></svg>;
}
function UsersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
}
function FileIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}
function CogIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /></svg>;
}
function BellIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>;
}
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function DefaultIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>;
}
