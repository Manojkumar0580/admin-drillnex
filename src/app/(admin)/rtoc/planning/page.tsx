'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminStore } from '@/store/useAdminStore';
import { useCompanies } from '@/lib/useCompanies';

// ─── Types ────────────────────────────────────────────────────────────────────

type DocStatus = 'pending' | 'green' | 'red';
type DocType   = 'planning' | 'cost';

interface DocInfo {
  status:     DocStatus;
  fileName:   string | null;
  fileSize:   number | null;
  errorMsg:   string | null;
  uploadedAt: string | null;
  uploadedBy: string | null;
}

interface WellRow {
  id:          string;
  wellName:    string;
  wellNumber:  string;
  wellStatus:  string;
  companyId:   string;
  companyName: string;
  planning:    DocInfo;
  cost:        DocInfo;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res  = await fetch(`/api/backend/${path}`, { cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data as T;
}

function fmtBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<DocStatus, { label: string; bg: string; color: string; dot: string }> = {
  green:   { label: 'Updated',  bg: '#16a34a1f', color: '#16a34a', dot: '#22c55e' },
  red:     { label: 'Error',    bg: '#dc26261f', color: '#dc2626', dot: '#ef4444' },
  pending: { label: 'Pending',  bg: '#d976061f', color: '#d97606', dot: '#f59e0b' },
};

function StatusBadge({ status, errorMsg }: { status: DocStatus; errorMsg: string | null }) {
  const cfg = STATUS_CFG[status];
  return (
    <span
      title={status === 'red' && errorMsg ? errorMsg : undefined}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full cursor-default"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44` }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}

// ─── 3-dot dropdown ───────────────────────────────────────────────────────────

function DotsMenu({
  row, border, text, muted, panelBg,
  onUpload, onReset,
}: {
  row: WellRow;
  border: string; text: string; muted: string; panelBg: string;
  onUpload: (row: WellRow, type: DocType) => void;
  onReset:  (row: WellRow, type: DocType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const items: { label: string; action: () => void }[] = [
    { label: 'Upload Planning File', action: () => { setOpen(false); onUpload(row, 'planning'); } },
    { label: 'Upload Cost File',     action: () => { setOpen(false); onUpload(row, 'cost');     } },
    { label: 'Reset Planning →Pending', action: () => { setOpen(false); onReset(row, 'planning'); } },
    { label: 'Reset Cost →Pending',  action: () => { setOpen(false); onReset(row, 'cost');     } },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
        style={{ color: muted, background: open ? `${muted}22` : 'transparent', border: `1px solid ${open ? muted + '44' : 'transparent'}` }}
        aria-label="Actions"
      >
        <span style={{ fontSize: 18, letterSpacing: 1, lineHeight: 1 }}>⋮</span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 rounded-xl shadow-xl overflow-hidden"
          style={{ top: 'calc(100% + 4px)', minWidth: 200, background: panelBg, border: `1px solid ${border}` }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              className="w-full text-left text-xs px-4 py-2.5 transition-colors hover:bg-black/10"
              style={{ color: text, borderBottom: i < items.length - 1 ? `1px solid ${border}` : undefined }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadModal({
  row, type, dark, onClose, onDone,
}: {
  row: WellRow;
  type: DocType;
  dark: boolean;
  onClose: () => void;
  onDone: (wellId: string, type: DocType, result: { status: DocStatus; fileName: string | null; fileSize: number | null; errorMsg: string | null; uploadedAt: string | null }) => void;
}) {
  const [file,     setFile]     = useState<File | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [result,   setResult]   = useState<{ status: DocStatus; errorMsg: string | null; fileName: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cardBg  = dark ? 'linear-gradient(160deg, #1c1c22 0%, #101013 100%)' : '#ffffff';
  const border  = dark ? '#1e1e2a' : '#e2e8f0';
  const text    = dark ? '#f0f0f0' : '#0f172a';
  const muted   = dark ? '#666666' : '#94a3b8';
  const overlay = 'rgba(0,0,0,0.65)';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      const data = await apiFetch<{
        success: boolean;
        data: { status: DocStatus; fileName: string | null; fileSize: number | null; errorMsg: string | null; uploadedAt: string | null };
      }>(`planning/${row.id}/upload`, { method: 'POST', body: form });
      setResult({ status: data.data.status, errorMsg: data.data.errorMsg, fileName: data.data.fileName });
      onDone(row.id, type, data.data);
    } catch (e) {
      setResult({ status: 'red', errorMsg: (e as Error).message, fileName: file.name });
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = type === 'planning' ? 'Planning' : 'Cost';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: overlay, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-2xl shadow-2xl w-full max-w-md mx-4" style={{ background: cardBg, border: `1px solid ${border}` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: text }}>Upload {typeLabel} File</p>
            <p className="text-xs mt-0.5" style={{ color: muted }}>{row.wellName} · {row.companyName}</p>
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded" style={{ color: muted }}>✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Accepted formats notice */}
          <p className="text-xs" style={{ color: muted }}>
            Accepted: <strong style={{ color: text }}>CSV, XLSX, XLS, PDF, DOCX, DOC</strong> · Max 10 MB.
            File content is validated — an empty or corrupt file will be rejected.
          </p>

          {/* File picker */}
          <div
            onClick={() => inputRef.current?.click()}
            className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-8 cursor-pointer transition-colors hover:opacity-80"
            style={{ borderColor: file ? '#16a34a88' : border }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={file ? '#16a34a' : muted} strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="text-xs font-medium" style={{ color: file ? '#16a34a' : muted }}>
              {file ? file.name : 'Click to browse'}
            </p>
            {file && <p className="text-xs" style={{ color: muted }}>{fmtBytes(file.size)}</p>}
          </div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.pdf,.docx,.doc" className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />

          {/* Result */}
          {result && (
            <div className="rounded-lg p-3" style={{
              background: result.status === 'green' ? '#16a34a1f' : '#dc26261f',
              border: `1px solid ${result.status === 'green' ? '#16a34a44' : '#dc262644'}`,
            }}>
              <p className="text-xs font-semibold" style={{ color: result.status === 'green' ? '#16a34a' : '#dc2626' }}>
                {result.status === 'green' ? '✓ File validated and accepted' : '✗ Validation failed'}
              </p>
              {result.errorMsg && (
                <p className="text-xs mt-1" style={{ color: result.status === 'green' ? '#16a34a' : '#dc2626' }}>
                  {result.errorMsg}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={submit}
            disabled={!file || busy}
            className="flex-1 text-sm font-semibold py-2 rounded-lg disabled:opacity-50 transition-opacity"
            style={{ background: '#1d6fbf', color: '#fff' }}
          >
            {busy ? 'Uploading…' : 'Upload & Validate'}
          </button>
          <button
            onClick={onClose}
            className="px-4 text-sm rounded-lg"
            style={{ background: 'transparent', color: muted, border: `1px solid ${border}` }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const WELL_STATUS_OPTS = ['active', 'paused', 'completed'];

export default function PlanningStatusPage() {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';

  const cardBg  = dark ? 'linear-gradient(160deg, #1c1c22 0%, #101013 100%)' : '#ffffff';
  const border  = dark ? '#1e1e2a' : '#e2e8f0';
  const text    = dark ? '#f0f0f0' : '#0f172a';
  const muted   = dark ? '#666666' : '#94a3b8';
  const panelBg = dark ? '#0b0b10' : '#f8fafc';
  const inputSt = { background: dark ? '#101016' : '#f8fafc', borderColor: border, color: text };

  const { data: companies = [] } = useCompanies();

  const [rows,       setRows]       = useState<WellRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [compFilter, setCompFilter] = useState('');
  const [statFilter, setStatFilter] = useState('');
  const [docFilter,  setDocFilter]  = useState<'' | 'green' | 'red' | 'pending'>('');
  const [search,     setSearch]     = useState('');

  const [uploadTarget, setUploadTarget] = useState<{ row: WellRow; type: DocType } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (compFilter) params.set('companyId', compFilter);
      if (statFilter) params.set('status', statFilter);
      const qs = params.toString();
      const r  = await apiFetch<{ success: boolean; data: WellRow[] }>(`planning${qs ? `?${qs}` : ''}`);
      setRows(r.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [compFilter, statFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleReset(row: WellRow, type: DocType) {
    try {
      await apiFetch(`planning/${row.id}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      setRows((prev) =>
        prev.map((r) =>
          r.id !== row.id ? r : {
            ...r,
            [type]: { status: 'pending', fileName: null, fileSize: null, errorMsg: null, uploadedAt: null, uploadedBy: null },
          }
        )
      );
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function handleUploadDone(
    wellId: string,
    type: DocType,
    result: { status: DocStatus; fileName: string | null; fileSize: number | null; errorMsg: string | null; uploadedAt: string | null }
  ) {
    setRows((prev) =>
      prev.map((r) =>
        r.id !== wellId ? r : {
          ...r,
          [type]: {
            status:     result.status,
            fileName:   result.fileName,
            fileSize:   result.fileSize,
            errorMsg:   result.errorMsg,
            uploadedAt: result.uploadedAt,
            uploadedBy: null,
          },
        }
      )
    );
  }

  const filtered = rows.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.wellName.toLowerCase().includes(q) && !r.companyName.toLowerCase().includes(q)) return false;
    }
    if (docFilter) {
      if (r.planning.status !== docFilter && r.cost.status !== docFilter) return false;
    }
    return true;
  });

  const wellStatusLabel = (s: string) =>
    s === 'active' ? '🟢 Active' : s === 'paused' ? '🟡 Paused' : s === 'completed' ? '⚪ Completed' : s;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: text }}>Planning Status</h1>
          <p className="text-xs mt-0.5" style={{ color: muted }}>RTOC — planning and cost document status per well</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          style={{ background: '#1d6fbf', color: '#fff' }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border p-4" style={{ background: cardBg, borderColor: border }}>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>Search</label>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Well or client…"
              className="text-xs px-3 py-2 rounded-lg border outline-none w-44"
              style={inputSt}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>Client</label>
            <select value={compFilter} onChange={(e) => setCompFilter(e.target.value)} className="text-xs px-3 py-2 rounded-lg border outline-none w-44" style={inputSt}>
              <option value="">All clients</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>Well Status</label>
            <select value={statFilter} onChange={(e) => setStatFilter(e.target.value)} className="text-xs px-3 py-2 rounded-lg border outline-none w-44" style={inputSt}>
              <option value="">All statuses</option>
              {WELL_STATUS_OPTS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>Doc Status</label>
            <select value={docFilter} onChange={(e) => setDocFilter(e.target.value as typeof docFilter)} className="text-xs px-3 py-2 rounded-lg border outline-none w-36" style={inputSt}>
              <option value="">All</option>
              <option value="green">Updated</option>
              <option value="pending">Pending</option>
              <option value="red">Error</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="rounded-xl border overflow-hidden" style={{ background: cardBg, borderColor: border }}>
        {/* Legend */}
        <div className="px-6 py-3 flex items-center gap-4 flex-wrap" style={{ borderBottom: `1px solid ${border}`, background: panelBg }}>
          <span className="text-xs font-semibold" style={{ color: muted }}>Legend:</span>
          {(['green', 'pending', 'red'] as DocStatus[]).map((s) => {
            const cfg = STATUS_CFG[s];
            return (
              <span key={s} className="flex items-center gap-1.5 text-xs" style={{ color: cfg.color }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
                {cfg.label}
              </span>
            );
          })}
          <span className="text-xs ml-auto" style={{ color: muted }}>{filtered.length} well{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: `1px solid ${border}`, background: panelBg }}>
                {['Client', 'Well', 'Well Status', 'Planning Status', 'Cost Status', 'Last Update', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: muted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-16" style={{ color: muted }}>Loading…</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16" style={{ color: muted }}>
                    {rows.length === 0 ? 'No wells found. Add wells in WITSML → Wells.' : 'No results match the current filters.'}
                  </td>
                </tr>
              )}
              {filtered.map((row, i) => {
                const lastUpdate = [row.planning.uploadedAt, row.cost.uploadedAt]
                  .filter(Boolean)
                  .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: i < filtered.length - 1 ? `1px solid ${border}` : undefined,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = dark ? '#ffffff08' : '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: text }}>{row.companyName}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: text }}>
                      <span className="font-medium">{row.wellName}</span>
                      {row.wellNumber && <span style={{ color: muted }}> #{row.wellNumber}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: muted }}>{wellStatusLabel(row.wellStatus)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={row.planning.status} errorMsg={row.planning.errorMsg} />
                        {row.planning.fileName && (
                          <span style={{ color: muted }}>{row.planning.fileName}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={row.cost.status} errorMsg={row.cost.errorMsg} />
                        {row.cost.fileName && (
                          <span style={{ color: muted }}>{row.cost.fileName}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: muted }}>
                      {fmtDate(lastUpdate)}
                    </td>
                    <td className="px-4 py-3">
                      <DotsMenu
                        row={row}
                        border={border} text={text} muted={muted} panelBg={panelBg}
                        onUpload={(r, t) => setUploadTarget({ row: r, type: t })}
                        onReset={handleReset}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload modal */}
      {uploadTarget && (
        <UploadModal
          row={uploadTarget.row}
          type={uploadTarget.type}
          dark={dark}
          onClose={() => setUploadTarget(null)}
          onDone={(id, type, result) => { handleUploadDone(id, type, result); }}
        />
      )}
    </div>
  );
}
