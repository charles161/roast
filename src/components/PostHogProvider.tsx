'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// Module-level guard: init the singleton exactly once per page load.
let inited = false;

/**
 * Initializes the posthog-js singleton once on the client, only when a public
 * key is present. `track()` captures against this same singleton. With no key
 * it inits nothing and just renders its children — completely silent on the VPC.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!KEY || inited) return;
    inited = true;
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
    });
  }, []);

  return <>{children}</>;
}
