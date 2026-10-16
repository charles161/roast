import { headers } from 'next/headers';

/** Absolute origin for share links and OG tags, behind a proxy or not. */
export async function originFromRequest(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? `127.0.0.1:${process.env.PORT ?? 3042}`;
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('127.0.0.1') || host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
