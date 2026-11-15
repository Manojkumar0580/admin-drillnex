'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Btn, FormRow, Notice, useColors } from '@/components/ui';
import { CompanySelect } from '@/components/SearchSelect';
import { api, RigRow, send } from '@/lib/adminApi';
import { useCompanies } from '@/lib/useCompanies';

export default function RigsPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<RigRow | 'new' | null>(null);
  const [form, setForm] = useState({ companyId: '', name: '' });
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<RigRow | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const companies = useCompanies();
  const rigs = useQuery({ queryKey: ['rigs'], queryFn: () => api<{ data: RigRow[] }>('rigs').then((r) => r.data) });

  const companyName = useMemo(() => new Map((companies.data ?? []).map((x) => [x.id, x.name])), [companies.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rigs.data ?? []).filter((r) =>
      (!companyFilter || r.companyId === companyFilter) &&
      (!q || r.name.toLowerCase().includes(q) || (companyName.get(r.companyId) ?? '').toLowerCase().includes(q))
    );
  }, [rigs.data, companyFilter, query, companyName]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['rigs'] });
    qc.invalidateQueries({ queryKey: ['stats-overview'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const name = form.name.trim();
      if (editing === 'new') return api('rigs', send('POST', { companyId: form.companyId, name }));
      return api(`rigs/${(editing as RigRow).id}`, send('PATCH', { name }));
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
    setForm(target === 'new' ? { companyId: companyFilter, name: '' } : { companyId: target.companyId, name: target.name });
    setEditing(target);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (editing === 'new' && !form.companyId) { setFormError('Select a company'); return; }
    if (!form.name.trim()) { setFormError('Enter the rig name'); return; }
    save.mutate();
  }

  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';

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
              <CompanySelect id="rc" width={220} value={companyFilter} onChange={setCompanyFilter} allLabel="All companies" />
            </div>
            <input aria-label="Search rigs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 200 }} />
          </div>
          <Btn onClick={() => open('new')}>New</Btn>
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Client Name', 'Rig Name', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rigs.data && rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td className="py-3 pr-4">{companyName.get(r.companyId) ?? '—'}</td>
                  <td className="py-3 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Btn small onClick={() => open(r)}>Edit</Btn>
                      <Btn small kind="danger" onClick={() => setDeleting(r)}>Delete</Btn>
                    </span>
                  </td>
                </tr>
              ))}
              {rigs.isLoading && <tr><td colSpan={3} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {rigs.isError && <tr><td colSpan={3} className="py-8 text-center text-red-400">{(rigs.error as Error).message}</td></tr>}
              {rigs.data && rows.length === 0 && <tr><td colSpan={3} className="py-8 text-center" style={{ color: c.muted }}>No rigs yet. Click New to add one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title="Rig Form"
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="rig-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="rig-form" onSubmit={onSubmit} className="space-y-3">
            <FormRow label="Client Name" htmlFor="r-company">
              <CompanySelect id="r-company" value={form.companyId} disabled={editing !== 'new'} onChange={(v) => setForm({ ...form, companyId: v })} />
            </FormRow>
            <FormRow label="Rig Name" htmlFor="r-name" hint="Anything you like: letters, numbers or both, e.g. Rig 42 or H&P-305.">
              <input id="r-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rig Name" className={input} style={c.inputStyle} />
            </FormRow>
            {formError && <p role="alert" className="text-sm text-red-400">{formError}</p>}
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
            Permanently delete <strong>{deleting.name}</strong>? This cannot be undone. A rig that is still assigned to a well cannot be deleted; unassign it first.
          </p>
        </Modal>
      )}
    </div>
  );
}
