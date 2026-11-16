'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import LiveSensorSection from '@/components/LiveSensorSection';
import { useAdminStore } from '@/store/useAdminStore';
import { api } from '@/lib/adminApi';

interface Overview {
  companies: { total: number; active: number };
  users:     { total: number; active: number };
  wells:     { total: number; drilling: number };
  rigs:      { total: number; active: number };
}

const fmtNum = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString());

export default function RtocDashboardPage() {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';

  const cardBg     = dark ? '#0d1b2e' : '#ffffff';
  const cardBorder = dark ? '#1e3a5f' : '#e2e8f0';
  const textPrimary = dark ? '#f1f5f9' : '#0f172a';

  const overview = useQuery({
    queryKey: ['stats-overview'],
    queryFn:  () => api<{ data: Overview }>('stats/overview').then((r) => r.data),
    refetchInterval: 15_000,
  });

  const o = overview.data;
  const cards = [
    { label: 'Active Wells',   value: fmtNum(o?.wells.drilling),    sub: o ? `${o.wells.total} total`     : '', href: '/witsml/wells', bg: '#0891b2', shadow: '#0e7490' },
    { label: 'Active Rigs',    value: fmtNum(o?.rigs.active),       sub: o ? `${o.rigs.total} total`      : '', href: '/witsml/rigs',  bg: '#16a34a', shadow: '#15803d' },
    { label: 'Active Clients', value: fmtNum(o?.companies.active),  sub: o ? `${o.companies.total} total` : '', href: '/companies',    bg: '#7c3aed', shadow: '#6d28d9' },
    { label: 'Active Users',   value: fmtNum(o?.users.active),      sub: o ? `${o.users.total} total`     : '', href: '/users',        bg: '#dc2626', shadow: '#b91c1c' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold" style={{ color: textPrimary }}>RTOC Dashboard</h1>
        {overview.isError && (
          <p role="alert" className="text-xs text-red-400">
            Could not load numbers: {(overview.error as Error).message}
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl overflow-hidden"
            style={{ background: c.bg, boxShadow: `0 4px 20px ${c.shadow}40` }}
          >
            <div className="px-6 py-5">
              <p className="text-4xl font-black text-white tracking-tight">{c.value}</p>
              <p className="text-sm font-medium text-white/80 mt-1">
                {c.label}
                {c.sub && <span className="text-white/60"> · {c.sub}</span>}
              </p>
            </div>
            <Link
              href={c.href}
              className="px-6 py-2.5 flex items-center gap-1.5 text-xs font-medium text-white/90 hover:bg-black/10 transition-colors"
              style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}
            >
              More Info →
            </Link>
          </div>
        ))}
      </div>

      {/* Live Sensor Feed — Client → Status → Well, 7 params, Expand for real-time graphs */}
      <LiveSensorSection dark={dark} />
    </div>
  );
}
