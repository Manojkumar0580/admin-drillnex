'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Badge, Btn, FormRow, Notice, Tone, useColors } from '@/components/ui';
import SearchSelect, { CompanySelect } from '@/components/SearchSelect';
import { api, PadRow, RigRow, send, WellFull } from '@/lib/adminApi';
import { useCompanies } from '@/lib/useCompanies';

const STATUSES = ['active', 'paused', 'completed'] as const;
const TYPES = ['vertical', 'directional', 'horizontal', 'lateral'] as const;
const STATUS_TONE: Record<(typeof STATUSES)[number], Tone> = { active: 'green', paused: 'amber', completed: 'blue' };
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = { active: 'Active', paused: 'Paused', completed: 'Completed' };

interface FormState {
  companyId: string; rigId: string; padId: string; name: string; wellNumber: string; operator: string; contractor: string;
  status: (typeof STATUSES)[number]; type: (typeof TYPES)[number];
  field: string; basin: string; country: string; lat: string; lng: string;
  targetDepth: string; currentDepth: string; spudDate: string;
}
const EMPTY: FormState = {
  companyId: '', rigId: '', padId: '', name: '', wellNumber: '', operator: '', contractor: '', status: 'active', type: 'vertical',
  field: '', basin: '', country: '', lat: '', lng: '', targetDepth: '', currentDepth: '', spudDate: '',
};

const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

export default function WellsPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<WellFull | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<WellFull | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const companies = useCompanies();
  const rigs = useQuery({ queryKey: ['rigs'], queryFn: () => api<{ data: RigRow[] }>('rigs').then((r) => r.data) });
  const wells = useQuery({ queryKey: ['wells', 'full'], queryFn: () => api<{ data: WellFull[] }>('wells').then((r) => r.data) });
  const pads = useQuery({ queryKey: ['pads'], queryFn: () => api<{ data: PadRow[] }>('pads').then((r) => r.data) });
  const padName = useMemo(() => new Map((pads.data ?? []).map((p) => [p.id, p.name])), [pads.data]);

  // Which rig is on which well (the link is stored on the rig).
  const rigOfWell = useMemo(() => new Map((rigs.data ?? []).filter((r) => r.currentWellId).map((r) => [r.currentWellId as string, r])), [rigs.data]);
  const companyName = useMemo(() => new Map((companies.data ?? []).map((x) => [x.id, x.name])), [companies.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (wells.data ?? []).filter((w) =>
      (!companyFilter || w.companyId === companyFilter) &&
      (!statusFilter || w.status === statusFilter) &&
      (!q || [w.name, w.wellNumber, w.field, w.operator, w.country, companyName.get(w.companyId) ?? ''].some((v) => v.toLowerCase().includes(q)))
    );
  }, [wells.data, companyFilter, statusFilter, query, companyName]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['wells'] });
    qc.invalidateQueries({ queryKey: ['rigs'] });
    qc.invalidateQueries({ queryKey: ['pads'] }); // pad well counts
    qc.invalidateQueries({ queryKey: ['companies'] }); // well counts
  };

  /** The rig <-> well link lives on the rig: free the old rig, then put the chosen rig on this well. */
  async function syncRig(wellId: string) {
    const current = rigOfWell.get(wellId);
    if (current?.id === form.rigId || (!current && !form.rigId)) return;
    if (current) await api(`rigs/${current.id}`, send('PATCH', { currentWellId: null }));
    if (form.rigId) await api(`rigs/${form.rigId}`, send('PATCH', { currentWellId: wellId }));
  }

  const save = useMutation({
    mutationFn: async () => {
      const lat = num(form.lat), lng = num(form.lng);
      if ((lat === undefined) !== (lng === undefined)) throw new Error('Give both latitude and longitude, or leave both empty');
      const body: Record<string, unknown> = {
        name: form.name, wellNumber: form.wellNumber, operator: form.operator, contractor: form.contractor,
        status: form.status, type: form.type, field: form.field, basin: form.basin, country: form.country,
        targetDepth: num(form.targetDepth),
      };
      // A pad is chosen right here, so a new well does not need a second trip to the Pads page.
      if (editing === 'new') { if (form.padId) body.padId = form.padId; }
      else body.padId = form.padId || null; // on edit, empty means "no pad"
      const cur = num(form.currentDepth);
      if (cur !== undefined) body.currentDepth = cur;
      if (editing === 'new') {
        body.companyId = form.companyId;
        if (lat !== undefined) { body.lat = lat; body.lng = lng; }
        if (form.spudDate) body.spudDate = form.spudDate;
        const created = await api<{ data: { id: string } }>('wells', send('POST', body));
        await syncRig(created.data.id);
        return created;
      }
      // On edit, empty means "clear it".
      body.lat = lat ?? null; body.lng = lng ?? null;
      body.spudDate = form.spudDate || null;
      const updated = await api(`wells/${(editing as WellFull).id}`, send('PATCH', body));
      await syncRig((editing as WellFull).id);
      return updated;
    },
    onSuccess: () => { setEditing(null); setNotice({ kind: 'ok', text: 'Well saved.' }); refresh(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const remove = useMutation({
    mutationFn: (w: WellFull) => api<{ deletedTelemetry: number }>(`wells/${w.id}`, send('DELETE')),
    onSuccess: (r) => {
      setDeleting(null);
      setNotice({ kind: 'ok', text: `Well deleted${r.deletedTelemetry ? ` along with ${r.deletedTelemetry.toLocaleString()} stored telemetry samples` : ''}.` });
      refresh();
    },
    onError: (e: Error) => { setDeleting(null); setNotice({ kind: 'error', text: e.message }); },
  });

  function open(target: WellFull | 'new') {
    setFormError('');
    setForm(target === 'new'
      ? { ...EMPTY, companyId: companyFilter }
      : {
          companyId: target.companyId, rigId: rigOfWell.get(target.id)?.id ?? '', padId: target.padId ?? '', name: target.name, wellNumber: target.wellNumber, operator: target.operator, contractor: target.contractor,
          status: target.status, type: target.type, field: target.field, basin: target.basin, country: target.country,
          lat: target.lat === null ? '' : String(target.lat), lng: target.lng === null ? '' : String(target.lng),
          targetDepth: String(target.targetDepth), currentDepth: String(target.currentDepth),
          spudDate: target.spudDate ? target.spudDate.slice(0, 10) : '',
        });
    setEditing(target);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (editing === 'new' && !form.companyId) { setFormError('Select a company'); return; }
    save.mutate();
  }

  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';
  const rigChoices = (rigs.data ?? []).filter((r) => r.companyId === form.companyId);
  const padChoices = (pads.data ?? []).filter((p) => p.companyId === form.companyId);
  const myWellId = editing && editing !== 'new' ? editing.id : '';
  const Text = ({ k, label, req, ph, type = 'text', step }: { k: keyof FormState; label: string; req?: boolean; ph?: string; type?: string; step?: string }) => (
    <FormRow label={label} htmlFor={`w-${k}`}>
      <input id={`w-${k}`} type={type} step={step} required={req} value={form[k]} placeholder={ph ?? label}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={input} style={c.inputStyle} />
    </FormRow>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>WITSML Settings</h1>
      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border }}>
          <h2 className="text-base font-medium" style={{ color: c.text }}>Wells</h2>
        </div>

        <div className="flex items-end justify-between gap-3 flex-wrap px-6 py-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label htmlFor="wc" className="text-xs font-semibold" style={{ color: c.text }}>Company:</label>
              <CompanySelect id="wc" width={220} value={companyFilter} onChange={setCompanyFilter} allLabel="All companies" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ws" className="text-xs font-semibold" style={{ color: c.text }}>Status:</label>
              <SearchSelect id="ws" width={150} value={statusFilter} onChange={setStatusFilter} allLabel="All" options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
            </div>
            <input aria-label="Search wells" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 200 }} />
          </div>
          <Btn onClick={() => open('new')}>New Well</Btn>
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Name', 'Well No.', 'Company', 'Rig', 'Pad', 'Field', 'Country', 'Type', 'Status', 'Depth (ft)', 'Operator', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td className="py-3 pr-4 font-medium">{w.name}</td>
                  <td className="py-3 pr-4">{w.wellNumber}</td>
                  <td className="py-3 pr-4">{companyName.get(w.companyId) ?? '—'}</td>
                  <td className="py-3 pr-4">{rigOfWell.get(w.id)?.name ?? <span style={{ color: c.muted }}>none</span>}</td>
                  <td className="py-3 pr-4">{w.padId ? padName.get(w.padId) ?? '—' : <span style={{ color: c.muted }}>none</span>}</td>
                  <td className="py-3 pr-4">{w.field}{w.basin ? <div className="text-xs" style={{ color: c.muted }}>{w.basin}</div> : null}</td>
                  <td className="py-3 pr-4">{w.country}</td>
                  <td className="py-3 pr-4 capitalize">{w.type}</td>
                  <td className="py-3 pr-4"><Badge tone={STATUS_TONE[w.status] ?? 'gray'}>{STATUS_LABEL[w.status] ?? w.status}</Badge></td>
                  <td className="py-3 pr-4 whitespace-nowrap">{w.currentDepth.toLocaleString()} / {w.targetDepth.toLocaleString()}</td>
                  <td className="py-3 pr-4">{w.operator}</td>
                  <td className="py-2 whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Btn small onClick={() => open(w)}>Edit</Btn>
                      <Btn small kind="danger" onClick={() => setDeleting(w)}>Delete</Btn>
                    </span>
                  </td>
                </tr>
              ))}
              {wells.isLoading && <tr><td colSpan={12} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {wells.isError && <tr><td colSpan={12} className="py-8 text-center text-red-400">{(wells.error as Error).message}</td></tr>}
              {!wells.isLoading && !wells.isError && rows.length === 0 && (
                <tr><td colSpan={12} className="py-8 text-center" style={{ color: c.muted }}>No wells yet. Click New Well to add one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title="Well Form"
          wide
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="well-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="well-form" onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
            <div className="space-y-3">
              <FormRow label="Company" htmlFor="w-company">
                <CompanySelect id="w-company" value={form.companyId} disabled={editing !== 'new'} onChange={(v) => setForm({ ...form, companyId: v, rigId: '', padId: '' })} />
              </FormRow>
              <FormRow label="Rig" htmlFor="w-rig" hint="A rig can be on one well at a time.">
                <SearchSelect id="w-rig" value={form.rigId} onChange={(v) => setForm({ ...form, rigId: v })} disabled={!form.companyId}
                  allLabel="No rig" placeholder={form.companyId ? 'Select a rig' : 'Select a company first'}
                  emptyText="No rigs for this company yet. Add one under WITSML Settings, Rigs."
                  options={rigChoices.map((r) => {
                    const other = r.currentWellId && r.currentWellId !== myWellId;
                    return { value: r.id, label: r.name, disabled: !!other, hint: other ? `on ${r.currentWell?.name ?? 'another well'}` : undefined };
                  })} />
              </FormRow>
              <FormRow label="Pad" htmlFor="w-pad" hint="Optional. Wells drilled from the same location share a pad.">
                <SearchSelect id="w-pad" value={form.padId} onChange={(v) => setForm({ ...form, padId: v })} disabled={!form.companyId}
                  allLabel="No pad" placeholder={form.companyId ? 'Select a pad' : 'Select a company first'}
                  emptyText="No pads for this company yet. Add one under WITSML Settings, Pads."
                  options={padChoices.map((p) => ({ value: p.id, label: p.name, hint: p.wellCount ? `${p.wellCount} well${p.wellCount > 1 ? 's' : ''}` : undefined }))} />
              </FormRow>
              {Text({ k: 'name', label: 'Name', req: true })}
              {Text({ k: 'wellNumber', label: 'Well Number', req: true, ph: 'Unique within the company' })}
              {Text({ k: 'operator', label: 'Operator', req: true })}
              {Text({ k: 'contractor', label: 'Contractor' })}
              <FormRow label="Status" htmlFor="w-status">
                <SearchSelect id="w-status" value={form.status} onChange={(v) => setForm({ ...form, status: v as FormState['status'] })} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
              </FormRow>
              <FormRow label="Type" htmlFor="w-type">
                <select id="w-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })} className={input} style={c.inputStyle}>
                  {TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormRow>
            </div>
            <div className="space-y-3">
              {Text({ k: 'field', label: 'Field', req: true })}
              {Text({ k: 'basin', label: 'Basin' })}
              {Text({ k: 'country', label: 'Country', req: true })}
              {Text({ k: 'lat', label: 'Latitude', type: 'number', step: 'any', ph: '-90 to 90' })}
              {Text({ k: 'lng', label: 'Longitude', type: 'number', step: 'any', ph: '-180 to 180' })}
              {Text({ k: 'targetDepth', label: 'Target depth (ft)', req: true, type: 'number', step: 'any' })}
              {Text({ k: 'currentDepth', label: 'Current depth (ft)', type: 'number', step: 'any' })}
              {Text({ k: 'spudDate', label: 'Spud date', type: 'date' })}
            </div>
            {formError && <p role="alert" className="lg:col-span-2 text-sm text-red-400">{formError}</p>}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete well"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>Delete</Btn>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Permanently delete <strong>{deleting.name}</strong> ({deleting.wellNumber}) <strong>and all telemetry stored for it</strong>? This cannot be
            undone. A well that still has reports or WITSML log maps cannot be deleted.
          </p>
        </Modal>
      )}
    </div>
  );
}
