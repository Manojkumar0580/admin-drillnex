'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useColors, Badge, Btn, Notice } from '@/components/ui';

// ─── Lightweight API helper (no token needed — proxy adds it) ─────────────────
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res  = await fetch(`/api/backend/${path}`, { cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataRow {
  depth: number;
  time?: string;
  [col: string]: number | string | undefined;
}

interface ColMeta {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  color: string;
  trackId: string; // columns with same trackId share one track column
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRACK_W  = 130;
const DEPTH_W  = 72;
const ZOOM_STEPS = [2, 4, 7, 14, 22, 36, 56];
const DEFAULT_ZOOM_IDX = 3;
const DEPTH_STEP = 1;

const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#14b8a6', '#1a8cff', '#a78bfa', '#ec4899',
  '#06b6d4', '#84cc16',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDepthHeader(h: string) { return /^dep/i.test(h); }
function isTimeHeader(h: string)  { return /date|time/i.test(h); }

function detectGaps(rows: DataRow[]): { from: number; to: number; gap: number }[] {
  if (rows.length < 2) return [];
  const gaps: { from: number; to: number; gap: number }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const g = rows[i].depth - rows[i - 1].depth;
    if (g > DEPTH_STEP + 0.01) gaps.push({ from: rows[i - 1].depth, to: rows[i].depth, gap: g });
  }
  return gaps;
}

function detectDups(rows: DataRow[]): number[] {
  const seen = new Set<number>(), dups: number[] = [];
  for (const r of rows) { if (seen.has(r.depth)) dups.push(r.depth); else seen.add(r.depth); }
  return [...new Set(dups)];
}

function autoFill(rows: DataRow[]): DataRow[] {
  if (rows.length < 2) return rows;
  const sorted = [...rows].sort((a, b) => a.depth - b.depth);
  const out: DataRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    if (i < sorted.length - 1) {
      let d = sorted[i].depth + DEPTH_STEP;
      while (d < sorted[i + 1].depth - 0.01) {
        out.push({ depth: +d.toFixed(3) });
        d += DEPTH_STEP;
      }
    }
  }
  return out;
}

function mergeDups(rows: DataRow[], cols: ColMeta[]): DataRow[] {
  const map = new Map<number, DataRow[]>();
  for (const r of rows) { const b = map.get(r.depth) ?? []; b.push(r); map.set(r.depth, b); }
  return Array.from(map.entries()).map(([depth, group]) => {
    const m: DataRow = { depth };
    for (const col of cols) {
      const vals = group.map((r) => r[col.key]).filter((v) => v !== undefined && v !== '') as number[];
      if (vals.length) m[col.key] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    return m;
  }).sort((a, b) => a.depth - b.depth);
}

function toCSV(rows: DataRow[], cols: ColMeta[], hasTime: boolean): string {
  const hdr = ['DEPTH', ...(hasTime ? ['DATE_TIME'] : []), ...cols.map((c) => c.label)].join(',');
  const lines = rows.map((r) =>
    ['DEPTH', ...(hasTime ? ['time'] : []), ...cols.map((c) => c.key)]
      .map((k) => r[k] ?? '').join(',')
  );
  return [hdr, ...lines].join('\n');
}

// ─── Single curve path (memoized per column) ──────────────────────────────────

function CurvePath({ rows, col, pxPerRow }: {
  rows: DataRow[]; col: ColMeta; pxPerRow: number;
}) {
  const range = col.max - col.min || 1;

  const linePath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][col.key];
      if (v === undefined || v === '' || isNaN(Number(v))) continue;
      const x = Math.max(0, Math.min(TRACK_W, ((Number(v) - col.min) / range) * TRACK_W));
      pts.push(`${x.toFixed(1)},${i * pxPerRow}`);
    }
    return pts.length > 1 ? 'M ' + pts.join(' L ') : '';
  }, [rows, col.key, col.min, range, pxPerRow]);

  if (!linePath) return null;
  return <path d={linePath} fill="none" stroke={col.color} strokeWidth={2} strokeLinejoin="round" />;
}

// ─── Static depth track (memoized — never re-renders on hover) ────────────────

type DepthTick = { depth: number; y: number; show: boolean };

const StaticDepthSVG = memo(function StaticDepthSVG({ depthTicks, totalH, gridColor, depthColor }: {
  depthTicks: DepthTick[];
  totalH: number;
  gridColor: string;
  depthColor: string;
}) {
  return (
    <div className="flex-shrink-0" style={{ width: DEPTH_W, borderRight: `1px solid ${gridColor}` }}>
      <svg width={DEPTH_W} height={totalH} style={{ display: 'block' }}>
        {depthTicks.map(({ depth, y, show }) => (
          <g key={depth}>
            <line x1={0} y1={y} x2={DEPTH_W} y2={y} stroke={gridColor} strokeWidth={1} />
            {show && (
              <text x={DEPTH_W - 4} y={y + 9} textAnchor="end" fontSize={9} fill={depthColor}>{depth}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
});

// ─── Static track (1 or more curves, memoized) ────────────────────────────────

const StaticTrackSVG = memo(function StaticTrackSVG({ cols, rows, depthTicks, totalH, pxPerRow, gridColor, trackBg }: {
  cols: ColMeta[];          // 1+ columns overlaid in this track
  rows: DataRow[];
  depthTicks: DepthTick[];
  totalH: number;
  pxPerRow: number;
  gridColor: string;
  trackBg: string;
}) {
  return (
    <div className="flex-shrink-0" style={{ width: TRACK_W, borderRight: `1px solid ${gridColor}`, background: trackBg }}>
      <svg width={TRACK_W} height={totalH} style={{ display: 'block' }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={f * TRACK_W} y1={0} x2={f * TRACK_W} y2={totalH} stroke={gridColor} strokeWidth={1} />
        ))}
        {depthTicks.map(({ depth, y }) => (
          <line key={depth} x1={0} y1={y} x2={TRACK_W} y2={y} stroke={gridColor} strokeWidth={1} opacity={0.3} />
        ))}
        {cols.map((col) => (
          <CurvePath key={col.key} rows={rows} col={col} pxPerRow={pxPerRow} />
        ))}
      </svg>
    </div>
  );
});

// ─── Hover overlay (only this re-renders on mouse move) ───────────────────────

function HoverOverlay({ hoverY, hoverRow, activeCols, totalH, colTrackX }: {
  hoverY: number | null;
  hoverRow: DataRow | null;
  activeCols: ColMeta[];
  totalH: number;
  colTrackX: Map<string, number>; // colKey → absolute left px of its track
}) {
  if (hoverY === null) return null;
  const totalW = DEPTH_W + (new Set(activeCols.map((c) => c.trackId)).size) * TRACK_W;

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 14, overflow: 'visible' }}
      width={totalW}
      height={totalH}
    >
      {/* Full-width crosshair */}
      <line x1={0} y1={hoverY} x2={totalW} y2={hoverY} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />

      {/* Depth dot */}
      <circle cx={DEPTH_W - 5} cy={hoverY} r={4.5} fill="#4fc3f7" stroke="white" strokeWidth={1.5} />

      {/* Per-column dot + value pill */}
      {hoverRow && activeCols.map((col) => {
        const v = hoverRow[col.key];
        if (v === undefined || v === '' || isNaN(Number(v))) return null;
        const range = col.max - col.min || 1;
        const trackLeft = colTrackX.get(col.key) ?? 0;
        const xInTrack = Math.max(0, Math.min(TRACK_W, ((Number(v) - col.min) / range) * TRACK_W));
        const cx = trackLeft + xInTrack;
        const valStr = Number(v).toFixed(2);
        const displayStr = valStr + (col.unit ? ` ${col.unit}` : '');
        const charW = 6.8;
        const pillW = displayStr.length * charW + 10;
        const pillX = cx + pillW + 4 <= trackLeft + TRACK_W ? cx + 4 : cx - pillW - 4;
        return (
          <g key={col.key}>
            <circle cx={cx} cy={hoverY} r={4.5} fill={col.color} stroke="white" strokeWidth={1.5} />
            <rect x={pillX} y={hoverY - 9} width={pillW} height={17} rx={4}
              fill="#141414" stroke={col.color} strokeWidth={1.2} />
            <text x={pillX + pillW / 2} y={hoverY + 4.5} textAnchor="middle"
              fontSize={10} fill="white" fontFamily="monospace" fontWeight="700">
              {displayStr}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Well Log View ─────────────────────────────────────────────────────────────

function WellLogView({ rows, cols, visibleCols }: {
  rows: DataRow[]; cols: ColMeta[]; visibleCols: Set<string>;
}) {
  const { dark, border, muted } = useColors();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPos,   setTipPos]   = useState({ x: 0, y: 0 });
  const [zoomIdx,  setZoomIdx]  = useState(DEFAULT_ZOOM_IDX);
  const rafRef = useRef<number | null>(null);

  const pxPerRow   = ZOOM_STEPS[zoomIdx];
  const labelStep  = Math.max(1, Math.ceil(11 / pxPerRow));
  const activeCols = cols.filter((c) => visibleCols.has(c.key));

  const bg         = dark ? '#070709' : '#f1f5f9';
  const trackBg    = dark ? '#0f0f14' : '#ffffff';
  const gridColor  = dark ? '#1a1a24' : '#e2e8f0';
  const depthColor = dark ? '#6b7a9a' : '#475569';
  const totalH     = rows.length * pxPerRow;

  const depthTicks = useMemo(() =>
    rows.map((r, i) => ({
      depth: r.depth,
      y: i * pxPerRow,
      show: i === 0 || i === rows.length - 1 || r.depth % labelStep === 0,
    })),
    [rows, pxPerRow, labelStep]
  );

  // Group columns by trackId (preserving insertion order of first occurrence)
  const trackGroups = useMemo(() => {
    const map = new Map<string, ColMeta[]>();
    for (const col of activeCols) {
      const g = map.get(col.trackId) ?? [];
      g.push(col);
      map.set(col.trackId, g);
    }
    return Array.from(map.values()); // array of groups
  }, [activeCols]);

  // Map: colKey → absolute left px of its track (for HoverOverlay)
  const colTrackX = useMemo(() => {
    const m = new Map<string, number>();
    trackGroups.forEach((group, gi) => {
      group.forEach((col) => m.set(col.key, DEPTH_W + gi * TRACK_W));
    });
    return m;
  }, [trackGroups]);

  const hoverRow = hoverIdx !== null ? rows[hoverIdx] : null;
  const hoverY   = hoverIdx !== null ? hoverIdx * pxPerRow : null;

  const zoomIn  = () => setZoomIdx((z) => Math.min(z + 1, ZOOM_STEPS.length - 1));
  const zoomOut = () => setZoomIdx((z) => Math.max(z - 1, 0));

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) setZoomIdx((z) => Math.min(z + 1, ZOOM_STEPS.length - 1));
    else              setZoomIdx((z) => Math.max(z - 1, 0));
  }, []);

  const onOverlayMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (rafRef.current !== null) return;
    const offsetY = e.nativeEvent.offsetY;
    const cx = e.clientX;
    const cy = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const idx = Math.floor(offsetY / pxPerRow);
      if (idx >= 0 && idx < rows.length) {
        setHoverIdx(idx);
        setTipPos({ x: cx, y: cy });
      }
    });
  }, [rows.length, pxPerRow]);

  const onOverlayLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHoverIdx(null);
  }, []);

  return (
    <div
      className="rounded-xl overflow-auto border select-none"
      style={{ borderColor: border, background: bg, maxHeight: 680 }}
      onWheel={onWheel}
    >
      {/* Headers */}
      <div className="flex sticky top-0 z-20" style={{ background: bg, borderBottom: `1px solid ${gridColor}` }}>
        <div className="flex-shrink-0 flex flex-col items-center justify-end pb-1 pt-2"
          style={{ width: DEPTH_W, borderRight: `1px solid ${gridColor}` }}>
          <span className="text-xs font-bold" style={{ color: depthColor }}>DEPTH</span>
          <span className="text-xs" style={{ color: muted }}>ft</span>
        </div>
        {trackGroups.map((group) => (
          <div key={group[0].trackId} className="flex flex-col items-stretch pt-1 pb-1 flex-shrink-0"
            style={{ width: TRACK_W, borderRight: `1px solid ${gridColor}` }}>
            {/* Color bars for each curve in group */}
            <div className="flex h-1 w-full overflow-hidden">
              {group.map((col) => (
                <div key={col.key} className="flex-1" style={{ background: col.color }} />
              ))}
            </div>
            {/* Labels */}
            <div className="text-center px-1 mt-0.5">
              {group.map((col) => (
                <div key={col.key} className="text-xs font-bold leading-tight" style={{ color: col.color }}>
                  {col.label}{col.unit ? ` (${col.unit})` : ''}
                </div>
              ))}
            </div>
            {/* Min/max of first curve */}
            <div className="flex justify-between px-1 mt-0.5">
              <span style={{ color: '#8aabb8', fontSize: 9 }}>{group[0].min.toFixed(1)}</span>
              <span style={{ color: '#8aabb8', fontSize: 9 }}>{group[0].max.toFixed(1)}</span>
            </div>
          </div>
        ))}
        {/* Zoom controls */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-2" style={{ minWidth: 56 }}>
          <button onClick={zoomIn} disabled={zoomIdx === ZOOM_STEPS.length - 1}
            title="Zoom in"
            className="flex items-center justify-center rounded-lg font-bold text-base disabled:opacity-30"
            style={{ width: 28, height: 28, background: dark ? '#1a1a1a' : '#e2e8f0', border: `1px solid ${gridColor}`, color: depthColor }}>
            +
          </button>
          <span style={{ color: depthColor, fontSize: 10, fontFamily: 'monospace' }}>{pxPerRow}px</span>
          <button onClick={zoomOut} disabled={zoomIdx === 0}
            title="Zoom out"
            className="flex items-center justify-center rounded-lg font-bold text-base disabled:opacity-30"
            style={{ width: 28, height: 28, background: dark ? '#1a1a1a' : '#e2e8f0', border: `1px solid ${gridColor}`, color: depthColor }}>
            −
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex relative" style={{ height: totalH }}>
        <StaticDepthSVG depthTicks={depthTicks} totalH={totalH} gridColor={gridColor} depthColor={depthColor} />

        {trackGroups.map((group) => (
          <StaticTrackSVG
            key={group[0].trackId}
            cols={group}
            rows={rows}
            depthTicks={depthTicks}
            totalH={totalH}
            pxPerRow={pxPerRow}
            gridColor={gridColor}
            trackBg={trackBg}
          />
        ))}

        <HoverOverlay
          hoverY={hoverY}
          hoverRow={hoverRow}
          activeCols={activeCols}
          totalH={totalH}
          colTrackX={colTrackX}
        />

        <div
          style={{ position: 'absolute', inset: 0, zIndex: 15, cursor: 'crosshair' }}
          onMouseMove={onOverlayMove}
          onMouseLeave={onOverlayLeave}
        />
      </div>

      {hoverRow && hoverIdx !== null && (
        <div style={{
          position: 'fixed', left: tipPos.x + 14, top: tipPos.y - 14,
          zIndex: 9999, background: dark ? 'linear-gradient(160deg, #1c1c22 0%, #101013 100%)' : '#ffffff', border: `1px solid ${depthColor}`,
          borderRadius: 6, padding: '3px 9px', pointerEvents: 'none',
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)', fontSize: 11,
          fontWeight: 700, color: depthColor, letterSpacing: 0.3, whiteSpace: 'nowrap',
        }}>
          {hoverRow.depth} ft
        </div>
      )}
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

function TableView({ rows, cols, hasTime }: { rows: DataRow[]; cols: ColMeta[]; hasTime: boolean }) {
  const { dark, border, text, muted } = useColors();

  return (
    <div className="overflow-auto rounded-xl border" style={{ borderColor: border, maxHeight: 600 }}>
      <table className="w-full text-xs border-collapse" style={{ fontFamily: 'monospace' }}>
        <thead className="sticky top-0 z-10" style={{ background: dark ? '#1a1a1a' : '#f1f5f9' }}>
          <tr>
            <th className="px-3 py-2 text-right border-b font-semibold" style={{ borderColor: border, color: '#4fc3f7' }}>DEPTH</th>
            {hasTime && <th className="px-3 py-2 text-left border-b font-semibold" style={{ borderColor: border, color: muted }}>Date/Time</th>}
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right border-b font-semibold" style={{ borderColor: border, color: c.color }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b" style={{ borderColor: `${border}44` }}>
              <td className="px-3 py-0.5 text-right font-bold" style={{ color: text }}>{row.depth}</td>
              {hasTime && <td className="px-3 py-0.5 text-left" style={{ color: muted }}>{row.time ?? ''}</td>}
              {cols.map((c) => (
                <td key={c.key} className="px-3 py-0.5 text-right" style={{ color: text }}>
                  {row[c.key] !== undefined && row[c.key] !== '' ? Number(row[c.key]).toFixed(3) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

type ViewMode = 'log' | 'table';

interface WellLite { id: string; name: string; wellNumber: string; companyId: string }
interface CompanyLite { id: string; name: string }

export default function WellLogXlsxViewer() {
  const { dark, border, text, cardBg, muted, inputStyle } = useColors();

  const [rows, setRows]           = useState<DataRow[]>([]);
  const [cols, setCols]           = useState<ColMeta[]>([]);
  const [hasTime, setHasTime]     = useState(false);
  const [visibleCols, setVisible] = useState<Set<string>>(new Set());
  const [fileName, setFileName]   = useState('');
  const [view, setView]           = useState<ViewMode>('log');
  const [notice, setNotice]       = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [loading, setLoading]     = useState(false);
  const fileRef                   = useRef<HTMLInputElement>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft]           = useState<{ label: string; unit: string; color: string; trackId: string }>({
    label: '', unit: '', color: '', trackId: '',
  });

  // ── Well / Company for save ────────────────────────────────────────────────
  const [companies,  setCompanies]  = useState<CompanyLite[]>([]);
  const [wells,      setWells]      = useState<WellLite[]>([]);
  const [companyId,  setCompanyId]  = useState('');
  const [wellId,     setWellId]     = useState('');
  const [saving,     setSaving]     = useState(false);
  const [savedWellId, setSavedWellId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: CompanyLite[] }>('companies').then((r) => setCompanies(r.data ?? [])).catch(() => {});
    apiFetch<{ data: WellLite[] }>('wells').then((r) => setWells(r.data ?? [])).catch(() => {});
  }, []);

  const filteredWells = useMemo(
    () => wells.filter((w) => !companyId || w.companyId === companyId),
    [wells, companyId],
  );

  const openEditor = (col: ColMeta) => {
    setEditingKey(col.key);
    setDraft({ label: col.label, unit: col.unit, color: col.color, trackId: col.trackId });
  };
  const saveEdit = () => {
    if (!editingKey) return;
    setCols((prev) => prev.map((c) => c.key === editingKey ? { ...c, ...draft } : c));
    setEditingKey(null);
  };

  const gaps      = useMemo(() => detectGaps(rows), [rows]);
  const dups      = useMemo(() => detectDups(rows), [rows]);
  const issueCount = gaps.length + dups.length;

  const handleFile = useCallback(async (file: File) => {
    setNotice(null);
    setHasTime(false);
    setLoading(true);
    try {
      const buf   = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);

      if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
        setNotice({ kind: 'error', msg: 'Invalid file — not a valid XLSX (ZIP) container. Upload a real .xlsx file.' });
        setLoading(false);
        return;
      }

      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      if (!raw.length) { setNotice({ kind: 'error', msg: 'Sheet is empty.' }); setLoading(false); return; }

      const allKeys  = Object.keys(raw[0]);
      const depthKey = allKeys.find(isDepthHeader);
      if (!depthKey) { setNotice({ kind: 'error', msg: 'No DEPTH column found.' }); setLoading(false); return; }

      const timeKey   = allKeys.find(isTimeHeader);
      const paramKeys = allKeys.filter((k) => k !== depthKey && k !== timeKey && k !== undefined);

      const newCols: ColMeta[] = paramKeys.map((key, i) => {
        const vals = raw.map((r) => Number(r[key])).filter((v) => !isNaN(v));
        return {
          key, label: key, unit: '',
          min: vals.length ? +Math.min(...vals).toFixed(3) : 0,
          max: vals.length ? +Math.max(...vals).toFixed(3) : 1,
          color: PALETTE[i % PALETTE.length],
          trackId: key, // each channel starts in its own track
        };
      });

      const parsed: DataRow[] = raw
        .map((r) => {
          const depth = parseFloat(String(r[depthKey]));
          if (isNaN(depth)) return null;
          const row: DataRow = { depth };
          if (timeKey) row.time = String(r[timeKey]);
          for (const key of paramKeys) {
            const v = parseFloat(String(r[key]));
            row[key] = isNaN(v) ? undefined : v;
          }
          return row;
        })
        .filter((r): r is DataRow => r !== null)
        .sort((a, b) => a.depth - b.depth);

      if (!parsed.length) { setNotice({ kind: 'error', msg: 'No valid rows.' }); setLoading(false); return; }

      setRows(parsed);
      setCols(newCols);
      setHasTime(!!timeKey);
      setVisible(new Set(newCols.map((c) => c.key)));
      setFileName(file.name);
      setNotice({ kind: 'ok', msg: `Loaded ${parsed.length} rows, ${newCols.length} channels from "${file.name}".` });
    } catch (err) {
      setNotice({ kind: 'error', msg: `Parse error: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '';
  };

  const doAutoFill = () => {
    const filled = autoFill(rows);
    setNotice({ kind: 'ok', msg: `${filled.length - rows.length} rows inserted for depth gaps.` });
    setRows(filled);
  };

  const doMerge = () => {
    const merged = mergeDups(rows, cols);
    setNotice({ kind: 'ok', msg: `${rows.length - merged.length} duplicate depth rows merged.` });
    setRows(merged);
  };

  const doSave = async () => {
    if (!wellId) { setNotice({ kind: 'error', msg: 'Pehle ek well select karo.' }); return; }
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        wellId,
        fileName,
        rows: rows.map((r) => {
          const out: Record<string, number | string | undefined> = { depth: r.depth };
          if (r.time) out.time = r.time;
          for (const c of cols) out[c.key] = r[c.key];
          return out;
        }),
        channels: cols.map((c) => ({ key: c.key, label: c.label, unit: c.unit, min: c.min, max: c.max })),
      };
      await apiFetch(`data-cleanup/${wellId}/import-depth-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSavedWellId(wellId);
      setNotice({ kind: 'ok', msg: `${rows.length} rows "${fileName}" saved to DB successfully.` });
    } catch (err) {
      setNotice({ kind: 'error', msg: `Save failed: ${(err as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  const doExport = () => {
    const activeCols = cols.filter((c) => visibleCols.has(c.key));
    const csv  = toCSV(rows, activeCols, hasTime);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.xlsx?$/i, '_cleaned.csv') || 'data_cleaned.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleCol = (key: string) =>
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // All unique trackIds currently in use (for the "Group with" dropdown)
  const trackOptions = useMemo(() => {
    const seen = new Map<string, string>(); // trackId → first label
    for (const c of cols) {
      if (!seen.has(c.trackId)) seen.set(c.trackId, c.label);
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [cols]);

  return (
    <div className="space-y-5" style={{ color: text }}>
      {/* Upload zone */}
      <div
        className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-10 cursor-pointer"
        style={{ borderColor: border, background: dark ? 'transparent' : '#f8fafc' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileRef.current?.click()}
      >
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p className="text-sm font-semibold" style={{ color: text }}>
          {loading ? 'Reading file…' : 'Drop XLSX file here or click to browse'}
        </p>
        <p className="text-xs" style={{ color: muted }}>Magic-byte verified — only valid .xlsx accepted</p>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onInputChange} />
      </div>

      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.msg}</Notice>}

      {/* View saved data link */}
      {savedWellId && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: '#052010', border: '1px solid #22c55e55' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span className="text-sm font-semibold" style={{ color: '#22c55e' }}>Data DB mein save ho gaya!</span>
          <a
            href={`/witsml/depth-data?wellId=${savedWellId}`}
            className="text-sm font-bold underline ml-auto"
            style={{ color: '#4fc3f7' }}
          >
            View in Depth Log →
          </a>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Save to DB */}
          <div className="rounded-xl border p-4 flex flex-wrap items-end gap-4"
            style={{ background: cardBg, borderColor: border }}>
            <div className="flex items-center gap-2 w-full">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
                <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
              </svg>
              <span className="text-sm font-bold" style={{ color: text }}>Save to Database</span>
              <span className="text-xs" style={{ color: muted }}>→ mud-log/import</span>
            </div>

            {/* Company filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: muted }}>Company (filter)</label>
              <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setWellId(''); }}
                className="text-sm px-3 py-1.5 rounded-lg outline-none border"
                style={{ ...inputStyle, width: 180 }}>
                <option value="">— All companies —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Well selector */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: muted }}>
                Well <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select value={wellId} onChange={(e) => setWellId(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-lg outline-none border"
                style={{ ...inputStyle, width: 220 }}>
                <option value="">— Select well —</option>
                {filteredWells.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.wellNumber})</option>
                ))}
              </select>
            </div>

            <Btn kind="success" small onClick={doSave} disabled={saving || !wellId}>
              {saving ? 'Saving…' : `Save ${rows.length} rows`}
            </Btn>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: cardBg, border: `1px solid ${border}` }}>
            <Badge tone="blue">{rows.length} rows</Badge>
            <Badge tone={issueCount === 0 ? 'green' : 'amber'}>
              {issueCount === 0 ? 'No issues' : `${issueCount} issue${issueCount > 1 ? 's' : ''}`}
            </Badge>
            <span className="text-xs font-mono" style={{ color: muted }}>
              {rows[0]?.depth} – {rows[rows.length - 1]?.depth} ft
            </span>
            <div className="flex-1" />
            {gaps.length  > 0 && <Btn kind="neutral" small onClick={doAutoFill}>Auto-fill Gaps</Btn>}
            {dups.length  > 0 && <Btn kind="neutral" small onClick={doMerge}>Merge Duplicates</Btn>}
            <Btn kind="success" small onClick={doExport}>Export CSV</Btn>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: border }}>
              {(['log', 'table'] as ViewMode[]).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className="px-3 py-1 text-xs font-semibold"
                  style={{ background: view === v ? '#1d6fbf' : 'transparent', color: view === v ? 'white' : muted }}>
                  {v === 'log' ? 'Log View' : 'Table'}
                </button>
              ))}
            </div>
          </div>

          {/* Channel pills */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold" style={{ color: muted }}>Channels:</span>
            {cols.map((c) => {
              const on = visibleCols.has(c.key);
              const isEditing = editingKey === c.key;
              // Show a small "grouped" badge if trackId differs from key
              const isGrouped = c.trackId !== c.key;
              return (
                <div key={c.key} className="flex items-center gap-0.5">
                  <button onClick={() => toggleCol(c.key)}
                    className="text-xs px-2.5 py-1 rounded-l-full border-y border-l font-semibold transition-opacity"
                    style={{ borderColor: c.color, color: on ? 'white' : c.color, background: on ? c.color : 'transparent', opacity: on ? 1 : 0.55 }}>
                    {c.label}{c.unit ? ` (${c.unit})` : ''}
                    {isGrouped && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.8 }}>⊕</span>}
                  </button>
                  <button
                    onClick={() => isEditing ? setEditingKey(null) : openEditor(c)}
                    title="Edit channel"
                    className="flex items-center justify-center rounded-r-full border-y border-r"
                    style={{ width: 24, height: 24, borderColor: c.color, background: isEditing ? c.color : 'transparent', color: isEditing ? 'white' : c.color, opacity: on ? 1 : 0.55 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Inline channel editor */}
          {editingKey && (() => {
            const col = cols.find((c) => c.key === editingKey)!;
            return (
              <div className="rounded-xl border p-4 flex flex-wrap items-end gap-4"
                style={{ background: cardBg, borderColor: col.color + '88', borderWidth: 1.5 }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: col.color }} />
                  <span className="text-xs font-bold" style={{ color: col.color }}>Editing: {col.key}</span>
                </div>
                <div className="flex flex-wrap gap-3 items-end flex-1">
                  {/* Label */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold" style={{ color: muted }}>Display Name</label>
                    <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                      className="text-sm px-3 py-1.5 rounded-lg outline-none border"
                      style={{ ...inputStyle, width: 140 }} />
                  </div>
                  {/* Unit */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold" style={{ color: muted }}>Unit</label>
                    <input value={draft.unit} placeholder="e.g. klbs, rpm, psi"
                      onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                      className="text-sm px-3 py-1.5 rounded-lg outline-none border"
                      style={{ ...inputStyle, width: 120 }} />
                  </div>
                  {/* Color */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold" style={{ color: muted }}>Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={draft.color}
                        onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                        className="rounded cursor-pointer"
                        style={{ width: 36, height: 32, padding: 2, border: `1px solid ${border}`, background: 'transparent' }} />
                      <input value={draft.color}
                        onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                        className="text-sm px-3 py-1.5 rounded-lg outline-none border font-mono"
                        style={{ ...inputStyle, width: 100 }} />
                    </div>
                  </div>
                  {/* Group with */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold" style={{ color: muted }}>Group with track</label>
                    <select
                      value={draft.trackId}
                      onChange={(e) => setDraft((d) => ({ ...d, trackId: e.target.value }))}
                      className="text-sm px-3 py-1.5 rounded-lg outline-none border"
                      style={{ ...inputStyle, width: 160 }}
                    >
                      {/* Own track option */}
                      <option value={col.key}>— Own track —</option>
                      {/* All other channels' trackIds */}
                      {trackOptions
                        .filter((t) => t.id !== col.key)
                        .map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))
                      }
                    </select>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2">
                    <Btn kind="primary" small onClick={saveEdit}>Save</Btn>
                    <Btn kind="neutral" small onClick={() => setEditingKey(null)}>Cancel</Btn>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              {view === 'log'
                ? <WellLogView rows={rows} cols={cols} visibleCols={visibleCols} />
                : <TableView rows={rows} cols={cols} hasTime={hasTime} />
              }
            </div>
            {issueCount > 0 && (
              <div className="w-64 flex-shrink-0 rounded-xl border p-4 space-y-2 self-start"
                style={{ background: cardBg, borderColor: border }}>
                <h3 className="text-sm font-bold" style={{ color: text }}>Issues ({issueCount})</h3>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {dups.map((d) => (
                    <div key={`dup-${d}`} className="text-xs rounded px-3 py-1.5"
                      style={{ background: '#ef444414', border: '1px solid #ef444455', color: '#ef4444' }}>
                      <span className="font-bold mr-1">DUP</span>Duplicate depth {d} ft
                    </div>
                  ))}
                  {gaps.map((g, i) => (
                    <div key={i} className="text-xs rounded px-3 py-1.5"
                      style={{ background: '#f59e0b14', border: '1px solid #f59e0b55', color: '#f59e0b' }}>
                      <span className="font-bold mr-1">GAP</span>{g.from}–{g.to} ft ({g.gap.toFixed(0)} ft)
                    </div>
                  ))}
                </div>
                <div className="pt-2 space-y-2 border-t" style={{ borderColor: border }}>
                  {dups.length > 0 && <Btn kind="danger"  small onClick={doMerge}>Fix Duplicates</Btn>}
                  {gaps.length > 0 && <Btn kind="primary" small onClick={doAutoFill}>Fill Gaps</Btn>}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
