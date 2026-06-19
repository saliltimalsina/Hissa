import type { Alert } from '../lib/alerts';
import { Button } from '../components/ui';

interface Props {
  alerts: Alert[];
  readAlertIds: Set<string>;
  onMarkAllRead: () => void;
}

const COLORS: Record<Alert['type'], { dot: string }> = {
  success: { dot: 'bg-success' },
  error: { dot: 'bg-danger' },
  warn: { dot: 'bg-warn' },
  info: { dot: 'bg-brand' },
};

export default function Notifications({ alerts, readAlertIds, onMarkAllRead }: Props) {
  const unread = alerts.filter(a => !readAlertIds.has(a.id)).length;

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display text-ink">Alerts</h1>
          <p className="text-body text-muted mt-1">Derived live from account health and recent application failures</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onMarkAllRead} disabled={unread === 0}>
          Mark all read
        </Button>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white border border-line rounded-lg px-4 py-12 text-center">
          <p className="text-body font-medium text-body">No alerts</p>
          <p className="text-caption text-muted mt-1">
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
                    ? 'bg-white border-border'
                    : 'bg-transparent border-line opacity-60'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${c.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-caption font-semibold text-ink">{a.title}</p>
                  <p className="text-caption text-muted mt-0.5">{a.desc}</p>
                </div>
                {a.tsLabel && (
                  <span className="text-[10px] text-faint flex-shrink-0 tabular">{a.tsLabel}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
