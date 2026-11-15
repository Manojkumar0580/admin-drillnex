'use client';
import ResourceTable from '@/components/ResourceTable';

const columns = [{ key: 'number', label: 'Invoice #' }, { key: 'company', label: 'Company' }, { key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' }];
const rows: Record<string, string>[] = [];

export default function Page() {
  return <ResourceTable pageTitle="Accounting" cardTitle="Invoicing" addLabel="New Invoice" columns={columns} rows={rows} />;
}
