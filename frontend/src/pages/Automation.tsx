const RULES = [
  {
    id: 1,
    name: 'Auto Apply Minimum',
    desc: 'When IPO opens → Apply minimum kitta to all eligible accounts',
    enabled: false,
    badge: 'IPO',
  },
  {
    id: 2,
    name: 'Skip Low Balance',
    desc: 'Skip accounts with ASBA balance below NPR 2,000',
    enabled: true,
    badge: 'Filter',
  },
  {
    id: 3,
    name: 'Expiry Protection',
    desc: 'Disable expired accounts automatically before execution',
    enabled: true,
    badge: 'Safety',
  },
  {
    id: 4,
    name: 'Closing Soon Alert',
    desc: 'Notify 24h before IPO closes if not yet applied',
    enabled: false,
    badge: 'Alert',
  },
];

const BADGE_COLOR: Record<string, string> = {
  IPO: 'bg-[#5B4DFF]/20 text-[#5B4DFF]',
  Filter: 'bg-[#F59E0B]/20 text-[#F59E0B]',
  Safety: 'bg-[#1F9D55]/20 text-[#1F9D55]',
  Alert: 'bg-[#EF4444]/20 text-[#EF4444]',
};

export default function Automation() {
  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Automation</h1>
          <p className="text-sm text-[#6B7280] mt-1">Rules that run automatically on trigger events</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5B4DFF] text-white rounded text-xs font-medium opacity-50 cursor-not-allowed">
          + New Rule
        </button>
      </div>

      <div className="space-y-2">
        {RULES.map(rule => (
          <div key={rule.id} className="bg-[#ffffff] border border-[#ECECF2] rounded-lg p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-[#111827]">{rule.name}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${BADGE_COLOR[rule.badge]}`}>{rule.badge}</span>
              </div>
              <p className="text-xs text-[#6b7280]">{rule.desc}</p>
            </div>
            <div className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${rule.enabled ? 'bg-[#5B4DFF]' : 'bg-[#D1D5DB]'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[#5B4DFF]/5 border border-[#5B4DFF]/20 rounded-lg p-4">
        <p className="text-xs font-semibold text-[#5B4DFF] mb-1">Coming soon</p>
        <p className="text-xs text-[#6b7280]">Visual workflow builder — create complex automation chains like n8n / GitHub Actions. Trigger-condition-action pipelines with MeroShare events.</p>
      </div>
    </div>
  );
}
