import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import AuthShell, { Field, SubmitButton, ErrorBanner } from './auth/AuthShell';

interface Props {
  onSignup: () => void;
  onForgot: () => void;
}

export default function Login({ onSignup, onForgot }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      // success: AuthProvider sets user; App re-renders to the app shell.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your accounts and IPOs."
      footer={
        <span>
          Don't have an account?{' '}
          <button onClick={onSignup} className="text-brand font-semibold hover:underline">
            Create one
          </button>
        </span>
      }
    >
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
        <div>
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <div className="text-right mt-1.5">
            <button
              type="button"
              onClick={onForgot}
              className="text-xs text-muted hover:text-brand transition-colors"
            >
              Forgot password?
            </button>
          </div>
        </div>
        <ErrorBanner message={error} />
        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
