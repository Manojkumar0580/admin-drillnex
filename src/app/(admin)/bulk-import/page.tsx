'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Btn, FormRow, Notice, useColors } from '@/components/ui';
import { api, send, Company, WellFull } from '@/lib/adminApi';

const MAX_MB = 500;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const ZONES = Array.from({ length: (14 - -12) * 2 + 1 }, (_, i) => -720 + i * 30).map((m) => ({
  minutes: m,
  label: m === 0 ? 'UTC' : `UTC${m < 0 ? '−' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`,
}));

type Phase = 'idle' | 'presigning' | 'uploading' | 'queued' | 'polling' | 'done' | 'error';

interface JobStatus {
  jobId: string;
  state: string;
  progress: number;
  wellId: string;
  filename: string;
  result?: { inserted: number; skipped: number; total: number; unmapped: string[]; problems: string[] };
  failReason?: string;
}

export default function BulkImportPage() {
  const c = useColors();
  const fileRef = useRef<HTMLInputElement>(null);

  const [companyId, setCompanyId] = useState('');
  const [wellId, setWellId] = useState('');
  const [utcOffset, setUtcOffset] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [uploadPct, setUploadPct] = useState(0);
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState('');

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data),
  });

  const { data: wells = [] } = useQuery<WellFull[]>({
    queryKey: ['wells'],
    queryFn: () => api<{ data: WellFull[] }>('wells').then((r) => r.data),
  });

  const { data: status } = useQuery<JobStatus>({
    queryKey: ['bulk-import-status', jobId],
    queryFn: () => api<{ data: JobStatus }>(`bulk-import/${jobId}`).then((r) => r.data),
    enabled: (phase === 'polling' || phase === 'queued') && !!jobId,
    refetchInterval: (query) => {
      const s = (query.state.data as JobStatus | undefined)?.state;
      if (s === 'completed' || s === 'failed') return false;
      return 2000;
    },
    staleTime: 0,
  });

  // Track terminal states from polling
  if (status?.state === 'completed' && phase === 'polling') setPhase('done');
  if (status?.state === 'failed' && phase === 'polling') { setPhase('error'); setError(status.failReason ?? 'Job failed'); }

  const { data: history } = useQuery<JobStatus[]>({
    queryKey: ['bulk-import-history'],
    queryFn: () => api<{ data: JobStatus[] }>('bulk-import').then((r) => r.data),
    refetchInterval: phase === 'done' || phase === 'error' ? false : 10_000,
  });

  const filteredWells = wells.filter((w) => !companyId || w.companyId === companyId);
  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';

  async function handleSubmit() {
    if (!wellId || !file) return;
    setError('');
    setPhase('presigning');

    try {
      // 1. Get presigned URL from backend.
      const presign = await api<{ data: { url: string; key: string } }>('bulk-import/presign', send('POST', {
        wellId,
        filename: file.name,
        fileSizeBytes: file.size,
      }));
      const { url, key } = presign.data;

      // 2. PUT file directly to S3.
      setPhase('uploading');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', 'text/csv');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Upload network error'));
        xhr.send(file);
      });

      // 3. Submit job to backend.
      setPhase('queued');
      const submit = await api<{ data: { jobId: string } }>('bulk-import/submit', send('POST', {
        wellId, s3Key: key, filename: file.name, utcOffsetMinutes: utcOffset,
      }));
      setJobId(submit.data.jobId);
      setPhase('polling');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }

  function reset() {
    setPhase('idle'); setError(''); setJobId(''); setUploadPct(0); setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const bg = c.cardBg; const border = c.border; const text = c.text; const muted = c.muted;

  const stateColor: Record<string, string> = {
    completed: '#22c55e', failed: '#ef4444', active: '#3b82f6', waiting: '#f59e0b',
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: text }}>Bulk Historical Import</h1>
        <p className="text-sm mt-1" style={{ color: muted }}>Upload a CSV (up to {MAX_MB} MB) and ingest it into any well via a background job.</p>
      </div>

      {/* Upload form */}
      <div className="rounded-xl border p-5 space-y-4" style={{ background: bg, borderColor: border }}>
        <FormRow label="Company" htmlFor="bi-company">
          <select id="bi-company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setWellId(''); }} className={input} style={c.inputStyle}>
            <option value="">All companies</option>
            {companies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </FormRow>

        <FormRow label="Well" htmlFor="bi-well">
          <select id="bi-well" value={wellId} onChange={(e) => setWellId(e.target.value)} className={input} style={c.inputStyle}>
            <option value="">Select a well</option>
            {filteredWells.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.wellNumber})</option>)}
          </select>
        </FormRow>

        <FormRow label="Timestamp timezone" htmlFor="bi-tz">
          <select id="bi-tz" value={utcOffset} onChange={(e) => setUtcOffset(Number(e.target.value))} className={input} style={c.inputStyle}>
            {ZONES.map((z) => <option key={z.minutes} value={z.minutes}>{z.label}</option>)}
          </select>
        </FormRow>

        <FormRow label="CSV file" htmlFor="bi-file">
          <input
            ref={fileRef}
            id="bi-file"
            type="file"
            accept=".csv,text/csv"
            className={input}
            style={c.inputStyle}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > MAX_BYTES) { setError(`File exceeds ${MAX_MB} MB limit`); return; }
              setFile(f); setError('');
            }}
          />
          {file && <p className="text-xs mt-1" style={{ color: muted }}>{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
        </FormRow>

        {error && <Notice kind="error">{error}</Notice>}

        {phase === 'uploading' && (
          <div>
            <div className="text-xs mb-1" style={{ color: muted }}>Uploading… {uploadPct}%</div>
            <div className="rounded-full h-2 overflow-hidden" style={{ background: border }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${uploadPct}%`, background: '#3b82f6' }} />
            </div>
          </div>
        )}

        {(phase === 'polling' || phase === 'queued') && status && (
          <div>
            <div className="text-xs mb-1" style={{ color: muted }}>
              Processing… {status.progress}% ({status.state})
            </div>
            <div className="rounded-full h-2 overflow-hidden" style={{ background: border }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${status.progress}%`, background: '#3b82f6' }} />
            </div>
          </div>
        )}

        {phase === 'done' && status?.result && (
          <Notice kind="ok">
            Import complete — {status.result.inserted.toLocaleString()} rows inserted, {status.result.skipped} skipped.
            {status.result.unmapped.length > 0 && ` Unmapped headers: ${status.result.unmapped.join(', ')}.`}
          </Notice>
        )}

        <div className="flex gap-3">
          {(phase === 'idle' || phase === 'error') && (
            <Btn
              onClick={handleSubmit}
              disabled={!wellId || !file}
              kind="primary"
            >
              Upload &amp; Enqueue
            </Btn>
          )}
          {phase === 'presigning' && <Btn disabled kind="primary">Preparing upload…</Btn>}
          {(phase === 'done' || phase === 'error') && (
            <Btn onClick={reset} kind="neutral">New import</Btn>
          )}
        </div>
      </div>

      {/* Recent jobs */}
      {history && history.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: border }}>
          <div className="px-4 py-3 font-medium text-sm" style={{ background: bg, color: text, borderBottom: `1px solid ${border}` }}>
            Recent imports
          </div>
          <div style={{ background: bg }}>
            {history.map((j) => (
              <div key={j.jobId} className="flex items-center gap-4 px-4 py-3 text-sm" style={{ borderBottom: `1px solid ${border}` }}>
                <span className="font-medium truncate flex-1" style={{ color: text }}>{j.filename}</span>
                <div className="w-24">
                  <div className="rounded-full h-1.5 overflow-hidden" style={{ background: border }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${j.progress}%`, background: stateColor[j.state] ?? '#94a3b8' }} />
                  </div>
                </div>
                <span className="text-xs font-semibold w-20 text-right" style={{ color: stateColor[j.state] ?? muted }}>
                  {j.state === 'completed' ? `${j.result?.inserted?.toLocaleString() ?? '?'} rows` : j.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
