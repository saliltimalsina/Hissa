import { useState, useEffect, useCallback } from 'react';
import type { SchedulerRule, SchedulerRuleInput } from '../types';
import {
  listSchedulerRules,
  createSchedulerRule,
  toggleSchedulerRule,
  deleteSchedulerRule,
} from '../lib/api';

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
  auto_all: 'bg-[#5B4DFF]/20 text-[#5B4DFF]',
  sector_filter: 'bg-[#F59E0B]/20 text-[#F59E0B]',
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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRules(await listSchedulerRules());
    } catch (e: any) {
      setError(e?.message || 'Failed to load automation rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onToggle(rule: SchedulerRule) {
    setBusyId(rule.id);
    // Optimistic flip.
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r));
    try {
      const updated = await toggleSchedulerRule(rule.id);
      setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (e: any) {
      // Revert on failure.
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: rule.active } : r));
      setError(e?.message || 'Failed to toggle rule');
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
    } catch (e: any) {
      setError(e?.message || 'Failed to delete rule');
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
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create rule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Automation</h1>
          <p className="text-sm text-[#6B7280] mt-1">Rules the daily scheduler evaluates against open IPOs</p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setFormError(''); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5B4DFF] text-white rounded text-xs font-medium hover:bg-[#4C3FF0] transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Rule'}
        </button>
      </div>

      {/* Honesty banner — what automation actually does today. */}
      <div className="bg-[#F59E0B]/5 border border-[#F59E0B]/30 rounded-lg p-4">
        <p className="text-xs font-semibold text-[#92400E] mb-1">How automation runs</p>
        <p className="text-xs text-[#6b7280] leading-relaxed">
          Active rules are evaluated once daily by a scheduled cron job. By default the engine runs in
          <span className="font-semibold text-[#92400E]"> DRY-RUN</span>: it computes exactly what it would
          apply (account, IPO, kitta) and records the intent, but it does <span className="font-semibold">not</span> contact
          MeroShare and does <span className="font-semibold">not</span> move any money. Real applications only happen when the
          server is explicitly armed (<span className="font-mono">AUTOMATION_ARMED</span>) by an operator. Per-rule caps
          (max accounts, max kitta) bound the blast radius, and already-applied IPOs are skipped automatically.
        </p>
      </div>

      {/* New rule form */}
      {showForm && (
        <form onSubmit={onCreate} className="bg-[#ffffff] border border-[#ECECF2] rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Auto-apply all"
                className="w-full bg-[#F7F8FC] border border-[#D1D5DB] rounded px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#5B4DFF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Match</label>
              <select
                value={form.rule_type}
                onChange={e => setForm(f => ({ ...f, rule_type: e.target.value as FormState['rule_type'] }))}
                className="w-full bg-[#F7F8FC] border border-[#D1D5DB] rounded px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#5B4DFF]"
              >
                <option value="auto_all">All open IPOs (auto_all)</option>
                <option value="sector_filter">Sector filter</option>
              </select>
            </div>
          </div>

          {form.rule_type === 'sector_filter' && (
            <div>
              <label className="block text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">
                Sector keywords <span className="font-normal normal-case">(comma-separated; matched against share group / type / scrip)</span>
              </label>
              <input
                type="text"
                value={form.sectors}
                onChange={e => setForm(f => ({ ...f, sectors: e.target.value }))}
                placeholder="e.g. hydropower, microfinance"
                className="w-full bg-[#F7F8FC] border border-[#D1D5DB] rounded px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#5B4DFF]"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Kitta</label>
              <input
                type="number" min={0}
                value={form.kitta}
                onChange={e => setForm(f => ({ ...f, kitta: e.target.value }))}
                className="w-full bg-[#F7F8FC] border border-[#D1D5DB] rounded px-3 py-2 text-xs text-[#111827] tabular focus:outline-none focus:border-[#5B4DFF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Max accounts</label>
              <input
                type="number" min={0}
                value={form.max_accounts}
                onChange={e => setForm(f => ({ ...f, max_accounts: e.target.value }))}
                className="w-full bg-[#F7F8FC] border border-[#D1D5DB] rounded px-3 py-2 text-xs text-[#111827] tabular focus:outline-none focus:border-[#5B4DFF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Max kitta</label>
              <input
                type="number" min={0}
                value={form.max_kitta}
                onChange={e => setForm(f => ({ ...f, max_kitta: e.target.value }))}
                className="w-full bg-[#F7F8FC] border border-[#D1D5DB] rounded px-3 py-2 text-xs text-[#111827] tabular focus:outline-none focus:border-[#5B4DFF]"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-[#EF4444]">{formError}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-[#5B4DFF] text-white rounded text-xs font-semibold disabled:opacity-50 hover:bg-[#4C3FF0] transition-colors"
            >
              {saving ? 'Saving…' : 'Create rule'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(''); }}
              className="px-4 py-1.5 border border-[#D1D5DB] text-[#6b7280] rounded text-xs hover:border-[#9CA3AF] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="px-4 py-3 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg text-xs text-[#EF4444] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline font-medium">Retry</button>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[#6b7280] py-8 justify-center">
          <svg className="animate-spin h-4 w-4 text-[#5B4DFF]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading rules…
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-[#ffffff] border border-[#ECECF2] rounded-lg px-4 py-10 text-center">
          <p className="text-sm font-medium text-[#374151]">No automation rules yet</p>
          <p className="text-xs text-[#6b7280] mt-1">Create a rule to have the daily scheduler evaluate open IPOs for you.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="bg-[#ffffff] border border-[#ECECF2] rounded-lg p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-[#111827] truncate">{rule.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${BADGE_COLOR[rule.rule_type] || 'bg-[#9CA3AF]/20 text-[#6b7280]'}`}>
                    {rule.rule_type}
                  </span>
                </div>
                <p className="text-xs text-[#6b7280]">
                  {RULE_TYPE_LABEL[rule.rule_type] || rule.rule_type}
                  {rule.rule_type === 'sector_filter' && rule.sectors?.length ? ` — ${rule.sectors.join(', ')}` : ''}
                  {` · ${rule.kitta} kitta · ≤${rule.max_accounts} accounts · ≤${rule.max_kitta} kitta cap`}
                </p>
                <p className="text-[10px] text-[#9CA3AF] mt-1">Last run: {timeAgoUtc(rule.last_run_at)}</p>
              </div>
              <button
                onClick={() => onDelete(rule)}
                disabled={busyId === rule.id}
                className="text-xs text-[#9CA3AF] hover:text-[#EF4444] transition-colors disabled:opacity-40"
                title="Delete rule"
              >
                Delete
              </button>
              <button
                onClick={() => onToggle(rule)}
                disabled={busyId === rule.id}
                aria-pressed={rule.active}
                title={rule.active ? 'Disable rule' : 'Enable rule'}
                className={`w-9 h-5 rounded-full relative transition-colors disabled:opacity-50 ${rule.active ? 'bg-[#5B4DFF]' : 'bg-[#D1D5DB]'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rule.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
