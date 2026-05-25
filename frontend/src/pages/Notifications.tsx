const ALERTS = [
  { id: 1, type: 'warn', title: 'Account expiring in 3 days', desc: 'Account 166535 — password expires 2025-05-10', ts: '2 hours ago', read: false },
  { id: 2, type: 'error', title: 'Application failed', desc: '2 accounts failed TPKHL — insufficient ASBA balance', ts: '3 hours ago', read: false },
  { id: 3, type: 'success', title: 'Bulk apply complete', desc: 'TPKHL — 18/20 accounts applied successfully', ts: '3 hours ago', read: true },
  { id: 4, type: 'info', title: 'New IPO opened', desc: 'Sanima Equity Fund II — closes in 2 days', ts: '5 hours ago', read: true },
  { id: 5, type: 'warn', title: '3 accounts expiring soon', desc: 'Run health check to see affected accounts', ts: '1 day ago', read: true },
];

const COLORS: Record<string, { dot: string; icon: string }> = {
  success: { dot: 'bg-[#1F9D55]', icon: 'text-[#1F9D55]' },
  error: { dot: 'bg-[#EF4444]', icon: 'text-[#EF4444]' },
  warn: { dot: 'bg-[#F59E0B]', icon: 'text-[#F59E0B]' },
  info: { dot: 'bg-[#5B4DFF]', icon: 'text-[#5B4DFF]' },
};

export default function Notifications() {
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Alerts</h1>
          <p className="text-sm text-[#6B7280] mt-1">System notifications and operational alerts</p>
        </div>
        <button className="px-3 py-1.5 border border-[#D1D5DB] text-[#6b7280] rounded text-xs hover:text-[#374151] hover:border-[#9CA3AF] transition-colors">
          Mark all read
        </button>
      </div>

      <div className="space-y-1">
        {ALERTS.map(a => {
          const c = COLORS[a.type];
          return (
            <div
              key={a.id}
              className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                !a.read
                  ? 'bg-[#ffffff] border-[#D1D5DB]'
                  : 'bg-transparent border-[#ECECF2] opacity-60'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${c.dot}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#111827]">{a.title}</p>
                <p className="text-xs text-[#6b7280] mt-0.5">{a.desc}</p>
              </div>
              <span className="text-[10px] text-[#D1D5DB] flex-shrink-0 tabular">{a.ts}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
