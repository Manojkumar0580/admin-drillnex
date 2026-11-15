'use client';
import ResourceTable, { Column, Field } from '@/components/ResourceTable';
import { useCompanies } from '@/lib/useCompanies';

const columns: Column[] = [
  { key: 'company', label: 'Company' },
  { key: 'sourceCode', label: 'Source Code' },
  { key: 'moblizeCode', label: 'Moblize NPT Code' },
];

const fieldsFor = (companies: string[]): Field[] => [
  { key: 'company', label: 'Company', type: 'select', options: companies, required: true },
  { key: 'sourceCode', label: 'Source Code', required: true },
  { key: 'moblizeCode', label: 'Moblize NPT Code', type: 'select', options: ['NPT-01', 'NPT-02', 'NPT-03'], required: true },
];

const rows = [
  { company: 'Alpha Drilling', sourceCode: 'RR', moblizeCode: 'NPT-01' },
  { company: 'Beta Offshore', sourceCode: 'WOW', moblizeCode: 'NPT-02' },
];

export default function Page() {
  const companies = (useCompanies().data ?? []).map((x) => x.name);
  const fields = fieldsFor(companies);
  return (
    <ResourceTable
      pageTitle="Planning Settings"
      cardTitle="NPT Code Mapping"
      formTitle="NPT Code Mapping Form"
      addLabel="New"
      columns={columns}
      rows={rows}
      fields={fields}
      actions={['edit', 'delete']}
      filters={[{ key: 'company', label: 'Company:', options: companies, placeholder: 'All companies' }]}
    />
  );
}
