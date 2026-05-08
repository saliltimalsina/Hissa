import { useState, useEffect, useCallback } from 'react';
import { fetchSchedulerRules, createSchedulerRule, toggleSchedulerRule, deleteSchedulerRule } from '../api';
import type { SchedulerRule } from '../types';

const B = 'rgba(14,15,12,0.08)';
const BR = 'rgba(14,15,12,0.12)';

const SECTORS = [
  'Hydropower', 'Commercial Banks', 'Development Banks', 'Finance Companies',
  'Microfinance', 'Insurance', 'Investment', 'Manufacturing', 'Hotels',
  'Trading', 'Others',
];

export default function Automation() {
  const [rules, setRules] = useState<SchedulerRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', rule_type: 'auto_all' as 'auto_all' | 'sector_filter',
    kitta: 10, sectors: [] as string[],
  });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await fetchSchedulerRules());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const rule = await createSchedulerRule({
        name: form.name,
        rule_type: form.rule_type,
        kitta: form.kitta,
        sectors: form.rule_type === 'sector_filter' ? form.sectors : undefined,
      });
      setRules(r => [rule, ...r]);
      setShowCreate(false);
      setForm({ name: '', rule_type: 'auto_all', kitta: 10, sectors: [] });
    } catch { /* silent */ } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: number) {
    const updated = await toggleSchedulerRule(id);
    setRules(r => r.map(x => x.id === id ? updated : x));
  }

  async function handleDelete(id: number) {
    await deleteSchedulerRule(id);
    setRules(r => r.filter(x => x.id !== id));
  }

  function toggleSector(s: string) {
    setForm(f => ({
      ...f,
      sectors: f.sectors.includes(s) ? f.sectors.filter(x => x !== s) : [...f.sectors, s],
    }));
  }

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <div className="text-base font-bold" style={{ color: '#0e0f0c' }}>Automation</div>
          <div className="text-xs" style={{ color: '#868685' }}>
            Auto-apply rules run every 15 min — apply when new IPOs open
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(v => !v)}
          className="text-xs font-semibold px-3 py-1.5 rounded"
          style={{ background: '#0e0f0c', color: '#9fe870', border: 'none', cursor: 'pointer' }}>
          + New Rule
        </button>
      </div>

      {/* How it works */}
      <div className="rounded-card p-4 space-y-1"
        style={{ background: 'rgba(159,232,112,0.08)', boxShadow: '#9fe870 0 0 0 1px' }}>
        <div className="text-xs font-bold" style={{ color: '#163300' }}>How it works</div>
        <div className="text-xs" style={{ color: '#454745' }}>
          Rules run every 15 minutes in the background. When a new IPO opens that matches your criteria,
          it automatically applies on all your accounts. Application history is recorded under History.
          Scheduler only runs while the server is running.
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-card p-4 space-y-4" style={{ background: '#fff', boxShadow: `${BR} 0 0 0 1px` }}>
          <div className="text-sm font-bold" style={{ color: '#0e0f0c' }}>New Auto-Apply Rule</div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Rule Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  placeholder="e.g. Apply all IPOs"
                  className="rounded px-2.5 py-1.5 text-xs outline-none"
                  style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c' }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Type</label>
                <select value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value as any }))}
                  className="rounded px-2.5 py-1.5 text-xs outline-none"
                  style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c' }}>
                  <option value="auto_all">All IPOs (apply everything)</option>
                  <option value="sector_filter">Sector filter (pick sectors)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Kitta per account</label>
                <input type="number" min={1} max={500} value={form.kitta}
                  onChange={e => setForm(f => ({ ...f, kitta: parseInt(e.target.value) || 10 }))}
                  className="rounded px-2.5 py-1.5 text-xs outline-none"
                  style={{ background: '#f2f5ef', border: `1px solid ${B}`, color: '#0e0f0c' }} />
              </div>
            </div>

            {form.rule_type === 'sector_filter' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Sectors</label>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map(s => (
                    <button key={s} type="button" onClick={() => toggleSector(s)}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-pill"
                      style={{
                        background: form.sectors.includes(s) ? '#9fe870' : '#f2f5ef',
                        color: form.sectors.includes(s) ? '#163300' : '#454745',
                        border: 'none', cursor: 'pointer',
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" disabled={creating}
                className="text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-40"
                style={{ background: '#9fe870', color: '#163300', border: 'none', cursor: 'pointer' }}>
                {creating ? 'Creating…' : 'Create Rule'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-xs font-semibold px-3 py-1.5 rounded"
                style={{ background: '#f2f5ef', color: '#454745', border: `1px solid ${B}`, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules list */}
      <div className="rounded-card overflow-hidden" style={{ boxShadow: `${BR} 0 0 0 1px` }}>
        <div className="px-4 py-2.5 flex items-center justify-between"
          style={{ background: '#f2f5ef', borderBottom: `1px solid ${B}` }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>
            Rules ({rules.length})
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm" style={{ color: '#868685', background: '#fff' }}>Loading…</div>
        ) : rules.length === 0 ? (
          <div className="py-12 text-center space-y-2" style={{ background: '#fff' }}>
            <div className="text-sm font-semibold" style={{ color: '#454745' }}>No rules yet</div>
            <div className="text-xs" style={{ color: '#868685' }}>Create a rule to auto-apply when new IPOs open</div>
          </div>
        ) : (
          <div style={{ background: '#fff' }}>
            {rules.map((rule, i) => (
              <div key={rule.id}
                className="px-4 py-3 flex items-center gap-3"
                style={{ borderBottom: i < rules.length - 1 ? `1px solid ${B}` : 'none' }}>

                {/* Toggle */}
                <button onClick={() => handleToggle(rule.id)}
                  className="w-8 h-4 rounded-full flex-shrink-0 relative"
                  style={{
                    background: rule.active ? '#9fe870' : '#e8ebe6',
                    border: 'none', cursor: 'pointer', padding: 0,
                  }}>
                  <div className="w-3 h-3 rounded-full absolute top-0.5"
                    style={{
                      background: '#fff',
                      left: rule.active ? '18px' : '2px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      transition: 'left 0.15s',
                    }} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: rule.active ? '#0e0f0c' : '#868685' }}>
                      {rule.name}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill"
                      style={{ background: '#f2f5ef', color: '#454745' }}>
                      {rule.rule_type === 'auto_all' ? 'All IPOs' : 'Sector filter'}
                    </span>
                    <span className="text-[10px]" style={{ color: '#868685' }}>
                      {rule.kitta} kitta/account
                    </span>
                  </div>
                  {rule.sectors && rule.sectors.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {rule.sectors.map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(159,232,112,0.15)', color: '#163300' }}>{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] mt-1" style={{ color: '#868685' }}>
                    Last run: {fmt(rule.last_run_at)} · Created {new Date(rule.created_at).toLocaleDateString()}
                  </div>
                </div>

                <button onClick={() => handleDelete(rule.id)}
                  className="text-[10px] font-semibold px-2 py-1 rounded flex-shrink-0"
                  style={{ background: 'rgba(208,50,56,0.08)', color: '#d03238', border: 'none', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
