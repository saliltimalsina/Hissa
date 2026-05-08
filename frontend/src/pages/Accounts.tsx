import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../store';
import { fetchBrokers, addAccount, updateAccount, deleteAccount, bulkImportAccounts, fetchSnapshot } from '../api';
import type { Account, Broker, AccountSnapshot } from '../types';

const B = 'rgba(14,15,12,0.08)';
const BR = 'rgba(14,15,12,0.12)';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>{children}</label>;
}
function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="rounded px-2.5 py-1.5 text-xs outline-none w-full"
      style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c', ...props.style as any }} />
  );
}

const STATUS_COLOR: Record<string, string> = {
  healthy: '#054d28', expiring: '#b37d00', expired: '#d03238',
  auth_failed: '#d03238', error: '#d03238',
};
const STATUS_BG: Record<string, string> = {
  healthy: 'rgba(5,77,40,0.08)', expiring: 'rgba(255,209,26,0.15)',
  expired: 'rgba(208,50,56,0.08)', auth_failed: 'rgba(208,50,56,0.08)', error: 'rgba(208,50,56,0.08)',
};

function parseBulkText(raw: string, brokers: Broker[]): { client_id: number; username: string; password: string; crn: string; pin: string; label?: string }[] {
  const brokerMap = new Map(brokers.map(b => [b.id, b.name]));
  return raw.trim().split('\n').flatMap(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return [];
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 5) return [];
    const [cid, username, password, crn, pin, label] = parts;
    return [{
      client_id: parseInt(cid),
      username,
      password,
      crn,
      pin,
      label: label || brokerMap.get(parseInt(cid)) || username,
    }];
  });
}

export default function AccountsPage() {
  const { accounts, reloadAccounts, accountsLoading, snapshots, setSnapshots, setSnapshotLoading, snapshotLoading } = useApp();
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [activeGroup, setActiveGroup] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [form, setForm] = useState({
    username: '', password: '', pin: '', crn: '',
    client_id: 0, label: '', group_name: 'Default',
  });
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState('');

  useEffect(() => {
    fetchBrokers().then(setBrokers).catch(() => {});
  }, []);

  const groups = ['All', ...Array.from(new Set(accounts.map(a => a.group_name || 'Default')))];
  const filtered = activeGroup === 'All' ? accounts : accounts.filter(a => (a.group_name || 'Default') === activeGroup);

  const snapMap = new Map<string, AccountSnapshot>(snapshots.map(s => [s.username, s]));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddErr('');
    setAdding(true);
    try {
      await addAccount({ ...form, pin: form.pin });
      setShowAdd(false);
      setForm({ username: '', password: '', pin: '', crn: '', client_id: 0, label: '', group_name: 'Default' });
      reloadAccounts();
    } catch (e: any) {
      setAddErr(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await deleteAccount(id);
      reloadAccounts();
    } catch { /* silent */ } finally {
      setDeleting(null);
    }
  }

  async function handleUpdateLabel(id: number, label: string, group_name: string) {
    await updateAccount(id, { label, group_name });
    reloadAccounts();
    setEditingId(null);
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const rows = parseBulkText(importText, brokers);
      const result = await bulkImportAccounts(rows);
      setImportResult(result);
      reloadAccounts();
      if (result.added > 0) setImportText('');
    } catch { /* silent */ } finally {
      setImporting(false);
    }
  }

  async function refreshSnapshot() {
    setSnapshotLoading(true);
    try {
      const snap = await fetchSnapshot();
      setSnapshots(snap.accounts, snap.summary);
    } catch { /* silent */ } finally {
      setSnapshotLoading(false);
    }
  }

  const selectedBroker = brokers.find(b => b.id === form.client_id);

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-base font-bold" style={{ color: '#0e0f0c' }}>Accounts</div>
          <div className="text-xs" style={{ color: '#868685' }}>{accounts.length} MeroShare accounts secured</div>
        </div>
        <div className="flex-1" />
        <button onClick={refreshSnapshot} disabled={snapshotLoading}
          className="text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40"
          style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
          {snapshotLoading ? 'Checking…' : 'Check Health'}
        </button>
        <button onClick={() => setShowImport(v => !v)}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
          Bulk Import
        </button>
        <button onClick={() => setShowAdd(v => !v)}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ background: '#0e0f0c', color: '#9fe870', border: 'none', cursor: 'pointer' }}>
          + Add Account
        </button>
      </div>

      {/* Bulk Import */}
      {showImport && (
        <div className="rounded-card p-4 space-y-3" style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px` }}>
          <div className="text-xs font-bold" style={{ color: '#0e0f0c' }}>Bulk Import</div>
          <div className="text-xs" style={{ color: '#868685' }}>
            One account per line: <code className="px-1.5 py-0.5 rounded" style={{ background: '#f2f5ef' }}>client_id,username,password,crn,pin,label(optional)</code>
          </div>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            rows={6}
            placeholder="129,myusername,mypassword,MYCRN123,1234,My Label&#10;145,otherusername,otherpass,OTHERCRN,5678"
            className="w-full text-xs rounded px-3 py-2 font-mono outline-none resize-none"
            style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c' }}
          />
          {importResult && (
            <div className="text-xs px-3 py-2 rounded" style={{ background: 'rgba(5,77,40,0.08)', color: '#054d28' }}>
              Added {importResult.added}, skipped {importResult.skipped} (already exist)
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={importing || !importText.trim()}
              className="text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40"
              style={{ background: '#9fe870', color: '#163300', border: 'none', cursor: 'pointer' }}>
              {importing ? 'Importing…' : 'Import'}
            </button>
            <button onClick={() => { setShowImport(false); setImportText(''); setImportResult(null); }}
              className="text-xs font-semibold px-3 py-1.5 rounded"
              style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Account form */}
      {showAdd && (
        <div className="rounded-card p-4" style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px` }}>
          <div className="text-xs font-bold mb-3" style={{ color: '#0e0f0c' }}>Add MeroShare Account</div>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Broker (client_id)</Label>
              <select value={form.client_id || ''} onChange={e => {
                const id = parseInt(e.target.value) || 0;
                const b = brokers.find(x => x.id === id);
                setForm(f => ({ ...f, client_id: id, label: f.label || b?.name || '' }));
              }}
                className="rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c' }}>
                <option value="">Select broker…</option>
                {brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.id})</option>)}
              </select>
              {selectedBroker && (
                <div className="text-[10px]" style={{ color: '#868685' }}>Code: {selectedBroker.code}</div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Username</Label>
              <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required placeholder="meroshare username" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required placeholder="••••••••" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>CRN</Label>
              <Input value={form.crn} onChange={e => setForm(f => ({ ...f, crn: e.target.value }))} required placeholder="CRN number" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>PIN</Label>
              <Input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} required placeholder="4-digit PIN" maxLength={6} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Label (optional)</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Display name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Group</Label>
              <Input value={form.group_name} onChange={e => setForm(f => ({ ...f, group_name: e.target.value }))} placeholder="Default" />
            </div>

            {addErr && (
              <div className="col-span-full text-xs px-3 py-2 rounded" style={{ background: 'rgba(208,50,56,0.08)', color: '#d03238' }}>
                {addErr}
              </div>
            )}

            <div className="col-span-full flex gap-2 pt-1">
              <button type="submit" disabled={adding}
                className="text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40"
                style={{ background: '#9fe870', color: '#163300', border: 'none', cursor: 'pointer' }}>
                {adding ? 'Adding…' : 'Add Account'}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setAddErr(''); }}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Group tabs */}
      {groups.length > 2 && (
        <div className="flex gap-1.5 flex-wrap">
          {groups.map(g => (
            <button key={g} onClick={() => setActiveGroup(g)}
              className="text-xs font-semibold px-3 py-1 rounded-pill"
              style={{
                background: activeGroup === g ? '#0e0f0c' : '#f2f5ef',
                color: activeGroup === g ? '#9fe870' : '#454745',
                border: 'none', cursor: 'pointer',
              }}>
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Accounts grid */}
      {accountsLoading ? (
        <div className="flex items-center justify-center h-32" style={{ color: '#868685' }}>
          <div className="text-sm">Loading accounts…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <div className="text-sm font-semibold" style={{ color: '#454745' }}>No accounts yet</div>
          <div className="text-xs" style={{ color: '#868685' }}>Add your first MeroShare account or bulk import from accounts.txt</div>
          <button onClick={() => setShowAdd(true)}
            className="text-xs font-semibold px-4 py-2 rounded"
            style={{ background: '#0e0f0c', color: '#9fe870', border: 'none', cursor: 'pointer' }}>
            + Add Account
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(acc => {
            const snap = snapMap.get(acc.username);
            const status = snap?.status || 'unknown';
            const isEditing = editingId === acc.id;

            return (
              <AccountCard
                key={acc.id}
                acc={acc}
                snap={snap}
                status={status}
                isEditing={isEditing}
                deleting={deleting === acc.id}
                onEdit={() => setEditingId(isEditing ? null : acc.id)}
                onDelete={() => handleDelete(acc.id)}
                onSave={handleUpdateLabel}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  acc, snap, status, isEditing, deleting, onEdit, onDelete, onSave,
}: {
  acc: Account;
  snap?: AccountSnapshot;
  status: string;
  isEditing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave: (id: number, label: string, group: string) => void;
}) {
  const [label, setLabel] = useState(acc.label || '');
  const [group, setGroup] = useState(acc.group_name || 'Default');
  const BR = 'rgba(14,15,12,0.12)';
  const B = 'rgba(14,15,12,0.08)';

  const scol = STATUS_COLOR[status] || '#868685';
  const sbg = STATUS_BG[status] || '#f2f5ef';
  const statusLabel = { healthy: 'Healthy', expiring: 'Expiring', expired: 'Expired', auth_failed: 'Auth Failed', error: 'Error' }[status] || 'Unknown';

  return (
    <div className="rounded-card p-4 flex flex-col gap-3" style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold truncate" style={{ color: '#0e0f0c' }}>
            {snap?.name || acc.label || acc.username}
          </div>
          <div className="text-[11px] font-mono" style={{ color: '#868685' }}>{acc.username}</div>
        </div>
        <span className="px-2 py-0.5 rounded-pill text-[10px] font-bold flex-shrink-0"
          style={{ background: sbg, color: scol }}>{statusLabel}</span>
      </div>

      {snap && (
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {snap.demat && <div><span style={{ color: '#868685' }}>Demat </span><span className="font-mono" style={{ color: '#454745' }}>{snap.demat.slice(-6)}</span></div>}
          {snap.days_to_expiry != null && (
            <div><span style={{ color: '#868685' }}>Expiry </span>
              <span style={{ color: snap.days_to_expiry < 0 ? '#d03238' : snap.days_to_expiry <= 30 ? '#b37d00' : '#054d28' }}>
                {snap.days_to_expiry < 0 ? 'Expired' : `${snap.days_to_expiry}d`}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="text-[10px] font-semibold px-2 py-0.5 rounded self-start"
        style={{ background: '#f2f5ef', color: '#868685' }}>
        {acc.group_name || 'Default'}
      </div>

      {isEditing && (
        <div className="space-y-2 pt-1" style={{ borderTop: `1px solid ${B}` }}>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Label</span>
            <input value={label} onChange={e => setLabel(e.target.value)}
              className="text-xs rounded px-2 py-1 outline-none"
              style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c' }} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Group</span>
            <input value={group} onChange={e => setGroup(e.target.value)}
              className="text-xs rounded px-2 py-1 outline-none"
              style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c' }} />
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => onSave(acc.id, label, group)}
              className="text-[10px] font-bold px-2 py-1 rounded flex-1"
              style={{ background: '#9fe870', color: '#163300', border: 'none', cursor: 'pointer' }}>
              Save
            </button>
            <button onClick={onEdit}
              className="text-[10px] font-bold px-2 py-1 rounded"
              style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isEditing && (
        <div className="flex gap-1.5 pt-1" style={{ borderTop: `1px solid ${B}` }}>
          <button onClick={onEdit}
            className="text-[10px] font-semibold px-2 py-1 rounded flex-1"
            style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
            Edit
          </button>
          <button onClick={onDelete} disabled={deleting}
            className="text-[10px] font-semibold px-2 py-1 rounded disabled:opacity-40"
            style={{ background: 'rgba(208,50,56,0.08)', color: '#d03238', border: 'none', cursor: 'pointer' }}>
            {deleting ? '…' : 'Remove'}
          </button>
        </div>
      )}
    </div>
  );
}
