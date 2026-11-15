'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Btn, FormRow, Notice, useColors } from '@/components/ui';
import { api, ApiError, ChannelInfo, Company, ImportPreview, send, WellFull } from '@/lib/adminApi';

const MAX_FILE_BYTES = 9 * 1024 * 1024; // the API accepts about 9.5 MB of CSV text per import

const fmtUtc = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—');
const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 16); // value for <input type="datetime-local">, read as UTC
const fromInput = (v: string) => (v ? Date.parse(`${v}:00Z`) : NaN);

// File time zones: every half hour from UTC-12:00 to UTC+14:00.
const ZONES = Array.from({ length: (14 - -12) * 2 + 1 }, (_, i) => -720 + i * 30).map((m) => ({
  minutes: m,
  label: m === 0 ? 'UTC' : `UTC${m < 0 ? '−' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`,
}));

function WellPicker({ companyId, setCompanyId, wellId, setWellId, companies, wells }: {
  companyId: string; setCompanyId: (v: string) => void; wellId: string; setWellId: (v: string) => void; companies: Company[]; wells: WellFull[];
}) {
  const c = useColors();
  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';
  const list = wells.filter((w) => !companyId || w.companyId === companyId);
  return (
    <>
      <FormRow label="Company" htmlFor="rm-company">
        <select id="rm-company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setWellId(''); }} className={input} style={c.inputStyle}>
          <option value="">All companies</option>
          {companies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </FormRow>
      <FormRow label="Well" htmlFor="rm-well">
        <select id="rm-well" value={wellId} onChange={(e) => setWellId(e.target.value)} className={input} style={c.inputStyle}>
          <option value="">Select a Well</option>
          {list.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.wellNumber})</option>)}
        </select>
      </FormRow>
    </>
  );
}

// ------------------------------------------------------------------ Download

function DownloadTab({ companies, wells }: { companies: Company[]; wells: WellFull[] }) {
  const c = useColors();
  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';
  const [companyId, setCompanyId] = useState('');
  const [wellId, setWellId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [resolution, setResolution] = useState('raw');
  const [allChannels, setAllChannels] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);

  const channels = useQuery({ queryKey: ['channels'], queryFn: () => api<{ data: ChannelInfo[] }>('telemetry/channels').then((r) => r.data), staleTime: Infinity });
  const stored = useQuery({
    queryKey: ['tele-stats', wellId],
    enabled: !!wellId,
    queryFn: () => api<{ well: { count: number; oldest: number | null; newest: number | null } }>(`telemetry/stats?wellId=${wellId}`).then((r) => r.well),
  });

  // When a well is picked, start at the last hour of the data it actually has.
  useEffect(() => {
    if (stored.data?.newest) {
      const end = Math.ceil(stored.data.newest / 60000) * 60000;
      setTo(toInput(end));
      setFrom(toInput(Math.max(stored.data.oldest ?? 0, end - 3600_000)));
    } else {
      setFrom(''); setTo('');
    }
  }, [stored.data?.newest, stored.data?.oldest, wellId]);

  const fromMs = fromInput(from), toMs = fromInput(to);
  const rangeOk = Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs < toMs;
  const chanParam = !allChannels && chosen.length ? `&channels=${chosen.join(',')}` : '';
  const qs = rangeOk && wellId ? `wellId=${wellId}&from=${fromMs}&to=${toMs}&resolution=${resolution}${chanParam}` : '';

  const estimate = useQuery({
    queryKey: ['estimate', qs],
    enabled: !!qs && (allChannels || chosen.length > 0),
    queryFn: () => api<{ rows: number; cap: number; tooLarge: boolean }>(`telemetry/export/estimate?${qs}`),
  });

  const canDownload = !!qs && !!estimate.data && estimate.data.rows > 0 && !estimate.data.tooLarge && (allChannels || chosen.length > 0);
  const toggle = (k: string) => setChosen((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <WellPicker companyId={companyId} setCompanyId={setCompanyId} wellId={wellId} setWellId={setWellId} companies={companies} wells={wells} />

      {wellId && (
        <p className="text-xs sm:ml-[182px]" style={{ color: c.muted }}>
          {stored.isLoading ? 'Checking stored data…' : stored.data?.count
            ? `Stored: ${stored.data.count.toLocaleString()} samples, ${fmtUtc(stored.data.oldest)} to ${fmtUtc(stored.data.newest)}`
            : 'No telemetry is stored for this well yet.'}
        </p>
      )}

      <FormRow label="From (UTC)" htmlFor="rm-from">
        <input id="rm-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={input} style={c.inputStyle} />
      </FormRow>
      <FormRow label="To (UTC)" htmlFor="rm-to">
        <input id="rm-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={input} style={c.inputStyle} />
      </FormRow>
      <FormRow label="Resolution" htmlFor="rm-res" hint="Raw is every stored sample. The others average the samples inside each period.">
        <select id="rm-res" value={resolution} onChange={(e) => setResolution(e.target.value)} className={input} style={c.inputStyle}>
          <option value="raw">Raw (every sample)</option>
          {[1, 5, 10, 30, 60].map((s) => <option key={s} value={s}>Average per {s} s</option>)}
        </select>
      </FormRow>
      <FormRow label="Channels">
        <label className="flex items-center gap-2 text-sm" style={{ color: c.text }}>
          <input type="checkbox" checked={allChannels} onChange={(e) => setAllChannels(e.target.checked)} /> All channels
        </label>
        {!allChannels && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-2">
            {(channels.data ?? []).map((ch) => (
              <label key={ch.key} className="flex items-center gap-2 text-xs" style={{ color: c.text }}>
                <input type="checkbox" checked={chosen.includes(ch.key)} onChange={() => toggle(ch.key)} /> {ch.label} <span style={{ color: c.muted }}>({ch.unit})</span>
              </label>
            ))}
          </div>
        )}
      </FormRow>

      <div className="flex items-center justify-between gap-4 flex-wrap pt-2 sm:ml-[182px]">
        <p className="text-sm" role="status" style={{ color: estimate.data?.tooLarge ? '#f87171' : c.muted }}>
          {!wellId ? 'Select a well.' : !rangeOk ? 'Enter a valid time range.' : estimate.isLoading ? 'Calculating size…'
            : estimate.isError ? (estimate.error as Error).message
            : estimate.data?.tooLarge ? `About ${estimate.data.rows.toLocaleString()} rows, over the limit of ${estimate.data.cap.toLocaleString()}. Narrow the range or choose a coarser resolution.`
            : estimate.data?.rows === 0 ? 'No data in this range.'
            : `About ${estimate.data?.rows.toLocaleString()} rows.`}
        </p>
        {canDownload ? (
          <a href={`/api/backend/telemetry/export?${qs}`} download className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: '#16a34a' }}>Download CSV</a>
        ) : (
          <span className="text-sm font-semibold px-4 py-2 rounded-lg text-white opacity-50" style={{ background: '#16a34a' }} aria-disabled="true">Download CSV</span>
        )}
      </div>
      <p className="text-xs sm:ml-[182px]" style={{ color: c.muted }}>
        Times are UTC. Values are in oilfield units; every header says which (for example <code>rop (ft/h)</code>). The file can be imported into another well on this tab.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Upload

function UploadTab({ companies, wells }: { companies: Company[]; wells: WellFull[] }) {
  const c = useColors();
  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';
  const [companyId, setCompanyId] = useState('');
  const [wellId, setWellId] = useState('');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const [zone, setZone] = useState(0); // minutes EAST of UTC at the rig
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [replace, setReplace] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [fileKey, setFileKey] = useState(0);

  // The API wants the minutes to ADD to a zone-less timestamp to reach UTC: the opposite sign of the zone.
  const offsetParam = -zone;

  async function onFile(f: File | undefined) {
    setPreview(null); setPreviewError(''); setResult(null); setReplace(false); setConfirm(false); setFileError('');
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) { setFile(null); setFileError(`The file is ${(f.size / 1048576).toFixed(1)} MB; the limit is 9 MB. Split it into several files.`); return; }
    setFile({ name: f.name, text: await f.text() });
  }

  // Analyse automatically whenever the file, well or time zone changes. Nothing is written.
  useEffect(() => {
    if (!file || !wellId) { setPreview(null); return; }
    let cancelled = false;
    setAnalysing(true); setPreviewError(''); setResult(null);
    api<{ data: ImportPreview }>('telemetry/import/preview', send('POST', { wellId, csv: file.text, utcOffsetMinutes: offsetParam, fileName: file.name }))
      .then((r) => { if (!cancelled) { setPreview(r.data); setReplace(false); setConfirm(false); } })
      .catch((e: Error) => { if (!cancelled) { setPreview(null); setPreviewError(e.message); } })
      .finally(() => { if (!cancelled) setAnalysing(false); });
    return () => { cancelled = true; };
  }, [file, wellId, offsetParam]);

  const overlapBlocks = !!preview && preview.existingInRange > 0 && !(replace && confirm);
  const canImport = !!preview && preview.usable > 0 && !overlapBlocks && !busy && !analysing;

  async function doImport() {
    if (!file || !preview) return;
    setBusy(true); setResult(null);
    try {
      const r = await api<{ data: { inserted: number; replacedExisting: number } }>('telemetry/import', send('POST', {
        wellId, csv: file.text, utcOffsetMinutes: offsetParam, overlap: replace ? 'replace' : 'reject', fileName: file.name,
      }));
      setResult({ kind: 'ok', text: `Imported ${r.data.inserted.toLocaleString()} samples into ${preview.well.name}${r.data.replacedExisting ? `, replacing ${r.data.replacedExisting.toLocaleString()} that were already stored` : ''}.` });
      setFile(null); setPreview(null); setFileKey((k) => k + 1); setReplace(false); setConfirm(false);
    } catch (e) {
      setResult({ kind: 'error', text: e instanceof ApiError ? e.message : 'Import failed' });
    } finally { setBusy(false); }
  }

  const pv = preview;
  const skipped = pv ? pv.rejected.noTime + pv.rejected.future + pv.rejected.tooOld + pv.duplicates : 0;
  const stat = (label: string, value: string, tone?: string) => (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: c.border }}>
      <div className="text-xs" style={{ color: c.muted }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: tone ?? c.text }}>{value}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {result && <Notice kind={result.kind} onClose={() => setResult(null)}>{result.text}</Notice>}

      <WellPicker companyId={companyId} setCompanyId={setCompanyId} wellId={wellId} setWellId={setWellId} companies={companies} wells={wells} />
      <FormRow label="File" htmlFor="rm-file" hint="A CSV with a header row and a time column. Up to 9 MB (about 100,000 rows); split bigger files.">
        <input key={fileKey} id="rm-file" type="file" accept=".csv,text/csv,.txt" onChange={(e) => onFile(e.target.files?.[0])} className={input} style={c.inputStyle} />
      </FormRow>
      {fileError && <p role="alert" className="text-sm text-red-400 sm:ml-[182px]">{fileError}</p>}
      <FormRow label="Times in file are" htmlFor="rm-zone" hint="Only used for times that do not carry a zone (like 2026/11/14 08:00:00). Pick the zone the rig clock was set to.">
        <select id="rm-zone" value={zone} onChange={(e) => setZone(Number(e.target.value))} className={input} style={c.inputStyle}>
          {ZONES.map((z) => <option key={z.minutes} value={z.minutes}>{z.label}</option>)}
        </select>
      </FormRow>

      {!wellId && file && <p className="text-sm sm:ml-[182px]" style={{ color: c.muted }}>Select a well to check the file.</p>}
      {analysing && <p className="text-sm sm:ml-[182px]" style={{ color: c.muted }}>Checking the file…</p>}
      {previewError && <p role="alert" className="text-sm text-red-400 sm:ml-[182px]">{previewError}</p>}

      {pv && (
        <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: c.border }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold" style={{ color: c.text }}>Check before importing into {pv.well.name}</h3>
            <span className="text-xs" style={{ color: c.muted }}>Nothing has been saved yet</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stat('Rows in file', pv.rows.toLocaleString())}
            {stat('Will be imported', pv.usable.toLocaleString(), pv.usable > 0 ? '#22c55e' : '#ef4444')}
            {stat('Skipped', skipped.toLocaleString(), skipped ? '#f59e0b' : undefined)}
            {stat('Channels recognised', `${pv.mapped.length} of ${pv.mapped.length + pv.unmapped.length}`)}
          </div>
          <p className="text-sm" style={{ color: c.text }}>
            Time range: <strong>{fmtUtc(pv.from)}</strong> to <strong>{fmtUtc(pv.to)}</strong>
          </p>

          {pv.warnings.length > 0 && (
            <ul className="text-sm space-y-1 rounded-lg px-4 py-3" style={{ background: '#f59e0b14', color: '#f59e0b', border: '1px solid #f59e0b55' }}>
              {pv.warnings.map((w) => <li key={w}>• {w}</li>)}
            </ul>
          )}
          {pv.problems.length > 0 && (
            <ul className="text-sm space-y-1 rounded-lg px-4 py-3" style={{ background: '#ef444414', color: '#ef4444', border: '1px solid #ef444455' }}>
              {pv.problems.map((p) => <li key={p}>• {p}</li>)}
            </ul>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ color: c.text }}>
              <thead><tr style={{ borderBottom: `1px solid ${c.border}` }}>
                {['Column in file', 'Becomes', 'Unit in file', 'Quality'].map((h) => <th key={h} className="text-left py-2 pr-4 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {pv.mapped.map((m) => {
                  const q = pv.quality[m.channel];
                  return (
                    <tr key={m.header} style={{ borderBottom: `1px solid ${c.border}` }}>
                      <td className="py-1.5 pr-4">{m.header}</td>
                      <td className="py-1.5 pr-4"><Badge tone="blue">{m.channel}</Badge></td>
                      <td className="py-1.5 pr-4">{m.unit}</td>
                      <td className="py-1.5 pr-4" style={{ color: q ? '#f59e0b' : c.muted }}>{q ? `${q.missing} missing, ${q.suspect} suspect` : 'ok'}</td>
                    </tr>
                  );
                })}
                {pv.unmapped.map((h) => (
                  <tr key={h} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td className="py-1.5 pr-4">{h}</td><td className="py-1.5 pr-4" colSpan={3} style={{ color: c.muted }}>not recognised, ignored</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pv.sample.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs font-semibold mb-1" style={{ color: c.text }}>First rows after conversion to oilfield units</p>
              <table className="w-full text-xs" style={{ color: c.text }}>
                <thead><tr style={{ borderBottom: `1px solid ${c.border}` }}>
                  <th className="text-left py-1 pr-4">time (UTC)</th>
                  {pv.mapped.slice(0, 5).map((m) => <th key={m.channel} className="text-left py-1 pr-4">{m.channel}</th>)}
                </tr></thead>
                <tbody>
                  {pv.sample.map((s) => (
                    <tr key={s.t}>
                      <td className="py-1 pr-4 whitespace-nowrap">{fmtUtc(s.t).replace(' UTC', '')}</td>
                      {pv.mapped.slice(0, 5).map((m) => <td key={m.channel} className="py-1 pr-4">{s.values[m.channel] === undefined ? '—' : Number(s.values[m.channel].toFixed(3))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pv.existingInRange > 0 && (
            <div className="rounded-lg px-4 py-3 space-y-2 text-sm" style={{ background: '#ef444414', border: '1px solid #ef444455', color: c.text }}>
              <p><strong>{pv.well.name} already has {pv.existingInRange.toLocaleString()} stored samples in this time range.</strong> Importing on top would double the data, so by default the import is blocked.</p>
              <label className="flex items-center gap-2"><input type="radio" checked={!replace} onChange={() => { setReplace(false); setConfirm(false); }} /> Do not import</label>
              <label className="flex items-center gap-2"><input type="radio" checked={replace} onChange={() => setReplace(true)} /> Replace the {pv.existingInRange.toLocaleString()} stored samples with this file</label>
              {replace && (
                <label className="flex items-center gap-2 text-red-400">
                  <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I understand those samples will be permanently deleted
                </label>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Btn onClick={doImport} disabled={!canImport}>{busy ? 'Importing…' : `Import ${pv.usable.toLocaleString()} samples`}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page

export default function ReleaseManagementPage() {
  const c = useColors();
  const [tab, setTab] = useState<'download' | 'upload'>('download');

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data) });
  const wells = useQuery({ queryKey: ['wells', 'full'], queryFn: () => api<{ data: WellFull[] }>('wells').then((r) => r.data) });
  const co = useMemo(() => companies.data ?? [], [companies.data]);
  const wl = useMemo(() => wells.data ?? [], [wells.data]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>Releases Management</h1>
      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="flex border-b px-4" style={{ borderColor: c.border }} role="tablist">
          {(['download', 'upload'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="px-4 py-3 text-sm font-medium capitalize"
              style={{ color: tab === t ? '#1a8cff' : c.muted, borderBottom: tab === t ? '2px solid #1a8cff' : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'download' ? <DownloadTab companies={co} wells={wl} /> : <UploadTab companies={co} wells={wl} />}
      </div>
    </div>
  );
}
