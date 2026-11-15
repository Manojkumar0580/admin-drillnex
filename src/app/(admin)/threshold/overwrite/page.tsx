'use client';
import ResourceTable from '@/components/ResourceTable';

const columns = [{ key: 'rig', label: 'Rig' }, { key: 'threshold', label: 'Threshold' }, { key: 'value', label: 'Value' }, { key: 'comment', label: 'Comment' }];
const rows: Record<string, string>[] = [];

export default function Page() {
  return <ResourceTable pageTitle="Threshold Settings" cardTitle="Overwrite" addLabel="New" columns={columns} rows={rows} />;
}
