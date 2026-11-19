'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/Modal';
import { Badge, Btn, FormRow, Notice, useColors } from '@/components/ui';
import { api, ChannelDef, CustomAlias, send, timeAgo } from '@/lib/adminApi';

interface Dictionary { builtin: ChannelDef[]; custom: CustomAlias[] }
interface Resolved { channel: string; source: 'built-in' | 'custom'; unit?: string }

const VISIBLE_ALIASES = 8;

export default function ChannelsPage() {
  const c = useColors();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CustomAlias | 'new' | null>(null);
  const [form, setForm] = useState({ mnemonic: '', channel: '', unit: '' });
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<CustomAlias | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [now] = useState(() => Date.now());

  // "Check a mnemonic": ask the server how it would be read, as you type.
  const [probe, setProbe] = useState('');
  const [probeDebounced, setProbeDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setProbeDebounced(probe.trim()), 300);
    return () => clearTimeout(t);
  }, [probe]);

  const dict = useQuery({ queryKey: ['channels'], queryFn: () => api<Dictionary & { success: boolean }>('channels') });
  const resolved = useQuery({
    queryKey: ['channel-probe', probeDebounced],
    enabled: probeDebounced.length > 0,
    queryFn: () => api<{ result: Resolved | null }>(`channels/resolve?mnemonic=${encodeURIComponent(probeDebounced)}`).then((r) => r.result),
  });

  const label = useMemo(() => new Map((dict.data?.builtin ?? []).map((ch) => [ch.key, ch])), [dict.data]);

  const customByChannel = useMemo(() => {
    const m = new Map<string, CustomAlias[]>();
    for (const a of dict.data?.custom ?? []) m.set(a.channel, [...(m.get(a.channel) ?? []), a]);
    return m;
  }, [dict.data]);

  const q = query.trim().toLowerCase();
  const customRows = useMemo(
    () => (dict.data?.custom ?? []).filter((a) => !q || a.mnemonic.toLowerCase().includes(q) || a.channel.toLowerCase().includes(q) || (label.get(a.channel)?.label ?? '').toLowerCase().includes(q)),
    [dict.data, q, label]
  );
  const builtinRows = useMemo(
    () => (dict.data?.builtin ?? []).filter((ch) =>
      !q || ch.key.toLowerCase().includes(q) || ch.label.toLowerCase().includes(q) || ch.aliases.some((a) => a.includes(q)) ||
      (customByChannel.get(ch.key) ?? []).some((a) => a.mnemonic.toLowerCase().includes(q))),
    [dict.data, q, customByChannel]
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['channels'] });
    qc.invalidateQueries({ queryKey: ['channel-probe'] });
  };

  const save = useMutation({
    mutationFn: () => {
      if (editing === 'new') return api('channels/aliases', send('POST', { mnemonic: form.mnemonic, channel: form.channel, ...(form.unit.trim() ? { unit: form.unit.trim() } : {}) }));
      return api(`channels/aliases/${(editing as CustomAlias).id}`, send('PATCH', { channel: form.channel, unit: form.unit.trim() || null }));
    },
    onSuccess: () => { setEditing(null); setNotice({ kind: 'ok', text: 'Alias saved. It applies to new imports and feeds straight away.' }); refresh(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const remove = useMutation({
    mutationFn: (a: CustomAlias) => api(`channels/aliases/${a.id}`, send('DELETE')),
    onSuccess: () => { setDeleting(null); setNotice({ kind: 'ok', text: 'Alias deleted.' }); refresh(); },
    onError: (e: Error) => { setDeleting(null); setNotice({ kind: 'error', text: e.message }); },
  });

  function open(target: CustomAlias | 'new', preset?: { mnemonic?: string; channel?: string }) {
    setFormError('');
    setForm(target === 'new'
      ? { mnemonic: preset?.mnemonic ?? '', channel: preset?.channel ?? '', unit: '' }
      : { mnemonic: target.mnemonic, channel: target.channel, unit: target.unit ?? '' });
    setEditing(target);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.channel) { setFormError('Choose the channel this mnemonic means'); return; }
    save.mutate();
  }

  const input = 'w-full text-sm px-3 py-2 rounded-lg border outline-none';
  const chip = 'inline-block text-xs px-2 py-0.5 rounded-full mr-1 mb-1';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: c.text }}>WITSML Settings</h1>
      {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      {/* Check a mnemonic */}
      <div className="rounded-xl border p-6" style={{ background: c.cardBg, borderColor: c.border }}>
        <h2 className="text-base font-medium" style={{ color: c.text }}>Check a mnemonic</h2>
        <p className="text-xs mt-0.5 mb-3" style={{ color: c.muted }}>
          Type a name as it appears in a customer&apos;s data (for example <code>SPPA</code>) to see how DrillNex would read it.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input aria-label="Mnemonic to check" value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Mnemonic" className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 260 }} />
          {probeDebounced && resolved.data && (
            <span className="text-sm" role="status" style={{ color: c.text }}>
              <Badge tone={resolved.data.source === 'custom' ? 'blue' : 'green'}>{resolved.data.source}</Badge>{' '}
              reads as <strong>{label.get(resolved.data.channel)?.label ?? resolved.data.channel}</strong> ({resolved.data.channel})
              {resolved.data.unit && <> · assumed unit {resolved.data.unit}</>}
            </span>
          )}
          {probeDebounced && resolved.data === null && !resolved.isLoading && (
            <span className="text-sm flex items-center gap-3" role="status" style={{ color: '#f59e0b' }}>
              Not recognised: its values would be ignored.
              <Btn small onClick={() => open('new', { mnemonic: probeDebounced })}>Add as alias</Btn>
            </span>
          )}
        </div>
      </div>

      {/* Custom aliases */}
      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: c.border }}>
          <div>
            <h2 className="text-base font-medium" style={{ color: c.text }}>Custom channels</h2>
            <p className="text-xs mt-0.5" style={{ color: c.muted }}>Channel names you have added. Use New Channel when a customer's data uses a name DrillNex does not know. They apply to every customer, to CSV imports and to live WITSML feeds.</p>
          </div>
          <div className="flex items-center gap-3">
            <input aria-label="Search channels" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="text-sm px-3 py-2 rounded-lg border outline-none" style={{ ...c.inputStyle, width: 200 }} />
            <Btn kind="success" onClick={() => open('new')}>+ New Channel</Btn>
          </div>
        </div>
        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Channel Name', 'Channel', 'Assumed unit', 'Added', ''].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {customRows.map((a) => (
                <tr key={a.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td className="py-3 pr-4 font-medium">{a.mnemonic}</td>
                  <td className="py-3 pr-4">{label.get(a.channel)?.label ?? a.channel} <span className="text-xs" style={{ color: c.muted }}>({a.channel}, {label.get(a.channel)?.unit})</span></td>
                  <td className="py-3 pr-4">{a.unit ?? <span style={{ color: c.muted }}>from the data</span>}</td>
                  <td className="py-3 pr-4" style={{ color: c.muted }}>{timeAgo(a.createdAt, now)}</td>
                  <td className="py-2 whitespace-nowrap text-right">
                    <span className="inline-flex gap-1">
                      <Btn small onClick={() => open(a)}>Edit</Btn>
                      <Btn small kind="danger" onClick={() => setDeleting(a)}>Delete</Btn>
                    </span>
                  </td>
                </tr>
              ))}
              {dict.isLoading && <tr><td colSpan={5} className="py-6 text-center" style={{ color: c.muted }}>Loading…</td></tr>}
              {dict.isError && <tr><td colSpan={5} className="py-6 text-center text-red-400">{(dict.error as Error).message}</td></tr>}
              {dict.data && customRows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center" style={{ color: c.muted }}>
                  {(dict.data.custom.length === 0) ? 'No custom channels yet. Click New Channel to add one.' : 'No alias matches the search.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Built-in channels */}
      <div className="rounded-xl border" style={{ background: c.cardBg, borderColor: c.border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: c.border }}>
          <h2 className="text-base font-medium" style={{ color: c.text }}>Standard channels</h2>
          <p className="text-xs mt-0.5" style={{ color: c.muted }}>Everything downstream (rig state, KPIs, alerts) uses these names and units. Values outside the valid range are flagged as suspect.</p>
        </div>
        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full text-sm" style={{ color: c.text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                {['Channel', 'Unit', 'Valid range', 'Names it understands'].map((h) => <th key={h} className="text-left font-semibold py-3 pr-4">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {builtinRows.map((ch) => {
                const open_ = expanded.includes(ch.key);
                const shown = open_ ? ch.aliases : ch.aliases.slice(0, VISIBLE_ALIASES);
                const mine = customByChannel.get(ch.key) ?? [];
                return (
                  <tr key={ch.key} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td className="py-3 pr-4 align-top">
                      <div className="font-medium">{ch.label}</div>
                      <div className="text-xs" style={{ color: c.muted }}>{ch.key}</div>
                    </td>
                    <td className="py-3 pr-4 align-top whitespace-nowrap">{ch.unit}</td>
                    <td className="py-3 pr-4 align-top whitespace-nowrap" style={{ color: c.muted }}>{ch.min} to {ch.max}</td>
                    <td className="py-3 pr-4 align-top">
                      {shown.map((a) => <span key={a} className={chip} style={{ background: c.dark ? '#2a2a2a' : '#e2e8f0', color: c.text }}>{a}</span>)}
                      {ch.aliases.length > VISIBLE_ALIASES && (
                        <button onClick={() => setExpanded((cur) => (open_ ? cur.filter((k) => k !== ch.key) : [...cur, ch.key]))} className="text-xs underline" style={{ color: c.muted }}>
                          {open_ ? 'show fewer' : `+${ch.aliases.length - VISIBLE_ALIASES} more`}
                        </button>
                      )}
                      {mine.map((a) => <span key={a.id} className={chip} style={{ background: '#1a8cff22', color: '#1a8cff', border: '1px solid #1a8cff55' }} title="Custom alias">{a.mnemonic}</span>)}
                      <button onClick={() => open('new', { channel: ch.key })} className="text-xs ml-1 underline" style={{ color: '#1a8cff' }}>+ add</button>
                    </td>
                  </tr>
                );
              })}
              {dict.data && builtinRows.length === 0 && <tr><td colSpan={4} className="py-6 text-center" style={{ color: c.muted }}>No channel matches the search.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? 'New Channel' : 'Edit Channel'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn type="submit" form="alias-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add' : 'Save'}</Btn>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <form id="alias-form" onSubmit={onSubmit} className="space-y-3">
            <FormRow label="Channel Name" htmlFor="al-m" hint={editing === 'new' ? 'As it appears in the data. Capitals, spaces, - and _ are ignored when matching.' : 'To change the name, delete this alias and add a new one.'}>
              <input id="al-m" required minLength={2} disabled={editing !== 'new'} value={form.mnemonic} onChange={(e) => setForm({ ...form, mnemonic: e.target.value })} placeholder="e.g. XYZ_PRESS" className={input} style={{ ...c.inputStyle, opacity: editing !== 'new' ? 0.7 : 1 }} />
            </FormRow>
            <FormRow label="Means" htmlFor="al-c">
              <select id="al-c" required value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className={input} style={c.inputStyle}>
                <option value="">Select a channel</option>
                {(dict.data?.builtin ?? []).map((ch) => <option key={ch.key} value={ch.key}>{ch.label} ({ch.unit})</option>)}
              </select>
            </FormRow>
            <FormRow label="Assumed unit" htmlFor="al-u" hint="Only used when the data does not say what unit it is in. Leave blank to rely on the unit in the data.">
              <input id="al-u" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g. kPa" className={input} style={c.inputStyle} />
            </FormRow>
            {formError && <p role="alert" className="text-sm text-red-400">{formError}</p>}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete alias"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Btn kind="danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>Delete</Btn>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: c.border, color: c.text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: c.text }}>
            Delete the alias <strong>{deleting.mnemonic}</strong>? Data that uses this name will no longer be recognised: live feeds stop storing that channel and imports skip it. Data already stored is not changed.
          </p>
        </Modal>
      )}
    </div>
  );
}
