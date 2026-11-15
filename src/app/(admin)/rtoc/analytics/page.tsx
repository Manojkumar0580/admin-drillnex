'use client';
import ResourceTable, { Column } from '@/components/ResourceTable';
import { WELL_STATUSES } from '@/lib/mock';
import { useCompanies } from '@/lib/useCompanies';

const columns: Column[] = [
  { key: 'uid', label: 'UID' },
  { key: 'well', label: 'Well' },
  { key: 'processUpTo', label: 'Process Up To' },
  { key: 'customer', label: 'Customer' },
  { key: 'status', label: 'Well Status' },
];

const rows = [
  { uid: '3401320832', well: 'Well-A1', processUpTo: '2026-11-12 05:30', customer: 'Alpha Drilling', status: 'Active' },
  { uid: '3401320863', well: 'Well-A2', processUpTo: '2026-11-12 04:11', customer: 'Alpha Drilling', status: 'Active' },
  { uid: '3401320865', well: 'Well-B7', processUpTo: '2026-10-24 05:16', customer: 'Beta Offshore', status: 'Completed' },
  { uid: '3401320872', well: 'Well-G2', processUpTo: '2026-08-05 11:40', customer: 'Gamma Energy', status: 'Paused' },
];

export default function Page() {
  const companies = (useCompanies().data ?? []).map((x) => x.name);
  return (
    <ResourceTable
      pageTitle="RTOC"
      cardTitle="Analytics Status"
      columns={columns}
      rows={rows}
      filters={[
        { key: 'customer', label: 'Customer', options: companies, placeholder: 'All companies' },
        { key: 'status', label: 'Well Status', options: WELL_STATUSES, placeholder: 'All statuses' },
      ]}
    />
  );
}
