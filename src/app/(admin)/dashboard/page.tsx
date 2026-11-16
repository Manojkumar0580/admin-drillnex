'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import LiveSensorSection from '@/components/LiveSensorSection';
import { useAdminStore } from '@/store/useAdminStore';
import { api } from '@/lib/adminApi';

interface Overview {
  companies: { total: number; active: number };
  users: { total: number; active: number };
  wells: { total: number; drilling: number };
  rigs: { total: number; active: number };
  reports: { total: number; last7d: number };
  logMaps: { total: number; on: number; off: number; live: number; stale: number; blocked: number };
  lag: { avgSec: number | null; feeds: number };
  server: { uptimeSec: number; poller: { runs: number; ok: number; failed: number; rows: number } };
  asOf: number;
}
interface LagResponse {
  bucketSec: number;
  points: { t: number; avgSec: number; maxSec: number; feeds: number }[];
}

const RANGES: Record<string, number> = { 'Last Hour': 3600_000, 'Last 6 Hours': 6 * 3600_000, 'Last 24 Hours': 24 * 3600_000, 'Last 7 Days': 7 * 86400_000 };
const PERIODS: Record<string, number> = { '1 Minute': 60, '5 Minutes': 300, '15 Minutes': 900, '30 Minutes': 1800 };

const fmtNum = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString());
function fmtDuration(sec: number): string {
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${(sec / 60).toFixed(sec < 600 ? 1 : 0)} min`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86400).toFixed(1)} days`;
}

export default function AdminDashboardPage() {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';
  const [period, setPeriod] = useState('5 Minutes');
  const [range, setRange] = useState('Last Hour');

  const cardBg = dark ? '#0d1b2e' : '#ffffff';
  const cardBorder = dark ? '#1e3a5f' : '#e2e8f0';
  const textPrimary = dark ? '#f1f5f9' : '#0f172a';
  const textMuted = dark ? '#64748b' : '#94a3b8';
  const gridColor = dark ? '#1e3a5f' : '#e2e8f0';
  const axisTick = dark ? '#64748b' : '#94a3b8';

  const overview = useQuery({
    queryKey: ['stats-overview'],
    queryFn: () => api<{ data: Overview }>('stats/overview').then((r) => r.data),
    refetchInterval: 15_000,
  });
  const lag = useQuery({
    queryKey: ['stats-lag', range, period],
    queryFn: () => {
      const to = Date.now();
      return api<LagResponse>(`stats/lag?from=${to - RANGES[range]}&to=${to}&bucketSec=${PERIODS[period]}`);
    },
    refetchInterval: 15_000,
  });

  const o = overview.data;
  const cards = [
    { label: 'Active Wells', value: fmtNum(o?.wells.drilling), sub: o ? `${o.wells.total} total` : '', href: '/witsml/wells', bg: '#0891b2', shadow: '#0e7490' },
    { label: 'Active Rigs', value: fmtNum(o?.rigs.active), sub: o ? `${o.rigs.total} total` : '', href: '/witsml/rigs', bg: '#16a34a', shadow: '#15803d' },
    { label: 'Active Clients', value: fmtNum(o?.companies.active), sub: o ? `${o.companies.total} total` : '', href: '/companies', bg: '#7c3aed', shadow: '#6d28d9' },
    { label: 'Active Users', value: fmtNum(o?.users.active), sub: o ? `${o.users.total} total` : '', href: '/users', bg: '#dc2626', shadow: '#b91c1c' },
  ];

  const longRange = RANGES[range] > 24 * 3600_000;
  const chartData = (lag.data?.points ?? []).map((p) => ({
    time: new Date(p.t).toLocaleString('en-GB', longRange
      ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' }),
    avg: p.avgSec,
    max: p.maxSec,
  }));

  const feedsOk = !!o && o.logMaps.stale === 0 && o.logMaps.blocked === 0;
  const quick = [
    {
      label: 'Live data feeds',
      value: o ? `${o.logMaps.live} / ${o.logMaps.on}` : '—',
      delta: !o ? '' : o.logMaps.on === 0 ? 'No log map is switched on' : feedsOk ? 'All switched-on feeds are delivering' : `${o.logMaps.stale} stale · ${o.logMaps.blocked} blocked`,
      deltaColor: !o ? textMuted : o.logMaps.on === 0 ? textMuted : feedsOk ? '#4ade80' : '#f87171',
    },
    {
      label: 'Reports (last 7 days)',
      value: fmtNum(o?.reports.last7d),
      delta: o ? `${o.reports.total.toLocaleString()} in total` : '',
      deltaColor: '#60a5fa',
    },
    {
      label: 'API uptime',
      value: o ? fmtDuration(o.server.uptimeSec) : '—',
      delta: o ? `Poller: ${o.server.poller.runs.toLocaleString()} runs, ${o.server.poller.failed} failed since start` : '',
      deltaColor: '#a78bfa',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold" style={{ color: textPrimary }}>Dashboard</h1>
        {overview.isError && (
          <p role="alert" className="text-xs text-red-400">Could not load the numbers: {(overview.error as Error).message}</p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl overflow-hidden" style={{ background: c.bg, boxShadow: `0 4px 20px ${c.shadow}40` }}>
            <div className="px-6 py-5">
              <p className="text-4xl font-black text-white tracking-tight">{c.value}</p>
              <p className="text-sm font-medium text-white/80 mt-1">{c.label}{c.sub && <span className="text-white/60"> · {c.sub}</span>}</p>
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

      {/* Average feed lag */}
      <div className="rounded-xl border p-6" style={{ background: cardBg, borderColor: cardBorder }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h2 className="text-base font-semibold" style={{ color: textPrimary }}>Average Real-time Lag</h2>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>
              How far behind real time the WITSML feeds are
              {o?.lag.avgSec != null && <> · now <strong style={{ color: textPrimary }}>{fmtDuration(o.lag.avgSec)}</strong> across {o.lag.feeds} feed{o.lag.feeds === 1 ? '' : 's'}</>}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label htmlFor="lag-range" className="text-xs" style={{ color: textMuted }}>Time Range</label>
              <select id="lag-range" value={range} onChange={(e) => setRange(e.target.value)} className="text-xs px-3 py-1.5 rounded-lg border outline-none cursor-pointer"
                style={{ background: dark ? '#0f1f35' : '#f8fafc', borderColor: cardBorder, color: textPrimary }}>
                {Object.keys(RANGES).map((k) => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="lag-period" className="text-xs" style={{ color: textMuted }}>Period</label>
              <select id="lag-period" value={period} onChange={(e) => setPeriod(e.target.value)} className="text-xs px-3 py-1.5 rounded-lg border outline-none cursor-pointer"
                style={{ background: dark ? '#0f1f35' : '#f8fafc', borderColor: cardBorder, color: textPrimary }}>
                {Object.keys(PERIODS).map((k) => <option key={k}>{k}</option>)}
              </select>
            </div>
            <button
              onClick={() => { overview.refetch(); lag.refetch(); }}
              disabled={lag.isFetching}
              className="text-xs font-semibold px-4 py-1.5 rounded-lg text-white disabled:opacity-60"
              style={{ background: '#16a34a' }}
            >
              {lag.isFetching ? 'Loading…' : 'Reload'}
            </button>
          </div>
        </div>

        {lag.isError ? (
          <p role="alert" className="text-sm text-red-400 py-16 text-center">{(lag.error as Error).message}</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm py-16 text-center" style={{ color: textMuted }}>
            {lag.isLoading ? 'Loading…' : 'No lag data in this range yet. It appears once a WITSML log map is switched on and has delivered data.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: axisTick }} tickLine={false} axisLine={{ stroke: gridColor }} minTickGap={40} />
              <YAxis
                tick={{ fontSize: 11, fill: axisTick }} tickLine={false} axisLine={false}
                label={{ value: 'Lag (seconds)', angle: -90, position: 'insideLeft', offset: 20, style: { fontSize: 10, fill: axisTick } }}
              />
              <Tooltip
                contentStyle={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: '8px', fontSize: '12px', color: textPrimary }}
                formatter={(v: number, name: string) => [fmtDuration(v), name === 'avg' ? 'Average lag' : 'Worst feed']}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px', color: textMuted }} formatter={(v) => (v === 'avg' ? 'Average lag' : 'Worst feed')} />
              <Line type="monotone" dataKey="avg" stroke="#1d6fbf" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#1d6fbf' }} isAnimationActive={false} />
              <Line type="monotone" dataKey="max" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Live Sensor Feed */}
      <LiveSensorSection dark={dark} />

      {/* Quick stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quick.map((s) => (
          <div key={s.label} className="rounded-xl border p-5" style={{ background: cardBg, borderColor: cardBorder }}>
            <p className="text-xs" style={{ color: textMuted }}>{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: textPrimary }}>{s.value}</p>
            <p className="text-xs mt-1 font-medium" style={{ color: s.deltaColor }}>{s.delta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
