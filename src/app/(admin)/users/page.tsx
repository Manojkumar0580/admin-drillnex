'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Badge, Btn, FormRow, Notice, Tone, useColors } from '@/components/ui';
import { CompanySelect } from '@/components/SearchSelect';
import { api, Company, generatePassword, send, timeAgo, UserRow } from '@/lib/adminApi';

const ROLES = ['manager', 'engineer', 'operator', 'viewer'] as const;
const ROLE_TONE: Record<UserRow['role'], Tone> = { manager: 'blue', engineer: 'green', operator: 'amber', viewer: 'gray' };

interface FormState { companyId: string; name: string; email: string; password: string; role: UserRow['role']; isActive: boolean }
const EMPTY: FormState = { companyId: '', name: '', email: '', password: '', role: 'viewer', isActive: true };

/** Password field with Show and Generate, shared by the create and reset forms. */
function PasswordInput({ id, value, onChange, show, setShow, input, style }: {
  id: string; value: string; onChange: (v: string) => void; show: boolean; setShow: (v: boolean) => void; input: string; style: React.CSSProperties;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard may be blocked */ }
  }
  return (
    <div className="space-y-2">
      <input id={id} type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Password" className={input} style={style} />
      <div className="flex gap-2 flex-wrap">
        <Btn small kind="neutral" onClick={() => { onChange(generatePassword()); setShow(true); }}>Generate</Btn>
        <Btn small kind="neutral" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</Btn>
        <Btn small kind="neutral" onClick={copy} disabled={!value}>{copied ? 'Copied' : 'Copy'}</Btn>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState('');
  const [resetError, setResetError] = useState('');
  const [deactivating, setDeactivating] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data) });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ data: UserRow[] }>('users').then((r) => r.data) });

  const companyName = useMemo(() => new Map((companies.data ?? []).map((x) => [x.id, x.name])), [companies.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users.data ?? []).filter((u) =>
      (!companyFilter || u.companyId === companyFilter) &&
      (!roleFilter || u.role === roleFilter) &&
      (!statusFilter || (statusFilter === 'active') === u.isActive) &&
      (!q || [u.name, u.email, companyName.get(u.companyId) ?? ''].some((v) => v.toLowerCase().includes(q)))
    );
  }, [users.data, companyFilter, roleFilter, statusFilter, query, companyName]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['companies'] }); // user counts
  };

  const save = useMutation({
    mutationFn: () => {
      if (editing === 'new') {
        return api('users', send('POST', { companyId: form.companyId, name: form.name, email: form.email, password: form.password, role: form.role }));
      }
      return api(`users/${(editing as UserRow).id}`, send('PATCH', { name: form.name, email: form.email, role: form.role, isActive: form.isActive }));
    },
    onSuccess: () => { setEditing(null); setNotice({ kind: 'ok', text: 'User saved.' }); refresh(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const setActive = useMutation({
    mutationFn: (v: { user: UserRow; active: boolean }) => api(`users/${v.user.id}`, send('PATCH', { isActive: v.active })),
    onSuccess: (_d, v) => {
      setDeactivating(null);
      setNotice({ kind: 'ok', text: v.active ? `${v.user.name} is active again and must sign in again.` : `${v.user.name} is deactivated and signed out everywhere.` });
      refresh();
    },
    onError: (e: Error) => { setDeactivating(null); setNotice({ kind: 'error', text: e.message }); },
  });

  const reset = useMutation({
    mutationFn: (u: UserRow) => api(`users/${u.id}/password`, send('POST', { password: newPw })),
    onSuccess: (_d, u) => { setResetting(null); setNotice({ kind: 'ok', text: `Password changed for ${u.name}. They are signed out everywhere and must use the new password.` }); },
    onError: (e: Error) => setResetError(e.message),
  });

  const remove = useMutation({
    mutationFn: (u: UserRow) => api(`users/${u.id}`, send('DELETE')),
    onSuccess: () => { setDeleting(null); setNotice({ kind: 'ok', text: 'User deleted.' }); refresh(); },
    onError: (e: Error) => { setDeleting(null); setNotice({ kind: 'error', text: e.message }); },
  });

  function open(target: UserRow | 'new') {
    setFormError(''); setShowPw(false);
    setForm(target === 'new'
      ? { ...EMPTY, companyId: companyFilter }
      : { companyId: target.companyId, name: target.name, email: target.email, password: '', role: target.role, isActive: target.isActive });
    setEditing(target);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (editing === 'new' && !form.companyId) { setFormError('Select a company'); return; }
    save.mutate();
  }

  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>Administration</h1>
      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border }}>
          <h2 className="text-base font-medium" style={{ color: c.text }}>Users</h2>
        </div>

        <div className="flex items-end justify-between gap-3 flex-wrap px-6 py-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label htmlFor="uc" className="text-xs font-semibold" style={{ color: c.text }}>Company:</label>
              <CompanySelect id="uc" width={220} value={companyFilter} allLabel="All companies" onChange={(v) => setCompanyFilter(v)} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ur" className="text-xs font-semibold" style={{ color: c.text }}>Role:</label>
              <select id="ur" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border outline-none" style={c.inputStyle}>
                <option value="">All</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="us" className="text-xs font-semibold" style={{ color: c.text }}>Status:</label>
              <select id="us" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm px-3 py-2 rounded-lg border outline-none" style={c.inputStyle}>
                <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </div>
            <input aria-label="Search users" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 200 }} />
          </div>
          <Btn onClick={() => open('new')}>New User</Btn>
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Name', 'Email', 'Company', 'Role', 'Status', 'Last login', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td className="py-3 pr-4 font-medium">{u.name}</td>
                  <td className="py-3 pr-4 break-all">{u.email}</td>
                  <td className="py-3 pr-4">{companyName.get(u.companyId) ?? '—'}</td>
                  <td className="py-3 pr-4"><Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge></td>
                  <td className="py-3 pr-4"><Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="py-3 pr-4 whitespace-nowrap" style={{ color: c.muted }}>{u.lastLogin ? timeAgo(u.lastLogin, now) : 'never'}</td>
                  <td className="py-2 whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Btn small onClick={() => open(u)}>Edit</Btn>
                      <Btn small kind="neutral" onClick={() => { setNewPw(''); setResetError(''); setShowPw(false); setResetting(u); }}>Reset password</Btn>
                      {u.isActive
                        ? <Btn small kind="neutral" onClick={() => setDeactivating(u)}>Deactivate</Btn>
                        : <Btn small kind="success" onClick={() => setActive.mutate({ user: u, active: true })} disabled={setActive.isPending}>Activate</Btn>}
                      <Btn small kind="danger" onClick={() => setDeleting(u)}>Delete</Btn>
                    </span>
                  </td>
                </tr>
              ))}
              {users.isLoading && <tr><td colSpan={7} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {users.isError && <tr><td colSpan={7} className="py-8 text-center text-red-400">{(users.error as Error).message}</td></tr>}
              {!users.isLoading && !users.isError && rows.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center" style={{ color: c.muted }}>No users yet. Click New User to add one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? 'New User' : 'Edit User'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="user-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="user-form" onSubmit={onSubmit} className="space-y-3">
            <FormRow label="Company" htmlFor="u-company">
              <CompanySelect id="u-company" value={form.companyId} disabled={editing !== 'new'} onChange={(v) => setForm({ ...form, companyId: v })} />
            </FormRow>
            <FormRow label="Name" htmlFor="u-name">
              <input id="u-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} style={c.inputStyle} placeholder="Full name" />
            </FormRow>
            <FormRow label="Email" htmlFor="u-email">
              <input id="u-email" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} style={c.inputStyle} placeholder="name@company.com" />
            </FormRow>
            {editing === 'new' && (
              <FormRow label="Password" htmlFor="u-pass" hint="At least 8 characters with an uppercase letter and a number. Share it with the user over a secure channel; it is never shown again.">
                <PasswordInput id="u-pass" value={form.password} onChange={(v) => setForm({ ...form, password: v })} show={showPw} setShow={setShowPw} input={input} style={c.inputStyle} />
              </FormRow>
            )}
            <FormRow label="Role" htmlFor="u-role" hint="Manager can manage users of their own company. Viewer is read-only.">
              <select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRow['role'] })} className={input} style={c.inputStyle}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </FormRow>
            {editing !== 'new' && (
              <FormRow label="Active" htmlFor="u-active" hint="Unticking signs the user out everywhere.">
                <input id="u-active" type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              </FormRow>
            )}
            {formError && <p role="alert" className="text-sm text-red-400">{formError}</p>}
          </form>
        </Modal>
      )}

      {resetting && (
        <Modal
          title="Reset password"
          onClose={() => setResetting(null)}
          footer={
            <>
              <Btn type="submit" form="reset-form" disabled={reset.isPending}>{reset.isPending ? 'Saving…' : 'Set password'}</Btn>
              <button onClick={() => setResetting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="reset-form" onSubmit={(e) => { e.preventDefault(); setResetError(''); reset.mutate(resetting); }} className="space-y-3">
            <p className="text-sm" style={{ color: c.text }}>
              New password for <strong>{resetting.name}</strong> ({resetting.email}). They will be signed out everywhere.
            </p>
            <FormRow label="New password" htmlFor="r-pass" hint="Copy it before saving; it is not shown again.">
              <PasswordInput id="r-pass" value={newPw} onChange={setNewPw} show={showPw} setShow={setShowPw} input={input} style={c.inputStyle} />
            </FormRow>
            {resetError && <p role="alert" className="text-sm text-red-400">{resetError}</p>}
          </form>
        </Modal>
      )}

      {deactivating && (
        <Modal
          title="Deactivate user"
          onClose={() => setDeactivating(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => setActive.mutate({ user: deactivating, active: false })} disabled={setActive.isPending}>Deactivate</Btn>
              <button onClick={() => setDeactivating(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Deactivate <strong>{deactivating.name}</strong>? They are signed out everywhere right away. If you activate them later they must sign in again.
          </p>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete user"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>Delete</Btn>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Permanently delete <strong>{deleting.name}</strong> ({deleting.email})? This cannot be undone. A user who created reports or wells cannot be
            deleted; deactivate them instead.
          </p>
        </Modal>
      )}
    </div>
  );
}
