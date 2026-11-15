'use client';
import ResourceTable from '@/components/ResourceTable';

const columns = [{ key: 'rig', label: 'Rig' }, { key: 'well', label: 'Well' }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'status', label: 'Status' }];
const rows: Record<string, string>[] = [];

export default function Page() {
  return <ResourceTable pageTitle="Threshold Settings" cardTitle="Rerun" addLabel="New" columns={columns} rows={rows} />;
}
