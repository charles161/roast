import { headers } from 'next/headers';

/** Absolute origin for share links and OG tags, behind a proxy or not. */
export async function originFromRequest(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const h = await headers();
  const fwdHost = h.get('x-forwarded-host') ?? h.get('host');
  if (fwdHost) {
    const proto = h.get('x-forwarded-proto') ?? (fwdHost.startsWith('127.0.0.1') || fwdHost.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${fwdHost}`;
  }
  // Static prerender / build has no request headers. On Vercel, use the
  // deployment's own production URL so OG/canonical tags never fall back to
  // localhost (set PUBLIC_BASE_URL in prod to pin the real domain).
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return `http://127.0.0.1:${process.env.PORT ?? 3042}`;
}
