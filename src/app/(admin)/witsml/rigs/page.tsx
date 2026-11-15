'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Badge, Btn, FormRow, Notice, Tone, useColors } from '@/components/ui';
import { api, Company, RigRow, send, WellFull } from '@/lib/adminApi';

const TYPES = ['land', 'jackup', 'semisubmersible', 'drillship'] as const;
const STATUSES = ['active', 'idle', 'maintenance', 'stacked'] as const;
const PROTOCOLS = ['WITSML', 'WITS_L0', 'OPC_UA', 'manual'] as const;
const STATUS_TONE: Record<RigRow['status'], Tone> = { active: 'green', idle: 'gray', maintenance: 'amber', stacked: 'red' };

interface FormState {
  companyId: string; name: string; rigNumber: string; contractor: string;
  type: RigRow['type']; status: RigRow['status']; currentWellId: string;
  maxDepth: string; horsepower: string; hookload: string; protocol: string;
}
const EMPTY: FormState = {
  companyId: '', name: '', rigNumber: '', contractor: '', type: 'land', status: 'idle', currentWellId: '',
  maxDepth: '', horsepower: '', hookload: '', protocol: '',
};
const num = (s: string) => (s.trim() === '' ? null : Number(s));

export default function RigsPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<RigRow | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<RigRow | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data) });
  const wells = useQuery({ queryKey: ['wells', 'full'], queryFn: () => api<{ data: WellFull[] }>('wells').then((r) => r.data) });
  const rigs = useQuery({ queryKey: ['rigs'], queryFn: () => api<{ data: RigRow[] }>('rigs').then((r) => r.data) });

  const companyName = useMemo(() => new Map((companies.data ?? []).map((x) => [x.id, x.name])), [companies.data]);
  // Which well is already taken by which rig, so the picker can say so instead of failing on save.
  const takenBy = useMemo(() => new Map((rigs.data ?? []).filter((r) => r.currentWellId).map((r) => [r.currentWellId as string, r])), [rigs.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rigs.data ?? []).filter((r) =>
      (!companyFilter || r.companyId === companyFilter) &&
      (!statusFilter || r.status === statusFilter) &&
      (!typeFilter || r.type === typeFilter) &&
      (!q || [r.name, r.rigNumber, r.contractor, r.currentWell?.name ?? '', companyName.get(r.companyId) ?? ''].some((v) => v.toLowerCase().includes(q)))
    );
  }, [rigs.data, companyFilter, statusFilter, typeFilter, query, companyName]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['rigs'] });
    qc.invalidateQueries({ queryKey: ['stats-overview'] });
  };

  const save = useMutation({
    mutationFn: () => {
      for (const k of ['maxDepth', 'horsepower', 'hookload'] as const) {
        const v = num(form[k]);
        if (v !== null && (!Number.isFinite(v) || v < 0)) throw new Error('Specifications must be positive numbers');
      }
      const body: Record<string, unknown> = {
        name: form.name, rigNumber: form.rigNumber, contractor: form.contractor, type: form.type, status: form.status,
        maxDepth: num(form.maxDepth), horsepower: num(form.horsepower), hookload: num(form.hookload),
        protocol: form.protocol || null, currentWellId: form.currentWellId || null,
      };
      if (editing === 'new') {
        body.companyId = form.companyId;
        // On create an empty value just means "not set"; leave those keys out.
        for (const k of ['maxDepth', 'horsepower', 'hookload', 'protocol', 'currentWellId']) if (body[k] === null) delete body[k];
        return api('rigs', send('POST', body));
      }
      return api(`rigs/${(editing as RigRow).id}`, send('PATCH', body));
    },
    onSuccess: () => { setEditing(null); setNotice({ kind: 'ok', text: 'Rig saved.' }); refresh(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const remove = useMutation({
    mutationFn: (r: RigRow) => api(`rigs/${r.id}`, send('DELETE')),
    onSuccess: () => { setDeleting(null); setNotice({ kind: 'ok', text: 'Rig deleted.' }); refresh(); },
    onError: (e: Error) => { setDeleting(null); setNotice({ kind: 'error', text: e.message }); },
  });

  function open(target: RigRow | 'new') {
    setFormError('');
    setForm(target === 'new'
      ? { ...EMPTY, companyId: companyFilter }
      : {
          companyId: target.companyId, name: target.name, rigNumber: target.rigNumber, contractor: target.contractor, type: target.type, status: target.status,
          currentWellId: target.currentWellId ?? '', maxDepth: target.maxDepth === null ? '' : String(target.maxDepth),
          horsepower: target.horsepower === null ? '' : String(target.horsepower), hookload: target.hookload === null ? '' : String(target.hookload),
          protocol: target.protocol ?? '',
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
  const wellChoices = (wells.data ?? []).filter((w) => w.companyId === form.companyId);
  const myId = editing && editing !== 'new' ? editing.id : '';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>WITSML Settings</h1>
      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border }}>
          <h2 className="text-base font-medium" style={{ color: c.text }}>Rigs</h2>
        </div>

        <div className="flex items-end justify-between gap-3 flex-wrap px-6 py-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label htmlFor="rc" className="text-xs font-semibold" style={{ color: c.text }}>Company:</label>
              <select id="rc" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border outline-none min-w-[190px]" style={c.inputStyle}>
                <option value="">All companies</option>
                {(companies.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="rs" className="text-xs font-semibold" style={{ color: c.text }}>Status:</label>
              <select id="rs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border outline-none" style={c.inputStyle}>
                <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="rt" className="text-xs font-semibold" style={{ color: c.text }}>Type:</label>
              <select id="rt" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border outline-none" style={c.inputStyle}>
                <option value="">All</option>{TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <input aria-label="Search rigs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 200 }} />
          </div>
          <Btn onClick={() => open('new')}>New</Btn>
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Name', 'Company', 'Type', 'Status', 'Contractor', 'Current well', 'Data feed', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rigs.data && rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs" style={{ color: c.muted }}>{r.rigNumber}</div>
                  </td>
                  <td className="py-3 pr-4">{companyName.get(r.companyId) ?? '—'}</td>
                  <td className="py-3 pr-4 capitalize">{r.type}</td>
                  <td className="py-3 pr-4"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                  <td className="py-3 pr-4">{r.contractor}</td>
                  <td className="py-3 pr-4">{r.currentWell ? `${r.currentWell.name} (${r.currentWell.wellNumber})` : <span style={{ color: c.muted }}>none</span>}</td>
                  <td className="py-3 pr-4">{r.protocol ?? <span style={{ color: c.muted }}>—</span>}</td>
                  <td className="py-2 whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Btn small onClick={() => open(r)}>Edit</Btn>
                      <Btn small kind="danger" onClick={() => setDeleting(r)}>Delete</Btn>
                    </span>
                  </td>
                </tr>
              ))}
              {rigs.isLoading && <tr><td colSpan={8} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {rigs.isError && <tr><td colSpan={8} className="py-8 text-center text-red-400">{(rigs.error as Error).message}</td></tr>}
              {rigs.data && rows.length === 0 && <tr><td colSpan={8} className="py-8 text-center" style={{ color: c.muted }}>No rigs yet. Click New to add one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title="Rig Form"
          wide
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="rig-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="rig-form" onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
            <div className="space-y-3">
              <FormRow label="Company" htmlFor="r-company">
                <select id="r-company" value={form.companyId} disabled={editing !== 'new'} onChange={(e) => setForm({ ...form, companyId: e.target.value, currentWellId: '' })} className={input} style={{ ...c.inputStyle, opacity: editing !== 'new' ? 0.7 : 1 }}>
                  <option value="">Select a company</option>
                  {(companies.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </FormRow>
              <FormRow label="Name" htmlFor="r-name"><input id="r-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={input} style={c.inputStyle} /></FormRow>
              <FormRow label="Rig number" htmlFor="r-num" hint="Unique within the company."><input id="r-num" required value={form.rigNumber} onChange={(e) => setForm({ ...form, rigNumber: e.target.value })} placeholder="Rig number" className={input} style={c.inputStyle} /></FormRow>
              <FormRow label="Contractor" htmlFor="r-contractor"><input id="r-contractor" required value={form.contractor} onChange={(e) => setForm({ ...form, contractor: e.target.value })} placeholder="Contractor" className={input} style={c.inputStyle} /></FormRow>
              <FormRow label="Type" htmlFor="r-type">
                <select id="r-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })} className={input} style={c.inputStyle}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormRow>
              <FormRow label="Status" htmlFor="r-status">
                <select id="r-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FormState['status'] })} className={input} style={c.inputStyle}>
                  {STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormRow>
            </div>
            <div className="space-y-3">
              <FormRow label="Current well" htmlFor="r-well" hint="A well can belong to one rig at a time.">
                <select id="r-well" value={form.currentWellId} onChange={(e) => setForm({ ...form, currentWellId: e.target.value })} className={input} style={c.inputStyle} disabled={!form.companyId}>
                  <option value="">None</option>
                  {wellChoices.map((w) => {
                    const owner = takenBy.get(w.id);
                    const taken = !!owner && owner.id !== myId;
                    return <option key={w.id} value={w.id} disabled={taken}>{w.name} ({w.wellNumber}){taken ? ` — on ${owner!.name}` : ''}</option>;
                  })}
                </select>
              </FormRow>
              <FormRow label="Data protocol" htmlFor="r-proto">
                <select id="r-proto" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} className={input} style={c.inputStyle}>
                  <option value="">Not set</option>
                  {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </FormRow>
              <FormRow label="Max depth (ft)" htmlFor="r-depth"><input id="r-depth" type="number" min={0} step="any" value={form.maxDepth} onChange={(e) => setForm({ ...form, maxDepth: e.target.value })} placeholder="Max depth" className={input} style={c.inputStyle} /></FormRow>
              <FormRow label="Horsepower (hp)" htmlFor="r-hp"><input id="r-hp" type="number" min={0} step="any" value={form.horsepower} onChange={(e) => setForm({ ...form, horsepower: e.target.value })} placeholder="Horsepower" className={input} style={c.inputStyle} /></FormRow>
              <FormRow label="Hookload (klbf)" htmlFor="r-hook"><input id="r-hook" type="number" min={0} step="any" value={form.hookload} onChange={(e) => setForm({ ...form, hookload: e.target.value })} placeholder="Hookload" className={input} style={c.inputStyle} /></FormRow>
            </div>
            {formError && <p role="alert" className="lg:col-span-2 text-sm text-red-400">{formError}</p>}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete rig"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>Delete</Btn>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Permanently delete <strong>{deleting.name}</strong> ({deleting.rigNumber})? This cannot be undone. A rig that is still assigned to a well cannot be deleted; unassign it first.
          </p>
        </Modal>
      )}
    </div>
  );
}
