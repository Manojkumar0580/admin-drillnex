'use client';

import { useAdminStore } from '@/store/useAdminStore';
import { usePathname, useRouter } from 'next/navigation';
import { useAdminSession, initials } from '@/lib/useAdminSession';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/users': 'Users',
  '/companies': 'Companies',
  '/subscriptions': 'Subscriptions',
  '/settings': 'Settings',
  '/audit': 'Audit Logs',
  '/threshold/configurations': 'Threshold Settings',
  '/threshold/rig-maps': 'Rig Maps',
  '/threshold/rerun': 'Rerun',
  '/threshold/overwrite': 'Overwrite',
  '/accounting/invoicing': 'Invoicing',
  '/log-actions': 'Log Actions',
  '/frac/stages': 'Frac Settings',
  '/rtoc/analytics': 'RTOC',
  '/planning/npt-codes': 'Planning Settings',
  '/planning/npt-code-mapping': 'Planning Settings',
  '/release-management': 'Releases Management',
  '/witsml/channels': 'Channels',
  '/witsml/connections': 'Connections',
  '/witsml/wells': 'Wells',
  '/witsml/rigs': 'Rigs',
  '/witsml/logs': 'Logs',
  '/witsml/log-maps': 'Log Maps',
  '/witsml/pads': 'Pads',
  '/witsml/depth-data': 'Depth Data',
  '/witsml/holesection-bitsize': 'HoleSection-BitSize mapping',
};

export default function Header() {
  const { theme, toggleTheme } = useAdminStore();
  const pathname = usePathname();
  const router = useRouter();
  const { data: admin } = useAdminSession();

  const signOut = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  };
  const dark = theme === 'dark';

  const title = PAGE_TITLES[pathname] ?? 'Dashboard';

  return (
    <header
      className="flex items-center h-14 px-6 border-b flex-shrink-0"
      style={{
        background: dark ? '#0d0d12' : '#ffffff',
        borderColor: dark ? '#1a1a24' : '#e2e8f0',
      }}
    >
      {/* Left — Page title */}
      <div className="flex items-center gap-2 text-sm" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Home</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ color: dark ? '#e2e8f0' : '#1e293b' }} className="font-medium">{title}</span>
      </div>

      {/* Center — Brand */}
      <div className="flex-1 flex justify-center">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: '#1d6fbf' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="text-sm font-bold" style={{ color: dark ? '#ffffff' : '#0f172a' }}>
            DrillNex <span style={{ color: '#64b5f6' }}>Admin</span>
          </span>
        </div>
      </div>

      {/* Right — Notifications + Theme + Profile */}
      <div className="flex items-center gap-3">
        {/* Bell */}
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: dark ? '#888' : '#64748b' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = dark ? '#1f1f1f' : '#f1f5f9'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"></span>
        </button>

        {/* Dark/Light toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: dark ? '#1a1a1a' : '#f1f5f9',
            color: dark ? '#aaaaaa' : '#475569',
            border: dark ? '1px solid #2a2a2a' : '1px solid #e2e8f0',
          }}
          title={dark ? 'Switch to Light mode' : 'Switch to Dark mode'}
        >
          {dark ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              <span>Light</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
              <span>Dark</span>
            </>
          )}
        </button>

        {/* Profile */}
        <div className="flex items-center gap-3 pl-3 border-l" style={{ borderColor: dark ? '#1e1e2a' : '#e2e8f0' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: '#1d6fbf', color: 'white' }}>
            {initials(admin?.name)}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-medium leading-tight" style={{ color: dark ? '#e2e8f0' : '#1e293b' }}>
              {admin?.name ?? 'Super Admin'}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: dark ? '#1a1a1a' : '#f1f5f9',
              color: dark ? '#aaaaaa' : '#475569',
              border: dark ? '1px solid #2a2a2a' : '1px solid #e2e8f0',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
