import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { isValidId } from '@/lib/cache';
import { recordSubscriber } from '@/lib/subscribers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/subscribe — optional, non-blocking email capture shown AFTER a
 * roast result. ADDITIVE: it shares nothing with and cannot affect the
 * /api/roast pipeline or its guards. The roast stays 100% free and un-gated.
 *
 * Body: { email, roastId?, source? }
 *   - valid email   -> 200 { ok: true }            (or { ok: true, dup: true })
 *   - invalid email -> 400 { ok: false, error }
 *   - abuse         -> 429 { ok: false, error }
 * It NEVER returns or logs anyone's email.
 */

// Deliberately simple + permissive: one @, a dot in the domain, no spaces. We
// reject the obviously-broken, not the exotic-but-valid — a bounced welcome
// email is a cheaper failure than turning away a real signup.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254; // RFC 5321 practical maximum.
const MAX_SOURCE_LEN = 40;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Keep a short, label-like source; otherwise drop it rather than store junk. */
function cleanSource(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, MAX_SOURCE_LEN);
  return /^[a-z0-9_-]+$/i.test(s) ? s : undefined;
}

export async function POST(req: Request) {
  let email: string;
  let roastId: string | undefined;
  let source: string | undefined;
  try {
    const body = (await req.json()) as { email?: unknown; roastId?: unknown; source?: unknown };
    const raw = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!raw || raw.length > MAX_EMAIL_LEN || !EMAIL_RE.test(raw)) {
      return bad('That email looks off. Mind checking it?');
    }
    email = raw;
    // Only keep a roastId that is actually a valid share id; ignore anything else.
    roastId = typeof body?.roastId === 'string' && isValidId(body.roastId) ? body.roastId : undefined;
    source = cleanSource(body?.source);
  } catch {
    return bad('Send a JSON body with an email.');
  }

  // Light abuse guard on its OWN bucket ("subscribe:<ip>") so it can never
  // consume — or be consumed by — the roast rate limiter.
  const rl = await rateLimit(`subscribe:${clientIp(req.headers)}`);
  if (!rl.ok) {
    return bad("You're a little quick on the draw — try again in a minute.", 429);
  }

  try {
    const { dup } = await recordSubscriber({ email, roastId, source });
    return NextResponse.json(dup ? { ok: true, dup: true } : { ok: true });
  } catch (err) {
    // Never log the email itself — only that a write failed.
    console.error('[subscribe] store failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Couldn't save that just now. Try again?" }, { status: 502 });
  }
}
