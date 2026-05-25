import { useState } from 'react';
import { useAuth } from '../auth';

export default function Signup({ onSwitch }: { onSwitch: () => void }) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr('Passwords do not match'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await signup(email, password, name);
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
      <div style={{ width: '100%', maxWidth: 380 }}>
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
          <div className="text-sm mt-1" style={{ color: '#868685' }}>Create your account</div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 p-6 rounded-card"
          style={{ background: '#fff', boxShadow: 'rgba(14,15,12,0.12) 0 0 0 1px' }}>

          {err && (
            <div className="rounded px-3 py-2 text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>
              {err}
            </div>
          )}

          {[
            { label: 'Full Name', value: name, set: setName, type: 'text', placeholder: 'Ram Bahadur', req: false },
            { label: 'Email', value: email, set: setEmail, type: 'email', placeholder: 'you@example.com', req: true },
            { label: 'Password', value: password, set: setPassword, type: 'password', placeholder: '••••••••', req: true },
            { label: 'Confirm Password', value: confirm, set: setConfirm, type: 'password', placeholder: '••••••••', req: true },
          ].map(f => (
            <div key={f.label} className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#868685' }}>
                {f.label}
              </label>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)}
                required={f.req} placeholder={f.placeholder} style={inputStyle} />
            </div>
          ))}

          <button type="submit" disabled={loading}
            className="rounded py-2.5 text-sm font-bold mt-1"
            style={{
              background: loading ? '#868685' : '#0e0f0c',
              color: '#9fe870',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <div className="text-center text-sm" style={{ color: '#868685' }}>
            Already have an account?{' '}
            <button type="button" onClick={onSwitch} className="font-bold"
              style={{ color: '#163300', background: 'none', border: 'none', cursor: 'pointer' }}>
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
