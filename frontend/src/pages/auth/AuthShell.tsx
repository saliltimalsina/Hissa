import type { ReactNode } from 'react';

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
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FC] px-4 select-none">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-8 h-8 bg-[#5B4DFF] rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-base font-bold text-[#111827] leading-none">Hissa</p>
            <p className="text-[10px] text-[#6b7280] leading-none mt-0.5">Investment Terminal</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#ECECF2] rounded-2xl shadow-sm px-7 py-7">
          <h1 className="text-xl font-bold text-[#111827] tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-[#6B7280] mt-1.5">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="text-center text-xs text-[#6B7280] mt-5">{footer}</div>}
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
      <span className="block text-xs font-semibold text-[#374151] mb-1.5">{label}</span>
      <input
        {...props}
        className="w-full border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm text-[#111827] focus:outline-none focus:border-[#5B4DFF] placeholder-[#9CA3AF] transition-colors"
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
      className="w-full px-4 py-2.5 bg-[#5B4DFF] text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  );
}

/** Inline error banner. */
export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="px-3 py-2 bg-[#FEE7E7] border border-[#EF4444]/20 rounded-lg text-xs text-[#B91C1C]">
      {message}
    </div>
  );
}
