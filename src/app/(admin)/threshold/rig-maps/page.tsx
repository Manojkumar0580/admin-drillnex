'use client';
import ResourceTable from '@/components/ResourceTable';

const columns = [{ key: 'rig', label: 'Rig' }, { key: 'configuration', label: 'Configuration' }, { key: 'comment', label: 'Comment' }];
const rows: Record<string, string>[] = [];

export default function Page() {
  return <ResourceTable pageTitle="Threshold Settings" cardTitle="Rig Maps" addLabel="New" columns={columns} rows={rows} />;
}
