'use client';

import { ReactNode } from 'react';
import { useAdminStore } from '@/store/useAdminStore';

/** Theme-aware colours shared by the hand-built admin pages. */
export function useColors() {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';
  const border = dark ? '#1e3a5f' : '#e2e8f0';
  const text = dark ? '#f1f5f9' : '#0f172a';
  return {
    dark,
    border,
    text,
    cardBg: dark ? '#0d1b2e' : '#ffffff',
    muted: dark ? '#64748b' : '#94a3b8',
    inputStyle: { background: dark ? '#0f1f35' : '#f8fafc', borderColor: border, color: text },
  };
}

const TONES = { green: '#22c55e', red: '#ef4444', amber: '#f59e0b', gray: '#94a3b8', blue: '#1a8cff' } as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  const c = TONES[tone];
  return (
    <span title={title} className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${c}1f`, color: c, border: `1px solid ${c}55` }}>
      {children}
    </span>
  );
}

const BTN = {
  primary: '#1d6fbf', success: '#16a34a', danger: '#dc2626', neutral: '#475569',
} as const;

export function Btn({
  kind = 'primary', small, onClick, disabled, children, title, type = 'button', form,
}: {
  kind?: keyof typeof BTN; small?: boolean; onClick?: () => void; disabled?: boolean; children: ReactNode;
  title?: string; type?: 'button' | 'submit'; form?: string;
}) {
  return (
    <button type={type} form={form} onClick={onClick} disabled={disabled} title={title}
      className={`${small ? 'text-xs px-2.5 py-1' : 'text-sm px-4 py-2'} font-semibold rounded-lg text-white disabled:opacity-50`}
      style={{ background: BTN[kind] }}>
      {children}
    </button>
  );
}

export function FormRow({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  const { text, muted } = useColors();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-1 sm:gap-3 sm:items-center">
      <label htmlFor={htmlFor} className="text-sm font-semibold sm:text-right" style={{ color: text }}>{label}</label>
      <div>
        {children}
        {hint && <p className="text-xs mt-1" style={{ color: muted }}>{hint}</p>}
      </div>
    </div>
  );
}

export function Notice({ kind, children, onClose }: { kind: 'ok' | 'error'; children: ReactNode; onClose?: () => void }) {
  const c = kind === 'ok' ? TONES.green : TONES.red;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="flex items-start justify-between gap-3 text-sm rounded-lg px-4 py-3"
      style={{ background: `${c}14`, color: c, border: `1px solid ${c}55` }}>
      <span>{children}</span>
      {onClose && <button onClick={onClose} aria-label="Dismiss" className="font-bold leading-none">×</button>}
    </div>
  );
}
