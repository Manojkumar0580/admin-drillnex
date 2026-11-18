'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminStore } from '@/store/useAdminStore';
import { useAdminSession, initials } from '@/lib/useAdminSession';

const NAV = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    label: 'RTOC',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    children: [
      { label: 'RTOC Dashboard', href: '/rtoc/dashboard' },
      { label: 'Analytics Status', href: '/rtoc/analytics' },
      { label: 'Planning Status', href: '/rtoc/planning' },
      { label: 'Data Cleanup', href: '/rtoc/data-cleanup' },
      { label: 'Inbox Messages', href: '/rtoc/inbox' },
      { label: 'Survey Configuration', href: '/rtoc/survey' },
      { label: 'T&C Threshold Overrides', href: '/rtoc/tc-thresholds' },
      { label: 'Health Check', href: '/rtoc/health' },
      { label: 'Automated Report', href: '/rtoc/auto-report' },
      { label: 'Frac Data Cleanup', href: '/rtoc/frac-cleanup' },
      { label: 'Mud Log Cleanup', href: '/rtoc/mud-log-cleanup' },
      { label: 'ProINSIGHT Inj Wells', href: '/rtoc/proinsight' },
    ],
  },
  {
    label: 'WITSML Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
    children: [
      { label: 'Channels', href: '/witsml/channels' },
      { label: 'Connections', href: '/witsml/connections' },
      { label: 'Wells', href: '/witsml/wells' },
      { label: 'Rigs', href: '/witsml/rigs' },
      { label: 'Logs', href: '/witsml/logs' },
      { label: 'Log Maps', href: '/witsml/log-maps' },
      { label: 'Pads', href: '/witsml/pads' },
      { label: 'Depth Data', href: '/witsml/depth-data' },
      { label: 'HoleSection-BitSize mapping', href: '/witsml/holesection-bitsize' },
    ],
  },
  {
    label: 'Threshold Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
      </svg>
    ),
    children: [
      { label: 'Configurations', href: '/threshold/configurations' },
      { label: 'Rig Maps', href: '/threshold/rig-maps' },
      { label: 'Rerun', href: '/threshold/rerun' },
      { label: 'Overwrite', href: '/threshold/overwrite' },
    ]
  },
  {
    label: 'Planning Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    children: [
      { label: 'Moblize NPT Codes', href: '/planning/npt-codes' },
      { label: 'NPT Code Mapping', href: '/planning/npt-code-mapping' },
    ],
  },
  {
    label: 'Accounting',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
      </svg>
    ),
    children: [
      { label: 'Invoicing', href: '/accounting/invoicing' },
    ]
  },
  {
    label: 'Administration',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      </svg>
    ),
    children: [
      { label: 'Companies', href: '/companies' },
      { label: 'Users', href: '/users' },
      { label: 'Log Actions', href: '/log-actions' },
      { label: 'Releases Management', href: '/release-management' },
    ]
  },
  {
    label: 'Frac Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
    children: [{ label: 'Frac Stages', href: '/frac/stages' }],
  },
];

export default function Sidebar() {
  const { theme, sidebarCollapsed, setSidebarCollapsed } = useAdminStore();
  const pathname = usePathname();
  const { data: admin } = useAdminSession();
  // Accordion: only one group stays open at a time.
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => NAV.find((n) => n.children?.some((c) => pathname.startsWith(c.href)))?.label ?? null
  );

  const dark = theme === 'dark';

  const toggleGroup = (label: string) => {
    setOpenGroup((prev) => (prev === label ? null : label));
  };

  return (
    <aside
      className="flex flex-col h-full transition-all duration-300 relative"
      style={{
        width: sidebarCollapsed ? '64px' : '230px',
        background: dark ? '#0d1b2e' : '#1e293b',
        borderRight: dark ? '1px solid #1e3a5f' : '1px solid #2d4a6a',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: dark ? '#1e3a5f' : '#2d4a6a' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#1d6fbf' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        {!sidebarCollapsed && (
          <div>
            <span className="text-sm font-bold text-white">RigPulse</span>
            <span className="block text-xs" style={{ color: '#64b5f6' }}>Admin Panel</span>
          </div>
        )}
      </div>

      {/* User */}
      {!sidebarCollapsed && (
        <div className="px-4 py-4 border-b" style={{ borderColor: dark ? '#1e3a5f' : '#2d4a6a' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: '#1d6fbf', color: 'white' }}>
              {initials(admin?.name)}
            </div>
            <div>
              <p className="text-sm font-medium text-white leading-tight">{admin?.name ?? 'Super Admin'}</p>
              <span className="flex items-center gap-1 text-xs" style={{ color: '#4ade80' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
                Online
              </span>
            </div>
          </div>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>MAIN NAVIGATION</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-hide">
        {NAV.map((item) => {
          const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href) : false;
          const isOpen = openGroup === item.label;

          if (item.href) {
            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-all mx-2 rounded-lg my-0.5"
                style={{
                  color: isActive ? 'white' : '#94a3b8',
                  background: isActive ? '#1d6fbf' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#1e3a5f'; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span className="flex-shrink-0" style={{ color: isActive ? 'white' : '#64b5f6' }}>{item.icon}</span>
                {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            );
          }

          return (
            <div key={item.label}>
              <button
                onClick={() => toggleGroup(item.label)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all mx-2 rounded-lg my-0.5"
                style={{
                  color: '#94a3b8',
                  background: 'transparent',
                  width: sidebarCollapsed ? 'calc(100% - 16px)' : 'calc(100% - 16px)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1e3a5f'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span className="flex-shrink-0" style={{ color: '#64b5f6' }}>{item.icon}</span>
                {!sidebarCollapsed && (
                  <>
                    <span className="font-medium flex-1 text-left">{item.label}</span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#64748b' }}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </>
                )}
              </button>
              {isOpen && !sidebarCollapsed && item.children && (
                <div className="ml-4 border-l pl-4 my-1" style={{ borderColor: '#1e3a5f' }}>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="flex items-center py-2 text-xs rounded-lg px-2 my-0.5 transition-colors"
                      style={{ color: pathname === child.href ? '#60a5fa' : '#64748b' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#93c5fd'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = pathname === child.href ? '#60a5fa' : '#64748b'; }}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="flex items-center justify-center py-3 border-t text-xs transition-colors"
        style={{ borderColor: dark ? '#1e3a5f' : '#2d4a6a', color: '#64748b' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'white'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
      >
        {sidebarCollapsed ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
          </svg>
        )}
      </button>
    </aside>
  );
}
