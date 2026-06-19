export default function Settings() {
  return (
    <div className="p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Settings</h1>
        <p className="text-sm text-[#6B7280] mt-1">Execution behavior and how alerts are derived</p>
      </div>

      {/* Honesty banner — no settings persistence endpoint exists yet. */}
      <div className="bg-[#5B4DFF]/5 border border-[#5B4DFF]/20 rounded-lg p-4">
        <p className="text-xs font-semibold text-[#5B4DFF] mb-1">Read-only for now</p>
        <p className="text-xs text-[#6b7280] leading-relaxed">
          These values describe how the backend currently behaves. There is no settings API yet, so they
          are shown for reference and cannot be edited from here. The values below reflect the server defaults.
        </p>
      </div>

      {/* Execution — informational, server-side defaults. */}
      <section>
        <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Execution (server defaults)</p>
        <div className="bg-[#ffffff] border border-[#ECECF2] rounded-lg divide-y divide-[#ECECF2]">
          {[
            { label: 'Concurrency', desc: 'Max parallel account operations', value: 'Server-managed' },
            { label: 'Retry behavior', desc: 'Failed applications are reported per-account in the execution console', value: 'No auto-retry' },
            { label: 'Idempotency', desc: 'Accounts that already applied to an IPO are skipped to prevent double-apply', value: 'Enabled' },
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

      {/* Alerts — explain how the bell/Alerts page is actually populated. */}
      <section>
        <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Alerts</p>
        <div className="bg-[#ffffff] border border-[#ECECF2] rounded-lg divide-y divide-[#ECECF2]">
          {[
            { label: 'Account health', desc: 'Expiring / expired / auth-failed accounts surface as alerts' },
            { label: 'Recent failures', desc: 'Failed applications from your application history appear as alerts' },
          ].map(s => (
            <div key={s.label} className="px-4 py-3">
              <p className="text-xs font-medium text-[#111827]">{s.label}</p>
              <p className="text-xs text-[#6b7280]">{s.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#9CA3AF] mt-2">
          Alerts are derived live from your accounts and history. There is no external notification channel
          (email / Telegram) wired up.
        </p>
      </section>
    </div>
  );
}
