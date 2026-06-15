import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import AuthShell, { Field, SubmitButton, ErrorBanner } from './auth/AuthShell';

interface Props {
  onLogin: () => void;
}

// Mirror of the server rule: min 8 chars, must contain letters AND numbers.
function passwordError(pw: string): string {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain both letters and numbers.';
  return '';
}

export default function Signup({ onLogin }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwErr = passwordError(password);
    if (pwErr) { setError(pwErr); return; }
    setError('');
    setLoading(true);
    try {
      await signup(email.trim(), password, name.trim() || undefined);
    } catch (err: any) {
      setError(err.message || 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start applying to IPOs across all your MeroShare accounts."
      footer={
        <span>
          Already have an account?{' '}
          <button onClick={onLogin} className="text-[#5B4DFF] font-semibold hover:underline">
            Sign in
          </button>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Name (optional)"
          type="text"
          autoComplete="name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
        />
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
            autoComplete="new-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <p className="text-[11px] text-[#9CA3AF] mt-1.5">At least 8 characters, with letters and numbers.</p>
        </div>
        <ErrorBanner message={error} />
        <SubmitButton loading={loading}>Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}
