'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useColors } from '@/components/ui';
import { useCompanies } from '@/lib/useCompanies';

export interface Option { value: string; label: string; disabled?: boolean; hint?: string }

/**
 * A dropdown you can type into. Click it, type part of a name to narrow the list, pick one.
 * `allLabel` adds a first "all" choice with an empty value (used for filters).
 */
export default function SearchSelect({
  id, value, onChange, options, placeholder = 'Select...', allLabel, disabled, emptyText = 'Nothing to show', width, footer,
}: {
  id?: string; value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string;
  allLabel?: string; disabled?: boolean; emptyText?: string; width?: number | string; footer?: React.ReactNode;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !s || o.label.toLowerCase().includes(s));
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); setQ(''); };
  const text = open ? q : selected?.label ?? (value === '' && allLabel ? allLabel : '');

  return (
    <div ref={wrap} className="relative" style={{ width: width ?? '100%', minWidth: width ? undefined : 0 }}>
      <input
        id={id} role="combobox" aria-expanded={open} aria-autocomplete="list" autoComplete="off" disabled={disabled}
        value={text} placeholder={open ? 'Type to search...' : placeholder}
        onFocus={() => !disabled && setOpen(true)} onClick={() => !disabled && setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); setQ(''); }
          if (e.key === 'Enter' && open) { e.preventDefault(); const first = shown.find((o) => !o.disabled); if (first) pick(first.value); }
        }}
        className="w-full text-sm px-3 py-2 pr-8 rounded-lg border outline-none"
        style={{ ...c.inputStyle, opacity: disabled ? 0.7 : 1 }}
      />
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: c.muted }}>▾</span>
      {open && (
        <div role="listbox" className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border shadow-lg" style={{ background: c.cardBg, borderColor: c.border }}>
          {allLabel && !q.trim() && (
            <button type="button" role="option" aria-selected={value === ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick('')}
              className="block w-full text-left text-sm px-3 py-2" style={{ color: value === '' ? '#60a5fa' : c.text }}>
              {allLabel}
            </button>
          )}
          {shown.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} disabled={o.disabled}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value)}
              className="block w-full text-left text-sm px-3 py-2 disabled:opacity-50"
              style={{ color: o.value === value ? '#60a5fa' : c.text }}>
              {o.label}{o.hint && <span className="text-xs ml-2" style={{ color: c.muted }}>{o.hint}</span>}
            </button>
          ))}
          {shown.length === 0 && <p className="px-3 py-2 text-sm" style={{ color: c.muted }}>{q.trim() ? `No match for "${q.trim()}"` : emptyText}</p>}
          {footer}
        </div>
      )}
    </div>
  );
}

/** The company picker used on every page: same list everywhere, searchable, with a way to add the first client. */
export function CompanySelect({
  id, value, onChange, allLabel, disabled, width,
}: { id?: string; value: string; onChange: (v: string) => void; allLabel?: string; disabled?: boolean; width?: number | string }) {
  const companies = useCompanies();
  const c = useColors();
  const options = (companies.data ?? []).map((x) => ({ value: x.id, label: x.name }));
  const empty = companies.isSuccess && options.length === 0;
  return (
    <SearchSelect
      id={id} value={value} onChange={onChange} options={options} allLabel={allLabel} disabled={disabled} width={width}
      placeholder={companies.isLoading ? 'Loading companies…' : companies.isError ? 'Could not load companies' : 'Select a company'}
      emptyText={companies.isError ? (companies.error as Error).message : 'No companies yet'}
      footer={empty ? (
        <Link href="/companies" className="block text-sm px-3 py-2 border-t" style={{ color: '#60a5fa', borderColor: c.border }}>+ Add a company first</Link>
      ) : undefined}
    />
  );
}
