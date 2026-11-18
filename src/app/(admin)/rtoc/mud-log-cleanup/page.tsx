'use client';

import WellLogXlsxViewer from '@/components/WellLogXlsxViewer';
import { useColors } from '@/components/ui';

export default function MudLogCleanupPage() {
  const { text, muted } = useColors();

  return (
    <div className="p-6 space-y-5" style={{ color: text }}>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: text }}>Data Cleanup — Excel Log Viewer</h1>
        <p className="text-sm mt-1" style={{ color: muted }}>
          Upload an XLSX file — all numeric columns auto-detected and shown as well log tracks.
        </p>
      </div>
      <WellLogXlsxViewer />
    </div>
  );
}
