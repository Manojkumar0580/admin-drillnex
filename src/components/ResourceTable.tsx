'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useAdminStore } from '@/store/useAdminStore';
import Modal from '@/components/Modal';
import SearchSelect from '@/components/SearchSelect';

export type Row = Record<string, string>;

export interface Column {
  key: string;
  label: string;
  /** Optional text colour for a cell value (e.g. red for OFF). */
  tone?: (value: string) => string | undefined;
}

export interface Field {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'number' | 'select' | 'checkbox';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  defaultValue?: string;
  hint?: string;
}

export interface Filter {
  key: string; // row key the filter applies to
  label: string;
  options: string[];
  placeholder: string;
}

type Action = 'edit' | 'delete' | 'reset';

interface Props {
  pageTitle: string;
  cardTitle: string;
  columns: Column[];
  rows: Row[];
  addLabel?: string;
  addTone?: 'blue' | 'green';
  formTitle?: string;
  fields?: Field[];
  filters?: Filter[];
  actions?: Action[];
  /** Returns the fields to overwrite when "Reset" is clicked. */
  onReset?: (row: Row) => Row;
  pageSize?: number;
}

type DataRow = Row & { _id: string };

export default function ResourceTable({
  pageTitle, cardTitle, columns, rows, addLabel, addTone = 'blue', formTitle, fields, filters = [],
  actions = [], onReset, pageSize = 10,
}: Props) {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';

  const [data, setData] = useState<DataRow[]>(() => rows.map((r, i) => ({ ...r, _id: `seed-${i}` })));
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<DataRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DataRow | null>(null);
  const [form, setForm] = useState<Row>({});
  const [error, setError] = useState('');

  const cardBg = dark ? 'linear-gradient(160deg, #1c1c22 0%, #101013 100%)' : '#ffffff';
  const border = dark ? '#1e1e2a' : '#e2e8f0';
  const text = dark ? '#f0f0f0' : '#0f172a';
  const muted = dark ? '#666666' : '#94a3b8';
  const inputStyle = { background: dark ? '#101016' : '#f8fafc', borderColor: border, color: text };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((r) => {
      for (const f of filters) {
        const v = filterValues[f.key];
        if (v && r[f.key] !== v) return false;
      }
      if (!q) return true;
      return columns.some((c) => (r[c.key] ?? '').toLowerCase().includes(q));
    });
  }, [data, query, filterValues, filters, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);

  function openForm(row: DataRow | 'new') {
    const initial: Row = {};
    for (const f of fields ?? []) {
      initial[f.key] = row === 'new' ? f.defaultValue ?? (f.type === 'checkbox' ? 'No' : '') : row[f.key] ?? '';
    }
    setForm(initial);
    setError('');
    setEditing(row);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const missing = (fields ?? []).find((f) => f.required && !form[f.key]?.trim());
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }
    // Password fields are never kept in table data.
    const clean: Row = {};
    for (const f of fields ?? []) if (f.type !== 'password') clean[f.key] = form[f.key];

    if (editing === 'new') {
      setData((d) => [{ ...clean, _id: `new-${Date.now()}` }, ...d]);
    } else if (editing) {
      const id = editing._id;
      setData((d) => d.map((r) => (r._id === id ? { ...r, ...clean } : r)));
    }
    setEditing(null);
  }

  const addBg = addTone === 'green' ? '#16a34a' : '#1d6fbf';
  const btn = 'text-xs font-medium px-2.5 py-1 rounded text-white';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: text }}>{pageTitle}</h1>

      <div className="rounded-xl border" style={{ background: cardBg, borderColor: border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: border }}>
          <h2 className="text-base font-medium" style={{ color: text }}>{cardTitle}</h2>
        </div>

        <div className="flex items-end justify-between gap-3 flex-wrap px-6 py-4">
          <div className="flex items-end gap-3 flex-wrap">
            {filters.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: text }}>{f.label}</label>
                <SearchSelect
                  width={200}
                  value={filterValues[f.key] ?? ''}
                  onChange={(v) => { setFilterValues((fv) => ({ ...fv, [f.key]: v })); setPage(0); }}
                  allLabel={f.placeholder}
                  options={f.options.map((o) => ({ value: o, label: o }))}
                  emptyText="Nothing to show"
                />
              </div>
            ))}
            <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: border }}>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                placeholder="Search..."
                aria-label="Search"
                className="px-3 py-2 text-sm outline-none bg-transparent"
                style={{ color: text, width: 200 }}
              />
              <span className="px-3 py-2 border-l" style={{ borderColor: border, color: muted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
            </div>
          </div>
          {addLabel ? (
            <button
              onClick={() => (fields ? openForm('new') : undefined)}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
              style={{ background: addBg }}
            >
              {addLabel}
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto px-6">
          <table className="w-full text-sm" style={{ color: text }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${border}` }}>
                {columns.map((c) => <th key={c.key} className="text-left font-semibold py-3 pr-4">{c.label}</th>)}
                {actions.length > 0 && <th className="py-3 w-px" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r._id} style={{ borderBottom: `1px solid ${border}` }}>
                  {columns.map((c) => (
                    <td key={c.key} className="py-3 pr-4" style={{ color: c.tone?.(r[c.key] ?? '') }}>{r[c.key]}</td>
                  ))}
                  {actions.length > 0 && (
                    <td className="py-2 whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        {actions.includes('edit') && fields && (
                          <button onClick={() => openForm(r)} className={btn} style={{ background: '#1d6fbf' }}>Edit</button>
                        )}
                        {actions.includes('delete') && (
                          <button onClick={() => setDeleting(r)} className={btn} style={{ background: '#dc2626' }}>Delete</button>
                        )}
                        {actions.includes('reset') && onReset && (
                          <button
                            onClick={() => setData((d) => d.map((x) => (x._id === r._id ? { ...x, ...onReset(x) } : x)))}
                            className={btn}
                            style={{ background: '#16a34a' }}
                          >
                            Reset
                          </button>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={columns.length + (actions.length ? 1 : 0)} className="py-8 text-center" style={{ color: muted }}>
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-6 py-4 text-xs" style={{ color: muted }}>
          <span>{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button disabled={current === 0} onClick={() => setPage(current - 1)}
              className="px-3 py-1 rounded border disabled:opacity-40" style={{ borderColor: border, color: text }}>Prev</button>
            <span>Page {current + 1} / {pages}</span>
            <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}
              className="px-3 py-1 rounded border disabled:opacity-40" style={{ borderColor: border, color: text }}>Next</button>
          </div>
        </div>
      </div>

      {editing && fields && (
        <Modal
          title={formTitle ?? cardTitle}
          onClose={() => setEditing(null)}
          wide={fields.length > 8}
          footer={
            <>
              <button type="submit" form="resource-form" className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: '#1d6fbf' }}>
                {editing === 'new' ? 'Add' : 'Save'}
              </button>
              <button onClick={() => setEditing(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: border, color: text }}>
                Cancel
              </button>
            </>
          }
        >
          <form id="resource-form" onSubmit={submit} className="space-y-3">
            {fields.map((f) => (
              <div key={f.key} className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-1 sm:gap-3 sm:items-center">
                <label htmlFor={`f-${f.key}`} className="text-sm font-semibold sm:text-right" style={{ color: text }}>{f.label}</label>
                <div>
                  {f.type === 'select' ? (
                    <SearchSelect id={`f-${f.key}`} value={form[f.key] ?? ''} onChange={(v) => setForm({ ...form, [f.key]: v })}
                      placeholder="Select" options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                      emptyText={f.key === 'company' ? 'No companies yet. Add one under Administration → Companies.' : 'Nothing to show'} />
                  ) : f.type === 'checkbox' ? (
                    <input id={`f-${f.key}`} type="checkbox" checked={form[f.key] === 'Yes'}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.checked ? 'Yes' : 'No' })} />
                  ) : (
                    <input id={`f-${f.key}`} type={f.type ?? 'text'} value={form[f.key] ?? ''} readOnly={f.readOnly}
                      autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                      placeholder={f.placeholder ?? f.label}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                      style={{ ...inputStyle, opacity: f.readOnly ? 0.7 : 1 }} />
                  )}
                  {f.hint && <p className="text-xs mt-1" style={{ color: muted }}>{f.hint}</p>}
                </div>
              </div>
            ))}
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete record"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button
                onClick={() => { setData((d) => d.filter((r) => r._id !== deleting._id)); setDeleting(null); }}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: '#dc2626' }}>
                Delete
              </button>
              <button onClick={() => setDeleting(null)} className="text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: border, color: text }}>
                Cancel
              </button>
            </>
          }
        >
          <p className="text-sm" style={{ color: text }}>
            Delete <strong>{deleting[columns[0].key] || columns[0].label}</strong>? This cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
