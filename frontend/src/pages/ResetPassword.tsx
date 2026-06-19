import { useState } from 'react';
import { api } from '../lib/api';
import AuthShell, { Field, SubmitButton, ErrorBanner } from './auth/AuthShell';

function passwordError(pw: string): string {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain both letters and numbers.';
  return '';
}

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwErr = passwordError(password);
    if (pwErr) { setError(pwErr); return; }
    setError('');
    setLoading(true);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  const goLogin = () => { window.location.href = '/'; };

  return (
    <AuthShell
      title="Set a new password"
      subtitle={done ? undefined : 'Choose a new password for your account.'}
      footer={
        <button onClick={goLogin} className="text-[#5B4DFF] font-semibold hover:underline">
          Back to sign in
        </button>
      }
    >
      {done ? (
        <div className="space-y-4">
          <div className="px-3 py-3 bg-[#EAFBF1] border border-[#1F9D55]/20 rounded-lg text-sm text-[#1F9D55]">
            Your password has been reset.
          </div>
          <button
            onClick={goLogin}
            className="w-full px-4 py-2.5 bg-[#5B4DFF] text-white rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          >
            Go to sign in
          </button>
        </div>
      ) : !token ? (
        <ErrorBanner message="Missing reset token. Please use the link from your email." />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p className="text-[11px] text-[#9CA3AF] mt-1.5">At least 8 characters, with letters and numbers.</p>
          </div>
          <ErrorBanner message={error} />
          <SubmitButton loading={loading}>Reset password</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
