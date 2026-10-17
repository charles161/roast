'use client';

import { useEffect } from 'react';
import { initAnalytics } from '@/lib/track';

/**
 * Mounts once in the root layout. With no NEXT_PUBLIC_POSTHOG_KEY it inits
 * nothing and simply renders its children — completely silent on the VPC.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);
  return <>{children}</>;
}
