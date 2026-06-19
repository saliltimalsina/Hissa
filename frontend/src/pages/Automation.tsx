import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { SchedulerRule, SchedulerRuleInput } from '../types';
import {
  listSchedulerRules,
  createSchedulerRule,
  toggleSchedulerRule,
  deleteSchedulerRule,
} from '../lib/api';
import { Button, Spinner, Toggle, Icon } from '../components/ui';

function timeAgoUtc(iso: string | null): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return iso;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const RULE_TYPE_LABEL: Record<string, string> = {
  auto_all: 'Auto-apply all open IPOs',
  sector_filter: 'Apply only matching sectors',
};

const BADGE_COLOR: Record<string, string> = {
  auto_all: 'bg-brand/20 text-brand',
  sector_filter: 'bg-warn/20 text-warn',
};

interface FormState {
  name: string;
  rule_type: 'auto_all' | 'sector_filter';
  kitta: string;
  sectors: string;
  max_accounts: string;
  max_kitta: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  rule_type: 'auto_all',
  kitta: '10',
  sectors: '',
  max_accounts: '50',
  max_kitta: '100',
};

export default function Automation() {
  const [rules, setRules] = useState<SchedulerRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  // Core fetch. `showSpinner` flips loading up-front for user-initiated reloads
  // (Retry button); the initial mount uses the `useState(true)` default so the
  // effect never sets state synchronously before its first await.
  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) {
      setLoading(true);
      setError('');
    }
    try {
      const fetched = await listSchedulerRules();
      setRules(fetched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load automation rules');
    } finally {
      setLoading(false);
    }
  }, []);

  // Microtask so the fetch's setState lands after commit, not synchronously.
  useEffect(() => { Promise.resolve().then(() => load(false)); }, [load]);

  async function onToggle(rule: SchedulerRule) {
    setBusyId(rule.id);
    // Optimistic flip.
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r));
    try {
      const updated = await toggleSchedulerRule(rule.id);
      setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (e: unknown) {
      // Revert on failure.
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: rule.active } : r));
      setError(e instanceof Error ? e.message : 'Failed to toggle rule');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(rule: SchedulerRule) {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    setBusyId(rule.id);
    try {
      await deleteSchedulerRule(rule.id);
      setRules(prev => prev.filter(r => r.id !== rule.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete rule');
    } finally {
      setBusyId(null);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const name = form.name.trim();
    if (!name) { setFormError('Name is required'); return; }
    const sectors = form.sectors.split(',').map(s => s.trim()).filter(Boolean);
    if (form.rule_type === 'sector_filter' && sectors.length === 0) {
      setFormError('Sector filter needs at least one sector keyword');
      return;
    }
    const payload: SchedulerRuleInput = {
      name,
      rule_type: form.rule_type,
      kitta: Math.max(0, parseInt(form.kitta) || 0),
      sectors: form.rule_type === 'sector_filter' ? sectors : null,
      max_accounts: Math.max(0, parseInt(form.max_accounts) || 0),
      max_kitta: Math.max(0, parseInt(form.max_kitta) || 0),
    };
    setSaving(true);
    try {
      const created = await createSchedulerRule(payload);
      setRules(prev => [...prev, created]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create rule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display text-ink">Automation</h1>
          <p className="text-body text-muted mt-1">Rules the daily scheduler evaluates against open IPOs</p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(s => !s); setFormError(''); }}>
          {showForm ? 'Cancel' : <><Icon icon={Plus} size={14} /> New Rule</>}
        </Button>
      </div>

      {/* Honesty banner — what automation actually does today. */}
      <div className="bg-warn/5 border border-warn/30 rounded-lg p-4">
        <p className="text-caption font-semibold text-warn-fg mb-1">How automation runs</p>
        <p className="text-caption text-muted leading-relaxed">
          Active rules are evaluated once daily by a scheduled cron job. By default the engine runs in
          <span className="font-semibold text-warn-fg"> DRY-RUN</span>: it computes exactly what it would
          apply (account, IPO, kitta) and records the intent, but it does <span className="font-semibold">not</span> contact
          MeroShare and does <span className="font-semibold">not</span> move any money. Real applications only happen when the
          server is explicitly armed (<span className="font-mono">AUTOMATION_ARMED</span>) by an operator. Per-rule caps
          (max accounts, max kitta) bound the blast radius, and already-applied IPOs are skipped automatically.
        </p>
      </div>

      {/* New rule form */}
      {showForm && (
        <form onSubmit={onCreate} className="bg-white border border-line rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Auto-apply all"
                className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-ink focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Match</label>
              <select
                value={form.rule_type}
                onChange={e => setForm(f => ({ ...f, rule_type: e.target.value as FormState['rule_type'] }))}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-ink focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <option value="auto_all">All open IPOs (auto_all)</option>
                <option value="sector_filter">Sector filter</option>
              </select>
            </div>
          </div>

          {form.rule_type === 'sector_filter' && (
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                Sector keywords <span className="font-normal normal-case">(comma-separated; matched against share group / type / scrip)</span>
              </label>
              <input
                type="text"
                value={form.sectors}
                onChange={e => setForm(f => ({ ...f, sectors: e.target.value }))}
                placeholder="e.g. hydropower, microfinance"
                className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-ink focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Kitta</label>
              <input
                type="number" min={0}
                value={form.kitta}
                onChange={e => setForm(f => ({ ...f, kitta: e.target.value }))}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-ink tabular focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Max accounts</label>
              <input
                type="number" min={0}
                value={form.max_accounts}
                onChange={e => setForm(f => ({ ...f, max_accounts: e.target.value }))}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-ink tabular focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Max kitta</label>
              <input
                type="number" min={0}
                value={form.max_kitta}
                onChange={e => setForm(f => ({ ...f, max_kitta: e.target.value }))}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-ink tabular focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-danger">{formError}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={saving}>
              {saving ? 'Saving…' : 'Create rule'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(''); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && (
        <div className="px-4 py-3 bg-danger/10 border border-danger/20 rounded-lg text-xs text-danger flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => load()} className="underline font-medium">Retry</button>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted py-8 justify-center text-brand">
          <Spinner size="md" />
          <span className="text-muted">Loading rules…</span>
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-white border border-line rounded-lg px-4 py-10 text-center">
          <p className="text-body font-medium text-body">No automation rules yet</p>
          <p className="text-caption text-muted mt-1">Create a rule to have the daily scheduler evaluate open IPOs for you.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="bg-white border border-line rounded-lg p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-body font-semibold text-ink truncate">{rule.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${BADGE_COLOR[rule.rule_type] || 'bg-faint/20 text-muted'}`}>
                    {rule.rule_type}
                  </span>
                </div>
                <p className="text-caption text-muted">
                  {RULE_TYPE_LABEL[rule.rule_type] || rule.rule_type}
                  {rule.rule_type === 'sector_filter' && rule.sectors?.length ? ` — ${rule.sectors.join(', ')}` : ''}
                  {` · ${rule.kitta} kitta · ≤${rule.max_accounts} accounts · ≤${rule.max_kitta} kitta cap`}
                </p>
                <p className="text-[10px] text-faint mt-1">Last run: {timeAgoUtc(rule.last_run_at)}</p>
              </div>
              <button
                onClick={() => onDelete(rule)}
                disabled={busyId === rule.id}
                className="text-xs text-faint hover:text-danger transition-colors disabled:opacity-40"
                title="Delete rule"
              >
                Delete
              </button>
              <Toggle
                checked={rule.active}
                onChange={() => onToggle(rule)}
                disabled={busyId === rule.id}
                label={rule.active ? `Disable rule ${rule.name}` : `Enable rule ${rule.name}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
