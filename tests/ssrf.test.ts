import { describe, expect, it, vi } from 'vitest';
import {
  assertFetchableUrl,
  assertPublicHost,
  BlockedUrlError,
  isBlockedHostname,
  isBlockedIp,
  isBlockedIpv4,
  isBlockedIpv6,
  resolveFetchTarget,
} from '@/lib/ssrf';

/** Stub resolver so tests never touch real DNS. */
const resolvesTo = (...ips: string[]) => async () => ips.map((address) => ({ address }));
const resolveFails = async () => {
  throw new Error('ENOTFOUND');
};

describe('isBlockedIpv4', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback range'],
    ['10.0.0.1', 'private 10/8'],
    ['10.255.255.255', 'private 10/8 top'],
    ['172.16.0.1', 'private 172.16/12 bottom'],
    ['172.31.255.255', 'private 172.16/12 top'],
    ['192.168.1.1', 'private 192.168/16'],
    ['169.254.169.254', 'cloud metadata'],
    ['169.254.0.1', 'link-local'],
    ['0.0.0.0', 'this network'],
    ['100.64.0.1', 'CGNAT'],
    ['100.127.255.255', 'CGNAT top'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['192.0.0.1', 'protocol assignments'],
    ['192.0.2.5', 'TEST-NET-1'],
    ['198.18.0.1', 'benchmarking'],
    ['198.51.100.5', 'TEST-NET-2'],
    ['203.0.113.5', 'TEST-NET-3'],
    ['192.88.99.1', '6to4 relay'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIpv4(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '11.0.0.1', '100.63.255.255', '100.128.0.1', '223.255.255.255'])(
    'allows the public address %s',
    (ip) => {
      expect(isBlockedIpv4(ip)).toBe(false);
    },
  );

  it.each(['999.1.1.1', '1.2.3', 'not-an-ip', '', '1.2.3.4.5'])('blocks the malformed %j', (ip) => {
    expect(isBlockedIpv4(ip)).toBe(true);
  });
});

describe('isBlockedIpv6', () => {
  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'unique-local'],
    ['fd12::1', 'unique-local short'],
    ['fd12:3456::1', 'unique-local'],
    ['fe80::1', 'link-local'],
    ['::ffff:192.168.0.1', 'v4-mapped private 192.168'],
    ['::ffff:100.64.0.1', 'v4-mapped CGNAT'],
    ['febf::1', 'link-local top'],
    ['ff02::1', 'multicast'],
    ['::ffff:127.0.0.1', 'v4-mapped loopback'],
    ['::ffff:169.254.169.254', 'v4-mapped metadata'],
    ['::ffff:10.0.0.1', 'v4-mapped private'],
    ['64:ff9b::7f00:1', 'NAT64'],
    ['2001:db8::1', 'documentation'],
    ['2002::1', '6to4'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIpv6(ip)).toBe(true);
  });

  it.each(['2606:4700:4700::1111', '2a00:1450:4001:828::200e', '2400:cb00::1'])(
    'allows the public address %s',
    (ip) => {
      expect(isBlockedIpv6(ip)).toBe(false);
    },
  );

  it('blocks a v4-mapped public address only if the v4 part is private', () => {
    expect(isBlockedIpv6('::ffff:8.8.8.8')).toBe(false);
  });

  it('blocks garbage', () => {
    expect(isBlockedIpv6('zzzz::1')).toBe(true);
  });
});

describe('isBlockedIp', () => {
  it('dispatches on family', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
  });

  it('blocks a bracketed loopback literal', () => {
    expect(isBlockedIp('[::1]')).toBe(true);
  });

  it('blocks anything that is not an IP', () => {
    expect(isBlockedIp('example.com')).toBe(true);
  });
});

describe('isBlockedHostname', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'localhost.',
    'foo.localhost',
    'metadata.google.internal',
    'metadata',
    'anything.internal',
    'printer.local',
    'db.lan',
    'svc.corp',
    'box.localdomain',
    'router.home.arpa',
    '1.0.0.127.in-addr.arpa',
    'intranet',
  ])('blocks %s', (h) => {
    expect(isBlockedHostname(h)).toBe(true);
  });

  it.each(['example.com', 'www.example.co.uk', 'sub.domain.io'])('allows %s', (h) => {
    expect(isBlockedHostname(h)).toBe(false);
  });
});

describe('assertPublicHost', () => {
  it('accepts a host that resolves only to public IPs', async () => {
    await expect(assertPublicHost('example.com', resolvesTo('93.184.216.34'))).resolves.toEqual([
      '93.184.216.34',
    ]);
  });

  it('rejects a host that resolves to a private IP (DNS rebinding)', async () => {
    await expect(assertPublicHost('evil.com', resolvesTo('127.0.0.1'))).rejects.toThrow(BlockedUrlError);
  });

  it('rejects when ANY resolved address is private', async () => {
    await expect(
      assertPublicHost('evil.com', resolvesTo('93.184.216.34', '169.254.169.254')),
    ).rejects.toThrow(BlockedUrlError);
  });

  it('rejects a host that fails to resolve', async () => {
    await expect(assertPublicHost('nope.invalid', resolveFails)).rejects.toThrow(BlockedUrlError);
  });

  it('rejects an empty resolver answer', async () => {
    await expect(assertPublicHost('nope.com', resolvesTo())).rejects.toThrow(BlockedUrlError);
  });

  it('judges a bare IP literal without resolving', async () => {
    await expect(assertPublicHost('8.8.8.8')).resolves.toEqual(['8.8.8.8']);
    await expect(assertPublicHost('169.254.169.254')).rejects.toThrow(BlockedUrlError);
  });

  it('rejects a blocklisted name before resolving it', async () => {
    await expect(assertPublicHost('localhost', resolvesTo('93.184.216.34'))).rejects.toThrow(
      BlockedUrlError,
    );
  });
});

describe('assertFetchableUrl', () => {
  const ok = resolvesTo('93.184.216.34');

  it('accepts a normal https URL', async () => {
    await expect(assertFetchableUrl('https://example.com/', ok)).resolves.toBeInstanceOf(URL);
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com'])(
    'rejects the scheme in %s',
    async (u) => {
      await expect(assertFetchableUrl(u, ok)).rejects.toThrow(BlockedUrlError);
    },
  );

  it('rejects credentials in the URL', async () => {
    await expect(assertFetchableUrl('https://u:p@example.com/', ok)).rejects.toThrow(BlockedUrlError);
  });

  it('rejects a non-web port', async () => {
    await expect(assertFetchableUrl('http://example.com:22/', ok)).rejects.toThrow(BlockedUrlError);
    await expect(assertFetchableUrl('http://example.com:6379/', ok)).rejects.toThrow(BlockedUrlError);
  });

  it('allows the usual web ports', async () => {
    await expect(assertFetchableUrl('http://example.com:8080/', ok)).resolves.toBeInstanceOf(URL);
  });

  it('rejects loopback and metadata targets directly', async () => {
    await expect(assertFetchableUrl('http://127.0.0.1:80/', ok)).rejects.toThrow(BlockedUrlError);
    await expect(assertFetchableUrl('http://169.254.169.254/latest/meta-data/', ok)).rejects.toThrow(
      BlockedUrlError,
    );
    await expect(assertFetchableUrl('http://[::1]/', ok)).rejects.toThrow(BlockedUrlError);
    await expect(assertFetchableUrl('http://localhost/', ok)).rejects.toThrow(BlockedUrlError);
  });

  it('rejects malformed input', async () => {
    await expect(assertFetchableUrl('://////', ok)).rejects.toThrow(BlockedUrlError);
  });
});

describe('resolveFetchTarget (resolve-once + pin)', () => {
  it('returns the URL and the validated addresses to pin to', async () => {
    const t = await resolveFetchTarget('https://example.com/path', resolvesTo('93.184.216.34'));
    expect(t.url).toBeInstanceOf(URL);
    expect(t.url.hostname).toBe('example.com');
    // These are the addresses the caller MUST pin the socket to.
    expect(t.addresses).toEqual(['93.184.216.34']);
  });

  it('resolves the hostname exactly once (the result is what gets pinned)', async () => {
    const resolver = vi.fn(async () => [{ address: '93.184.216.34' }]);
    await resolveFetchTarget('https://example.com/', resolver);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('rejects when the single resolved address is private (DNS rebinding attempt)', async () => {
    await expect(resolveFetchTarget('https://evil.com/', resolvesTo('169.254.169.254'))).rejects.toThrow(
      BlockedUrlError,
    );
    await expect(resolveFetchTarget('https://evil.com/', resolvesTo('127.0.0.1'))).rejects.toThrow(
      BlockedUrlError,
    );
  });

  it('rejects the WHOLE request when ANY resolved address is private (no cherry-picking)', async () => {
    await expect(
      resolveFetchTarget('https://evil.com/', resolvesTo('93.184.216.34', '10.0.0.5')),
    ).rejects.toThrow(BlockedUrlError);
  });

  it('returns every address when they are all public (so pinning can use any)', async () => {
    const t = await resolveFetchTarget(
      'https://example.com/',
      resolvesTo('93.184.216.34', '1.1.1.1'),
    );
    expect(t.addresses).toEqual(['93.184.216.34', '1.1.1.1']);
  });

  it('still enforces scheme, port and credential rules', async () => {
    const ok = resolvesTo('93.184.216.34');
    await expect(resolveFetchTarget('ftp://example.com/', ok)).rejects.toThrow(BlockedUrlError);
    await expect(resolveFetchTarget('http://example.com:22/', ok)).rejects.toThrow(BlockedUrlError);
    await expect(resolveFetchTarget('https://u:p@example.com/', ok)).rejects.toThrow(BlockedUrlError);
  });

  it('pins a bare public IP literal to itself without resolving', async () => {
    const t = await resolveFetchTarget('https://8.8.8.8/', resolveFails);
    expect(t.addresses).toEqual(['8.8.8.8']);
  });

  it('rejects a private IP literal', async () => {
    await expect(resolveFetchTarget('http://169.254.169.254/latest/', resolveFails)).rejects.toThrow(
      BlockedUrlError,
    );
  });
});
