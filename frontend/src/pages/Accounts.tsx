import { useState, useEffect, useRef } from 'react';
import type { Account, AccountSnapshot } from '../types';
import { api } from '../lib/api';

interface Broker { code: string; id: number; name: string; }

function BrokerSearch({ onSelect }: { onSelect: (b: Broker) => void }) {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/brokers', { credentials: 'include' }).then(r => r.json()).then(setBrokers).catch(() => {});
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
  accountsLoaded: boolean;
  onRefresh: () => Promise<void> | void;
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

// Transient form type — holds credentials ONLY while the form is open.
// Cleared immediately after a successful submit; never persisted.
interface CredForm {
  username: string;
  password: string;
  pin: string;
  crn: string;
  client_id: string;
  label: string;
  group_name: string;
}

const EMPTY_FORM: CredForm = { username: '', password: '', pin: '', crn: '', client_id: '', label: '', group_name: '' };

const inputCls = 'w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#5B4DFF] placeholder-[#9CA3AF] transition-colors';

export default function Accounts({ accounts, accountsLoaded, onRefresh, snapshots, verifyingUser, checking, onVerifyOne, onCheckAll }: Props) {
  const [csvMode, setCsvMode] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvError, setCsvError] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);

  // Add-account form (transient credentials).
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<CredForm>({ ...EMPTY_FORM });
  const [addError, setAddError] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  // Inline edit (only sends changed/non-blank credential fields).
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CredForm>({ ...EMPTY_FORM });
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  function setField(k: keyof CredForm, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }
  function setEditField(k: keyof CredForm, v: string) {
    setEditForm(f => ({ ...f, [k]: v }));
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    if (!form.username || !form.password || !form.pin || !form.crn || !form.client_id) {
      setAddError('Username, password, PIN, CRN and Client ID are required.');
      return;
    }
    setAddBusy(true);
    try {
      await api('/api/accounts', {
        method: 'POST',
        body: {
          username: form.username,
          password: form.password,
          pin: form.pin, // string per contract
          crn: form.crn,
          client_id: parseInt(form.client_id) || 0,
          label: form.label || undefined,
          group_name: form.group_name || undefined,
        },
      });
      setForm({ ...EMPTY_FORM }); // clear creds from memory immediately
      setShowAdd(false);
      await onRefresh();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add account.');
    } finally {
      setAddBusy(false);
    }
  }

  function startEdit(acc: Account) {
    setEditError('');
    setEditId(acc.id);
    // Pre-fill metadata only; credential fields stay blank => unchanged unless typed.
    setEditForm({
      username: acc.username,
      password: '',
      pin: '',
      crn: '',
      client_id: String(acc.client_id),
      label: acc.label || '',
      group_name: acc.group_name || '',
    });
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editId == null) return;
    setEditError('');
    setEditBusy(true);
    try {
      const body: Record<string, unknown> = {
        label: editForm.label || undefined,
        group_name: editForm.group_name || undefined,
        client_id: parseInt(editForm.client_id) || undefined,
      };
      // Only send credential fields if the user actually typed a new value.
      if (editForm.password) body.password = editForm.password;
      if (editForm.pin) body.pin = editForm.pin;
      if (editForm.crn) body.crn = editForm.crn;
      await api(`/api/accounts/${editId}`, { method: 'PUT', body });
      setEditForm({ ...EMPTY_FORM }); // clear any typed creds
      setEditId(null);
      await onRefresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update account.');
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteAccount(id: number) {
    if (!window.confirm('Delete this account? This removes its stored credentials from the server.')) return;
    setDeletingId(id);
    try {
      await api(`/api/accounts/${id}`, { method: 'DELETE' });
      await onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  async function parseCSV() {
    setCsvError('');
    const lines = csvText.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const parsed: Array<Record<string, unknown>> = [];
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 5) { setCsvError(`Bad line: "${line}" — need client_id,username,password,crn,pin`); return; }
      parsed.push({
        client_id: parseInt(parts[0]) || 0,
        username: parts[1],
        password: parts[2],
        crn: parts[3],
        pin: parts[4], // string per contract
        label: parts[5] || undefined,
        group_name: parts[6] || undefined,
      });
    }
    if (parsed.length === 0) { setCsvError('Nothing to import.'); return; }
    setCsvBusy(true);
    try {
      await api('/api/accounts/import', { method: 'POST', body: parsed });
      setCsvText(''); // clear creds from memory
      setCsvMode(false);
      await onRefresh();
    } catch (err: unknown) {
      setCsvError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setCsvBusy(false);
    }
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
              onClick={() => { setCsvMode(!csvMode); setShowAdd(false); }}
              className="px-3 py-1.5 border border-[#D1D5DB] text-[#374151] rounded text-xs font-medium hover:border-[#9CA3AF] transition-colors"
            >
              {csvMode ? 'Close import' : 'Import CSV'}
            </button>
            <button
              onClick={() => { setShowAdd(s => !s); setCsvMode(false); setAddError(''); }}
              className="px-3 py-1.5 border border-[#D1D5DB] text-[#374151] rounded text-xs font-medium hover:border-[#9CA3AF] transition-colors"
            >
              {showAdd ? 'Cancel' : '+ Add account'}
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
        {/* Broker lookup — find correct client_id, auto-opens the add form */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <BrokerSearch onSelect={b => { setShowAdd(true); setCsvMode(false); setField('client_id', String(b.id)); setField('label', b.name); }} />
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

      {/* Add account form */}
      {showAdd && (
        <div className="px-6 py-4 border-b border-[#ECECF2] flex-shrink-0 bg-white">
          <form onSubmit={submitAdd} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Label</label>
                <input className={inputCls} value={form.label} onChange={e => setField('label', e.target.value)} placeholder="e.g. Salil" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Group</label>
                <input className={inputCls} value={form.group_name} onChange={e => setField('group_name', e.target.value)} placeholder="e.g. Family" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Client ID</label>
                <input className={inputCls} type="number" value={form.client_id} onChange={e => setField('client_id', e.target.value)} placeholder="174" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Username</label>
                <input className={inputCls} value={form.username} onChange={e => setField('username', e.target.value)} placeholder="username" autoComplete="off" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Password</label>
                <input className={inputCls} type="password" value={form.password} onChange={e => setField('password', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">CRN</label>
                <input className={inputCls} value={form.crn} onChange={e => setField('crn', e.target.value)} placeholder="CRN" autoComplete="off" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">PIN</label>
                <input className={inputCls} type="password" value={form.pin} onChange={e => setField('pin', e.target.value)} placeholder="PIN" autoComplete="new-password" />
              </div>
            </div>
            {addError && <p className="text-xs text-[#EF4444]">{addError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={addBusy} className="px-4 py-1.5 bg-[#5B4DFF] text-white rounded text-xs font-medium disabled:opacity-40 flex items-center gap-1.5">
                {addBusy && <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
                Save account
              </button>
              <button type="button" onClick={() => { setForm({ ...EMPTY_FORM }); setShowAdd(false); setAddError(''); }} className="px-3 py-1.5 border border-[#D1D5DB] text-[#374151] rounded text-xs">
                Cancel
              </button>
            </div>
          </form>
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
              disabled={!csvText.trim() || csvBusy}
              className="px-3 py-1.5 bg-[#5B4DFF] text-white rounded text-xs font-medium disabled:opacity-40 flex items-center gap-1.5"
            >
              {csvBusy && <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
              Import
            </button>
            <button onClick={() => { setCsvMode(false); setCsvError(''); setCsvText(''); }} className="px-3 py-1.5 border border-[#D1D5DB] text-[#374151] rounded text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {!accountsLoaded ? (
          <div className="flex items-center justify-center h-48 text-[#6b7280]">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <p className="text-sm text-[#6b7280]">No accounts yet</p>
              <p className="text-xs text-[#D1D5DB] mt-1">Add an account or import CSV</p>
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
                <th className="px-3 py-2.5 text-left font-medium">Health</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc, i) => {
                const snap = snapshots[acc.username];
                const isEditing = editId === acc.id;
                if (isEditing) {
                  return (
                    <tr key={acc.id} className="border-b border-[#F4F4F8] bg-[#FAFAFF]">
                      <td colSpan={7} className="px-5 py-4">
                        <form onSubmit={submitEdit} className="space-y-3">
                          <p className="text-[11px] text-[#6b7280]">Editing <span className="font-semibold text-[#374151]">{acc.label || acc.username}</span> — leave password / PIN / CRN blank to keep the existing values.</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Label</label>
                              <input className={inputCls} value={editForm.label} onChange={e => setEditField('label', e.target.value)} placeholder="label" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Group</label>
                              <input className={inputCls} value={editForm.group_name} onChange={e => setEditField('group_name', e.target.value)} placeholder="group" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Client ID</label>
                              <input className={inputCls} type="number" value={editForm.client_id} onChange={e => setEditField('client_id', e.target.value)} placeholder="174" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">New Password</label>
                              <input className={inputCls} type="password" value={editForm.password} onChange={e => setEditField('password', e.target.value)} placeholder="unchanged" autoComplete="new-password" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">New CRN</label>
                              <input className={inputCls} value={editForm.crn} onChange={e => setEditField('crn', e.target.value)} placeholder="unchanged" autoComplete="off" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">New PIN</label>
                              <input className={inputCls} type="password" value={editForm.pin} onChange={e => setEditField('pin', e.target.value)} placeholder="unchanged" autoComplete="new-password" />
                            </div>
                          </div>
                          {editError && <p className="text-xs text-[#EF4444]">{editError}</p>}
                          <div className="flex gap-2">
                            <button type="submit" disabled={editBusy} className="px-4 py-1.5 bg-[#5B4DFF] text-white rounded text-xs font-medium disabled:opacity-40 flex items-center gap-1.5">
                              {editBusy && <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
                              Save changes
                            </button>
                            <button type="button" onClick={() => { setEditForm({ ...EMPTY_FORM }); setEditId(null); setEditError(''); }} className="px-3 py-1.5 border border-[#D1D5DB] text-[#374151] rounded text-xs">
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={acc.id} className="border-b border-[#F4F4F8] hover:bg-[#FAFAFF] group transition-colors">
                    <td className="px-5 py-2.5 text-[#6b7280] tabular">{i + 1}</td>
                    <td className="px-3 py-2.5 text-[#111827] font-medium">{acc.label || '—'}</td>
                    <td className="px-3 py-2.5 text-[#6b7280]">{acc.group_name || '—'}</td>
                    <td className="px-3 py-2.5 text-[#374151] tabular">{acc.client_id || '—'}</td>
                    <td className="px-3 py-2.5 text-[#374151] tabular">{acc.username}</td>
                    <td className="px-3 py-2.5">
                      {(() => {
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
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(acc)} className="text-[#9CA3AF] hover:text-[#5B4DFF] text-xs font-medium" title="Edit">
                          Edit
                        </button>
                        <button onClick={() => deleteAccount(acc.id)} disabled={deletingId === acc.id} className="text-[#D1D5DB] hover:text-[#EF4444] transition-colors font-bold text-base leading-none disabled:opacity-40" title="Delete">
                          ×
                        </button>
                      </div>
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
