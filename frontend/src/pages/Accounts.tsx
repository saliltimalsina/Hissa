import { useState, useEffect, useRef } from 'react';
import type { Account, AccountSnapshot } from '../types';

interface Broker { code: string; id: number; name: string; }

function BrokerSearch({ onSelect }: { onSelect: (b: Broker) => void }) {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/brokers').then(r => r.json()).then(setBrokers).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = query.length >= 2
    ? brokers.filter(b =>
        b.name.toLowerCase().includes(query.toLowerCase()) ||
        b.code.includes(query)
      ).slice(0, 8)
    : [];

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search broker to get Client ID..."
        className="w-full border border-[#D1D5DB] rounded-lg px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#5B4DFF] placeholder-[#9CA3AF]"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#ECECF2] rounded-lg shadow-lg z-20 overflow-hidden">
          {filtered.map(b => (
            <button
              key={b.id}
              onClick={() => { onSelect(b); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-[#F7F8FC] flex items-center justify-between"
            >
              <span className="text-[#111827] font-medium">{b.name}</span>
              <span className="text-[#6b7280] font-mono ml-3 flex-shrink-0">ID: {b.id} · {b.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  accounts: Account[];
  onChange: (accounts: Account[]) => void;
  snapshots: Record<string, AccountSnapshot>;
  verifyingUser: string | null;
  checking: boolean;
  onVerifyOne: (account: Account) => void;
  onCheckAll: () => void;
}

const STATUS_PILL: Record<string, string> = {
  healthy: 'bg-[#EAFBF1] text-[#1F9D55]',
  expiring: 'bg-[#FEF6E0] text-[#92400E]',
  expired: 'bg-[#FEE7E7] text-[#B91C1C]',
  auth_failed: 'bg-[#FEE7E7] text-[#B91C1C]',
  error: 'bg-[#FEE7E7] text-[#B91C1C]',
};

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-[#1F9D55]',
  expiring: 'bg-[#F59E0B]',
  expired: 'bg-[#EF4444]',
  auth_failed: 'bg-[#EF4444]',
  error: 'bg-[#EF4444]',
};

const EMPTY: Account = { client_id: 0, username: '', password: '', crn: '', pin: 0, label: '', group: '' };

function isComplete(a: Account): boolean {
  return a.client_id > 0 && !!a.username && !!a.password && !!a.crn && a.pin > 0;
}

export default function Accounts({ accounts, onChange, snapshots, verifyingUser, checking, onVerifyOne, onCheckAll }: Props) {
  const [csvMode, setCsvMode] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvError, setCsvError] = useState('');

  function addRow() { onChange([...accounts, { ...EMPTY }]); }
  function removeRow(i: number) {
    onChange(accounts.filter((_, idx) => idx !== i));
  }
  function updateRow(i: number, field: keyof Account, value: string) {
    onChange(accounts.map((a, idx) => {
      if (idx !== i) return a;
      if (field === 'client_id' || field === 'pin') return { ...a, [field]: parseInt(value) || 0 };
      return { ...a, [field]: value };
    }));
  }

  function parseCSV() {
    setCsvError('');
    const lines = csvText.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const parsed: Account[] = [];
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 5) { setCsvError(`Bad line: "${line}" — need client_id,username,password,crn,pin`); return; }
      parsed.push({ client_id: parseInt(parts[0]), username: parts[1], password: parts[2], crn: parts[3], pin: parseInt(parts[4]), label: parts[5] || '', group: parts[6] || '' });
    }
    onChange(parsed);
    setCsvMode(false);
    setCsvText('');
  }

  const healthy = Object.values(snapshots).filter(s => s.status === 'healthy').length;
  const expiring = Object.values(snapshots).filter(s => s.status === 'expiring').length;
  const failed = Object.values(snapshots).filter(s => ['expired', 'auth_failed', 'error'].includes(s.status)).length;

  return (
    <div className="h-full flex flex-col bg-[#F7F8FC]">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[#ECECF2] flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Accounts</h1>
            <p className="text-sm text-[#6B7280] mt-1">{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} configured</p>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={() => setCsvMode(!csvMode)}
            className="px-3 py-1.5 border border-[#D1D5DB] text-[#374151] rounded text-xs font-medium hover:border-[#9CA3AF] transition-colors"
          >
            {csvMode ? 'Table view' : 'Import CSV'}
          </button>
          <button
            onClick={addRow}
            className="px-3 py-1.5 border border-[#D1D5DB] text-[#374151] rounded text-xs font-medium hover:border-[#9CA3AF] transition-colors"
          >
            + Add row
          </button>
          <button
            onClick={onCheckAll}
            disabled={checking || accounts.length === 0}
            className="px-3 py-1.5 bg-[#5B4DFF]/20 text-[#5B4DFF] border border-[#5B4DFF]/30 rounded text-xs font-medium disabled:opacity-40 flex items-center gap-1.5 transition-colors"
          >
            {checking && <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
            Health Check
          </button>
          </div>
        </div>
        {/* Broker lookup — find correct client_id */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <BrokerSearch onSelect={b => onChange([...accounts, { ...EMPTY, client_id: b.id, label: b.name }])} />
          </div>
          <div className="text-xs text-[#6b7280] bg-[#fff8e1] border border-[#fde68a] rounded-lg px-3 py-2 flex-shrink-0 max-w-xs">
            <span className="font-semibold text-[#92400e]">Client ID ≠ Broker Code.</span> Search your broker above to auto-fill the correct internal ID. E.g. NIC Asia code <code className="font-mono">13700</code> → ID <code className="font-mono">174</code>.
          </div>
        </div>
      </div>

      {/* Health summary */}
      {Object.keys(snapshots).length > 0 && (
        <div className="px-6 py-3 border-b border-[#ECECF2] flex items-center gap-6 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1F9D55]" />
            <span className="text-xs text-[#374151]"><span className="text-[#1F9D55] font-semibold tabular">{healthy}</span> healthy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
            <span className="text-xs text-[#374151]"><span className="text-[#F59E0B] font-semibold tabular">{expiring}</span> expiring</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span className="text-xs text-[#374151]"><span className="text-[#EF4444] font-semibold tabular">{failed}</span> failed</span>
          </div>
        </div>
      )}

      {/* CSV import mode */}
      {csvMode && (
        <div className="px-6 py-4 border-b border-[#ECECF2] flex-shrink-0">
          <p className="text-[10px] text-[#6b7280] font-mono mb-2 bg-[#ffffff] border border-[#D1D5DB] rounded px-3 py-1.5">
            Format: client_id,username,password,crn,pin[,label[,group]]
          </p>
          <textarea
            className="w-full h-32 bg-[#f0f2f7] border border-[#D1D5DB] rounded font-mono text-xs text-[#111827] p-3 resize-none focus:outline-none focus:border-[#5B4DFF] placeholder-[#D1D5DB]"
            placeholder={`174,166535,mypassword,CRN1234,3669,Salil,Family`}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
          />
          {csvError && <p className="text-xs text-[#EF4444] mt-1">{csvError}</p>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={parseCSV}
              disabled={!csvText.trim()}
              className="px-3 py-1.5 bg-[#5B4DFF] text-white rounded text-xs font-medium disabled:opacity-40"
            >
              Import
            </button>
            <button onClick={() => { setCsvMode(false); setCsvError(''); }} className="px-3 py-1.5 border border-[#D1D5DB] text-[#374151] rounded text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {accounts.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <p className="text-sm text-[#6b7280]">No accounts yet</p>
              <p className="text-xs text-[#D1D5DB] mt-1">Add rows or import CSV</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#F7F8FC] border-b border-[#ECECF2]">
              <tr className="text-[#6b7280]">
                <th className="px-5 py-2.5 text-left font-medium">#</th>
                <th className="px-3 py-2.5 text-left font-medium">Label</th>
                <th className="px-3 py-2.5 text-left font-medium">Group</th>
                <th className="px-3 py-2.5 text-left font-medium">Client ID</th>
                <th className="px-3 py-2.5 text-left font-medium">Username</th>
                <th className="px-3 py-2.5 text-left font-medium">Password</th>
                <th className="px-3 py-2.5 text-left font-medium">CRN</th>
                <th className="px-3 py-2.5 text-left font-medium">PIN</th>
                <th className="px-3 py-2.5 text-left font-medium">Health</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc, i) => {
                const snap = snapshots[acc.username];
                return (
                  <tr key={i} className="border-b border-[#F4F4F8] hover:bg-[#FAFAFF] group transition-colors">
                    <td className="px-5 py-2 text-[#6b7280] tabular">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <input value={acc.label || ''} onChange={e => updateRow(i, 'label', e.target.value)}
                        className="w-24 bg-transparent border-b border-transparent group-hover:border-[#D1D5DB] focus:border-[#5B4DFF] text-[#111827] outline-none py-0.5 transition-colors"
                        placeholder="label" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={acc.group || ''} onChange={e => updateRow(i, 'group', e.target.value)}
                        className="w-20 bg-transparent border-b border-transparent group-hover:border-[#D1D5DB] focus:border-[#5B4DFF] text-[#374151] outline-none py-0.5 transition-colors"
                        placeholder="group" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" value={acc.client_id || ''} onChange={e => updateRow(i, 'client_id', e.target.value)}
                        className="w-16 bg-transparent border-b border-transparent group-hover:border-[#D1D5DB] focus:border-[#5B4DFF] text-[#374151] outline-none py-0.5 tabular transition-colors"
                        placeholder="174" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={acc.username} onChange={e => updateRow(i, 'username', e.target.value)}
                        className="w-24 bg-transparent border-b border-transparent group-hover:border-[#D1D5DB] focus:border-[#5B4DFF] text-[#111827] outline-none py-0.5 tabular transition-colors"
                        placeholder="username" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="password" value={acc.password} onChange={e => updateRow(i, 'password', e.target.value)}
                        className="w-24 bg-transparent border-b border-transparent group-hover:border-[#D1D5DB] focus:border-[#5B4DFF] text-[#374151] outline-none py-0.5 transition-colors"
                        placeholder="••••••••" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={acc.crn} onChange={e => updateRow(i, 'crn', e.target.value)}
                        className="w-28 bg-transparent border-b border-transparent group-hover:border-[#D1D5DB] focus:border-[#5B4DFF] text-[#374151] outline-none py-0.5 tabular transition-colors"
                        placeholder="CRN" />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" value={acc.pin || ''} onChange={e => updateRow(i, 'pin', e.target.value)}
                        className="w-14 bg-transparent border-b border-transparent group-hover:border-[#D1D5DB] focus:border-[#5B4DFF] text-[#374151] outline-none py-0.5 tabular transition-colors"
                        placeholder="PIN" />
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const complete = isComplete(acc);
                        const isVerifying = verifyingUser === acc.username;
                        if (isVerifying) {
                          return (
                            <div className="flex items-center gap-1.5 text-[#5B4DFF]">
                              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                              </svg>
                              <span className="text-xs">Verifying...</span>
                            </div>
                          );
                        }
                        if (!complete) {
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#9CA3AF]" />
                              <span className="text-[#9CA3AF]">Incomplete</span>
                            </div>
                          );
                        }
                        if (snap) {
                          const label = snap.status === 'auth_failed' ? 'Auth Failed' : snap.status.charAt(0).toUpperCase() + snap.status.slice(1);
                          return (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_PILL[snap.status]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[snap.status]}`} />
                                {label}
                                {snap.days_to_expiry !== undefined && snap.status !== 'healthy' && (
                                  <span className="opacity-70 font-medium">· {snap.days_to_expiry}d</span>
                                )}
                              </span>
                              <button
                                onClick={() => onVerifyOne(acc)}
                                className="text-[#9CA3AF] hover:text-[#5B4DFF] text-[11px]"
                                title="Re-verify"
                              >
                                ↻
                              </button>
                            </div>
                          );
                        }
                        return (
                          <button
                            onClick={() => onVerifyOne(acc)}
                            className="flex items-center gap-1.5 px-2 py-0.5 bg-[#5B4DFF]/10 text-[#5B4DFF] border border-[#5B4DFF]/20 rounded text-xs font-medium hover:bg-[#5B4DFF]/15 transition-colors"
                          >
                            Verify
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-2">
                      <button onClick={() => removeRow(i)} className="text-[#D1D5DB] hover:text-[#EF4444] transition-colors font-bold text-base leading-none">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
