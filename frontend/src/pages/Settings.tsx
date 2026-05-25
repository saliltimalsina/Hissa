export default function Settings() {
  return (
    <div className="p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Settings</h1>
        <p className="text-sm text-[#6B7280] mt-1">Configure execution, appearance, and notifications</p>
      </div>

      {/* Execution */}
      <section>
        <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Execution</p>
        <div className="bg-[#ffffff] border border-[#ECECF2] rounded-lg divide-y divide-[#ECECF2]">
          {[
            { label: 'Concurrency', desc: 'Max parallel account operations', type: 'number', value: '5', unit: 'threads' },
            { label: 'Retry Count', desc: 'Retry failed applications', type: 'number', value: '2', unit: 'retries' },
            { label: 'Delay Between Accounts', desc: 'Wait between each account operation', type: 'number', value: '500', unit: 'ms' },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-medium text-[#111827]">{s.label}</p>
                <p className="text-xs text-[#6b7280]">{s.desc}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type={s.type}
                  defaultValue={s.value}
                  className="w-16 bg-[#F7F8FC] border border-[#D1D5DB] rounded px-2 py-1 text-xs text-[#111827] text-center tabular focus:outline-none focus:border-[#5B4DFF]"
                />
                <span className="text-xs text-[#6b7280]">{s.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Appearance */}
      <section>
        <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Appearance</p>
        <div className="bg-[#ffffff] border border-[#ECECF2] rounded-lg divide-y divide-[#ECECF2]">
          {[
            { label: 'Theme', desc: 'Color scheme', value: 'Dark (default)' },
            { label: 'Density', desc: 'UI information density', value: 'Compact' },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-medium text-[#111827]">{s.label}</p>
                <p className="text-xs text-[#6b7280]">{s.desc}</p>
              </div>
              <span className="text-xs text-[#6b7280] border border-[#D1D5DB] rounded px-2 py-1">{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Notifications */}
      <section>
        <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Notifications</p>
        <div className="bg-[#ffffff] border border-[#ECECF2] rounded-lg divide-y divide-[#ECECF2]">
          {[
            { label: 'IPO Opening Alerts', enabled: true },
            { label: 'Expiry Warnings', enabled: true },
            { label: 'Application Results', enabled: true },
            { label: 'Telegram Integration', enabled: false },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between px-4 py-3">
              <p className="text-xs font-medium text-[#111827]">{s.label}</p>
              <div className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${s.enabled ? 'bg-[#5B4DFF]' : 'bg-[#D1D5DB]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Backend */}
      <section>
        <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Backend</p>
        <div className="bg-[#ffffff] border border-[#ECECF2] rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-[#111827] mb-1">API Endpoint</p>
          <p className="text-xs text-[#6b7280] font-mono">http://localhost:8000 (proxied via Vite)</p>
        </div>
      </section>
    </div>
  );
}
