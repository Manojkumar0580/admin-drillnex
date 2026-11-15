'use client';
import ResourceTable from '@/components/ResourceTable';

const columns = [{ key: 'name', label: 'Name' }, { key: 'comment', label: 'Comment' }];
const rows: Record<string, string>[] = [];

export default function Page() {
  return <ResourceTable pageTitle="Threshold Settings" cardTitle="Configurations" addLabel="New" columns={columns} rows={rows} />;
}
