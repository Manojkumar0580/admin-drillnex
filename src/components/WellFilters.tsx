'use client';

import { useQuery } from '@tanstack/react-query';
import SearchSelect from '@/components/SearchSelect';
import { useColors } from '@/components/ui';
import { api, WellFull } from '@/lib/adminApi';

export const WELL_STATUSES = ['active', 'paused', 'completed'] as const;
export type WellStatus = (typeof WELL_STATUSES)[number];
const LABEL: Record<WellStatus, string> = { active: 'Active', paused: 'Paused', completed: 'Completed' };

export interface WellFilterState { wellId: string; status: '' | WellStatus }
export const NO_WELL_FILTER: WellFilterState = { wellId: '', status: '' };

/** The wells list shared by the admin pages (same cache key as the Wells page). */
export function useAllWells() {
  return useQuery({ queryKey: ['wells', 'full'], queryFn: () => api<{ data: WellFull[] }>('wells').then((r) => r.data) });
}

/**
 * True when a row passes the well filters. A row is linked to zero or more wells; with a filter set,
 * a row linked to no well never matches (it has nothing to filter on).
 */
export function matchesWellFilter(wellIds: (string | null | undefined)[], wells: Map<string, WellFull>, f: WellFilterState): boolean {
  if (!f.wellId && !f.status) return true;
  const ids = wellIds.filter((x): x is string => !!x);
  return ids.some((id) => {
    const w = wells.get(id);
    return !!w && (!f.wellId || id === f.wellId) && (!f.status || w.status === f.status);
  });
}

/**
 * "Well" and "Well Status" filter pair for list pages. The well list follows the company filter and
 * the status filter, so a well that cannot match is never offered.
 */
export default function WellFilters({ companyId, value, onChange, idPrefix }: {
  companyId: string; value: WellFilterState; onChange: (v: WellFilterState) => void; idPrefix: string;
}) {
  const c = useColors();
  const wells = useAllWells();
  const options = (wells.data ?? [])
    .filter((w) => (!companyId || w.companyId === companyId) && (!value.status || w.status === value.status))
    .map((w) => ({ value: w.id, label: w.name, hint: w.wellNumber }));

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-well`} className="text-xs font-semibold" style={{ color: c.text }}>Well:</label>
        <SearchSelect id={`${idPrefix}-well`} width={200} value={value.wellId} onChange={(v) => onChange({ ...value, wellId: v })}
          allLabel="All wells" placeholder={wells.isLoading ? 'Loading wells…' : 'Select a well'} emptyText="No wells match" options={options} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-wstatus`} className="text-xs font-semibold" style={{ color: c.text }}>Well Status:</label>
        <select id={`${idPrefix}-wstatus`} value={value.status}
          // changing the status can make the chosen well impossible, so the well choice is dropped with it
          onChange={(e) => onChange({ wellId: '', status: e.target.value as WellFilterState['status'] })}
          className="text-sm px-3 py-2 rounded-lg border outline-none" style={c.inputStyle}>
          <option value="">All</option>
          {WELL_STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
      </div>
    </>
  );
}
