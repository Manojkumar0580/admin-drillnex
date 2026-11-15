'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Badge, Btn, Tone, useColors } from '@/components/ui';
import { CompanySelect } from '@/components/SearchSelect';
import { api, AuditEntry, Company, timeAgo } from '@/lib/adminApi';

const GROUPS: [string, string][] = [
  ['', 'All actions'],
  ['admin', 'Admin sign-ins'],
  ['company', 'Companies'],
  ['user', 'Users'],
  ['well', 'Wells'],
  ['connection', 'WITSML connections'],
  ['logmap', 'Log maps'],
  ['replay', 'Replay'],
  ['audit', 'Audit exports'],
];

function tone(e: AuditEntry): Tone {
  if (e.result === 'failure') return 'red';
  const verb = e.action.split('.')[1];
  if (['delete', 'login_failed'].includes(verb)) return 'red';
  if (['deactivate', 'stop', 'password_reset'].includes(verb)) return 'amber';
  if (['create', 'activate', 'start'].includes(verb)) return 'green';
  if (['update', 'role_change', 'reset', 'export'].includes(verb)) return 'blue';
  return 'gray';
}

const show = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
};

const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : undefined);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).getTime() : undefined);

function Details({ e }: { e: AuditEntry }) {
  const { text, muted, border } = useColors();
  const changes = (e.meta?.changes ?? null) as Record<string, { from?: unknown; to: unknown }> | null;
  const rest = e.meta ? Object.fromEntries(Object.entries(e.meta).filter(([k]) => k !== 'changes')) : {};
  return (
    <div className="px-4 py-3 text-xs space-y-2" style={{ color: text, borderTop: `1px dashed ${border}` }}>
      {changes && (
        <div>
          <div className="font-semibold mb-1">What changed</div>
          <ul className="space-y-0.5">
            {Object.entries(changes).map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>:{' '}
                {'from' in v ? <><span style={{ color: muted }}>{show(v.from)}</span> → </> : null}
                <strong>{show(v.to)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {Object.keys(rest).length > 0 && (
        <div>
          <div className="font-semibold mb-1">Details</div>
          <pre className="whitespace-pre-wrap break-all" style={{ color: muted }}>{JSON.stringify(rest, null, 2)}</pre>
        </div>
      )}
      <div style={{ color: muted }}>
        Target: {e.targetType}{e.targetId ? ` · ${e.targetId}` : ''} · Entry {e.id}
      </div>
    </div>
  );
}

export default function LogActionsPage() {
  const c = useColors();
  const [group, setGroup] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const [now] = useState(() => Date.now());

  // Search as you type, but only ask the server once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (group) p.set('action', group);
    if (companyId) p.set('companyId', companyId);
    const f = dayStart(from), t = dayEnd(to);
    if (f !== undefined) p.set('from', String(f));
    if (t !== undefined) p.set('to', String(t));
    if (q) p.set('q', q);
    return p;
  }, [group, companyId, from, to, q]);

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data) });
  const companyName = useMemo(() => new Map((companies.data ?? []).map((x) => [x.id, x.name])), [companies.data]);

  const log = useInfiniteQuery({
    queryKey: ['audit', params.toString()],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params);
      p.set('limit', '50');
      if (pageParam) p.set('cursor', pageParam);
      return api<{ data: AuditEntry[]; nextCursor: string | null }>(`audit?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = log.data?.pages.flatMap((p) => p.data) ?? [];
  const exportUrl = `/api/backend/audit/export?${params}`;
  const input = 'text-sm px-3 py-2 rounded-lg border outline-none';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>Administration</h1>

      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: c.border }}>
          <div>
            <h2 className="text-base font-medium" style={{ color: c.text }}>Log Actions</h2>
            <p className="text-xs mt-0.5" style={{ color: c.muted }}>Everything platform admins did. Entries cannot be edited or deleted.</p>
          </div>
          <div className="flex gap-2">
            <Btn kind="neutral" onClick={() => log.refetch()} disabled={log.isFetching}>{log.isFetching ? 'Loading…' : 'Refresh'}</Btn>
            <a href={exportUrl} download className="text-sm px-4 py-2 font-semibold rounded-lg text-white" style={{ background: '#1d6fbf' }}>Export CSV</a>
          </div>
        </div>

        <div className="flex items-end gap-3 flex-wrap px-6 py-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="la-group" className="text-xs font-semibold" style={{ color: c.text }}>Action:</label>
            <select id="la-group" value={group} onChange={(e) => setGroup(e.target.value)} className={input} style={c.inputStyle}>
              {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="la-company" className="text-xs font-semibold" style={{ color: c.text }}>Company:</label>
            <CompanySelect id="la-company" width={200} value={companyId} allLabel="All companies" onChange={setCompanyId} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="la-from" className="text-xs font-semibold" style={{ color: c.text }}>From:</label>
            <input id="la-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={input} style={c.inputStyle} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="la-to" className="text-xs font-semibold" style={{ color: c.text }}>To:</label>
            <input id="la-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} style={c.inputStyle} />
          </div>
          <input aria-label="Search log" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actor, user, company..." className={input} style={{ ...c.inputStyle, width: 240 }} />
          {(group || companyId || from || to || search) && (
            <button onClick={() => { setGroup(''); setCompanyId(''); setFrom(''); setTo(''); setSearch(''); }} className="text-xs underline" style={{ color: c.muted }}>Clear filters</button>
          )}
        </div>

        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Time', 'Actor', 'Action', 'What happened', 'Company', 'IP'].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const t = new Date(e.time);
                const hasDetails = !!e.meta || !!e.targetId;
                const isOpen = open === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() => hasDetails && setOpen(isOpen ? '' : e.id)}
                      style={{ borderBottom: isOpen ? 'none' : `1px solid ${c.border}`, cursor: hasDetails ? 'pointer' : 'default' }}
                      aria-expanded={hasDetails ? isOpen : undefined}
                    >
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {t.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        <div className="text-xs" style={{ color: c.muted }}>{timeAgo(e.time, now)}</div>
                      </td>
                      <td className="py-3 pr-4 break-all">{e.actor.email ?? '—'}</td>
                      <td className="py-3 pr-4 whitespace-nowrap"><Badge tone={tone(e)}>{e.action}</Badge></td>
                      <td className="py-3 pr-4">{e.summary}{hasDetails && <span className="ml-2 text-xs" style={{ color: c.muted }}>{isOpen ? '▲' : '▼'}</span>}</td>
                      <td className="py-3 pr-4">{e.companyId ? companyName.get(e.companyId) ?? '—' : '—'}</td>
                      <td className="py-3 pr-4 whitespace-nowrap" style={{ color: c.muted }}>{e.ip ?? '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ borderBottom: `1px solid ${c.border}` }}><td colSpan={6} className="p-0"><Details e={e} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
              {log.isLoading && <tr><td colSpan={6} className="py-8 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {log.isError && <tr><td colSpan={6} className="py-8 text-center text-red-400">{(log.error as Error).message}</td></tr>}
              {!log.isLoading && !log.isError && rows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center" style={{ color: c.muted }}>No entries match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 pb-5 flex items-center justify-between text-xs" style={{ color: c.muted }}>
          <span>{rows.length} entr{rows.length === 1 ? 'y' : 'ies'} shown</span>
          {log.hasNextPage && (
            <Btn kind="neutral" onClick={() => log.fetchNextPage()} disabled={log.isFetchingNextPage}>{log.isFetchingNextPage ? 'Loading…' : 'Load more'}</Btn>
          )}
        </div>
      </div>
    </div>
  );
}
