'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Notice, useColors } from '@/components/ui';
import { CompanySelect } from '@/components/SearchSelect';
import { api, ChannelInfo, WellFull } from '@/lib/adminApi';

interface DepthResponse {
  unit: 'ft';
  binFt: number;
  channels: { key: string; unit: string }[];
  points: { d: number; values: Record<string, number | null>; samples: number }[];
}

const COLORS = ['#1a8cff', '#f59e0b', '#22c55e', '#a78bfa', '#ef4444', '#14b8a6'];
const DEFAULT_CHANNELS = ['rop', 'wob', 'spp'];
const MAX_RANGE_FT = 30000; // the API limit per request

/**
 * Depth-indexed data (MWD/LWD, mud logs) of one well, drawn the way a log is read: depth runs down
 * the page, one track per channel. Values are binned by depth on the server, so a whole hole stays a
 * few hundred points; narrow the range to see more detail.
 */
export default function DepthDataPage() {
  const c = useColors();
  const [companyId, setCompanyId] = useState('');
  const [wellId, setWellId] = useState('');
  const [from, setFrom] = useState('0');
  const [to, setTo] = useState('30000');
  const [channels, setChannels] = useState<string[]>(DEFAULT_CHANNELS);

  const wells = useQuery({ queryKey: ['wells', 'full'], queryFn: () => api<{ data: WellFull[] }>('wells').then((r) => r.data) });
  const chan = useQuery({ queryKey: ['channels'], queryFn: () => api<{ data: ChannelInfo[] }>('telemetry/channels').then((r) => r.data), staleTime: Infinity });
  const companyWells = useMemo(() => (wells.data ?? []).filter((w) => !companyId || w.companyId === companyId), [wells.data, companyId]);

  const fromN = Number(from), toN = Number(to);
  const rangeError =
    !(Number.isFinite(fromN) && Number.isFinite(toN)) ? 'Enter the depth range in feet.'
    : fromN < 0 || toN <= fromN ? 'The end depth must be greater than the start depth.'
    : toN - fromN > MAX_RANGE_FT ? `At most ${MAX_RANGE_FT.toLocaleString()} ft at a time.`
    : '';
  const enabled = !!wellId && channels.length > 0 && !rangeError;

  const data = useQuery({
    queryKey: ['depth', wellId, fromN, toN, [...channels].sort().join(',')],
    enabled,
    queryFn: () => api<DepthResponse>(`telemetry/depth?wellId=${wellId}&from=${fromN}&to=${toN}&channels=${channels.join(',')}&maxPoints=400`),
  });

  const toggle = (k: string) => setChannels((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].slice(0, 6)));
  const pts = data.data?.points ?? [];
  const deepest = pts.length ? pts[pts.length - 1].d : null;

  const sel = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 13, ...c.inputStyle } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12, color: c.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Company
          <CompanySelect id="dd-company" value={companyId} onChange={(v) => { setCompanyId(v); setWellId(''); }} allLabel="All companies" width={220} />
        </label>
        <label style={{ fontSize: 12, color: c.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Well
          <select id="dd-well" value={wellId} onChange={(e) => setWellId(e.target.value)} style={{ ...sel, minWidth: 220 }}>
            <option value="">Select a well</option>
            {companyWells.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.wellNumber})</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: c.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
          From (ft)
          <input id="dd-from" inputMode="decimal" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...sel, width: 100 }} />
        </label>
        <label style={{ fontSize: 12, color: c.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
          To (ft)
          <input id="dd-to" inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...sel, width: 100 }} />
        </label>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13, color: c.text }}>
          <legend style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>Channels (up to 6)</legend>
          {(chan.data ?? []).map((ch) => (
            <label key={ch.key} style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={channels.includes(ch.key)} onChange={() => toggle(ch.key)} />
              {ch.label} <span style={{ color: c.muted }}>({ch.unit})</span>
            </label>
          ))}
        </fieldset>
      </div>

      {rangeError && <Notice kind="error">{rangeError}</Notice>}
      {data.isError && <Notice kind="error">{(data.error as Error).message}</Notice>}
      {!wellId && <div style={{ color: c.muted, fontSize: 13 }}>Choose a well to see its depth-indexed data. Wells receive depth data from a Log Map that points at a measured-depth log.</div>}
      {enabled && data.isLoading && <div style={{ color: c.muted, fontSize: 13 }}>Loading…</div>}
      {enabled && data.isSuccess && pts.length === 0 && (
        <div style={{ color: c.muted, fontSize: 13 }}>No depth data stored for this well in {fromN.toLocaleString()}–{toN.toLocaleString()} ft.</div>
      )}

      {data.isSuccess && pts.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: c.muted }}>
            {pts.length} points, {data.data!.binFt} ft per point (averaged), deepest {deepest!.toLocaleString()} ft
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(data.data!.channels.length, 3)}, minmax(0, 1fr))`, gap: 12 }}>
            {data.data!.channels.map((ch, i) => {
              const info = (chan.data ?? []).find((x) => x.key === ch.key);
              return (
                <div key={ch.key} style={{ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 12, padding: 12, height: 520 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 6 }}>{info?.label ?? ch.key} <span style={{ color: c.muted, fontWeight: 400 }}>({ch.unit})</span></div>
                  <ResponsiveContainer width="100%" height="94%">
                    <LineChart layout="vertical" data={pts.map((p) => ({ d: p.d, v: p.values[ch.key] }))} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                      <CartesianGrid stroke={c.border} strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="v" stroke={c.muted} fontSize={11} domain={['auto', 'auto']} />
                      <YAxis type="number" dataKey="d" reversed stroke={c.muted} fontSize={11} width={56} domain={['dataMin', 'dataMax']} unit=" ft" />
                      <Tooltip contentStyle={{ background: c.cardBg, border: `1px solid ${c.border}`, color: c.text, fontSize: 12 }} formatter={(v: number) => [`${Number(v).toFixed(2)} ${ch.unit}`, info?.label ?? ch.key]} labelFormatter={(d) => `${d} ft`} />
                      <Line type="monotone" dataKey="v" stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
