'use client';

import { FormEvent, useState } from 'react';
import Modal from '@/components/Modal';
import { useAdminStore } from '@/store/useAdminStore';
import { COMPANIES } from '@/lib/mock';

interface Profile {
  id: string;
  company: string;
  region: string;
  surface: string;
  intermediate: string;
  curve: string;
  lateral: string;
}

const REGIONS = ['Utica', 'Permian', 'Bakken'];
const SECTIONS = ['surface', 'intermediate', 'curve', 'lateral'] as const;

const SEED: Profile[] = [
  { id: 'p1', company: 'Alpha Drilling', region: 'Utica', surface: '22, 17.5', intermediate: '12.25, 8.75, 8.5', curve: '12.25, 8.5', lateral: '8.5' },
  { id: 'p2', company: 'Alpha Drilling', region: 'Utica', surface: '17.5', intermediate: '12.25, 8.5', curve: '8.5', lateral: '8.5' },
  { id: 'p3', company: 'Alpha Drilling', region: 'Utica', surface: '', intermediate: '', curve: '', lateral: '' },
  { id: 'p4', company: 'Beta Offshore', region: 'Permian', surface: '13.5', intermediate: '9.875', curve: '8.75', lateral: '6.125' },
];

export default function HoleSectionPage() {
  const { theme } = useAdminStore();
  const dark = theme === 'dark';
  const cardBg = dark ? '#0d1b2e' : '#ffffff';
  const border = dark ? '#1e3a5f' : '#e2e8f0';
  const text = dark ? '#f1f5f9' : '#0f172a';
  const muted = dark ? '#64748b' : '#94a3b8';
  const inputStyle = { background: dark ? '#0f1f35' : '#f8fafc', borderColor: border, color: text };

  const [profiles, setProfiles] = useState<Profile[]>(SEED);
  const [company, setCompany] = useState('');
  const [region, setRegion] = useState('');
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [form, setForm] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);

  const shown = profiles.filter((p) => (!company || p.company === company) && (!region || p.region === region));
  const groups = Array.from(new Set(shown.map((p) => p.region)));

  function open(p: Profile | 'new') {
    setForm(
      p === 'new'
        ? { id: '', company: company || COMPANIES[0], region: region || REGIONS[0], surface: '', intermediate: '', curve: '', lateral: '' }
        : { ...p }
    );
    setEditing(p);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (editing === 'new') setProfiles((l) => [...l, { ...form, id: `p${Date.now()}` }]);
    else setProfiles((l) => l.map((x) => (x.id === form.id ? form : x)));
    setEditing(null);
  }

  const select = 'text-sm px-3 py-2 rounded-lg border outline-none min-w-[190px]';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: text }}>WITSML Settings</h1>

      <div className="rounded-xl border" style={{ background: cardBg, borderColor: border }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: border }}>
          <h2 className="text-base font-medium" style={{ color: text }}>Hole Size Profiles</h2>
        </div>

        <div className="flex gap-4 flex-wrap px-6 py-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: text }}>Company:</label>
            <select value={company} onChange={(e) => setCompany(e.target.value)} className={select} style={inputStyle}>
              <option value="">All companies</option>
              {COMPANIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: text }}>Region:</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className={select} style={inputStyle}>
              <option value="">All Regions</option>
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {groups.length === 0 && <p className="text-sm py-6 text-center" style={{ color: muted }}>No profiles found</p>}
          {groups.map((g) => (
            <section key={g} className="rounded-lg border" style={{ borderColor: border }}>
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold" style={{ color: text }}>{g}</h3>
                <button
                  onClick={() => { setRegion(g); open('new'); }}
                  className="text-xs font-semibold px-3 py-1.5 rounded text-white" style={{ background: '#1d6fbf' }}>
                  + Add Profile
                </button>
              </div>
              <div className="px-4 pb-4 space-y-3">
                {shown.filter((p) => p.region === g).map((p, i) => (
                  <div key={p.id} className="rounded-lg border" style={{ borderColor: border }}>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: border }}>
                      <span className="text-sm" style={{ color: text }}>Profile {i + 1}</span>
                      <span className="flex gap-1">
                        <button onClick={() => open(p)} className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: border, color: text }}>Edit</button>
                        <button onClick={() => setDeleting(p)} className="text-xs px-2.5 py-1 rounded text-white" style={{ background: '#dc2626' }}>Delete</button>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 py-3">
                      {SECTIONS.map((s) => (
                        <div key={s}>
                          <p className="text-sm font-semibold capitalize" style={{ color: text }}>{s}</p>
                          <p className="text-sm" style={{ color: muted }}>{p[s] || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {editing && form && (
        <Modal
          title={editing === 'new' ? 'Add Profile' : 'Edit Profile'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="submit" form="profile-form" className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: '#1d6fbf' }}>Save</button>
              <button onClick={() => setEditing(null)} className="text-sm px-4 py-2 rounded-lg border" style={{ borderColor: border, color: text }}>Cancel</button>
            </>
          }
        >
          <form id="profile-form" onSubmit={save} className="space-y-3">
            {(['company', 'region'] as const).map((k) => (
              <div key={k} className="grid grid-cols-1 sm:grid-cols-[130px_1fr] gap-1 sm:gap-3 sm:items-center">
                <label className="text-sm font-semibold sm:text-right capitalize" style={{ color: text }}>{k}</label>
                <select value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="w-full text-sm px-3 py-2 rounded-lg border outline-none" style={inputStyle}>
                  {(k === 'company' ? COMPANIES : REGIONS).map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            {SECTIONS.map((s) => (
              <div key={s} className="grid grid-cols-1 sm:grid-cols-[130px_1fr] gap-1 sm:gap-3 sm:items-center">
                <label className="text-sm font-semibold sm:text-right capitalize" style={{ color: text }}>{s}</label>
                <input value={form[s]} placeholder="Bit sizes, comma separated (e.g. 12.25, 8.5)"
                  onChange={(e) => setForm({ ...form, [s]: e.target.value })}
                  className="w-full text-sm px-3 py-2 rounded-lg border outline-none" style={inputStyle} />
              </div>
            ))}
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete profile"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button onClick={() => { setProfiles((l) => l.filter((x) => x.id !== deleting.id)); setDeleting(null); }}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: '#dc2626' }}>Delete</button>
              <button onClick={() => setDeleting(null)} className="text-sm px-4 py-2 rounded-lg border" style={{ borderColor: border, color: text }}>Cancel</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: text }}>Delete this {deleting.region} profile? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
