import type { Alert } from '../lib/alerts';

interface Props {
  alerts: Alert[];
  readAlertIds: Set<string>;
  onMarkAllRead: () => void;
}

const COLORS: Record<Alert['type'], { dot: string }> = {
  success: { dot: 'bg-[#1F9D55]' },
  error: { dot: 'bg-[#EF4444]' },
  warn: { dot: 'bg-[#F59E0B]' },
  info: { dot: 'bg-[#5B4DFF]' },
};

export default function Notifications({ alerts, readAlertIds, onMarkAllRead }: Props) {
  const unread = alerts.filter(a => !readAlertIds.has(a.id)).length;

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Alerts</h1>
          <p className="text-sm text-[#6B7280] mt-1">Derived live from account health and recent application failures</p>
        </div>
        <button
          onClick={onMarkAllRead}
          disabled={unread === 0}
          className="px-3 py-1.5 border border-[#D1D5DB] text-[#6b7280] rounded text-xs hover:text-[#374151] hover:border-[#9CA3AF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mark all read
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-[#ffffff] border border-[#ECECF2] rounded-lg px-4 py-12 text-center">
          <p className="text-sm font-medium text-[#374151]">No alerts</p>
          <p className="text-xs text-[#6b7280] mt-1">
            Nothing needs your attention. Account-health warnings and failed applications will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {alerts.map(a => {
            const c = COLORS[a.type];
            const read = readAlertIds.has(a.id);
            return (
              <div
                key={a.id}
                className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                  !read
                    ? 'bg-[#ffffff] border-[#D1D5DB]'
                    : 'bg-transparent border-[#ECECF2] opacity-60'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${c.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#111827]">{a.title}</p>
                  <p className="text-xs text-[#6b7280] mt-0.5">{a.desc}</p>
                </div>
                {a.tsLabel && (
                  <span className="text-[10px] text-[#9CA3AF] flex-shrink-0 tabular">{a.tsLabel}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
