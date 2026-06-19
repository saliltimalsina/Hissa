export default function Settings() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-display text-ink">Settings</h1>
        <p className="text-body text-muted mt-1">Execution behavior and how alerts are derived</p>
      </div>

      {/* Honesty banner — no settings persistence endpoint exists yet. */}
      <div className="bg-brand/5 border border-brand/20 rounded-lg p-4">
        <p className="text-caption font-semibold text-brand mb-1">Read-only for now</p>
        <p className="text-caption text-muted leading-relaxed">
          These values describe how the backend currently behaves. There is no settings API yet, so they
          are shown for reference and cannot be edited from here. The values below reflect the server defaults.
        </p>
      </div>

      {/* Execution — informational, server-side defaults. */}
      <section>
        <p className="text-overline text-muted mb-3">Execution (server defaults)</p>
        <div className="bg-white border border-line rounded-lg divide-y divide-line">
          {[
            { label: 'Concurrency', desc: 'Max parallel account operations', value: 'Server-managed' },
            { label: 'Retry behavior', desc: 'Failed applications are reported per-account in the execution console', value: 'No auto-retry' },
            { label: 'Idempotency', desc: 'Accounts that already applied to an IPO are skipped to prevent double-apply', value: 'Enabled' },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-caption font-medium text-ink">{s.label}</p>
                <p className="text-caption text-muted">{s.desc}</p>
              </div>
              <span className="text-caption text-muted border border-border rounded px-2 py-1">{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Alerts — explain how the bell/Alerts page is actually populated. */}
      <section>
        <p className="text-overline text-muted mb-3">Alerts</p>
        <div className="bg-white border border-line rounded-lg divide-y divide-line">
          {[
            { label: 'Account health', desc: 'Expiring / expired / auth-failed accounts surface as alerts' },
            { label: 'Recent failures', desc: 'Failed applications from your application history appear as alerts' },
          ].map(s => (
            <div key={s.label} className="px-4 py-3">
              <p className="text-caption font-medium text-ink">{s.label}</p>
              <p className="text-caption text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-faint mt-2">
          Alerts are derived live from your accounts and history. There is no external notification channel
          (email / Telegram) wired up.
        </p>
      </section>
    </div>
  );
}
