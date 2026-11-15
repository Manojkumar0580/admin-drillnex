'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Btn, FormRow, Notice, useColors } from '@/components/ui';
import { api, Company, PadRow, send, WellFull } from '@/lib/adminApi';

interface FormState { companyId: string; name: string; notes: string; wellIds: string[] }
const EMPTY: FormState = { companyId: '', name: '', notes: '', wellIds: [] };
const SHOWN_WELLS = 4;

export default function PadsPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<PadRow | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [wellSearch, setWellSearch] = useState('');
  const [deleting, setDeleting] = useState<PadRow | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data) });
  const wells = useQuery({ queryKey: ['wells', 'full'], queryFn: () => api<{ data: WellFull[] }>('wells').then((r) => r.data) });
  const pads = useQuery({ queryKey: ['pads'], queryFn: () => api<{ data: PadRow[] }>('pads').then((r) => r.data) });

  const companyName = useMemo(() => new Map((companies.data ?? []).map((x) => [x.id, x.name])), [companies.data]);
  // Which pad each well is on, so the picker can show a well that is taken instead of failing on save.
  const padOfWell = useMemo(() => {
    const m = new Map<string, PadRow>();
    for (const p of pads.data ?? []) for (const w of p.wells) m.set(w.id, p);
    return m;
  }, [pads.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (pads.data ?? []).filter((p) =>
      (!companyFilter || p.companyId === companyFilter) &&
      (!q || [p.name, p.notes, companyName.get(p.companyId) ?? '', ...p.wells.map((w) => w.name)].some((v) => v.toLowerCase().includes(q)))
    );
  }, [pads.data, companyFilter, query, companyName]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pads'] });
    qc.invalidateQueries({ queryKey: ['wells'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const wellIds = [...form.wellIds].sort(); // a stable order, so re-saving unchanged wells is not logged as a change
      if (editing === 'new') {
        return api('pads', send('POST', { companyId: form.companyId, name: form.name, ...(form.notes.trim() ? { notes: form.notes.trim() } : {}), wellIds }));
      }
      return api(`pads/${(editing as PadRow).id}`, send('PATCH', { name: form.name, notes: form.notes.trim(), wellIds }));
    },
    onSuccess: () => { setEditing(null); setNotice({ kind: 'ok', text: 'Pad saved.' }); refresh(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const remove = useMutation({
    mutationFn: (p: PadRow) => api<{ unassignedWells: number }>(`pads/${p.id}`, send('DELETE')),
    onSuccess: (r) => {
      setDeleting(null);
      setNotice({ kind: 'ok', text: `Pad deleted.${r.unassignedWells ? ` ${r.unassignedWells} well${r.unassignedWells > 1 ? 's are' : ' is'} no longer on a pad.` : ''}` });
      refresh();
    },
    onError: (e: Error) => { setDeleting(null); setNotice({ kind: 'error', text: e.message }); },
  });

  function open(target: PadRow | 'new') {
    setFormError(''); setWellSearch('');
    setForm(target === 'new' ? { ...EMPTY, companyId: companyFilter } : { companyId: target.companyId, name: target.name, notes: target.notes, wellIds: target.wells.map((w) => w.id) });
    setEditing(target);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (editing === 'new' && !form.companyId) { setFormError('Select a company'); return; }
    save.mutate();
  }

  const toggle = (id: string) => setForm((f) => ({ ...f, wellIds: f.wellIds.includes(id) ? f.wellIds.filter((x) => x !== id) : [...f.wellIds, id] }));
  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';
  const myId = editing && editing !== 'new' ? editing.id : '';
  const wellChoices = (wells.data ?? [])
    .filter((w) => w.companyId === form.companyId)
    .filter((w) => !wellSearch.trim() || `${w.name} ${w.wellNumber}`.toLowerCase().includes(wellSearch.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>WITSML Settings</h1>
      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border }}>
          <h2 className="text-base font-medium" style={{ color: c.text }}>Pads</h2>
        </div>

        <div className="flex items-end justify-between gap-3 flex-wrap px-6 py-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label htmlFor="pc" className="text-xs font-semibold" style={{ color: c.text }}>Company:</label>
              <select id="pc" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border outline-none min-w-[190px]" style={c.inputStyle}>
                <option value="">All companies</option>
                {(companies.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <input aria-label="Search pads" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 220 }} />
          </div>
          <Btn kind="success" onClick={() => open('new')}>New</Btn>
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Name', 'Company', 'Wells', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{p.name}</div>
                    {p.notes && <div className="text-xs" style={{ color: c.muted }}>{p.notes}</div>}
                  </td>
                  <td className="py-3 pr-4">{companyName.get(p.companyId) ?? '—'}</td>
                  <td className="py-3 pr-4" style={{ maxWidth: 420 }}>
                    {p.wellCount === 0 ? <span style={{ color: c.muted }}>no wells</span> : (
                      <span title={p.wells.map((w) => w.name).join(', ')}>
                        {p.wells.slice(0, SHOWN_WELLS).map((w) => w.name).join(', ')}
                        {p.wellCount > SHOWN_WELLS && <span style={{ color: c.muted }}> +{p.wellCount - SHOWN_WELLS} more</span>}
                      </span>
                    )}
                  </td>
                  <td className="py-2 whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Btn small onClick={() => open(p)}>Edit</Btn>
                      <Btn small kind="danger" onClick={() => setDeleting(p)}>Delete</Btn>
                    </span>
                  </td>
                </tr>
              ))}
              {pads.isLoading && <tr><td colSpan={4} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {pads.isError && <tr><td colSpan={4} className="py-8 text-center text-red-400">{(pads.error as Error).message}</td></tr>}
              {pads.data && rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center" style={{ color: c.muted }}>No pads yet. Click New to add one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title="Pad Form"
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="pad-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="pad-form" onSubmit={onSubmit} className="space-y-3">
            <FormRow label="Company" htmlFor="pd-company">
              <select id="pd-company" value={form.companyId} disabled={editing !== 'new'} onChange={(e) => setForm({ ...form, companyId: e.target.value, wellIds: [] })} className={input} style={{ ...c.inputStyle, opacity: editing !== 'new' ? 0.7 : 1 }}>
                <option value="">Select a company</option>
                {(companies.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </FormRow>
            <FormRow label="Name" htmlFor="pd-name" hint="Unique within the company.">
              <input id="pd-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={input} style={c.inputStyle} />
            </FormRow>
            <FormRow label="Notes" htmlFor="pd-notes">
              <input id="pd-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" className={input} style={c.inputStyle} />
            </FormRow>
            <FormRow label="Wells" hint="A well can be on one pad at a time. Ticking a well here moves it onto this pad.">
              {!form.companyId ? (
                <p className="text-sm" style={{ color: c.muted }}>Select a company first.</p>
              ) : (
                <div className="space-y-2">
                  <input aria-label="Search wells" value={wellSearch} onChange={(e) => setWellSearch(e.target.value)} placeholder="Search wells..." className={input} style={c.inputStyle} />
                  <div className="max-h-52 overflow-y-auto rounded-lg border divide-y" style={{ borderColor: c.border }}>
                    {wellChoices.map((w) => {
                      const other = padOfWell.get(w.id);
                      const taken = !!other && other.id !== myId;
                      return (
                        <label key={w.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ color: taken ? c.muted : c.text, borderColor: c.border }}>
                          <input type="checkbox" disabled={taken} checked={form.wellIds.includes(w.id)} onChange={() => toggle(w.id)} />
                          {w.name} <span className="text-xs" style={{ color: c.muted }}>({w.wellNumber})</span>
                          {taken && <span className="ml-auto text-xs">on {other!.name}</span>}
                        </label>
                      );
                    })}
                    {wellChoices.length === 0 && <p className="px-3 py-3 text-sm" style={{ color: c.muted }}>No wells to show for this company.</p>}
                  </div>
                  <p className="text-xs" style={{ color: c.muted }}>{form.wellIds.length} selected</p>
                </div>
              )}
            </FormRow>
            {formError && <p role="alert" className="text-sm text-red-400">{formError}</p>}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete pad"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>Delete</Btn>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Delete the pad <strong>{deleting.name}</strong>?{' '}
            {deleting.wellCount > 0
              ? `Its ${deleting.wellCount} well${deleting.wellCount > 1 ? 's are' : ' is'} not deleted; they just stop belonging to a pad.`
              : 'It has no wells.'}
          </p>
        </Modal>
      )}
    </div>
  );
}
