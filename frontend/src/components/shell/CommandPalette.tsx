import { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../store';
import { fetchIPOs, fetchSnapshot, fetchPortfolio } from '../../api';
import type { Page } from '../../types';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: string;
  action: () => void;
  group: string;
  keywords?: string;
}

export default function CommandPalette() {
  const { commandOpen, closeCommand, navigate, accounts,
          setIPOs, setIPOLoading, setSnapshots, setSnapshotLoading,
          setPortfolios, setPortfolioLoading, addLog } = useApp();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (commandOpen) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandOpen]);

  async function refreshIPOs() {
    closeCommand();
    if (!accounts.length) return;
    setIPOLoading(true);
    try {
      const data = await fetchIPOs();
      setIPOs(data);
      addLog({ status: 'info', message: `Loaded ${data.length} open IPOs` });
      navigate('ipo');
    } catch (e: any) {
      addLog({ status: 'failed', message: `IPO fetch failed: ${e.message}` });
    } finally {
      setIPOLoading(false);
    }
  }

  async function refreshSnapshot() {
    closeCommand();
    if (!accounts.length) return;
    setSnapshotLoading(true);
    try {
      const snap = await fetchSnapshot();
      setSnapshots(snap.accounts, snap.summary);
      addLog({ status: 'info', message: `Health check — ${snap.summary.healthy} healthy` });
      navigate('accounts');
    } catch (e: any) {
      addLog({ status: 'failed', message: `Snapshot failed: ${e.message}` });
    } finally {
      setSnapshotLoading(false);
    }
  }

  async function refreshPortfolio() {
    closeCommand();
    if (!accounts.length) return;
    setPortfolioLoading(true);
    try {
      const data = await fetchPortfolio();
      setPortfolios(data.accounts, data.grand_total);
      addLog({ status: 'info', message: `Portfolio loaded — NPR ${data.grand_total.toLocaleString()}` });
      navigate('portfolio');
    } catch (e: any) {
      addLog({ status: 'failed', message: `Portfolio failed: ${e.message}` });
    } finally {
      setPortfolioLoading(false);
    }
  }

  const go = (page: Page) => { navigate(page); closeCommand(); };

  const commands: Command[] = useMemo(() => [
    { id: 'nav-overview',     group: 'Navigate', label: 'Overview',          description: 'Mission control',       icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', action: () => go('overview') },
    { id: 'nav-ipo',          group: 'Navigate', label: 'IPO Engine',         description: 'Bulk allocation',       icon: 'M13 10V3L4 14h7v7l9-11h-7z', action: () => go('ipo') },
    { id: 'nav-portfolio',    group: 'Navigate', label: 'Portfolio',          description: 'Aggregated holdings',   icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', action: () => go('portfolio') },
    { id: 'nav-accounts',     group: 'Navigate', label: 'Accounts',           description: 'Manage credentials',   icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', action: () => go('accounts') },
    { id: 'nav-automation',   group: 'Navigate', label: 'Automation',         description: 'Rules & queues',       icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', action: () => go('automation') },
    { id: 'action-ipos',      group: 'Actions',  label: 'Load Available IPOs', description: `${accounts.length} accounts`, icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4', action: refreshIPOs, keywords: 'fetch refresh load ipo' },
    { id: 'action-snapshot',  group: 'Actions',  label: 'Check Account Health', description: 'Expiry + auth status', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', action: refreshSnapshot, keywords: 'health expiry snapshot' },
    { id: 'action-portfolio', group: 'Actions',  label: 'Load Portfolio',       description: 'All holdings aggregated', icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3', action: refreshPortfolio, keywords: 'holdings portfolio' },
    { id: 'nav-settings',     group: 'Navigate', label: 'Settings',            description: 'Configuration',       icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', action: () => go('settings') },
  ], [accounts.length]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.keywords?.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q)
    );
  }, [query, commands]);

  const groups = useMemo(() => {
    const g: Record<string, Command[]> = {};
    filtered.forEach(c => { (g[c.group] ??= []).push(c); });
    return g;
  }, [filtered]);

  const flat = filtered;
  useEffect(() => { setSelected(0); }, [query]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flat.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && flat[selected]) flat[selected].action();
  }

  useEffect(() => {
    const el = listRef.current?.querySelectorAll('[data-cmd]')[selected] as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!commandOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-20"
      style={{ background: 'rgba(14,15,12,0.4)', backdropFilter: 'blur(8px)', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) closeCommand(); }}
    >
      <div className="w-full max-w-lg rounded-card-lg overflow-hidden scale-in"
        style={{
          background: '#ffffff',
          boxShadow: 'rgba(14,15,12,0.12) 0px 0px 0px 1px, rgba(14,15,12,0.15) 0px 24px 48px -12px',
        }}>

        {/* Input */}
        <div className="flex items-center gap-3 px-4"
          style={{ borderBottom: '1px solid rgba(14,15,12,0.08)' }}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#868685" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a command or search…"
            className="flex-1 py-4 bg-transparent text-sm font-semibold outline-none"
            style={{ color: '#0e0f0c' }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded-lg font-mono font-semibold flex-shrink-0"
            style={{ background: '#f2f5ef', color: '#868685' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="py-1 max-h-80 overflow-y-auto">
          {flat.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-medium" style={{ color: '#868685' }}>
              No commands match
            </div>
          ) : Object.entries(groups).map(([group, cmds]) => (
            <div key={group}>
              <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>
                {group}
              </div>
              {cmds.map(cmd => {
                const idx = flat.indexOf(cmd);
                const active = idx === selected;
                return (
                  <button
                    key={cmd.id}
                    data-cmd={idx}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelected(idx)}
                    className="w-full flex items-center gap-3 px-4 py-2.5"
                    style={{
                      background: active ? '#f2f5ef' : 'transparent',
                      borderLeft: active ? '2px solid #9fe870' : '2px solid transparent',
                      transform: 'none',
                    }}>
                    <div className="w-7 h-7 rounded-card flex items-center justify-center flex-shrink-0"
                      style={{ background: active ? '#e2f6d5' : '#f2f5ef' }}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                        stroke={active ? '#163300' : '#868685'} strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={cmd.icon} />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-xs font-semibold" style={{ color: active ? '#0e0f0c' : '#454745' }}>
                        {cmd.label}
                      </div>
                      {cmd.description && (
                        <div className="text-[11px] font-medium" style={{ color: '#868685' }}>{cmd.description}</div>
                      )}
                    </div>
                    {active && (
                      <kbd className="text-[10px] px-1.5 py-0.5 rounded-lg font-mono font-semibold"
                        style={{ background: '#e2f6d5', color: '#163300' }}>↵</kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5" style={{ borderTop: '1px solid rgba(14,15,12,0.08)' }}>
          {[['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close']].map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <kbd className="text-[10px] px-1.5 py-0.5 rounded-lg font-mono font-semibold"
                style={{ background: '#f2f5ef', color: '#868685' }}>{key}</kbd>
              <span className="text-[11px] font-medium" style={{ color: '#868685' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
