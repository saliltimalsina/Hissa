import { useState, useEffect, useRef } from 'react';
import { RefreshCw, X, Plus } from 'lucide-react';
import type { Account, AccountSnapshot } from '../types';
import { api } from '../lib/api';
import { Button, Spinner, StatusPill, Icon } from '../components/ui';
import { statusMeta } from '../lib/status';

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
        className="w-full border border-border rounded-lg px-3 py-2 text-xs text-ink focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand placeholder-faint"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-lg z-20 overflow-hidden">
          {filtered.map(b => (
            <button
              key={b.id}
              onClick={() => { onSelect(b); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-surface flex items-center justify-between"
            >
              <span className="text-ink font-medium">{b.name}</span>
              <span className="text-muted font-mono ml-3 flex-shrink-0">ID: {b.id} · {b.code}</span>
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

const inputCls = 'w-full bg-white border border-border rounded-lg px-3 py-2 text-xs text-ink focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand placeholder-faint transition-colors';

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
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-4 sm:px-8 py-6 border-b border-line flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-display text-ink">Accounts</h1>
            <p className="text-body text-muted mt-1">{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} configured</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setCsvMode(!csvMode); setShowAdd(false); }}>
              {csvMode ? 'Close import' : 'Import CSV'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setShowAdd(s => !s); setCsvMode(false); setAddError(''); }}>
              {showAdd ? 'Cancel' : <><Icon icon={Plus} size={14} /> Add account</>}
            </Button>
            <button
              onClick={onCheckAll}
              disabled={checking || accounts.length === 0}
              className="px-3 py-1.5 bg-brand/20 text-brand border border-brand/30 rounded text-xs font-medium disabled:opacity-40 flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {checking && <Spinner size="sm" />}
              Health Check
            </button>
          </div>
        </div>
        {/* Broker lookup — find correct client_id, auto-opens the add form */}
        <div className="flex flex-col md:flex-row items-stretch md:items-start gap-3">
          <div className="flex-1">
            <BrokerSearch onSelect={b => { setShowAdd(true); setCsvMode(false); setField('client_id', String(b.id)); setField('label', b.name); }} />
          </div>
          <div className="text-xs text-muted bg-warn-bg border border-warn/30 rounded-lg px-3 py-2 flex-shrink-0 max-w-xs">
            <span className="font-semibold text-warn-fg">Client ID ≠ Broker Code.</span> Search your broker above to auto-fill the correct internal ID. E.g. NIC Asia code <code className="font-mono">13700</code> → ID <code className="font-mono">174</code>.
          </div>
        </div>
      </div>

      {/* Health summary */}
      {Object.keys(snapshots).length > 0 && (
        <div className="px-6 py-3 border-b border-line flex items-center gap-6 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs text-body"><span className="text-success font-semibold tabular">{healthy}</span> healthy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-warn" />
            <span className="text-xs text-body"><span className="text-warn font-semibold tabular">{expiring}</span> expiring</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-danger" />
            <span className="text-xs text-body"><span className="text-danger font-semibold tabular">{failed}</span> failed</span>
          </div>
        </div>
      )}

      {/* Add account form */}
      {showAdd && (
        <div className="px-6 py-4 border-b border-line flex-shrink-0 bg-white">
          <form onSubmit={submitAdd} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-overline text-muted mb-1">Label</label>
                <input className={inputCls} value={form.label} onChange={e => setField('label', e.target.value)} placeholder="e.g. Salil" />
              </div>
              <div>
                <label className="block text-overline text-muted mb-1">Group</label>
                <input className={inputCls} value={form.group_name} onChange={e => setField('group_name', e.target.value)} placeholder="e.g. Family" />
              </div>
              <div>
                <label className="block text-overline text-muted mb-1">Client ID</label>
                <input className={inputCls} type="number" value={form.client_id} onChange={e => setField('client_id', e.target.value)} placeholder="174" />
              </div>
              <div>
                <label className="block text-overline text-muted mb-1">Username</label>
                <input className={inputCls} value={form.username} onChange={e => setField('username', e.target.value)} placeholder="username" autoComplete="off" />
              </div>
              <div>
                <label className="block text-overline text-muted mb-1">Password</label>
                <input className={inputCls} type="password" value={form.password} onChange={e => setField('password', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-overline text-muted mb-1">CRN</label>
                <input className={inputCls} value={form.crn} onChange={e => setField('crn', e.target.value)} placeholder="CRN" autoComplete="off" />
              </div>
              <div>
                <label className="block text-overline text-muted mb-1">PIN</label>
                <input className={inputCls} type="password" value={form.pin} onChange={e => setField('pin', e.target.value)} placeholder="PIN" autoComplete="new-password" />
              </div>
            </div>
            {addError && <p className="text-xs text-danger">{addError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={addBusy}>Save account</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setShowAdd(false); setAddError(''); }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* CSV import mode */}
      {csvMode && (
        <div className="px-6 py-4 border-b border-line flex-shrink-0">
          <p className="text-[10px] text-muted font-mono mb-2 bg-white border border-border rounded px-3 py-1.5">
            Format: client_id,username,password,crn,pin[,label[,group]]
          </p>
          <textarea
            className="w-full h-32 bg-[#f0f2f7] border border-border rounded font-mono text-xs text-ink p-3 resize-none focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand placeholder-faint"
            placeholder={`174,166535,mypassword,CRN1234,3669,Salil,Family`}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
          />
          {csvError && <p className="text-xs text-danger mt-1">{csvError}</p>}
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={parseCSV} disabled={!csvText.trim()} loading={csvBusy}>Import</Button>
            <Button variant="secondary" size="sm" onClick={() => { setCsvMode(false); setCsvError(''); setCsvText(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {!accountsLoaded ? (
          <div className="flex items-center justify-center h-48 text-muted">
            <Spinner size="md" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <p className="text-sm text-muted">No accounts yet</p>
              <p className="text-xs text-faint mt-1">Add an account or import CSV</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface border-b border-line">
              <tr className="text-muted">
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
                    <tr key={acc.id} className="border-b border-line-soft bg-brand-subtle">
                      <td colSpan={7} className="px-5 py-4">
                        <form onSubmit={submitEdit} className="space-y-3">
                          <p className="text-[11px] text-muted">Editing <span className="font-semibold text-body">{acc.label || acc.username}</span> — leave password / PIN / CRN blank to keep the existing values.</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-overline text-muted mb-1">Label</label>
                              <input className={inputCls} value={editForm.label} onChange={e => setEditField('label', e.target.value)} placeholder="label" />
                            </div>
                            <div>
                              <label className="block text-overline text-muted mb-1">Group</label>
                              <input className={inputCls} value={editForm.group_name} onChange={e => setEditField('group_name', e.target.value)} placeholder="group" />
                            </div>
                            <div>
                              <label className="block text-overline text-muted mb-1">Client ID</label>
                              <input className={inputCls} type="number" value={editForm.client_id} onChange={e => setEditField('client_id', e.target.value)} placeholder="174" />
                            </div>
                            <div>
                              <label className="block text-overline text-muted mb-1">New Password</label>
                              <input className={inputCls} type="password" value={editForm.password} onChange={e => setEditField('password', e.target.value)} placeholder="unchanged" autoComplete="new-password" />
                            </div>
                            <div>
                              <label className="block text-overline text-muted mb-1">New CRN</label>
                              <input className={inputCls} value={editForm.crn} onChange={e => setEditField('crn', e.target.value)} placeholder="unchanged" autoComplete="off" />
                            </div>
                            <div>
                              <label className="block text-overline text-muted mb-1">New PIN</label>
                              <input className={inputCls} type="password" value={editForm.pin} onChange={e => setEditField('pin', e.target.value)} placeholder="unchanged" autoComplete="new-password" />
                            </div>
                          </div>
                          {editError && <p className="text-xs text-danger">{editError}</p>}
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" loading={editBusy}>Save changes</Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => { setEditForm({ ...EMPTY_FORM }); setEditId(null); setEditError(''); }}>
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={acc.id} className="border-b border-line-soft hover:bg-brand-subtle group transition-colors">
                    <td className="px-5 py-2.5 text-muted tabular">{i + 1}</td>
                    <td className="px-3 py-2.5 text-ink font-medium">{acc.label || '—'}</td>
                    <td className="px-3 py-2.5 text-muted">{acc.group_name || '—'}</td>
                    <td className="px-3 py-2.5 text-body tabular">{acc.client_id || '—'}</td>
                    <td className="px-3 py-2.5 text-body tabular">{acc.username}</td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const isVerifying = verifyingUser === acc.username;
                        if (isVerifying) {
                          return (
                            <div className="flex items-center gap-1.5 text-brand">
                              <Spinner size="sm" />
                              <span className="text-xs">Verifying...</span>
                            </div>
                          );
                        }
                        if (snap) {
                          const meta = statusMeta(snap.status);
                          const extra = snap.days_to_expiry !== undefined && snap.status !== 'healthy'
                            ? `${meta.label} · ${snap.days_to_expiry}d`
                            : meta.label;
                          return (
                            <div className="flex items-center gap-2">
                              <StatusPill status={snap.status} label={extra} dot />
                              <button
                                onClick={() => onVerifyOne(acc)}
                                className="text-faint hover:text-brand p-0.5"
                                aria-label={`Re-verify ${acc.label || acc.username}`}
                                title="Re-verify"
                              >
                                <Icon icon={RefreshCw} size={12} />
                              </button>
                            </div>
                          );
                        }
                        return (
                          <button
                            onClick={() => onVerifyOne(acc)}
                            className="flex items-center gap-1.5 px-2 py-0.5 bg-brand/10 text-brand border border-brand/20 rounded text-xs font-medium hover:bg-brand/15 transition-colors"
                          >
                            Verify
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(acc)} className="text-faint hover:text-brand text-xs font-medium" title="Edit">
                          Edit
                        </button>
                        <button onClick={() => deleteAccount(acc.id)} disabled={deletingId === acc.id} className="text-border hover:text-danger transition-colors leading-none disabled:opacity-40 p-0.5" aria-label={`Delete account ${acc.label || acc.username}`} title="Delete account">
                          <Icon icon={X} size={16} />
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
