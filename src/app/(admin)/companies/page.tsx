'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Badge, Btn, FormRow, Notice, useColors } from '@/components/ui';
import { api, Company, send } from '@/lib/adminApi';

const PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;
const PLAN_TONE = { free: 'gray', starter: 'blue', pro: 'green', enterprise: 'amber' } as const;

interface FormState { name: string; country: string; industry: string; plan: (typeof PLANS)[number]; expires: string; isActive: boolean }
const EMPTY: FormState = { name: '', country: '', industry: 'Oil & Gas', plan: 'free', expires: '', isActive: true };

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function CompaniesPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Company | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [deactivating, setDeactivating] = useState<Company | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data) });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (companies.data ?? []).filter((r) =>
      (!statusFilter || (statusFilter === 'active') === r.isActive) &&
      (!q || [r.name, r.country, r.industry ?? '', r.slug ?? ''].some((v) => v.toLowerCase().includes(q)))
    );
  }, [companies.data, query, statusFilter]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['companies'] });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: form.name, country: form.country, industry: form.industry, subscriptionPlan: form.plan,
        subscriptionExpiresAt: form.expires ? form.expires : null, // null clears an existing expiry
      };
      if (editing === 'new') {
        if (!form.expires) delete body.subscriptionExpiresAt;
        return api('companies', send('POST', body));
      }
      body.isActive = form.isActive;
      return api(`companies/${(editing as Company).id}`, send('PATCH', body));
    },
    onSuccess: () => { setEditing(null); setNotice({ kind: 'ok', text: 'Company saved.' }); refresh(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const setActive = useMutation({
    mutationFn: (v: { company: Company; active: boolean }) => api(`companies/${v.company.id}`, send('PATCH', { isActive: v.active })),
    onSuccess: (_d, v) => {
      setDeactivating(null);
      setNotice({ kind: 'ok', text: v.active ? `${v.company.name} is active again. Its users can sign in.` : `${v.company.name} is deactivated. Its users are signed out and cannot sign in. Data is kept.` });
      refresh();
    },
    onError: (e: Error) => { setDeactivating(null); setNotice({ kind: 'error', text: e.message }); },
  });

  const remove = useMutation({
    mutationFn: (co: Company) => api(`companies/${co.id}`, send('DELETE')),
    onSuccess: () => { setDeleting(null); setNotice({ kind: 'ok', text: 'Company deleted.' }); refresh(); },
    onError: (e: Error) => { setDeleting(null); setNotice({ kind: 'error', text: e.message }); },
  });

  function open(target: Company | 'new') {
    setFormError('');
    setForm(target === 'new' ? EMPTY : {
      name: target.name, country: target.country, industry: target.industry ?? '', plan: target.subscriptionPlan ?? 'free',
      expires: target.subscriptionExpiresAt ? target.subscriptionExpiresAt.slice(0, 10) : '', isActive: target.isActive,
    });
    setEditing(target);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    save.mutate();
  }

  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';
  const now = Date.now();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>Administration</h1>
      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border }}>
          <h2 className="text-base font-medium" style={{ color: c.text }}>Companies</h2>
        </div>

        <div className="flex items-end justify-between gap-3 flex-wrap px-6 py-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label htmlFor="cs" className="text-xs font-semibold" style={{ color: c.text }}>Status</label>
              <select id="cs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border outline-none" style={c.inputStyle}>
                <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </div>
            <input aria-label="Search companies" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 220 }} />
          </div>
          <Btn onClick={() => open('new')}>New Company</Btn>
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Name', 'Country', 'Industry', 'Plan', 'Users', 'Wells', 'Status', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const plan = r.subscriptionPlan ?? 'free';
                const expired = !!r.subscriptionExpiresAt && new Date(r.subscriptionExpiresAt).getTime() < now;
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs" style={{ color: c.muted }}>{r.slug}</div>
                    </td>
                    <td className="py-3 pr-4">{r.country}</td>
                    <td className="py-3 pr-4">{r.industry}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={PLAN_TONE[plan]}>{plan}</Badge>
                      {r.subscriptionExpiresAt && (
                        <div className="text-xs mt-1" style={{ color: expired ? '#f87171' : c.muted }}>
                          {expired ? 'expired ' : 'until '}{fmtDate(r.subscriptionExpiresAt)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">{r.userCount ?? 0}</td>
                    <td className="py-3 pr-4">{r.wellCount ?? 0}</td>
                    <td className="py-3 pr-4"><Badge tone={r.isActive ? 'green' : 'red'}>{r.isActive ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="py-2 whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        <Btn small onClick={() => open(r)}>Edit</Btn>
                        {r.isActive
                          ? <Btn small kind="neutral" onClick={() => setDeactivating(r)}>Deactivate</Btn>
                          : <Btn small kind="success" onClick={() => setActive.mutate({ company: r, active: true })} disabled={setActive.isPending}>Activate</Btn>}
                        <Btn small kind="danger" onClick={() => setDeleting(r)}>Delete</Btn>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {companies.isLoading && <tr><td colSpan={8} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {companies.isError && <tr><td colSpan={8} className="py-8 text-center text-red-400">{(companies.error as Error).message}</td></tr>}
              {!companies.isLoading && !companies.isError && rows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center" style={{ color: c.muted }}>No companies yet. Click New Company to add one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? 'New Company' : 'Edit Company'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="co-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="co-form" onSubmit={onSubmit} className="space-y-3">
            <FormRow label="Name" htmlFor="co-name">
              <input id="co-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} style={c.inputStyle} placeholder="Name" />
            </FormRow>
            <FormRow label="Country" htmlFor="co-country">
              <input id="co-country" required minLength={2} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={input} style={c.inputStyle} placeholder="Country" />
            </FormRow>
            <FormRow label="Industry" htmlFor="co-ind">
              <input id="co-ind" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className={input} style={c.inputStyle} placeholder="Industry" />
            </FormRow>
            <FormRow label="Plan" htmlFor="co-plan">
              <select id="co-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as FormState['plan'] })} className={input} style={c.inputStyle}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormRow>
            <FormRow label="Plan expires" htmlFor="co-exp" hint="Leave empty for no expiry. This is recorded only; it does not block anyone by itself.">
              <input id="co-exp" type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} className={input} style={c.inputStyle} />
            </FormRow>
            {editing !== 'new' && (
              <FormRow label="Active" htmlFor="co-active" hint="Unticking signs all of this company's users out and stops them signing in.">
                <input id="co-active" type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              </FormRow>
            )}
            {formError && <p role="alert" className="text-sm text-red-400">{formError}</p>}
          </form>
        </Modal>
      )}

      {deactivating && (
        <Modal
          title="Deactivate company"
          onClose={() => setDeactivating(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => setActive.mutate({ company: deactivating, active: false })} disabled={setActive.isPending}>Deactivate</Btn>
              <button onClick={() => setDeactivating(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Deactivate <strong>{deactivating.name}</strong>? Its {deactivating.userCount ?? 0} user{deactivating.userCount === 1 ? '' : 's'} will be
            signed out right away and cannot sign in until you activate the company again. All data is kept.
          </p>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete company"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>Delete</Btn>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Permanently delete <strong>{deleting.name}</strong>? This cannot be undone. A company that still has users, wells or WITSML
            connections cannot be deleted; deactivate it instead.
          </p>
        </Modal>
      )}
    </div>
  );
}
