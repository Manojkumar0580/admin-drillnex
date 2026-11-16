'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTelemetry, TelemetryMessage } from '@/lib/useTelemetry';

// ─── Constants ────────────────────────────────────────────────────────────────

const WELL_STATUSES = ['active', 'paused', 'completed'] as const;
type WellStatus = (typeof WELL_STATUSES)[number];

const STATUS_LABEL: Record<WellStatus, string> = { active: 'Active', paused: 'Paused', completed: 'Completed' };
const STATUS_COLOR: Record<WellStatus, string> = { active: '#22c55e', paused: '#f59e0b', completed: '#94a3b8' };

const PARAMS = [
  { key: 'rop',      label: 'ROP',      unit: 'ft/h',   color: '#1a8cff', digits: 1 },
  { key: 'wob',      label: 'WOB',      unit: 'klbf',   color: '#f59e0b', digits: 1 },
  { key: 'hookload', label: 'Hookload', unit: 'klbf',   color: '#ef4444', digits: 1 },
  { key: 'rpm',      label: 'RPM',      unit: 'rpm',    color: '#a78bfa', digits: 0 },
  { key: 'slowIn',   label: 'Slow In',  unit: 'spm',    color: '#14b8a6', digits: 0 },
  { key: 'spp',      label: 'SPP',      unit: 'psi',    color: '#22c55e', digits: 0 },
  { key: 'torque',   label: 'Torque',   unit: 'kft·lb', color: '#f97316', digits: 1 },
] as const;

type ParamKey = (typeof PARAMS)[number]['key'];

// Log-view param definitions — includes scale range for each track
const LOG_PARAMS = [
  { key: 'rop',      label: 'ROP/FT',  unit: 'f/hr',   min: 0,  max: 300,  color: '#ef4444', digits: 1 },
  { key: 'hookload', label: 'HKLD',    unit: 'klbs',   min: 0,  max: 1000, color: '#1a8cff', digits: 1 },
  { key: 'wob',      label: 'WOB',     unit: 'klbs',   min: 0,  max: 150,  color: '#a78bfa', digits: 1 },
  { key: 'slowIn',   label: 'SLOW IN', unit: 'spm',    min: 0,  max: 150,  color: '#22c55e', digits: 0 },
  { key: 'spp',      label: 'SPP',     unit: 'psi',    min: 0,  max: 5000, color: '#14b8a6', digits: 0 },
  { key: 'rpm',      label: 'RPM',     unit: 'rpm',    min: 0,  max: 200,  color: '#f97316', digits: 0 },
  { key: 'torque',   label: 'TRQ',     unit: 'kft·lb', min: 0,  max: 100,  color: '#f59e0b', digits: 1 },
];

const STATE_STYLE: Record<string, { label: string; color: string }> = {
  drilling:     { label: 'Drilling',     color: '#22c55e' },
  reaming:      { label: 'Reaming',      color: '#f59e0b' },
  circulating:  { label: 'Circulating',  color: '#1a8cff' },
  tripping_in:  { label: 'Tripping In',  color: '#a78bfa' },
  tripping_out: { label: 'Tripping Out', color: '#a78bfa' },
  in_slips:     { label: 'In Slips',     color: '#f97316' },
  static:       { label: 'Static',       color: '#94a3b8' },
  unknown:      { label: 'Unknown',      color: '#64748b' },
};

// ─── Demo-mode data generation ────────────────────────────────────────────────

interface DemoPhase {
  key: string;
  ticks: number;
  rop: [number, number]; wob: [number, number]; hookload: [number, number];
  rpm: [number, number]; slowIn: [number, number]; spp: [number, number]; torque: [number, number];
}

const DEMO_PHASES: DemoPhase[] = [
  { key: 'drilling',    ticks: 45, rop: [40, 110], wob: [20, 55],  hookload: [280, 350], rpm: [80,  150], slowIn: [60, 90],  spp: [2500, 3800], torque: [20, 50] },
  { key: 'circulating', ticks: 20, rop: [0,   2],  wob: [0,   2],  hookload: [295, 320], rpm: [20,  50],  slowIn: [80, 120], spp: [2000, 2800], torque: [3,  8]  },
  { key: 'in_slips',    ticks: 10, rop: [0,   0],  wob: [0,   0],  hookload: [0,   15],  rpm: [0,   0],   slowIn: [0,  5],   spp: [50,  200],   torque: [0,  1]  },
  { key: 'tripping_in', ticks: 25, rop: [0,   0],  wob: [0,   5],  hookload: [80,  180], rpm: [0,   5],   slowIn: [10, 30],  spp: [150, 400],   torque: [0,  3]  },
];

const DEMO_CYCLE = DEMO_PHASES.reduce((s, p) => s + p.ticks, 0);

function demoPhaseAt(tick: number): DemoPhase {
  const pos = ((tick % DEMO_CYCLE) + DEMO_CYCLE) % DEMO_CYCLE;
  let acc = 0;
  for (const ph of DEMO_PHASES) { acc += ph.ticks; if (pos < acc) return ph; }
  return DEMO_PHASES[0];
}

function demoVal(range: [number, number], tick: number, ch: number): number {
  const [lo, hi] = range;
  const base   = lo + (hi - lo) * (Math.sin(tick * 0.13 + ch) * 0.5 + 0.5);
  const jitter = Math.sin(tick * 2.37 + ch * 7.1) * 0.08 * (hi - lo);
  return Math.max(lo, Math.min(hi, base + jitter));
}

function makeDemoPoint(tsMs: number, tick: number): TelemetryMessage {
  const ph = demoPhaseAt(tick);
  const q  = { rop: 'good', wob: 'good', hookload: 'good', rpm: 'good', slowIn: 'good', spp: 'good', torque: 'good' } as Record<string, 'good' | 'suspect' | 'missing'>;
  return {
    wellId: 'demo', t: tsMs, sourceT: tsMs,
    onBottom: ph.key === 'drilling', bitSpeedFtMin: null,
    replay: { file: '', row: 0, total: 0, speed: 0 },
    rigState: ph.key,
    values: {
      rop: demoVal(ph.rop, tick, 0), wob: demoVal(ph.wob, tick, 1),
      hookload: demoVal(ph.hookload, tick, 2), rpm: demoVal(ph.rpm, tick, 3),
      slowIn: demoVal(ph.slowIn, tick, 4), spp: demoVal(ph.spp, tick, 5),
      torque: demoVal(ph.torque, tick, 6),
    },
    quality: q,
  };
}

function generateInitialDemoPoints(): TelemetryMessage[] {
  const pts: TelemetryMessage[] = [];
  const now = Date.now();
  for (let i = 89; i >= 0; i--) {
    pts.push(makeDemoPoint(now - i * 60_000, 89 - i));
  }
  return pts;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyRow { id: string; name: string; }
interface WellRow    { id: string; name: string; wellNumber: string; status: string; }

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res  = await fetch(`/api/backend/${path}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data as T;
}

// ─── Drilling-log style multi-track SVG view ──────────────────────────────────

const TRACK_W  = 130;
const TIME_W   = 54;
const HEADER_H = 90;

interface HoverSnap { svgY: number; pt: TelemetryMessage; clientX: number; clientY: number }

function LogView({ points, dark }: { points: TelemetryMessage[]; dark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverSnap | null>(null);

  const headerBg = '#0d1b2e';
  const bodyBg0  = dark ? '#060f1a' : '#f1f5f9';
  const bodyBg1  = dark ? '#071526' : '#f8fafc';
  const timeBg   = dark ? '#0a1628' : '#dde4ee';
  const gridClr  = dark ? '#1e3a5f88' : '#94a3b844';
  const timeTxt  = dark ? '#94a3b8'  : '#475569';
  const divClr   = dark ? '#1e3a5f'  : '#cbd5e1';
  const nowClr   = '#22c55e';

  // Auto-scroll to bottom whenever new points arrive
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [points.length]);

  if (points.length < 2) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: timeTxt, fontStyle: 'italic', fontSize: 13 }}>
        Waiting for data…
      </div>
    );
  }

  const tMin   = new Date(points[0].t).getTime();
  const tMax   = new Date(points[points.length - 1].t).getTime();
  const tRange = tMax - tMin || 1;

  // Height: 4px per point, min 500
  const totalH = Math.max(500, points.length * 4);
  const totalW = LOG_PARAMS.length * TRACK_W + TIME_W;

  const yOf = (t: string | number) => {
    const ms = typeof t === 'string' ? new Date(t).getTime() : t;
    return ((ms - tMin) / tRange) * totalH;
  };

  const xOf = (p: typeof LOG_PARAMS[0], value: number | undefined) => {
    if (value === undefined || isNaN(value)) return null;
    const v = Math.max(p.min, Math.min(p.max, value));
    return TRACK_W * (v - p.min) / (p.max - p.min);
  };

  // Minute tick marks
  const minMs    = 60_000;
  const startMin = Math.ceil(tMin / minMs) * minMs;
  const ticks: { ms: number; label: string }[] = [];
  for (let t = startMin; t <= tMax; t += minMs) {
    ticks.push({
      ms:    t,
      label: new Date(t).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    });
  }

  // Build polyline strings per param
  const polylines = LOG_PARAMS.map((p) => {
    const pts = points
      .map((pt) => {
        const x = xOf(p, (pt.values as Record<string, number>)[p.key]);
        const y = yOf(pt.t);
        return x !== null ? `${x.toFixed(1)},${y.toFixed(1)}` : null;
      })
      .filter(Boolean)
      .join(' ');
    return { ...p, pts };
  });

  const last = points[points.length - 1];

  // ── Mouse handlers for crosshair ──────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect    = el.getBoundingClientRect();
    const scrollY = el.scrollTop;
    // y inside the SVG (0 = top of SVG including header)
    const rawY  = (e.clientY - rect.top) + scrollY;
    const bodyY = rawY - HEADER_H; // y inside the track bodies area

    // Find the nearest point by body-Y distance
    let bestPt   = points[0];
    let bestDist = Infinity;
    for (const pt of points) {
      const ptY = yOf(pt.t);
      const d   = Math.abs(ptY - bodyY);
      if (d < bestDist) { bestDist = d; bestPt = pt; }
    }
    setHover({ svgY: yOf(bestPt.t), pt: bestPt, clientX: e.clientX, clientY: e.clientY });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
      style={{ position: 'relative', overflowY: 'auto', overflowX: 'auto', maxHeight: 580, background: bodyBg1, borderTop: `1px solid ${divClr}` }}
    >
      <svg width={totalW} height={HEADER_H + totalH} style={{ display: 'block', fontFamily: 'ui-monospace, monospace' }}>
        {/* ── Header row ──────────────────────────────────────────── */}
        <rect x={0} y={0} width={totalW} height={HEADER_H} fill={headerBg} />

        {LOG_PARAMS.map((p, i) => {
          const x      = i * TRACK_W;
          const curVal = (last?.values as Record<string, number>)?.[p.key];
          const maxLbl = p.max >= 1000 ? `${(p.max / 1000).toFixed(0)}K` : String(p.max);
          return (
            <g key={p.key}>
              <line x1={x} y1={0} x2={x} y2={HEADER_H} stroke='#334155' strokeWidth={1} />
              {/* Param name */}
              <text x={x + TRACK_W / 2} y={15} textAnchor='middle' fill={p.color} fontSize={11} fontWeight='bold' letterSpacing='0.05em'>
                {p.label}
              </text>
              {/* Unit + scale */}
              <text x={x + TRACK_W / 2} y={29} textAnchor='middle' fill='#64748b' fontSize={9}>
                ({p.unit}) {p.min}-{maxLbl}
              </text>
              {/* Current value */}
              <text x={x + TRACK_W / 2} y={55} textAnchor='middle' fill={p.color} fontSize={20} fontWeight='bold'>
                {curVal !== undefined ? curVal.toFixed(p.digits) : '—'}
              </text>
              {/* Unit label under value */}
              <text x={x + TRACK_W / 2} y={72} textAnchor='middle' fill='#475569' fontSize={9}>
                {p.unit}
              </text>
              {/* Scale range row at bottom of header */}
              <text x={x + 4} y={84} fill='#475569' fontSize={8}>{p.min}</text>
              <text x={x + TRACK_W - 4} y={84} textAnchor='end' fill='#475569' fontSize={8}>{maxLbl}</text>
            </g>
          );
        })}

        {/* Time column header */}
        <line x1={LOG_PARAMS.length * TRACK_W} y1={0} x2={LOG_PARAMS.length * TRACK_W} y2={HEADER_H} stroke='#334155' strokeWidth={1} />
        <text
          x={LOG_PARAMS.length * TRACK_W + TIME_W / 2}
          y={40}
          textAnchor='middle'
          fill='#64748b'
          fontSize={9}
          letterSpacing='0.08em'
        >
          TIME
        </text>

        {/* ── Track bodies ───────────────────────────────────────── */}
        <g transform={`translate(0, ${HEADER_H})`}>

          {/* Track backgrounds */}
          {LOG_PARAMS.map((_, i) => (
            <rect key={i} x={i * TRACK_W} y={0} width={TRACK_W} height={totalH}
              fill={i % 2 === 0 ? bodyBg0 : bodyBg1} />
          ))}
          {/* Time column bg */}
          <rect x={LOG_PARAMS.length * TRACK_W} y={0} width={TIME_W} height={totalH} fill={timeBg} />

          {/* Horizontal minute grid lines */}
          {ticks.map(({ ms, label }) => {
            const y = yOf(ms);
            return (
              <g key={ms}>
                <line x1={0} y1={y} x2={LOG_PARAMS.length * TRACK_W} y2={y}
                  stroke={gridClr} strokeWidth={0.75} strokeDasharray='5 5' />
                {/* Solid line on time column */}
                <line x1={LOG_PARAMS.length * TRACK_W} y1={y} x2={LOG_PARAMS.length * TRACK_W + TIME_W} y2={y}
                  stroke={divClr} strokeWidth={0.5} />
                <text
                  x={LOG_PARAMS.length * TRACK_W + 5}
                  y={y - 2}
                  fill={timeTxt}
                  fontSize={9}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Vertical track dividers */}
          {LOG_PARAMS.map((_, i) => (
            <line key={i}
              x1={(i + 1) * TRACK_W} y1={0}
              x2={(i + 1) * TRACK_W} y2={totalH}
              stroke={divClr} strokeWidth={1}
            />
          ))}

          {/* Data polylines — clipped to their track */}
          <defs>
            {LOG_PARAMS.map((p, i) => (
              <clipPath key={p.key} id={`lv-clip-${p.key}`}>
                <rect x={i * TRACK_W} y={0} width={TRACK_W} height={totalH} />
              </clipPath>
            ))}
          </defs>

          {polylines.map((p, i) => (
            <polyline
              key={p.key}
              points={p.pts}
              fill='none'
              stroke={p.color}
              strokeWidth={1.5}
              strokeLinejoin='round'
              transform={`translate(${i * TRACK_W}, 0)`}
              clipPath={`url(#lv-clip-${p.key})`}
              style={{ transform: `translateX(${i * TRACK_W}px)` }}
            />
          ))}

          {/* "Now" indicator */}
          <line x1={0} y1={totalH - 1} x2={LOG_PARAMS.length * TRACK_W + TIME_W} y2={totalH - 1}
            stroke={nowClr} strokeWidth={1.5} />
          <text
            x={LOG_PARAMS.length * TRACK_W + 5}
            y={totalH - 4}
            fill={nowClr}
            fontSize={8}
            fontWeight='bold'
          >
            NOW
          </text>

          {/* Crosshair on hover */}
          {hover && (
            <g>
              <line
                x1={0} y1={hover.svgY}
                x2={LOG_PARAMS.length * TRACK_W + TIME_W} y2={hover.svgY}
                stroke='#ffffff' strokeWidth={0.75} strokeDasharray='3 3' opacity={0.5}
                pointerEvents='none'
              />
              {/* Dot per track at crosshair */}
              {LOG_PARAMS.map((p, i) => {
                const val = (hover.pt.values as Record<string, number>)[p.key];
                const x   = xOf(p, val);
                if (x === null) return null;
                return <circle key={p.key} cx={i * TRACK_W + x} cy={hover.svgY} r={4} fill={p.color} stroke='#fff' strokeWidth={1} pointerEvents='none' />;
              })}
              {/* Time label on crosshair */}
              <text
                x={LOG_PARAMS.length * TRACK_W + 5}
                y={hover.svgY - 3}
                fill='#ffffff'
                fontSize={8}
                fontWeight='bold'
              >
                {new Date(hover.pt.t).toLocaleTimeString('en-US', { hour12: false })}
              </text>
            </g>
          )}
        </g>
      </svg>

      {/* Floating tooltip — fixed to viewport so it escapes the scroll container */}
      {hover && (() => {
        const vals = hover.pt.values as Record<string, number>;
        const tooltipX = hover.clientX + 18;
        const tooltipY = hover.clientY - 10;
        return (
          <div style={{
            position: 'fixed',
            left: tooltipX, top: tooltipY,
            background: '#060f1a',
            border: '1px solid #1e3a5f',
            borderRadius: 10, padding: '10px 14px',
            zIndex: 9999, pointerEvents: 'none',
            fontSize: 12, color: '#f1f5f9',
            boxShadow: '0 8px 32px #00000099',
            lineHeight: 1.8, minWidth: 180,
          }}>
            <div style={{ color: '#64748b', fontSize: 10, marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
              {new Date(hover.pt.t).toLocaleTimeString('en-US', { hour12: false })}
            </div>
            {LOG_PARAMS.map((p) => {
              const v = vals[p.key];
              return (
                <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ color: p.color, fontWeight: 600 }}>{p.label}</span>
                  <span style={{ fontWeight: 700 }}>
                    {v !== undefined ? v.toFixed(p.digits) : '—'}
                    <span style={{ color: '#475569', fontSize: 10, marginLeft: 3 }}>{p.unit}</span>
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Param tile with hover tooltip ───────────────────────────────────────────

interface ParamTileProps {
  p:         (typeof PARAMS)[number];
  value:     number | undefined;
  prevValue: number | undefined;
  quality:   string | undefined;
  isActive:  boolean;
  onClick:   () => void;
  dark:      boolean;
  border:    string;
  muted:     string;
  panelBg:   string;
}

function ParamTile({ p, value, prevValue, quality, isActive, onClick, dark, border, muted, panelBg }: ParamTileProps) {
  const [hovered, setHovered] = useState(false);
  const suspect = quality === 'suspect';
  const logP    = LOG_PARAMS.find((lp) => lp.key === p.key);

  let trend = '→';
  if (value !== undefined && prevValue !== undefined) {
    const range = logP ? (logP.max - logP.min) : 100;
    const diff  = value - prevValue;
    if (diff > range * 0.005) trend = '↑';
    else if (diff < -range * 0.005) trend = '↓';
  }

  const tooltipBg     = dark ? '#060f1a'  : '#1e293b';
  const tooltipBorder = `${p.color}66`;

  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        onClick={onClick}
        className='w-full rounded-lg px-4 py-3 text-left transition-all'
        style={{
          background: isActive ? `${p.color}18` : panelBg,
          border:     `1px solid ${suspect ? '#f59e0b' : isActive ? `${p.color}55` : border}`,
        }}
      >
        <div className='text-xs font-semibold uppercase tracking-wider' style={{ color: muted }}>{p.label}</div>
        <div className='text-xl font-black mt-1' style={{ color: p.color }}>
          {value !== undefined ? value.toFixed(p.digits) : '—'}
        </div>
        <div className='text-xs mt-0.5' style={{ color: muted }}>{p.unit}{suspect ? ' · ⚠' : ''}</div>
      </button>

      {hovered && value !== undefined && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: tooltipBg, color: '#f1f5f9',
          border: `1px solid ${tooltipBorder}`,
          borderRadius: 10, padding: '10px 14px',
          zIndex: 200, whiteSpace: 'nowrap',
          fontSize: 12, lineHeight: 1.7,
          boxShadow: `0 8px 32px #00000077`,
          pointerEvents: 'none',
        }}>
          {/* Arrow */}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: `6px solid ${tooltipBorder}`,
          }} />
          <div style={{ color: p.color, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            {p.label} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({p.unit})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 16, rowGap: 2 }}>
            <span style={{ color: '#64748b' }}>Current</span>
            <span style={{ fontWeight: 700, color: p.color }}>{value.toFixed(Math.max(p.digits, 2))} {p.unit}</span>
            {prevValue !== undefined && (
              <>
                <span style={{ color: '#64748b' }}>Previous</span>
                <span>{prevValue.toFixed(Math.max(p.digits, 2))} {p.unit}</span>
              </>
            )}
            {logP && (
              <>
                <span style={{ color: '#64748b' }}>Range</span>
                <span>{logP.min} – {logP.max} {p.unit}</span>
              </>
            )}
            <span style={{ color: '#64748b' }}>Trend</span>
            <span style={{ color: trend === '↑' ? '#22c55e' : trend === '↓' ? '#ef4444' : '#94a3b8', fontWeight: 700 }}>
              {trend} {trend === '↑' ? 'Rising' : trend === '↓' ? 'Falling' : 'Stable'}
            </span>
            <span style={{ color: '#64748b' }}>Quality</span>
            <span style={{ color: suspect ? '#f59e0b' : '#22c55e' }}>
              {suspect ? '⚠ Suspect' : '✓ Good'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Well feed (subscribes to one real well) ──────────────────────────────────

function WellFeed({ wellId, wellName, dark }: { wellId: string; wellName: string; dark: boolean }) {
  const { conn, error, points, lastAt } = useTelemetry(wellId);
  const [active,   setActive]   = useState<ParamKey>('rop');
  const [expanded, setExpanded] = useState(false);
  const [now,      setNow]      = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cardBg  = dark ? '#0d1b2e' : '#ffffff';
  const border  = dark ? '#1e3a5f' : '#e2e8f0';
  const text    = dark ? '#f1f5f9' : '#0f172a';
  const muted   = dark ? '#64748b' : '#94a3b8';
  const panelBg = dark ? '#071526' : '#f8fafc';

  const last      = points[points.length - 1];
  const live      = conn === 'connected' && !!last && now - lastAt < 4000;
  const activeDef = PARAMS.find((p) => p.key === active)!;
  const rigState  = last ? (STATE_STYLE[last.rigState] ?? STATE_STYLE.unknown) : null;

  const badge = live
    ? { text: 'LIVE',    color: '#22c55e' }
    : conn === 'error'
    ? { text: 'OFFLINE', color: '#ef4444' }
    : { text: 'WAITING', color: '#94a3b8' };

  const chartData = useMemo(
    () => points.map((p) => ({
      t: new Date(p.t).toLocaleTimeString('en-US', { hour12: false }),
      v: (p.values as Record<string, number>)[active],
    })),
    [points, active]
  );

  return (
    <>
      {/* Feed header */}
      <div className='flex items-center justify-between flex-wrap gap-3 px-6 py-4' style={{ borderBottom: `1px solid ${border}` }}>
        <div className='flex items-center gap-3 flex-wrap'>
          <span className='flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full'
            style={{ background: `${badge.color}1f`, color: badge.color, border: `1px solid ${badge.color}55` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color, display: 'inline-block', animation: live ? 'livePulse 2s infinite' : undefined }} />
            {badge.text}
          </span>
          <span className='text-sm font-semibold' style={{ color: text }}>{wellName}</span>
          {rigState && (
            <span className='text-xs font-semibold px-2.5 py-1 rounded-full'
              style={{ background: `${rigState.color}1f`, color: rigState.color, border: `1px solid ${rigState.color}55` }}>
              {rigState.label}
            </span>
          )}
          {!live && conn === 'connected' && (
            <span className='text-xs' style={{ color: muted }}>Waiting for data…</span>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className='text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all hover:opacity-80'
          style={{
            borderColor: expanded ? '#1a8cff55' : border,
            background:  expanded ? '#1a8cff18' : 'transparent',
            color:       expanded ? '#1a8cff'   : text,
          }}
        >
          {expanded ? '⊟ Collapse Log' : '⤢ Expand Log View'}
        </button>
      </div>

      {error && <p className='px-6 pt-3 pb-0 text-xs' style={{ color: '#f87171' }}>Connection: {error}</p>}

      {/* 7 parameter tiles */}
      <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 px-6 py-4' style={{ borderBottom: `1px solid ${border}` }}>
        {PARAMS.map((p) => {
          const prev = points.length >= 2 ? points[points.length - 2] : undefined;
          return (
            <ParamTile
              key={p.key}
              p={p}
              value={last?.values[p.key] as number | undefined}
              prevValue={prev?.values[p.key] as number | undefined}
              quality={last?.quality[p.key]}
              isActive={active === p.key}
              onClick={() => setActive(p.key)}
              dark={dark} border={border} muted={muted} panelBg={panelBg}
            />
          );
        })}
      </div>

      {/* Mini chart — single selected param */}
      <div className='px-6 py-4' style={{ borderBottom: expanded ? `1px solid ${border}` : undefined }}>
        <p className='text-xs font-semibold mb-3' style={{ color: muted }}>
          {activeDef.label} ({activeDef.unit}) — last {chartData.length} samples
        </p>
        <ResponsiveContainer width='100%' height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={border} strokeDasharray='4 4' vertical={false} />
            <XAxis dataKey='t' tick={{ fontSize: 10, fill: muted }} tickLine={false} axisLine={{ stroke: border }} interval='preserveStartEnd' minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: muted }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: text }}
              formatter={(v: number) => [`${Number(v).toFixed(2)} ${activeDef.unit}`, activeDef.label]}
            />
            <Line type='monotone' dataKey='v' stroke={activeDef.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Drilling-log view — inline, same page */}
      {expanded && <LogView points={points} dark={dark} />}

      <style>{`@keyframes livePulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </>
  );
}

// ─── Demo well feed ───────────────────────────────────────────────────────────

function DemoWellFeed({ dark, onStop }: { dark: boolean; onStop: () => void }) {
  const [points,   setPoints]   = useState<TelemetryMessage[]>(() => generateInitialDemoPoints());
  const [active,   setActive]   = useState<ParamKey>('rop');
  const [expanded, setExpanded] = useState(false);
  const tickRef = useRef(90);

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current += 1;
      const pt = makeDemoPoint(Date.now(), tickRef.current);
      setPoints((prev) => [...prev.slice(-299), pt]);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const cardBg  = dark ? '#0d1b2e' : '#ffffff';
  const border  = dark ? '#1e3a5f' : '#e2e8f0';
  const text    = dark ? '#f1f5f9' : '#0f172a';
  const muted   = dark ? '#64748b' : '#94a3b8';
  const panelBg = dark ? '#071526' : '#f8fafc';

  const last      = points[points.length - 1];
  const activeDef = PARAMS.find((p) => p.key === active)!;
  const rigState  = last ? (STATE_STYLE[last.rigState] ?? STATE_STYLE.unknown) : null;

  const chartData = useMemo(
    () => points.slice(-60).map((p) => ({
      t: new Date(p.t).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      v: (p.values as Record<string, number>)[active],
    })),
    [points, active],
  );

  return (
    <>
      {/* Demo feed header */}
      <div className='flex items-center justify-between flex-wrap gap-3 px-6 py-4' style={{ borderBottom: `1px solid ${border}` }}>
        <div className='flex items-center gap-3 flex-wrap'>
          {/* DEMO badge */}
          <span className='flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full'
            style={{ background: '#f97316' + '1f', color: '#f97316', border: '1px solid #f9741655' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', display: 'inline-block', animation: 'livePulse 2s infinite' }} />
            DEMO
          </span>
          <span className='text-sm font-semibold' style={{ color: text }}>Demo Well — Eagle Ford #12</span>
          {rigState && (
            <span className='text-xs font-semibold px-2.5 py-1 rounded-full'
              style={{ background: `${rigState.color}1f`, color: rigState.color, border: `1px solid ${rigState.color}55` }}>
              {rigState.label}
            </span>
          )}
          <span className='text-xs' style={{ color: muted }}>Simulated · updates every 2s</span>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={() => setExpanded((v) => !v)}
            className='text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all hover:opacity-80'
            style={{
              borderColor: expanded ? '#1a8cff55' : border,
              background:  expanded ? '#1a8cff18' : 'transparent',
              color:       expanded ? '#1a8cff'   : text,
            }}
          >
            {expanded ? '⊟ Collapse Log' : '⤢ Expand Log View'}
          </button>
          <button
            onClick={onStop}
            className='text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all hover:opacity-80'
            style={{ borderColor: '#ef444455', background: '#ef444411', color: '#ef4444' }}
          >
            ✕ Stop Demo
          </button>
        </div>
      </div>

      {/* 7 parameter tiles */}
      <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 px-6 py-4' style={{ borderBottom: `1px solid ${border}` }}>
        {PARAMS.map((p) => {
          const prev = points.length >= 2 ? points[points.length - 2] : undefined;
          return (
            <ParamTile
              key={p.key}
              p={p}
              value={(last?.values as Record<string, number>)[p.key]}
              prevValue={prev ? (prev.values as Record<string, number>)[p.key] : undefined}
              quality={last?.quality[p.key]}
              isActive={active === p.key}
              onClick={() => setActive(p.key)}
              dark={dark} border={border} muted={muted} panelBg={panelBg}
            />
          );
        })}
      </div>

      {/* Mini chart */}
      <div className='px-6 py-4' style={{ borderBottom: expanded ? `1px solid ${border}` : undefined }}>
        <p className='text-xs font-semibold mb-3' style={{ color: muted }}>
          {activeDef.label} ({activeDef.unit}) — last {chartData.length} samples
        </p>
        <ResponsiveContainer width='100%' height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={border} strokeDasharray='4 4' vertical={false} />
            <XAxis dataKey='t' tick={{ fontSize: 10, fill: muted }} tickLine={false} axisLine={{ stroke: border }} interval='preserveStartEnd' minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: muted }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: text }}
              formatter={(v: number) => [`${Number(v).toFixed(2)} ${activeDef.unit}`, activeDef.label]}
            />
            <Line type='monotone' dataKey='v' stroke={activeDef.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {expanded && <LogView points={points} dark={dark} />}

      <style>{`@keyframes livePulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

export default function LiveSensorSection({ dark }: { dark: boolean }) {
  const [companies,  setCompanies]  = useState<CompanyRow[]>([]);
  const [wells,      setWells]      = useState<WellRow[]>([]);
  const [clientId,   setClientId]   = useState('');
  const [wellStatus, setWellStatus] = useState<WellStatus>('active');
  const [wellId,     setWellId]     = useState('');
  const [wellName,   setWellName]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [compError,  setCompError]  = useState('');
  const [demoMode,   setDemoMode]   = useState(false);

  const cardBg    = dark ? '#0d1b2e' : '#ffffff';
  const border    = dark ? '#1e3a5f' : '#e2e8f0';
  const text      = dark ? '#f1f5f9' : '#0f172a';
  const muted     = dark ? '#64748b' : '#94a3b8';
  const inputStyle = { background: dark ? '#0f1f35' : '#f8fafc', borderColor: border, color: text };

  useEffect(() => {
    apiFetch<{ success: boolean; data: CompanyRow[] }>('companies')
      .then((r) => setCompanies(r.data ?? []))
      .catch((e: Error) => setCompError(e.message));
  }, []);

  useEffect(() => {
    if (!clientId) { setWells([]); setWellId(''); setWellName(''); return; }
    setLoading(true);
    apiFetch<{ success: boolean; data: WellRow[] }>(`wells?companyId=${clientId}&status=${wellStatus}`)
      .then((r) => {
        const list = r.data ?? [];
        setWells(list);
        setWellId((prev) => {
          if (list.some((w) => w.id === prev)) return prev;
          setWellName('');
          return '';
        });
      })
      .catch(() => setWells([]))
      .finally(() => setLoading(false));
  }, [clientId, wellStatus]);

  function handleClientChange(id: string) {
    setClientId(id);
    setWellId('');
    setWellName('');
  }

  function handleWellChange(id: string) {
    setWellId(id);
    const w = wells.find((w) => w.id === id);
    setWellName(w ? w.name : '');
  }

  const selectedCompany = companies.find((c) => c.id === clientId);
  const displayName     = selectedCompany ? `${selectedCompany.name} · ${wellName}` : wellName;

  return (
    <div className='rounded-xl border' style={{ background: cardBg, borderColor: border }}>
      {/* Selection bar */}
      <div className='px-6 py-4' style={{ borderBottom: `1px solid ${border}` }}>
        <div className='flex items-center justify-between gap-2 mb-4 flex-wrap'>
          <span className='text-sm font-semibold' style={{ color: text }}>Live Sensor Feed</span>
          <div className='flex items-center gap-2'>
            {compError && <span className='text-xs' style={{ color: '#f87171' }}>{compError}</span>}
            <button
              onClick={() => setDemoMode((v) => !v)}
              className='text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all hover:opacity-80'
              style={{
                borderColor: demoMode ? '#f9741655' : border,
                background:  demoMode ? '#f9741611' : 'transparent',
                color:       demoMode ? '#f97316'   : muted,
              }}
            >
              {demoMode ? '■ Exit Demo' : '▶ Demo'}
            </button>
          </div>
        </div>

        <div className='flex items-end gap-4 flex-wrap'>
          {/* 1. Client */}
          <div className='flex flex-col gap-1.5'>
            <label className='text-xs font-semibold uppercase tracking-wider' style={{ color: muted }}>Client</label>
            <select
              value={clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className='text-xs px-3 py-2 rounded-lg border outline-none min-w-[180px]'
              style={inputStyle}
            >
              <option value=''>Select client…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* 2. Well status */}
          <div className='flex flex-col gap-1.5'>
            <label className='text-xs font-semibold uppercase tracking-wider' style={{ color: muted }}>Status</label>
            <div className='flex gap-1'>
              {WELL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setWellStatus(s)}
                  className='text-xs font-semibold px-3 py-2 rounded-lg border transition-all'
                  style={{
                    background:  wellStatus === s ? `${STATUS_COLOR[s]}18` : 'transparent',
                    borderColor: wellStatus === s ? `${STATUS_COLOR[s]}55` : border,
                    color:       wellStatus === s ? STATUS_COLOR[s] : muted,
                  }}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Well name */}
          <div className='flex flex-col gap-1.5'>
            <label className='text-xs font-semibold uppercase tracking-wider' style={{ color: muted }}>Well Name</label>
            <select
              value={wellId}
              onChange={(e) => handleWellChange(e.target.value)}
              disabled={!clientId || loading}
              className='text-xs px-3 py-2 rounded-lg border outline-none min-w-[220px] disabled:opacity-50'
              style={inputStyle}
            >
              <option value=''>
                {!clientId ? 'Select a client first' : loading ? 'Loading…' : wells.length === 0 ? `No ${STATUS_LABEL[wellStatus].toLowerCase()} wells` : 'Select well…'}
              </option>
              {wells.map((w) => (
                <option key={w.id} value={w.id}>{w.name}{w.wellNumber ? ` #${w.wellNumber}` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Feed, demo, or empty state */}
      {demoMode ? (
        <DemoWellFeed dark={dark} onStop={() => setDemoMode(false)} />
      ) : wellId ? (
        <WellFeed key={wellId} wellId={wellId} wellName={displayName} dark={dark} />
      ) : (
        <div className='flex flex-col items-center justify-center py-16 gap-3' style={{ color: muted }}>
          <svg width='44' height='44' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.2' opacity='0.35'>
            <circle cx='12' cy='12' r='9' /><path d='M12 7v5l3 3' />
          </svg>
          <p className='text-sm'>Select a client and well to view the live feed</p>
          <p className='text-xs opacity-60'>Real-time data streams via WITSML connection</p>
        </div>
      )}
    </div>
  );
}
