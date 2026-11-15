'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Badge, Btn, FormRow, Notice, Tone, useColors } from '@/components/ui';
import { api, ApiError, Company, Connection, send, timeAgo } from '@/lib/adminApi';

const STATUS: Record<Connection['status'], { tone: Tone; label: string }> = {
  ok: { tone: 'green', label: 'Connected' },
  auth_failed: { tone: 'red', label: 'Login rejected' },
  error: { tone: 'amber', label: 'Error' },
  unknown: { tone: 'gray', label: 'Not tested' },
};

interface FormState { companyId: string; name: string; url: string; loginName: string; password: string }
const EMPTY: FormState = { companyId: '', name: '', url: '', loginName: '', password: '' };

export default function ConnectionsPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Connection | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Connection | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [testingId, setTestingId] = useState('');

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data) });
  const conns = useQuery({ queryKey: ['connections'], queryFn: () => api<{ data: Connection[] }>('witsml/connections').then((r) => r.data) });

  const companyName = useMemo(() => new Map((companies.data ?? []).map((x) => [x.id, x.name])), [companies.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (conns.data ?? []).filter((r) =>
      (!companyFilter || r.companyId === companyFilter) &&
      (!q || [r.name, r.url, r.loginName, companyName.get(r.companyId) ?? ''].some((v) => v.toLowerCase().includes(q)))
    );
  }, [conns.data, companyFilter, query, companyName]);

  const save = useMutation({
    mutationFn: async () => {
      if (editing === 'new') {
        return api('witsml/connections', send('POST', form));
      }
      const body: Record<string, string> = { name: form.name, url: form.url, loginName: form.loginName };
      if (form.password) body.password = form.password; // blank = keep the stored password
      return api(`witsml/connections/${(editing as Connection).id}`, send('PATCH', body));
    },
    onSuccess: () => {
      setEditing(null);
      setNotice({ kind: 'ok', text: 'Connection saved.' });
      qc.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`witsml/connections/${id}`, send('DELETE')),
    onSuccess: () => { setDeleting(null); setNotice({ kind: 'ok', text: 'Connection deleted.' }); qc.invalidateQueries({ queryKey: ['connections'] }); },
    onError: (e: Error) => { setDeleting(null); setNotice({ kind: 'error', text: e.message }); },
  });

  async function test(conn: Connection) {
    setTestingId(conn.id);
    setNotice(null);
    try {
      const r = await api<{ versions: string[] }>(`witsml/connections/${conn.id}/test`, send('POST'));
      setNotice({ kind: 'ok', text: `"${conn.name}" is reachable and the login works${r.versions.length ? ` (server reports WITSML ${r.versions.join(', ')})` : ''}.` });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Test failed';
      setNotice({ kind: 'error', text: `"${conn.name}": ${msg}` });
    } finally {
      setTestingId('');
      qc.invalidateQueries({ queryKey: ['connections'] });
    }
  }

  function open(target: Connection | 'new') {
    setFormError('');
    setForm(target === 'new'
      ? { ...EMPTY, companyId: companyFilter }
      : { companyId: target.companyId, name: target.name, url: target.url, loginName: target.loginName, password: '' });
    setEditing(target);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (editing === 'new' && (!form.companyId || !form.password)) {
      setFormError('Company and password are required');
      return;
    }
    save.mutate();
  }

  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>WITSML Settings</h1>

      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border }}>
          <h2 className="text-base font-medium" style={{ color: c.text }}>Connections</h2>
        </div>

        <div className="flex items-end justify-between gap-3 flex-wrap px-6 py-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label htmlFor="cf" className="text-xs font-semibold" style={{ color: c.text }}>Company</label>
              <select id="cf" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border outline-none min-w-[190px]" style={c.inputStyle}>
                <option value="">All companies</option>
                {(companies.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <input aria-label="Search connections" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..."
              className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 220 }} />
          </div>
          <Btn onClick={() => open('new')}>New</Btn>
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Name', 'Company', 'URL', 'Login Name', 'Status', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS[r.status];
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td className="py-3 pr-4 font-medium">{r.name}{!r.isActive && <span className="ml-2 text-xs" style={{ color: c.muted }}>(disabled)</span>}</td>
                    <td className="py-3 pr-4">{companyName.get(r.companyId) ?? '—'}</td>
                    <td className="py-3 pr-4 break-all" style={{ maxWidth: 320 }}>{r.url}</td>
                    <td className="py-3 pr-4">{r.loginName}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={s.tone} title={r.lastError}>{s.label}</Badge>
                      {r.lastTestAt && <div className="text-xs mt-1" style={{ color: c.muted }}>tested {timeAgo(r.lastTestAt)}</div>}
                    </td>
                    <td className="py-2 whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        <Btn small kind="success" onClick={() => test(r)} disabled={testingId === r.id}>{testingId === r.id ? 'Testing…' : 'Test'}</Btn>
                        <Btn small onClick={() => open(r)}>Edit</Btn>
                        <Btn small kind="danger" onClick={() => setDeleting(r)}>Delete</Btn>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {conns.isLoading && <tr><td colSpan={6} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {conns.isError && <tr><td colSpan={6} className="py-8 text-center text-red-400">{(conns.error as Error).message}</td></tr>}
              {!conns.isLoading && !conns.isError && rows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center" style={{ color: c.muted }}>No connections yet. Click New to add one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title="Connection Form"
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="conn-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="conn-form" onSubmit={onSubmit} className="space-y-3">
            <FormRow label="Company" htmlFor="f-company">
              <select id="f-company" value={form.companyId} disabled={editing !== 'new'} onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                className={input} style={{ ...c.inputStyle, opacity: editing !== 'new' ? 0.7 : 1 }}>
                <option value="">Select a company</option>
                {(companies.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </FormRow>
            <FormRow label="Name" htmlFor="f-name">
              <input id="f-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={input} style={c.inputStyle} />
            </FormRow>
            <FormRow label="URL" htmlFor="f-url" hint="Full https:// address of the WITSML store, e.g. https://witsml.example.com/store">
              <input id="f-url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." className={input} style={c.inputStyle} />
            </FormRow>
            <FormRow label="Login Name" htmlFor="f-login">
              <input id="f-login" required autoComplete="off" value={form.loginName} onChange={(e) => setForm({ ...form, loginName: e.target.value })} placeholder="Login Name" className={input} style={c.inputStyle} />
            </FormRow>
            <FormRow label="Password" htmlFor="f-pass" hint={editing === 'new' ? 'Stored encrypted. It is never shown again.' : 'Leave blank to keep the current password.'}>
              <input id="f-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing === 'new' ? 'Password' : '••••••••'} className={input} style={c.inputStyle} />
            </FormRow>
            {formError && <p role="alert" className="text-sm text-red-400">{formError}</p>}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete connection"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => remove.mutate(deleting.id)} disabled={remove.isPending}>Delete</Btn>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Delete <strong>{deleting.name}</strong>? Its log maps must be removed first. This cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
