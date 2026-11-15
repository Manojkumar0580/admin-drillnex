'use client';

import { useQuery } from '@tanstack/react-query';
import { api, Company } from '@/lib/adminApi';

/**
 * One shared list of companies (clients) for every page. All pages use the same query key, so a client
 * added on the Companies page shows up everywhere straight away (the Companies page invalidates this key).
 */
export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: () => api<{ data: Company[] }>('companies').then((r) => r.data),
  });
}
