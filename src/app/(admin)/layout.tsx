'use client';

import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { useAdminStore } from '@/store/useAdminStore';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: dark ? '#071526' : '#f1f5f9' }}
    >
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main
          className="flex-1 overflow-y-auto p-6"
          style={{ background: dark ? '#071526' : '#f1f5f9' }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
