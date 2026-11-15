'use client';
import { useQuery } from '@tanstack/react-query';

export interface AdminUser {
  name: string;
  email: string;
  role: string;
}

export function useAdminSession() {
  return useQuery<AdminUser | null>({
    queryKey: ['admin-session'],
    queryFn: async () => {
      const res = await fetch('/api/session', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function initials(name?: string) {
  if (!name) return 'SA';
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
