import { useState } from 'react';
import { useApp } from '../store';

export default function Settings() {
  const { accounts, setAccounts } = useApp();
  const [confirmClear, setConfirmClear] = useState(false);

  function clearAllAccounts() {
    setAccounts([]);
    setConfirmClear(false);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-5 space-y-5">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Settings</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>App configuration and data management</p>
        </div>

        {/* General */}
        <Section title="General">
          <SettingRow label="Backend URL" desc="FastAPI server address">
            <input defaultValue="http://localhost:8000" readOnly
              className="px-2.5 py-1 rounded text-xs font-mono outline-none"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)', width: 200 }} />
          </SettingRow>
          <SettingRow label="Concurrency" desc="Parallel account processing limit">
            <input type="number" defaultValue={6} min={1} max={20}
              className="px-2.5 py-1 rounded text-xs tabular outline-none"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)', width: 80 }} />
          </SettingRow>
          <SettingRow label="Apply Delay" desc="Seconds between each account apply">
            <input type="number" defaultValue={1} min={0} max={10} step={0.5}
              className="px-2.5 py-1 rounded text-xs tabular outline-none"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)', width: 80 }} />
          </SettingRow>
        </Section>

        {/* Data */}
        <Section title="Data">
          <SettingRow label="Stored Accounts" desc={`${accounts.length} accounts in localStorage`}>
            <span className="text-xs tabular" style={{ color: 'var(--text-3)' }}>{accounts.length} accounts</span>
          </SettingRow>
          <SettingRow label="Clear All Accounts" desc="Permanently removes all stored account credentials">
            {confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--danger)' }}>Are you sure?</span>
                <button onClick={clearAllAccounts}
                  className="px-3 py-1 rounded text-xs font-semibold"
                  style={{ background: 'var(--danger)', color: '#fff' }}>
                  Delete All
                </button>
                <button onClick={() => setConfirmClear(false)}
                  className="px-3 py-1 rounded text-xs"
                  style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} disabled={accounts.length === 0}
                className="px-3 py-1 rounded text-xs font-medium disabled:opacity-40"
                style={{ background: 'var(--danger-dim)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--danger)' }}>
                Clear Accounts
              </button>
            )}
          </SettingRow>
        </Section>

        {/* Keyboard shortcuts */}
        <Section title="Keyboard Shortcuts">
          {[
            ['⌘K', 'Open command palette'],
            ['↑ ↓', 'Navigate command palette'],
            ['↵', 'Execute selected command'],
            ['Esc', 'Close command palette'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0"
              style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-2)' }}>{desc}</span>
              <kbd className="text-[11px] px-2 py-0.5 rounded font-mono"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                {key}
              </kbd>
            </div>
          ))}
        </Section>

        {/* About */}
        <Section title="About">
          <div className="px-4 py-3 space-y-1">
            <div className="flex justify-between">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Product</span>
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>Capital OS</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Version</span>
              <span className="text-xs tabular" style={{ color: 'var(--text-2)' }}>2.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Backend</span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-2)' }}>FastAPI + MeroShare</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="px-4 py-2.5 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{title}</span>
      </div>
      <div className="divide-y" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>{children}</div>
    </div>
  );
}

function SettingRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>{label}</div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{desc}</div>
      </div>
      {children}
    </div>
  );
}
