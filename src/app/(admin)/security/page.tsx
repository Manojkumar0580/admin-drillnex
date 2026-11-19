'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminSession } from '@/lib/useAdminSession';

type Phase = 'idle' | 'setup' | 'disabling';

export default function SecurityPage() {
  const { data: admin } = useAdminSession();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [pendingSecret, setPendingSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const enabled = admin?.totpEnabled ?? false;

  async function startSetup() {
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch('/api/backend/auth/2fa/setup');
      const data = await res.json();
      if (!res.ok) { setStatus({ ok: false, msg: data.message || 'Setup failed' }); return; }
      setQrDataUrl(data.qrDataUrl);
      setPendingSecret(data.pendingSecret);
      setPhase('setup');
    } catch {
      setStatus({ ok: false, msg: 'Network error' });
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    if (verifyCode.length !== 6) return;
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch('/api/backend/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingSecret, totpCode: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus({ ok: false, msg: data.message || 'Verification failed' }); return; }
      setStatus({ ok: true, msg: '2FA is now enabled on your account.' });
      setPhase('idle');
      setVerifyCode('');
      void queryClient.invalidateQueries({ queryKey: ['admin-session'] });
    } catch {
      setStatus({ ok: false, msg: 'Network error' });
    } finally {
      setLoading(false);
    }
  }

  async function confirmDisable() {
    if (disableCode.length !== 6) return;
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch('/api/backend/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus({ ok: false, msg: data.message || 'Failed to disable 2FA' }); return; }
      setStatus({ ok: true, msg: '2FA has been disabled.' });
      setPhase('idle');
      setDisableCode('');
      void queryClient.invalidateQueries({ queryKey: ['admin-session'] });
    } catch {
      setStatus({ ok: false, msg: 'Network error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-1">Security</h1>
      <p className="text-sm mb-6" style={{ color: '#94a3b8' }}>
        Manage two-factor authentication for your admin account.
      </p>

      <div className="rounded-xl p-5 space-y-4" style={{ background: '#1c1c22', border: '1px solid #2a2a2a' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Authenticator App (TOTP)</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
              Google Authenticator, Authy, 1Password, etc.
            </p>
          </div>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={enabled
              ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80' }
              : { background: 'rgba(100,116,139,0.15)', color: '#64748b' }}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {status && (
          <p className="text-xs rounded-lg px-3 py-2"
            style={status.ok
              ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }
              : { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            {status.msg}
          </p>
        )}

        {phase === 'idle' && !enabled && (
          <button onClick={startSetup} disabled={loading}
            className="w-full text-sm font-semibold py-2.5 rounded-lg text-white disabled:opacity-60"
            style={{ background: '#1d6fbf' }}>
            {loading ? 'Loading…' : 'Set up 2FA'}
          </button>
        )}

        {phase === 'setup' && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
            </p>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="TOTP QR code" className="rounded-lg mx-auto block"
                style={{ width: 180, height: 180, background: '#fff', padding: 8 }} />
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>Verification code</label>
              <input
                type="text" inputMode="numeric" maxLength={6} pattern="\d{6}"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full text-sm text-center tracking-widest px-3 py-2.5 rounded-lg outline-none"
                style={{ background: '#101016', border: '1px solid #2a2a2a', color: '#f0f0f0' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={confirmSetup} disabled={loading || verifyCode.length !== 6}
                className="flex-1 text-sm font-semibold py-2.5 rounded-lg text-white disabled:opacity-60"
                style={{ background: '#1d6fbf' }}>
                {loading ? 'Verifying…' : 'Enable 2FA'}
              </button>
              <button onClick={() => { setPhase('idle'); setStatus(null); }}
                className="text-sm py-2.5 px-4 rounded-lg" style={{ background: '#2a2a2a', color: '#94a3b8' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === 'idle' && enabled && (
          <div className="space-y-3">
            {phase === 'idle' && (
              <button onClick={() => setPhase('disabling')}
                className="w-full text-sm font-semibold py-2.5 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                Disable 2FA
              </button>
            )}
          </div>
        )}

        {phase === 'disabling' && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Enter your current authenticator code to confirm you want to disable 2FA.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>Authenticator code</label>
              <input
                type="text" inputMode="numeric" maxLength={6} pattern="\d{6}"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full text-sm text-center tracking-widest px-3 py-2.5 rounded-lg outline-none"
                style={{ background: '#101016', border: '1px solid #2a2a2a', color: '#f0f0f0' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={confirmDisable} disabled={loading || disableCode.length !== 6}
                className="flex-1 text-sm font-semibold py-2.5 rounded-lg disabled:opacity-60"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                {loading ? 'Disabling…' : 'Confirm disable'}
              </button>
              <button onClick={() => { setPhase('idle'); setStatus(null); setDisableCode(''); }}
                className="text-sm py-2.5 px-4 rounded-lg" style={{ background: '#2a2a2a', color: '#94a3b8' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
