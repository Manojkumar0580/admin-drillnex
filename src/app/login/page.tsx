'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Login failed');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong, please try again');
    } finally {
      setLoading(false);
    }
  }

  const input = 'w-full text-sm px-3 py-2.5 rounded-lg outline-none';
  const inputStyle = { background: '#0f1f35', border: '1px solid #1e3a5f', color: '#f1f5f9' };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#071526' }}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl p-8 space-y-5"
        style={{ background: '#0d1b2e', border: '1px solid #1e3a5f' }}
      >
        <div className="text-center">
          <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center" style={{ background: '#1d6fbf' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mt-4">
            RigPulse <span style={{ color: '#64b5f6' }}>Admin</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>Sign in to the administration panel</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-medium" style={{ color: '#94a3b8' }}>Email</label>
          <input id="email" type="email" required autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} className={input} style={inputStyle} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium" style={{ color: '#94a3b8' }}>Password</label>
          <input id="password" type="password" required autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={input} style={inputStyle} />
        </div>

        {error && (
          <p role="alert" className="text-xs rounded-lg px-3 py-2"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}
          className="w-full text-sm font-semibold py-2.5 rounded-lg text-white disabled:opacity-60"
          style={{ background: '#1d6fbf' }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
