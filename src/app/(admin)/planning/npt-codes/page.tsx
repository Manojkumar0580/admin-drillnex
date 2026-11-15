'use client';
import ResourceTable, { Column, Field } from '@/components/ResourceTable';

const columns: Column[] = [
  { key: 'code', label: 'Code' },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Category' },
];

const fields: Field[] = [
  { key: 'code', label: 'Code', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'category', label: 'Category', type: 'select', options: ['Rig', 'Weather', 'Equipment', 'Wait', 'Other'] },
];

const rows = [
  { code: 'NPT-01', description: 'Rig repair', category: 'Rig' },
  { code: 'NPT-02', description: 'Waiting on weather', category: 'Weather' },
  { code: 'NPT-03', description: 'Downhole tool failure', category: 'Equipment' },
];

export default function Page() {
  return (
    <ResourceTable
      pageTitle="Planning Settings"
      cardTitle="Moblize NPT Codes"
      formTitle="NPT Code Form"
      addLabel="New"
      columns={columns}
      rows={rows}
      fields={fields}
      actions={['edit', 'delete']}
    />
  );
}
