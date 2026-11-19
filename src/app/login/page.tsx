'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'credentials' | 'totp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const totpRef = useRef<HTMLInputElement>(null);

  async function onSubmitCredentials(e: FormEvent) {
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
      if (!res.ok) { setError(data.message || 'Login failed'); return; }

      if (data.requires2FA) {
        setStep('totp');
        setTimeout(() => totpRef.current?.focus(), 50);
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

  async function onSubmitTotp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, totpCode: totpCode.replace(/\s/g, '') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message || 'Invalid code'); return; }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong, please try again');
    } finally {
      setLoading(false);
    }
  }

  const input = 'w-full text-sm px-3 py-2.5 rounded-lg outline-none';
  const inputStyle = { background: '#101016', border: '1px solid #2a2a2a', color: '#f0f0f0' };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#070709' }}>
      <div
        className="w-full max-w-sm rounded-xl p-8 space-y-5"
        style={{ background: 'linear-gradient(160deg, #1c1c22 0%, #101013 100%)', border: '1px solid #1e1e2a', boxShadow: '0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)' }}
      >
        <div className="text-center">
          <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center" style={{ background: '#1d6fbf' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mt-4">
            DrillNex <span style={{ color: '#64b5f6' }}>Admin</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            {step === 'credentials' ? 'Sign in to the administration panel' : 'Enter your authenticator code'}
          </p>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={onSubmitCredentials} className="space-y-4">
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
            {error && <ErrorBanner message={error} />}
            <button type="submit" disabled={loading}
              className="w-full text-sm font-semibold py-2.5 rounded-lg text-white disabled:opacity-60"
              style={{ background: '#1d6fbf' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitTotp} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="totp" className="text-xs font-medium" style={{ color: '#94a3b8' }}>
                Authenticator code
              </label>
              <input
                id="totp" ref={totpRef} type="text" inputMode="numeric" pattern="\d{6}"
                maxLength={6} required autoComplete="one-time-code"
                value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" className={input + ' text-center tracking-widest text-lg'} style={inputStyle} />
            </div>
            <p className="text-xs text-center" style={{ color: '#64748b' }}>
              Open your authenticator app and enter the 6-digit code.
            </p>
            {error && <ErrorBanner message={error} />}
            <button type="submit" disabled={loading || totpCode.length !== 6}
              className="w-full text-sm font-semibold py-2.5 rounded-lg text-white disabled:opacity-60"
              style={{ background: '#1d6fbf' }}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" onClick={() => { setStep('credentials'); setTotpCode(''); setError(''); }}
              className="w-full text-xs py-1.5 rounded-lg" style={{ color: '#64748b' }}>
              ← Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs rounded-lg px-3 py-2"
      style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
      {message}
    </p>
  );
}
