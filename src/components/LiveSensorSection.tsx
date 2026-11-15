'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTelemetry } from '@/lib/useTelemetry';

const ROOM = 'demo-rig'; // admin-only demo room fed by the replay engine

const PARAMS = [
  { key: 'rop', label: 'ROP', unit: 'ft/h', color: '#1a8cff', digits: 1 },
  { key: 'wob', label: 'WOB', unit: 'klbf', color: '#f59e0b', digits: 1 },
  { key: 'rpm', label: 'RPM', unit: 'rpm', color: '#a78bfa', digits: 0 },
  { key: 'spp', label: 'SPP', unit: 'psi', color: '#22c55e', digits: 0 },
  { key: 'hookload', label: 'Hookload', unit: 'klbf', color: '#ef4444', digits: 1 },
  { key: 'flowIn', label: 'Flow In', unit: 'gpm', color: '#14b8a6', digits: 0 },
] as const;

const STATE_STYLE: Record<string, { label: string; color: string }> = {
  drilling: { label: 'Drilling', color: '#22c55e' },
  reaming: { label: 'Reaming', color: '#f59e0b' },
  circulating: { label: 'Circulating', color: '#1a8cff' },
  tripping_in: { label: 'Tripping In', color: '#a78bfa' },
  tripping_out: { label: 'Tripping Out', color: '#a78bfa' },
  in_slips: { label: 'In Slips', color: '#f97316' },
  static: { label: 'Static', color: '#94a3b8' },
  unknown: { label: 'Unknown', color: '#64748b' },
};

interface ReplayStatus {
  files: string[];
  running: { wellId: string; file: string; speed: number; row: number; total: number }[];
}

interface HistoryResponse {
  binMs: number;
  channels: { key: string; unit: string }[];
  points: { t: number; values: Record<string, number | null>; state: string | null; samples: number }[];
}
interface StatsResponse {
  retentionDays: number;
  writer: { queued: number; written: number; dropped: number; lastError: string | null };
  well: { count: number; oldest: number | null; newest: number | null };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/backend/${path}`, { cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data as T;
}

export default function LiveSensorSection({ dark }: { dark: boolean }) {
  const { conn, error, points, lastAt, clear } = useTelemetry(ROOM);
  const [active, setActive] = useState<(typeof PARAMS)[number]['key']>('rop');
  const [status, setStatus] = useState<ReplayStatus | null>(null);
  const [file, setFile] = useState('');
  const [speed, setSpeed] = useState(10);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [persist, setPersist] = useState(false);
  const [view, setView] = useState<'live' | 'history'>('live');
  const [rangeMin, setRangeMin] = useState(15);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [histStats, setHistStats] = useState<StatsResponse | null>(null);
  const [histBusy, setHistBusy] = useState(false);

  const cardBg = dark ? '#0d1b2e' : '#ffffff';
  const border = dark ? '#1e3a5f' : '#e2e8f0';
  const text = dark ? '#f1f5f9' : '#0f172a';
  const muted = dark ? '#64748b' : '#94a3b8';
  const panelBg = dark ? '#071526' : '#f8fafc';
  const inputStyle = { background: dark ? '#0f1f35' : '#f8fafc', borderColor: border, color: text };

  const refresh = useCallback(async () => {
    try {
      const s = await api<ReplayStatus & { success: boolean }>('replay');
      setStatus(s);
      setFile((f) => f || s.files.find((x) => x.includes('forge')) || s.files[0] || '');
    } catch (e) {
      setNote((e as Error).message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const mine = status?.running.find((r) => r.wellId === ROOM);
  const last = points[points.length - 1];
  const live = conn === 'connected' && last && now - lastAt < 4000;
  const activeDef = PARAMS.find((p) => p.key === active)!;

  async function start() {
    setBusy(true); setNote('');
    try {
      clear();
      const r = await api<{ total: number; mapped: unknown[]; unmapped: string[]; problems: string[] }>('replay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wellId: ROOM, file, speed, loop: true, persist }),
      });
      setNote(`${r.total} rows, ${r.mapped.length} channels mapped` +
        (r.problems.length ? `, ${r.problems.length} column(s) skipped` : ''));
      await refresh();
    } catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true);
    try {
      await api('replay/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wellId: ROOM }) });
      setNote('Stopped');
      await refresh();
    } catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  }

  const loadHistory = useCallback(async () => {
    setHistBusy(true);
    try {
      const to = Date.now();
      const from = to - rangeMin * 60_000;
      const q = new URLSearchParams({ wellId: ROOM, from: String(from), to: String(to), channels: active, maxPoints: '400' });
      const [h, s] = await Promise.all([
        api<HistoryResponse>(`telemetry/history?${q}`),
        api<StatsResponse>(`telemetry/stats?wellId=${ROOM}`),
      ]);
      setHistory(h);
      setHistStats(s);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setHistBusy(false);
    }
  }, [active, rangeMin]);

  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  const chartData = useMemo(
    () => view === 'history'
      ? (history?.points ?? []).map((p) => ({
          t: new Date(p.t).toLocaleTimeString('en-US', { hour12: false }),
          v: p.values[active] ?? undefined,
        }))
      : points.map((p) => ({
          t: new Date(p.t).toLocaleTimeString('en-US', { hour12: false }),
          v: p.values[active],
        })),
    [view, history, points, active]
  );

  const state = last ? STATE_STYLE[last.rigState] ?? STATE_STYLE.unknown : null;
  const badge = live
    ? { text: 'LIVE', color: '#22c55e' }
    : conn === 'error'
      ? { text: 'OFFLINE', color: '#ef4444' }
      : { text: mine ? 'WAITING' : 'IDLE', color: '#94a3b8' };

  return (
    <div className="rounded-xl border" style={{ background: cardBg, borderColor: border }}>
      <div className="flex items-center justify-between flex-wrap gap-3 px-6 py-4" style={{ borderBottom: `1px solid ${border}` }}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: `${badge.color}1f`, color: badge.color, border: `1px solid ${badge.color}55` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color, display: 'inline-block', animation: live ? 'livePulse 2s infinite' : undefined }} />
            {badge.text}
          </span>
          <span className="text-sm font-semibold" style={{ color: text }}>Live Sensor Feed</span>
          {state && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: `${state.color}1f`, color: state.color, border: `1px solid ${state.color}55` }}>
              {state.label}
            </span>
          )}
          <span className="text-xs" style={{ color: muted }}>
            {last ? `REPLAY · ${last.replay.file} · row ${last.replay.row}/${last.replay.total}` : 'No data yet. Start a replay.'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select aria-label="Replay file" value={file} onChange={(e) => setFile(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border outline-none" style={inputStyle}>
            {(status?.files ?? []).map((f) => <option key={f}>{f}</option>)}
            {!status?.files?.length && <option value="">No files</option>}
          </select>
          <select aria-label="Replay speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
            className="text-xs px-2 py-1.5 rounded-lg border outline-none" style={inputStyle}>
            {[1, 5, 10, 50].map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: muted }}
            title="Also write every sample to the database so it can be viewed later in History">
            <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} disabled={!!mine} />
            Save to history
          </label>
          {mine ? (
            <button onClick={stop} disabled={busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>
              ■ STOP
            </button>
          ) : (
            <button onClick={start} disabled={busy || !file}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-50"
              style={{ background: 'rgba(26,140,255,0.1)', borderColor: 'rgba(26,140,255,0.3)', color: '#1a8cff' }}>
              ▶ START REPLAY
            </button>
          )}
        </div>
      </div>

      {(note || error) && (
        <p role="status" className="px-6 pt-3 text-xs" style={{ color: error ? '#f87171' : muted }}>
          {error ? `Connection: ${error}` : note}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap px-6 pt-3">
        <div className="flex gap-1" role="tablist" aria-label="Data view">
          {(['live', 'history'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border capitalize"
              style={{
                background: view === v ? 'rgba(26,140,255,0.12)' : 'transparent',
                borderColor: view === v ? 'rgba(26,140,255,0.4)' : border,
                color: view === v ? '#1a8cff' : muted,
              }}>
              {v}
            </button>
          ))}
        </div>
        {view === 'history' && (
          <div className="flex items-center gap-2">
            <select aria-label="History range" value={rangeMin} onChange={(e) => setRangeMin(Number(e.target.value))}
              className="text-xs px-2 py-1.5 rounded-lg border outline-none" style={inputStyle}>
              {[5, 15, 60, 240, 1440].map((m) => <option key={m} value={m}>Last {m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
            </select>
            <button onClick={loadHistory} disabled={histBusy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-50" style={{ borderColor: border, color: text }}>
              {histBusy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-6 py-4" style={{ borderBottom: `1px solid ${border}` }}>
        {PARAMS.map((p) => {
          const v = last?.values[p.key];
          const suspect = last?.quality[p.key] === 'suspect';
          return (
            <button key={p.key} onClick={() => setActive(p.key)} disabled={v === undefined && !!last}
              className="rounded-lg px-4 py-3 text-left transition-all disabled:opacity-40"
              style={{
                background: active === p.key ? `${p.color}18` : panelBg,
                border: `1px solid ${suspect ? '#f59e0b' : active === p.key ? p.color + '55' : border}`,
              }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>{p.label}</div>
              <div className="text-xl font-black mt-1" style={{ color: p.color }}>
                {v !== undefined ? v.toFixed(p.digits) : '—'}
              </div>
              <div className="text-xs mt-0.5" style={{ color: muted }}>
                {p.unit}{suspect ? ' · check' : ''}
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-6 py-4">
        <p className="text-xs font-semibold mb-3" style={{ color: muted }}>
          {view === 'history'
            ? `${activeDef.label} (${activeDef.unit}) — stored history, last ${rangeMin >= 60 ? `${rangeMin / 60} h` : `${rangeMin} min`}` +
              (history ? `, ${history.points.length} points${history.binMs > 1000 ? ` (avg per ${(history.binMs / 1000).toFixed(1)} s)` : ''}` : '')
            : `${activeDef.label} (${activeDef.unit}) — last ${chartData.length} samples`}
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={border} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: muted }} tickLine={false} axisLine={{ stroke: border }} interval="preserveStartEnd" minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: muted }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: text }}
              formatter={(v: number) => [`${Number(v).toFixed(2)} ${activeDef.unit}`, activeDef.label]}
            />
            <Line type="monotone" dataKey="v" stroke={activeDef.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        {view === 'history' && (
          <p className="text-xs mt-2" style={{ color: muted }}>
            {history && history.points.length === 0
              ? 'No stored data in this range. Tick "Save to history" and start a replay to record some.'
              : histStats
                ? `${histStats.well.count.toLocaleString()} samples stored for this room · kept ${histStats.retentionDays} days` +
                  (histStats.writer.dropped ? ` · ${histStats.writer.dropped} dropped` : '') +
                  (histStats.writer.lastError ? ` · write error: ${histStats.writer.lastError}` : '')
                : ''}
          </p>
        )}
        <p className="text-xs text-center mt-2" style={{ color: muted, opacity: 0.6 }}>
          Replayed test data (Utah FORGE 58-32 or synthetic). Real rigs will stream through a WITSML connection.
        </p>
      </div>
      <style>{`@keyframes livePulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </div>
  );
}
