'use client';

import { ReactNode, useEffect } from 'react';
import { useAdminStore } from '@/store/useAdminStore';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export default function Modal({ title, onClose, children, footer, wide }: Props) {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-10"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-xl border ${wide ? 'max-w-4xl' : 'max-w-xl'}`}
        style={{ background: dark ? 'linear-gradient(160deg, #1c1c22 0%, #101013 100%)' : '#ffffff', borderColor: dark ? '#1e1e2a' : '#e2e8f0' }}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: dark ? '#1e1e2a' : '#e2e8f0' }}>
          <h2 className="text-lg font-medium" style={{ color: dark ? '#f0f0f0' : '#0f172a' }}>{title}</h2>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: dark ? '#1e1e2a' : '#e2e8f0' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
