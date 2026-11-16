'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAdminStore } from '@/store/useAdminStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyRow { id: string; name: string; }
interface WellRow    { id: string; name: string; wellNumber: string; status: string; }

interface GapInfo { from: string; to: string; durationMs: number; }

interface OverviewData {
  wellId:       string;
  firstPoint:   string;
  lastPoint:    string;
  totalPoints:  number;
  overrideCount: number;
  channels:     string[];
  gaps:         GapInfo[];
  hourlyBuckets: { hour: string; count: number }[];
}

interface DataPoint {
  t:           string;
  [channel: string]: string | number;
}

interface SegmentData {
  points:   DataPoint[];
  gaps:     GapInfo[];
  channels: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WELL_STATUSES = ['active', 'paused', 'completed'] as const;

const DEFAULT_COLORS = [
  '#1a8cff', '#f59e0b', '#ef4444', '#a78bfa',
  '#14b8a6', '#22c55e', '#f97316', '#ec4899',
  '#06b6d4', '#84cc16',
];

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res  = await fetch(`/api/backend/${path}`, { cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data as T;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtShortTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function msToHuman(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Overview Heatmap ─────────────────────────────────────────────────────────

function OverviewHeatmap({
  data, border, muted,
}: {
  data: OverviewData;
  border: string;
  muted: string;
}) {
  const max = Math.max(1, ...data.hourlyBuckets.map((b) => b.count));

  const gapSet = new Set<string>();
  for (const g of data.gaps) {
    const start = new Date(g.from);
    const end   = new Date(g.to);
    let cur = new Date(start);
    cur.setMinutes(0, 0, 0);
    while (cur <= end) {
      gapSet.add(cur.toISOString().slice(0, 13));
      cur = new Date(cur.getTime() + 3_600_000);
    }
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'flex', gap: 2, minWidth: 'max-content' }}>
        {data.hourlyBuckets.map((b) => {
          const hourKey = b.hour.slice(0, 13);
          const isGap   = gapSet.has(hourKey);
          const opacity = isGap ? 1 : b.count === 0 ? 0.08 : 0.15 + 0.85 * (b.count / max);
          const bg      = isGap ? '#ef4444' : '#1a8cff';
          return (
            <div
              key={b.hour}
              title={`${fmtDate(b.hour)}: ${b.count} pts${isGap ? ' (gap)' : ''}`}
              style={{
                width: 8, height: 32,
                background: bg,
                opacity,
                borderRadius: 2,
                flexShrink: 0,
                cursor: 'default',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: muted }}>
        <span>{data.firstPoint ? fmtDate(data.firstPoint) : ''}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 1, background: '#1a8cff', display: 'inline-block' }} />
            Data
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 1, background: '#ef4444', display: 'inline-block' }} />
            Gap
          </span>
        </span>
        <span>{data.lastPoint ? fmtDate(data.lastPoint) : ''}</span>
      </div>
    </div>
  );
}

// ─── Custom draggable dot ──────────────────────────────────────────────────────

interface DragState {
  wellId:  string;
  t:       string;
  channel: string;
  startY:  number;
  startVal: number;
  currentVal: number;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DataCleanupPage() {
  const { theme } = useAdminStore();
  const isDark = theme === 'dark';

  const bg        = isDark ? '#0f172a' : '#f8fafc';
  const surface   = isDark ? '#1e293b' : '#ffffff';
  const border    = isDark ? '#334155' : '#e2e8f0';
  const text      = isDark ? '#f1f5f9' : '#0f172a';
  const muted     = isDark ? '#94a3b8' : '#64748b';
  const inputBg   = isDark ? '#0f172a' : '#f8fafc';

  // ── Selectors ────────────────────────────────────────────────────────────────
  const [companies,     setCompanies]     = useState<CompanyRow[]>([]);
  const [wells,         setWells]         = useState<WellRow[]>([]);
  const [selCompany,    setSelCompany]    = useState('');
  const [selWellStatus, setSelWellStatus] = useState('active');
  const [selWell,       setSelWell]       = useState<WellRow | null>(null);

  useEffect(() => {
    apiFetch<{ success: boolean; data: CompanyRow[] }>('companies')
      .then((r) => setCompanies(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selCompany) { setWells([]); setSelWell(null); return; }
    apiFetch<{ success: boolean; data: WellRow[] }>(
      `wells?companyId=${selCompany}&status=${selWellStatus}`
    ).then((r) => { setWells(r.data); setSelWell(null); }).catch(() => {});
  }, [selCompany, selWellStatus]);

  // ── Overview ─────────────────────────────────────────────────────────────────
  const [overview,     setOverview]     = useState<OverviewData | null>(null);
  const [overviewLoad, setOverviewLoad] = useState(false);
  const [overviewErr,  setOverviewErr]  = useState('');

  const loadOverview = useCallback(async (wellId: string) => {
    setOverviewLoad(true);
    setOverviewErr('');
    try {
      const r = await apiFetch<{ success: boolean; data: OverviewData | null }>(
        `data-cleanup/${wellId}/overview`
      );
      if (!r.data) {
        setOverview(null);
        setOverviewErr('No telemetry data found for this well.');
        return;
      }
      setOverview(r.data);
      setChannelColors(
        Object.fromEntries(
          r.data.channels.map((c, i) => [c, DEFAULT_COLORS[i % DEFAULT_COLORS.length]])
        )
      );
      setSelChannels(r.data.channels.slice(0, 4));
    } catch (e: unknown) {
      setOverviewErr(e instanceof Error ? e.message : 'Failed to load overview');
    } finally {
      setOverviewLoad(false);
    }
  }, []);

  useEffect(() => {
    if (!selWell) { setOverview(null); setOverviewErr(''); return; }
    loadOverview(selWell.id);
  }, [selWell, loadOverview]);

  // ── Channel config ───────────────────────────────────────────────────────────
  const [channelColors, setChannelColors] = useState<Record<string, string>>({});
  const [selChannels,   setSelChannels]   = useState<string[]>([]);

  function toggleChannel(c: string) {
    setSelChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  // ── Date range ───────────────────────────────────────────────────────────────
  const [fromDt, setFromDt] = useState('');
  const [toDt,   setToDt]   = useState('');

  useEffect(() => {
    if (!overview) return;
    const to   = overview.lastPoint  ? new Date(overview.lastPoint)  : new Date();
    const from = overview.firstPoint ? new Date(overview.firstPoint) : new Date(to.getTime() - 86_400_000);
    const toLocal   = new Date(to.getTime()   - to.getTimezoneOffset()   * 60000).toISOString().slice(0, 16);
    const fromLocal = new Date(from.getTime() - from.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setFromDt(fromLocal);
    setToDt(toLocal);
  }, [overview]);

  // ── Segment data ─────────────────────────────────────────────────────────────
  const [segment,     setSegment]     = useState<SegmentData | null>(null);
  const [segLoad,     setSegLoad]     = useState(false);
  const [segErr,      setSegErr]      = useState('');

  const loadSegment = useCallback(async () => {
    if (!selWell || !fromDt || !toDt || selChannels.length === 0) return;
    setSegLoad(true);
    setSegErr('');
    try {
      const params = new URLSearchParams({
        from:      new Date(fromDt).toISOString(),
        to:        new Date(toDt).toISOString(),
        channels:  selChannels.join(','),
        maxPoints: '1000',
        mode:      'time',
      });
      const r = await apiFetch<{ success: boolean; data: SegmentData }>(
        `data-cleanup/${selWell.id}/segment?${params}`
      );
      setSegment(r.data);
    } catch (e: unknown) {
      setSegErr(e instanceof Error ? e.message : 'Failed to load segment');
    } finally {
      setSegLoad(false);
    }
  }, [selWell, fromDt, toDt, selChannels]);

  // ── Drag-to-edit ─────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef         = useRef<DragState | null>(null);

  useEffect(() => { dragRef.current = drag; }, [drag]);

  const handleDotMouseDown = useCallback((
    e: React.MouseEvent,
    wellId: string,
    t: string,
    channel: string,
    value: number
  ) => {
    e.preventDefault();
    const state: DragState = { wellId, t, channel, startY: e.clientY, startVal: value, currentVal: value };
    setDrag(state);
    dragRef.current = state;

    const onMove = (ev: MouseEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const dy      = cur.startY - ev.clientY;
      const newVal  = Math.max(0, cur.startVal + dy * 0.5);
      dragRef.current = { ...cur, currentVal: newVal };
      setDrag({ ...cur, currentVal: newVal });
    };

    const onUp = async () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const cur = dragRef.current;
      if (!cur) return;
      setDrag(null);
      dragRef.current = null;
      if (Math.abs(cur.currentVal - cur.startVal) < 0.001) return;
      try {
        await apiFetch(`data-cleanup/${cur.wellId}/point`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ t: cur.t, channel: cur.channel, value: cur.currentVal }),
        });
        setSegment((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            points: prev.points.map((p) => {
              if (p.t !== cur.t) return p;
              return { ...p, [cur.channel]: cur.currentVal };
            }),
          };
        });
      } catch {
        // silent — point reverts visually on next load
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── Custom dot renderer ───────────────────────────────────────────────────────
  function makeDotRenderer(wellId: string, channel: string, color: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function CustomDot(props: any) {
      const { cx, cy, payload } = props;
      if (cx === undefined || cy === undefined) return <circle r={0} />;
      const isDragging = drag?.t === payload.t && (drag?.channel === channel);
      return (
        <circle
          cx={cx}
          cy={isDragging ? cy + ((drag?.startVal ?? 0) - (drag?.currentVal ?? 0)) * 0 : cy}
          r={4}
          fill={color}
          stroke={isDark ? '#1e293b' : '#ffffff'}
          strokeWidth={1.5}
          style={{ cursor: 'ns-resize', userSelect: 'none' }}
          onMouseDown={(e) =>
            handleDotMouseDown(e, wellId, payload.t, channel, payload[channel] as number)
          }
        />
      );
    };
  }

  // ── Fill gap modal ────────────────────────────────────────────────────────────
  const [fillGapOpen, setFillGapOpen] = useState(false);
  const [fillFrom,    setFillFrom]    = useState('');
  const [fillTo,      setFillTo]      = useState('');
  const [fillChannels, setFillChannels] = useState<string[]>([]);
  const [fillInterval, setFillInterval] = useState(60);
  const [filling,      setFilling]      = useState(false);
  const [fillMsg,      setFillMsg]      = useState('');

  async function doFillGap() {
    if (!selWell) return;
    setFilling(true);
    setFillMsg('');
    try {
      await apiFetch(`data-cleanup/${selWell.id}/fill-gap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:        new Date(fillFrom).toISOString(),
          to:          new Date(fillTo).toISOString(),
          channels:    fillChannels,
          intervalMs:  fillInterval * 1000,
        }),
      });
      setFillMsg('Gap filled successfully.');
      await loadSegment();
      await loadOverview(selWell.id);
    } catch (e: unknown) {
      setFillMsg(e instanceof Error ? e.message : 'Fill failed');
    } finally {
      setFilling(false);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  async function doExport() {
    if (!selWell || !fromDt || !toDt) return;
    const params = new URLSearchParams({
      from:     new Date(fromDt).toISOString(),
      to:       new Date(toDt).toISOString(),
      channels: selChannels.join(','),
    });
    window.location.href = `/api/backend/data-cleanup/${selWell.id}/export?${params}`;
  }

  // ── Import ────────────────────────────────────────────────────────────────────
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [importing,   setImporting]   = useState(false);
  const [importMsg,   setImportMsg]   = useState('');

  async function doImport(file: File) {
    if (!selWell) return;
    setImporting(true);
    setImportMsg('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`/api/backend/data-cleanup/${selWell.id}/import`, {
        method: 'POST',
        body:   fd,
        cache:  'no-store',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || 'Import failed');
      setImportMsg(`Imported ${data.data?.inserted ?? 0} rows.`);
      await loadSegment();
    } catch (e: unknown) {
      setImportMsg(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    background: inputBg, color: text, border: `1px solid ${border}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none',
  };

  const btnStyle = (accent: string): React.CSSProperties => ({
    background: accent, color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  });

  const cardStyle: React.CSSProperties = {
    background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 20,
  };

  return (
    <div style={{ padding: 24, background: bg, minHeight: '100vh', color: text }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Data Cleanup</h1>
        <p style={{ fontSize: 13, color: muted, marginTop: 4 }}>
          Visualize, edit, fill gaps, export and re-import well telemetry data.
        </p>
      </div>

      {/* ── Selectors ─────────────────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Client */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client</label>
            <select
              value={selCompany}
              onChange={(e) => setSelCompany(e.target.value)}
              style={{ ...inputStyle, minWidth: 180 }}
            >
              <option value=''>Select client…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Well Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Well Status</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {WELL_STATUSES.map((s) => {
                const active = selWellStatus === s;
                const clr = s === 'active' ? '#16a34a' : s === 'paused' ? '#d97706' : '#475569';
                return (
                  <button
                    key={s}
                    onClick={() => setSelWellStatus(s)}
                    style={{
                      padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: `1px solid ${active ? clr : border}`,
                      background: active ? clr : surface, color: active ? '#fff' : muted,
                      transition: 'all 0.15s',
                    }}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Well */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Well</label>
            <select
              value={selWell?.id ?? ''}
              onChange={(e) => setSelWell(wells.find((w) => w.id === e.target.value) ?? null)}
              style={{ ...inputStyle, minWidth: 220 }}
              disabled={wells.length === 0}
            >
              <option value=''>Select well…</option>
              {wells.map((w) => (
                <option key={w.id} value={w.id}>{w.name}{w.wellNumber ? ` (${w.wellNumber})` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Overview section ────────────────────────────────────────────────────── */}
      {selWell && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Overview — {selWell.name}</h2>
            {overviewLoad && <span style={{ fontSize: 12, color: muted }}>Loading…</span>}
          </div>
          {overviewErr && (
            <p style={{
              color: overviewErr.startsWith('No telemetry') ? muted : '#ef4444',
              fontSize: 13, margin: 0,
              fontStyle: overviewErr.startsWith('No telemetry') ? 'italic' : 'normal',
            }}>
              {overviewErr}
            </p>
          )}
          {overview && (
            <>
              {/* Stats row */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
                {[
                  { label: 'First Point', value: fmtDate(overview.firstPoint) },
                  { label: 'Last Point',  value: fmtDate(overview.lastPoint) },
                  { label: 'Total Points', value: overview.totalPoints.toLocaleString() },
                  { label: 'Overrides',   value: overview.overrideCount.toLocaleString() },
                  { label: 'Gaps',        value: overview.gaps.length.toString(), color: overview.gaps.length > 0 ? '#ef4444' : '#22c55e' },
                  { label: 'Channels',    value: overview.channels.length.toString() },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: color ?? text }}>{value}</div>
                  </div>
                ))}
              </div>
              {/* Heatmap */}
              {overview.hourlyBuckets.length > 0 && (
                <OverviewHeatmap data={overview} border={border} muted={muted} />
              )}
              {/* Gaps list */}
              {overview.gaps.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>
                    Detected Gaps ({overview.gaps.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {overview.gaps.map((g, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '6px 10px', borderRadius: 6,
                          background: isDark ? '#7f1d1d22' : '#fef2f2',
                          border: `1px solid #ef444433`, fontSize: 12,
                        }}
                      >
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>Gap</span>
                        <span style={{ color: muted }}>{fmtDate(g.from)} → {fmtDate(g.to)}</span>
                        <span style={{ color: text, fontWeight: 600 }}>{msToHuman(g.durationMs)}</span>
                        <button
                          onClick={() => {
                            const fromLocal = new Date(new Date(g.from).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                            const toLocal   = new Date(new Date(g.to).getTime()   - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                            setFillFrom(fromLocal);
                            setFillTo(toLocal);
                            setFillChannels(selChannels.length > 0 ? selChannels : overview.channels.slice(0, 4));
                            setFillMsg('');
                            setFillGapOpen(true);
                          }}
                          style={{
                            marginLeft: 'auto', padding: '3px 10px', borderRadius: 6,
                            border: `1px solid #ef4444`, background: 'transparent',
                            color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Fill Gap
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Chart config & date range ──────────────────────────────────────────── */}
      {overview && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Date range */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Date Range
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type='datetime-local'
                  value={fromDt}
                  onChange={(e) => setFromDt(e.target.value)}
                  style={inputStyle}
                />
                <span style={{ color: muted }}>→</span>
                <input
                  type='datetime-local'
                  value={toDt}
                  onChange={(e) => setToDt(e.target.value)}
                  style={inputStyle}
                />
                <button onClick={loadSegment} disabled={segLoad} style={btnStyle('#1a8cff')}>
                  {segLoad ? 'Loading…' : 'Load Chart'}
                </button>
              </div>
            </div>

            {/* Channels */}
            <div style={{ flex: 1, minWidth: 300 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Channels
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {overview.channels.map((c) => {
                  const active = selChannels.includes(c);
                  const color  = channelColors[c] ?? '#94a3b8';
                  return (
                    <div
                      key={c}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <button
                        onClick={() => toggleChannel(c)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', border: `1.5px solid ${active ? color : border}`,
                          background: active ? `${color}22` : surface,
                          color: active ? color : muted,
                          transition: 'all 0.15s',
                        }}
                      >
                        {c}
                      </button>
                      {/* Color swatch */}
                      <input
                        type='color'
                        value={channelColors[c] ?? '#1a8cff'}
                        onChange={(e) => setChannelColors((p) => ({ ...p, [c]: e.target.value }))}
                        title='Change channel color'
                        style={{
                          width: 20, height: 20, border: 'none', borderRadius: 4,
                          padding: 0, cursor: 'pointer', background: 'none',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Chart ──────────────────────────────────────────────────────────────── */}
      {(segment || segLoad || segErr) && selWell && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Interactive Chart</h2>
              <p style={{ fontSize: 11, color: muted, margin: '2px 0 0' }}>
                Drag dots up/down to edit values. Changes are saved automatically.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={doExport} style={btnStyle('#16a34a')} title='Export visible range to Excel'>
                ↓ Export XLSX
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                style={btnStyle('#7c3aed')}
                title='Re-upload edited Excel file'
              >
                {importing ? 'Importing…' : '↑ Import XLSX'}
              </button>
              <input
                ref={fileInputRef}
                type='file'
                accept='.xlsx'
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }}
              />
              <button
                onClick={() => { setFillFrom(fromDt); setFillTo(toDt); setFillChannels(selChannels); setFillMsg(''); setFillGapOpen(true); }}
                style={btnStyle('#ef4444')}
                title='Fill gaps in selected range by interpolation'
              >
                Fill Gaps
              </button>
            </div>
          </div>

          {importMsg && (
            <div style={{
              padding: '8px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13,
              background: importMsg.startsWith('Imported') ? (isDark ? '#14532d33' : '#f0fdf4') : (isDark ? '#7f1d1d33' : '#fef2f2'),
              color: importMsg.startsWith('Imported') ? '#16a34a' : '#ef4444',
              border: `1px solid ${importMsg.startsWith('Imported') ? '#16a34a44' : '#ef444444'}`,
            }}>
              {importMsg}
            </div>
          )}

          {segErr && <p style={{ color: '#ef4444', fontSize: 13 }}>{segErr}</p>}

          {segLoad && (
            <div style={{ textAlign: 'center', padding: 40, color: muted, fontSize: 14 }}>
              Loading chart data…
            </div>
          )}

          {segment && segment.points.length > 0 && (
            <ResponsiveContainer width='100%' height={420}>
              <ComposedChart data={segment.points} margin={{ top: 8, right: 20, bottom: 8, left: 10 }}>
                <CartesianGrid strokeDasharray='3 3' stroke={border} vertical={false} />
                <XAxis
                  dataKey='t'
                  tickFormatter={(v) => fmtShortTime(v)}
                  tick={{ fontSize: 10, fill: muted }}
                  stroke={border}
                  interval='preserveStartEnd'
                />
                <YAxis tick={{ fontSize: 10, fill: muted }} stroke={border} width={48} />
                <Tooltip
                  contentStyle={{ background: surface, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => fmtDate(v as string)}
                  formatter={(value: number, name: string) => [value?.toFixed(2) ?? '—', name]}
                />
                {/* Gap shading */}
                {segment.gaps.map((g, i) => (
                  <ReferenceArea
                    key={i}
                    x1={g.from}
                    x2={g.to}
                    fill='#ef4444'
                    fillOpacity={0.08}
                    stroke='#ef4444'
                    strokeOpacity={0.3}
                    strokeDasharray='4 4'
                    label={{ value: 'Gap', position: 'insideTop', fontSize: 10, fill: '#ef4444' }}
                  />
                ))}
                {/* Data lines */}
                {selChannels.filter((c) => segment.channels.includes(c)).map((c) => {
                  const color = channelColors[c] ?? '#94a3b8';
                  return (
                    <Line
                      key={c}
                      type='monotone'
                      dataKey={c}
                      stroke={color}
                      strokeWidth={1.5}
                      dot={makeDotRenderer(selWell.id, c, color)}
                      activeDot={{ r: 6, fill: color }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {segment && segment.points.length === 0 && !segLoad && (
            <div style={{ textAlign: 'center', padding: 40, color: muted, fontSize: 14 }}>
              No data in this range for the selected channels.
            </div>
          )}

          {/* Legend */}
          {segment && selChannels.length > 0 && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${border}` }}>
              {selChannels.map((c) => (
                <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: muted }}>
                  <span style={{ width: 12, height: 3, borderRadius: 2, background: channelColors[c] ?? '#94a3b8', display: 'inline-block' }} />
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Fill Gap Modal ─────────────────────────────────────────────────────── */}
      {fillGapOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: '#00000066', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setFillGapOpen(false); }}
        >
          <div
            style={{
              background: surface, border: `1px solid ${border}`,
              borderRadius: 14, padding: 28, width: 460, maxWidth: '95vw',
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Fill Gap by Interpolation</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, display: 'block', marginBottom: 4 }}>From</label>
                <input type='datetime-local' value={fillFrom} onChange={(e) => setFillFrom(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, display: 'block', marginBottom: 4 }}>To</label>
                <input type='datetime-local' value={fillTo} onChange={(e) => setFillTo(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, display: 'block', marginBottom: 4 }}>
                  Interval (seconds)
                </label>
                <input
                  type='number'
                  min={1}
                  value={fillInterval}
                  onChange={(e) => setFillInterval(Number(e.target.value))}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, display: 'block', marginBottom: 6 }}>Channels</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(overview?.channels ?? []).map((c) => {
                    const active = fillChannels.includes(c);
                    const color  = channelColors[c] ?? '#94a3b8';
                    return (
                      <button
                        key={c}
                        onClick={() => setFillChannels((p) => active ? p.filter((x) => x !== c) : [...p, c])}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', border: `1.5px solid ${active ? color : border}`,
                          background: active ? `${color}22` : surface,
                          color: active ? color : muted,
                        }}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {fillMsg && (
              <div style={{
                marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: fillMsg.includes('successfully') ? (isDark ? '#14532d33' : '#f0fdf4') : (isDark ? '#7f1d1d33' : '#fef2f2'),
                color: fillMsg.includes('successfully') ? '#16a34a' : '#ef4444',
                border: `1px solid ${fillMsg.includes('successfully') ? '#16a34a44' : '#ef444444'}`,
              }}>
                {fillMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => { setFillGapOpen(false); setFillMsg(''); }}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', border: `1px solid ${border}`, background: surface, color: text,
                }}
              >
                Cancel
              </button>
              <button
                onClick={doFillGap}
                disabled={filling || fillChannels.length === 0 || !fillFrom || !fillTo}
                style={btnStyle('#ef4444')}
              >
                {filling ? 'Filling…' : 'Fill by Interpolation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
