'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Badge, Btn, FormRow, Notice, Tone, useColors } from '@/components/ui';
import { CompanySelect } from '@/components/SearchSelect';
import { api, ApiError, Company, Connection, LogMapRow, send, timeAgo, WellLite } from '@/lib/adminApi';

const STATUS: Record<LogMapRow['status'], { tone: Tone; label: string }> = {
  ok: { tone: 'green', label: 'Running' },
  error: { tone: 'amber', label: 'Retrying' },
  blocked: { tone: 'red', label: 'Blocked' },
  idle: { tone: 'gray', label: 'Idle' },
};

interface Item { uid: string; name: string }
interface LogItem extends Item { indexType: string; curves: { mnemonic: string; unit: string }[] }

interface FormState {
  companyId: string; connectionId: string; wellId: string;
  uidWell: string; uidWellbore: string; uidLog: string;
  intervalSec: number; backfillMinutes: number; start: boolean;
}
const EMPTY: FormState = { companyId: '', connectionId: '', wellId: '', uidWell: '', uidWellbore: '', uidLog: '', intervalSec: 30, backfillMinutes: 10, start: true };

export default function LogMapsPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LogMapRow | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<LogMapRow | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // discovery (browse the WITSML server instead of typing UIDs)
  const [wells, setWells] = useState<Item[] | null>(null);
  const [bores, setBores] = useState<Item[] | null>(null);
  const [logs, setLogs] = useState<LogItem[] | null>(null);
  const [discBusy, setDiscBusy] = useState(false);
  const [discError, setDiscError] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data) });
  const conns = useQuery({ queryKey: ['connections'], queryFn: () => api<{ data: Connection[] }>('witsml/connections').then((r) => r.data) });
  const wellList = useQuery({ queryKey: ['wells'], queryFn: () => api<{ data: WellLite[] }>('wells').then((r) => r.data) });
  // Runtime status changes while the poller works, so refresh the list every few seconds.
  const maps = useQuery({
    queryKey: ['logmaps'],
    queryFn: () => api<{ data: LogMapRow[] }>('witsml/logmaps').then((r) => r.data),
    refetchInterval: 5000,
  });

  const connName = useMemo(() => new Map((conns.data ?? []).map((x) => [x.id, x.name])), [conns.data]);
  const wellName = useMemo(() => new Map((wellList.data ?? []).map((x) => [x.id, x.name])), [wellList.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (maps.data ?? []).filter((r) =>
      (!companyFilter || r.companyId === companyFilter) &&
      (!stateFilter || r.dataState === stateFilter) &&
      (!q || [r.uidLog, r.uidWell, r.uidWellbore, wellName.get(r.wellId) ?? '', connName.get(r.connectionId) ?? ''].some((v) => v.toLowerCase().includes(q)))
    );
  }, [maps.data, companyFilter, stateFilter, query, wellName, connName]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['logmaps'] });

  const toggle = useMutation({
    mutationFn: (r: LogMapRow) => api(`witsml/logmaps/${r.id}`, send('PATCH', { dataState: r.dataState === 'ON' ? 'OFF' : 'ON' })),
    onSuccess: refresh,
    onError: (e: Error) => setNotice({ kind: 'error', text: e.message }),
  });
  const reset = useMutation({
    mutationFn: (r: LogMapRow) => api(`witsml/logmaps/${r.id}/reset`, send('POST')),
    onSuccess: () => { setNotice({ kind: 'ok', text: 'Error state cleared. The poller will retry on its next tick.' }); refresh(); },
    onError: (e: Error) => setNotice({ kind: 'error', text: e.message }),
  });
  const remove = useMutation({
    mutationFn: (r: LogMapRow) => api(`witsml/logmaps/${r.id}`, send('DELETE')),
    onSuccess: () => { setDeleting(null); setNotice({ kind: 'ok', text: 'Log map deleted. Data already stored is kept.' }); refresh(); },
    onError: (e: Error) => { setDeleting(null); setNotice({ kind: 'error', text: e.message }); },
  });
  const save = useMutation({
    mutationFn: () => {
      if (editing === 'new') {
        return api('witsml/logmaps', send('POST', {
          connectionId: form.connectionId, wellId: form.wellId, uidWell: form.uidWell, uidWellbore: form.uidWellbore, uidLog: form.uidLog,
          intervalSec: Number(form.intervalSec), backfillMinutes: Number(form.backfillMinutes), dataState: form.start ? 'ON' : 'OFF',
        }));
      }
      return api(`witsml/logmaps/${(editing as LogMapRow).id}`, send('PATCH', { intervalSec: Number(form.intervalSec), backfillMinutes: Number(form.backfillMinutes) }));
    },
    onSuccess: () => { setEditing(null); setNotice({ kind: 'ok', text: 'Log map saved.' }); refresh(); },
    onError: (e: Error) => setFormError(e.message),
  });

  function open(target: LogMapRow | 'new') {
    setFormError(''); setDiscError(''); setWells(null); setBores(null); setLogs(null);
    setForm(target === 'new'
      ? { ...EMPTY, companyId: companyFilter }
      : { ...EMPTY, companyId: target.companyId, connectionId: target.connectionId, wellId: target.wellId, uidWell: target.uidWell, uidWellbore: target.uidWellbore, uidLog: target.uidLog, intervalSec: target.intervalSec, backfillMinutes: target.backfillMinutes, start: target.dataState === 'ON' });
    setEditing(target);
  }

  async function discover(type: 'wells' | 'wellbores' | 'logs', uidWell?: string, uidWellbore?: string) {
    setDiscBusy(true); setDiscError('');
    try {
      const r = await api<{ data: Item[] | LogItem[] }>(`witsml/connections/${form.connectionId}/discover`, send('POST', { type, uidWell, uidWellbore }));
      if (type === 'wells') { setWells(r.data as Item[]); setBores(null); setLogs(null); }
      if (type === 'wellbores') { setBores(r.data as Item[]); setLogs(null); }
      if (type === 'logs') setLogs(r.data as LogItem[]);
    } catch (e) {
      setDiscError(e instanceof ApiError ? e.message : 'Could not read from the server');
    } finally { setDiscBusy(false); }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (editing === 'new' && (!form.connectionId || !form.wellId || !form.uidWell || !form.uidWellbore || !form.uidLog)) {
      setFormError('Connection, RigPulse well and the three WITSML identifiers are required');
      return;
    }
    save.mutate();
  }

  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';
  const isNew = editing === 'new';
  const connChoices = (conns.data ?? []).filter((x) => !form.companyId || x.companyId === form.companyId);
  const wellChoices = (wellList.data ?? []).filter((x) => !form.companyId || x.companyId === form.companyId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>WITSML Settings</h1>
      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border }}>
          <h2 className="text-base font-medium" style={{ color: c.text }}>Log - Connection Map</h2>
        </div>

        <div className="flex items-end justify-between gap-3 flex-wrap px-6 py-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label htmlFor="lmc" className="text-xs font-semibold" style={{ color: c.text }}>Company:</label>
              <CompanySelect id="lmc" width={220} value={companyFilter} allLabel="All companies" onChange={(v) => setCompanyFilter(v)} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lms" className="text-xs font-semibold" style={{ color: c.text }}>Data State:</label>
              <select id="lms" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border outline-none" style={c.inputStyle}>
                <option value="">All</option><option>ON</option><option>OFF</option>
              </select>
            </div>
            <input aria-label="Search log maps" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 200 }} />
          </div>
          <Btn onClick={() => open('new')}>New</Btn>
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Log', 'RigPulse Well', 'Source Connection', 'Data State', 'Interval (s)', 'Status', 'Rows', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS[r.status];
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{r.uidLog}</div>
                      <div className="text-xs" style={{ color: c.muted }}>{r.uidWell} / {r.uidWellbore}</div>
                    </td>
                    <td className="py-3 pr-4">{wellName.get(r.wellId) ?? '—'}</td>
                    <td className="py-3 pr-4">{connName.get(r.connectionId) ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <button onClick={() => toggle.mutate(r)} disabled={toggle.isPending} aria-label={`Turn ${r.dataState === 'ON' ? 'off' : 'on'}`}
                        title="Click to switch" className="font-bold text-xs px-2.5 py-1 rounded-full border"
                        style={{ color: r.dataState === 'ON' ? '#22c55e' : '#ef4444', borderColor: r.dataState === 'ON' ? '#22c55e55' : '#ef444455', background: r.dataState === 'ON' ? '#22c55e1f' : '#ef44441f' }}>
                        {r.dataState}
                      </button>
                    </td>
                    <td className="py-3 pr-4">{r.intervalSec}</td>
                    <td className="py-3 pr-4" style={{ maxWidth: 280 }}>
                      <Badge tone={r.dataState === 'OFF' ? 'gray' : s.tone}>{r.dataState === 'OFF' ? 'Stopped' : s.label}</Badge>
                      <div className="text-xs mt-1" style={{ color: c.muted }}>
                        {r.lastSuccessAt ? `last data ${timeAgo(r.lastSuccessAt, now)}` : 'no data yet'}
                        {r.failures > 0 ? ` · ${r.failures} failure${r.failures > 1 ? 's' : ''}` : ''}
                      </div>
                      {r.lastError && <div className="text-xs mt-0.5 text-red-400 truncate" title={r.lastError}>{r.lastError}</div>}
                    </td>
                    <td className="py-3 pr-4">{r.totalRows.toLocaleString()}</td>
                    <td className="py-2 whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        <Btn small onClick={() => open(r)}>Edit</Btn>
                        <Btn small kind="danger" onClick={() => setDeleting(r)}>Delete</Btn>
                        <Btn small kind="success" onClick={() => reset.mutate(r)} disabled={reset.isPending} title="Clear errors and retry now">Reset</Btn>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {maps.isLoading && <tr><td colSpan={8} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {maps.isError && <tr><td colSpan={8} className="py-8 text-center text-red-400">{(maps.error as Error).message}</td></tr>}
              {!maps.isLoading && !maps.isError && rows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center" style={{ color: c.muted }}>No log maps yet. Click New to start collecting data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={isNew ? 'Log Map Form' : 'Edit Log Map'}
          wide
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="lm-form" disabled={save.isPending}>{save.isPending ? (isNew ? 'Checking server…' : 'Saving…') : isNew ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="lm-form" onSubmit={onSubmit} className="space-y-3">
            {isNew ? (
              <>
                <FormRow label="Company" htmlFor="lm-company">
                  <CompanySelect id="lm-company" value={form.companyId} onChange={(v) => { setForm({ ...form, companyId: v, connectionId: '', wellId: '' }); setWells(null); setBores(null); setLogs(null); }} />
                </FormRow>
                <FormRow label="Source Connection" htmlFor="lm-conn">
                  <select id="lm-conn" value={form.connectionId} onChange={(e) => { setForm({ ...form, connectionId: e.target.value, uidWell: '', uidWellbore: '', uidLog: '' }); setWells(null); setBores(null); setLogs(null); }} className={input} style={c.inputStyle}>
                    <option value="">Select a connection</option>
                    {connChoices.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </FormRow>
                <FormRow label="RigPulse Well" htmlFor="lm-well" hint="The well in RigPulse this data will be stored under.">
                  <select id="lm-well" value={form.wellId} onChange={(e) => setForm({ ...form, wellId: e.target.value })} className={input} style={c.inputStyle}>
                    <option value="">Select a well</option>
                    {wellChoices.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </FormRow>

                <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: c.border }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: c.text }}>On the WITSML server</span>
                    <Btn small kind="neutral" disabled={!form.connectionId || discBusy} onClick={() => discover('wells')}>{discBusy ? 'Loading…' : 'Browse server'}</Btn>
                  </div>
                  {discError && <p role="alert" className="text-xs text-red-400">{discError}</p>}

                  {wells && (
                    <FormRow label="Well" htmlFor="d-well">
                      <select id="d-well" value={form.uidWell} className={input} style={c.inputStyle}
                        onChange={(e) => { setForm({ ...form, uidWell: e.target.value, uidWellbore: '', uidLog: '' }); setBores(null); setLogs(null); if (e.target.value) discover('wellbores', e.target.value); }}>
                        <option value="">Select</option>
                        {wells.map((w) => <option key={w.uid} value={w.uid}>{w.name || w.uid} ({w.uid})</option>)}
                      </select>
                    </FormRow>
                  )}
                  {bores && (
                    <FormRow label="Wellbore" htmlFor="d-bore">
                      <select id="d-bore" value={form.uidWellbore} className={input} style={c.inputStyle}
                        onChange={(e) => { setForm({ ...form, uidWellbore: e.target.value, uidLog: '' }); setLogs(null); if (e.target.value) discover('logs', form.uidWell, e.target.value); }}>
                        <option value="">Select</option>
                        {bores.map((w) => <option key={w.uid} value={w.uid}>{w.name || w.uid} ({w.uid})</option>)}
                      </select>
                    </FormRow>
                  )}
                  {logs && (
                    <FormRow label="Log" htmlFor="d-log" hint="Only time-indexed logs can be collected.">
                      <select id="d-log" value={form.uidLog} className={input} style={c.inputStyle} onChange={(e) => setForm({ ...form, uidLog: e.target.value })}>
                        <option value="">Select</option>
                        {logs.map((l) => {
                          const time = /date\s*time/i.test(l.indexType);
                          return <option key={l.uid} value={l.uid} disabled={!time}>{l.name || l.uid} ({l.uid}) · {l.indexType || 'unknown index'} · {l.curves.length} curves{time ? '' : ' — not supported'}</option>;
                        })}
                      </select>
                    </FormRow>
                  )}

                  <p className="text-xs" style={{ color: c.muted }}>Or type the identifiers if you already know them:</p>
                  {(['uidWell', 'uidWellbore', 'uidLog'] as const).map((k) => (
                    <FormRow key={k} label={k === 'uidWell' ? 'Well UID' : k === 'uidWellbore' ? 'Wellbore UID' : 'Log UID'} htmlFor={`m-${k}`}>
                      <input id={`m-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={input} style={c.inputStyle} placeholder={k} />
                    </FormRow>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm" style={{ color: c.muted }}>
                {form.uidLog} on {connName.get(form.connectionId) ?? 'connection'} → {wellName.get(form.wellId) ?? 'well'}. The source log and well cannot be changed; delete and add a new map for that.
              </p>
            )}

            <FormRow label="Retrieval interval (s)" htmlFor="lm-int" hint="How often to ask the server for new data (5 to 3600).">
              <input id="lm-int" type="number" min={5} max={3600} value={form.intervalSec} onChange={(e) => setForm({ ...form, intervalSec: Number(e.target.value) })} className={input} style={c.inputStyle} />
            </FormRow>
            <FormRow label="First-run backfill (min)" htmlFor="lm-bf" hint="On the first run, read this many minutes of past data (0 = only new data).">
              <input id="lm-bf" type="number" min={0} max={1440} value={form.backfillMinutes} onChange={(e) => setForm({ ...form, backfillMinutes: Number(e.target.value) })} className={input} style={c.inputStyle} disabled={!isNew} />
            </FormRow>
            {isNew && (
              <FormRow label="Start collecting" htmlFor="lm-start">
                <input id="lm-start" type="checkbox" checked={form.start} onChange={(e) => setForm({ ...form, start: e.target.checked })} />
              </FormRow>
            )}
            {formError && <p role="alert" className="text-sm text-red-400">{formError}</p>}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete log map"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>Delete</Btn>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Stop collecting <strong>{deleting.uidLog}</strong> and delete this map? Data already stored is kept.
          </p>
        </Modal>
      )}
    </div>
  );
}
