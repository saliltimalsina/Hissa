import { useState } from 'react';
import { api } from '../lib/api';
import AuthShell, { Field, SubmitButton, ErrorBanner } from './auth/AuthShell';

interface Props {
  onLogin: () => void;
}

const CONFIRMATION = 'If that email is registered, a reset link has been sent.';

export default function ForgotPassword({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setSent(true);
    } catch (err: unknown) {
      // Endpoint always 200s; only surface true network/server failures.
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle={sent ? undefined : 'Enter your email and we will send a reset link.'}
      footer={
        <button onClick={onLogin} className="text-brand font-semibold hover:underline">
          Back to sign in
        </button>
      }
    >
      {sent ? (
        <div className="px-3 py-3 bg-success-bg border border-success/20 rounded-lg text-sm text-success">
          {CONFIRMATION}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <ErrorBanner message={error} />
          <SubmitButton loading={loading}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
