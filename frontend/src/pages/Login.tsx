import { useState } from 'react';
import { useAuth } from '../auth';

export default function Login({ onSwitch }: { onSwitch: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: '#f2f5ef',
    border: '1px solid rgba(14,15,12,0.12)',
    color: '#0e0f0c',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fafaf8' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: '#9fe870' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#163300" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="text-xl font-bold" style={{ color: '#0e0f0c' }}>Hissa</div>
          <div className="text-sm mt-1" style={{ color: '#868685' }}>Your MeroShare, automated.</div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 p-6 rounded-card"
          style={{ background: '#fff', boxShadow: 'rgba(14,15,12,0.12) 0 0 0 1px' }}>

          {err && (
            <div className="rounded px-3 py-2 text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>
              {err}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="you@example.com" style={inputStyle} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••" style={inputStyle} />
          </div>

          <button type="submit" disabled={loading}
            className="rounded py-2.5 text-sm font-bold mt-1"
            style={{
              background: loading ? '#868685' : '#0e0f0c',
              color: '#9fe870',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <div className="text-center text-sm" style={{ color: '#868685' }}>
            No account?{' '}
            <button type="button" onClick={onSwitch} className="font-bold"
              style={{ color: '#163300', background: 'none', border: 'none', cursor: 'pointer' }}>
              Sign up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
