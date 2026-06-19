import type { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';
import { Icon, Spinner } from '../../components/ui';

/** Shared visual frame for all auth screens — matches the Hissa brand. */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8 select-none">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center flex-shrink-0 text-white">
            <Icon icon={TrendingUp} size={18} strokeWidth={2.5} />
          </div>
          <div className="text-left">
            <p className="text-base font-bold text-ink leading-none">Hissa</p>
            <p className="text-[10px] text-muted leading-none mt-0.5">Investment Terminal</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-line rounded-2xl shadow-sm px-7 py-7">
          <h1 className="text-xl font-bold text-ink tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1.5">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="text-center text-xs text-muted mt-5">{footer}</div>}
      </div>
    </div>
  );
}

/** Shared input field styled to match the app. */
export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-body mb-1.5">{label}</span>
      <input
        {...props}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand placeholder-faint transition-colors"
      />
    </label>
  );
}

/** Primary submit button with spinner state. */
export function SubmitButton({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full px-4 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
    >
      {loading && <Spinner size="md" />}
      {children}
    </button>
  );
}

/** Inline error banner. */
export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="px-3 py-2 bg-danger-bg border border-danger/20 rounded-lg text-xs text-danger-fg">
      {message}
    </div>
  );
}
