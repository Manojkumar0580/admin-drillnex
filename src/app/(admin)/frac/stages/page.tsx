'use client';

import { useAdminStore } from '@/store/useAdminStore';

export default function FracStagesPage() {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';
  const text = dark ? '#f0f0f0' : '#0f172a';
  const muted = dark ? '#666666' : '#94a3b8';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: text }}>Frac Settings</h1>
      <div
        className="rounded-xl border flex flex-col items-center justify-center text-center py-24"
        style={{ background: dark ? 'linear-gradient(160deg, #1c1c22 0%, #101013 100%)' : '#ffffff', borderColor: dark ? '#1e1e2a' : '#e2e8f0' }}
      >
        <div className="text-5xl mb-4">🚧</div>
        <h2 className="text-2xl font-bold" style={{ color: text }}>Coming Soon</h2>
        <p className="text-sm mt-2" style={{ color: muted }}>
          Frac Settings is under development and will be available shortly.
        </p>
      </div>
    </div>
  );
}
