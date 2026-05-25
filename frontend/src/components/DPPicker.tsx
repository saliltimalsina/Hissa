import { useState, useMemo, useRef, useEffect } from 'react';
import type { Broker } from '../types';

export default function DPPicker({ brokers, onSelect }: { brokers: Broker[]; onSelect: (b: Broker) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Broker | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return brokers;
    const q = query.toLowerCase();
    return brokers.filter(b => b.name.toLowerCase().includes(q) || b.code.includes(q));
  }, [brokers, query]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function pick(b: Broker) {
    setSelected(b);
    setQuery(b.name);
    setOpen(false);
    onSelect(b);
  }

  return (
    <div ref={ref} className="relative" style={{ minWidth: 180 }}>
      <input
        autoFocus
        value={query}
        onChange={e => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search depository participant…"
        className="w-full px-2 py-1 rounded text-xs outline-none"
        style={{
          background: selected ? '#e2f6d5' : 'var(--surface)',
          border: `1px solid ${selected ? '#9fe870' : 'var(--border)'}`,
          color: 'var(--text)',
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded-card overflow-hidden"
          style={{ background: 'var(--surface)', boxShadow: 'rgba(14,15,12,0.15) 0px 8px 24px -4px, var(--shadow-ring)', minWidth: 280, maxHeight: 360, overflowY: 'auto' }}>
          {filtered.map(b => (
            <button key={b.id} onMouseDown={() => pick(b)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
              style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
              <span className="text-xs font-medium flex-1" style={{ color: 'var(--text)' }}>{b.name}</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>{b.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
