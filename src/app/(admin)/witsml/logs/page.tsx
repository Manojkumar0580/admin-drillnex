'use client';
import ResourceTable, { Column, Field } from '@/components/ResourceTable';

const columns: Column[] = [
  { key: 'uid', label: 'UID' },
  { key: 'wellUid', label: 'Well UID' },
  { key: 'wellboreUid', label: 'Wellbore UID' },
  { key: 'indexType', label: 'Index Type' },
];

const fields: Field[] = [
  { key: 'uid', label: 'UID', required: true },
  { key: 'wellUid', label: 'Well UID', required: true },
  { key: 'wellboreUid', label: 'Wellbore UID' },
  { key: 'indexType', label: 'Index Type', type: 'select', options: ['Time', 'Depth'], defaultValue: 'Time' },
];

const rows = [
  { uid: '3001570001', wellUid: 'W-1001', wellboreUid: 'WB-1', indexType: 'Time' },
  { uid: '3001512345', wellUid: 'W-1001', wellboreUid: 'WB-1', indexType: 'Depth' },
  { uid: '4222742599', wellUid: 'W-2007', wellboreUid: 'WB-2', indexType: 'Time' },
];

export default function Page() {
  return (
    <ResourceTable
      pageTitle="WITSML Settings"
      cardTitle="Logs"
      formTitle="Log Form"
      addLabel="New"
      columns={columns}
      rows={rows}
      fields={fields}
      actions={['edit', 'delete']}
    />
  );
}
