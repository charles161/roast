/**
 * SSRF guard. This service fetches arbitrary user-supplied URLs, so every
 * hop must be proven to land on a public, routable IP before we connect.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

/** Hostnames we refuse without even resolving them. */
const BLOCKED_HOST_EXACT = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

const BLOCKED_HOST_SUFFIX = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.home.arpa',
  '.corp',
  '.localdomain',
  '.in-addr.arpa',
  '.ip6.arpa',
];

/** True for any IPv4 literal that is not globally routable. */
export function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b, c] = parts as [number, number, number, number];

  if (a === 0) return true;                               // 0.0.0.0/8 "this network"
  if (a === 10) return true;                              // private
  if (a === 127) return true;                             // loopback
  if (a === 100 && b >= 64 && b <= 127) return true;      // 100.64/10 CGNAT
  if (a === 169 && b === 254) return true;                // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;       // private
  if (a === 192 && b === 0 && c === 0) return true;        // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true;        // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true;      // 6to4 relay anycast
  if (a === 192 && b === 168) return true;                // private
  if (a === 198 && (b === 18 || b === 19)) return true;    // benchmarking
  if (a === 198 && b === 51 && c === 100) return true;     // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true;      // TEST-NET-3
  if (a >= 224) return true;                              // multicast + reserved + broadcast
  return false;
}

function expandIpv6(ip: string): number[] | null {
  const clean = ip.replace(/^\[|\]$/g, '').split('%')[0]!.toLowerCase();
  if (!net.isIPv6(clean)) return null;

  // An IPv4-mapped/embedded tail (::ffff:1.2.3.4) becomes two more groups.
  let head = clean;
  let tailGroups: string[] = [];
  const v4 = head.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const o = v4[1]!.split('.').map(Number);
    tailGroups = [
      ((o[0]! << 8) | o[1]!).toString(16),
      ((o[2]! << 8) | o[3]!).toString(16),
    ];
    head = head.slice(0, -v4[1]!.length).replace(/:$/, ':');
  }

  const [left, right] = head.split('::') as [string, string | undefined];
  const l = left ? left.split(':').filter(Boolean) : [];
  const r = right !== undefined && right ? right.split(':').filter(Boolean) : [];
  const explicit = [...l, ...r, ...tailGroups];
  const groups =
    right === undefined
      ? explicit
      : [...l, ...Array(8 - explicit.length).fill('0'), ...r, ...tailGroups];
  if (groups.length !== 8) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** True for any IPv6 literal that is not globally routable. */
export function isBlockedIpv6(ip: string): boolean {
  const g = expandIpv6(ip);
  if (!g) return true;
  const [g0, g1] = g as number[];

  const allZero = g.every((x) => x === 0);
  if (allZero) return true;                                     // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 loopback

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible: judge the embedded v4.
  const v4mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const v4compat = g.slice(0, 6).every((x) => x === 0);
  if (v4mapped || v4compat) {
    const a = (g[6]! >> 8) & 0xff, b = g[6]! & 0xff, c = (g[7]! >> 8) & 0xff, d = g[7]! & 0xff;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }

  if ((g0! & 0xfe00) === 0xfc00) return true;   // fc00::/7 unique-local
  if ((g0! & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
  if ((g0! & 0xff00) === 0xff00) return true;   // ff00::/8 multicast
  if (g0 === 0x0064 && g1 === 0xff9b) return true; // 64:ff9b::/96 NAT64
  if (g0 === 0x2001 && (g1! & 0xff00) === 0x0000) return true; // 2001:0000::/23 Teredo etc.
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x2002) return true;               // 6to4
  return false;
}

/** True if this IP literal (v4 or v6) must not be connected to. */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip.replace(/^\[|\]$/g, ''))) return isBlockedIpv6(ip);
  return true; // not an IP we understand -> refuse
}

/** True if the hostname itself is on the never-resolve list. */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (BLOCKED_HOST_EXACT.has(h)) return true;
  if (BLOCKED_HOST_SUFFIX.some((s) => h.endsWith(s))) return true;
  if (!h.includes('.') && !net.isIP(h)) return true; // single-label intranet name
  return false;
}

/**
 * Resolve a hostname and assert every address it maps to is public.
 * Returns the resolved addresses so the caller can pin the connection.
 */
export async function assertPublicHost(
  hostname: string,
  resolver: (h: string) => Promise<{ address: string }[]> = (h) => lookup(h, { all: true, verbatim: true }),
): Promise<string[]> {
  if (isBlockedHostname(hostname)) {
    throw new BlockedUrlError('That host is not reachable from here.');
  }

  const bare = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) {
    if (isBlockedIp(bare)) throw new BlockedUrlError('That address is not a public website.');
    return [bare];
  }

  let addrs: { address: string }[];
  try {
    addrs = await resolver(hostname);
  } catch {
    throw new BlockedUrlError("That domain doesn't resolve.");
  }
  if (!addrs?.length) throw new BlockedUrlError("That domain doesn't resolve.");

  for (const { address } of addrs) {
    if (isBlockedIp(address)) throw new BlockedUrlError('That address is not a public website.');
  }
  return addrs.map((a) => a.address);
}

/** Full check of one absolute URL: scheme, port, hostname, and every resolved IP. */
export async function assertFetchableUrl(
  urlStr: string,
  resolver?: (h: string) => Promise<{ address: string }[]>,
): Promise<URL> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new BlockedUrlError('Invalid URL.');
  }
  const proto = u.protocol.toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') {
    throw new BlockedUrlError('Only http and https URLs are supported.');
  }
  if (u.username || u.password) throw new BlockedUrlError('Credentials in URLs are not allowed.');

  if (u.port) {
    const port = Number(u.port);
    // Only the usual web ports; blocks gopher/redis/ssh-style internal pivots.
    const ALLOWED_PORTS = new Set([80, 443, 3000, 8000, 8080, 8443]);
    if (!ALLOWED_PORTS.has(port)) throw new BlockedUrlError('That port is not allowed.');
  }

  await assertPublicHost(u.hostname, resolver);
  return u;
}
