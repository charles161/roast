import { describe, expect, it } from 'vitest';
import { BadUrlError, displayUrl, normalizeUrl, siteName } from '@/lib/url';

describe('normalizeUrl', () => {
  it('adds https to a bare host', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
  });

  it('keeps an explicit http scheme', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('lowercases the host but not the path', () => {
    expect(normalizeUrl('HTTPS://Example.COM/MyPath')).toBe('https://example.com/MyPath');
  });

  it('trims surrounding whitespace and pasted punctuation', () => {
    expect(normalizeUrl('  <https://example.com>  ')).toBe('https://example.com/');
    expect(normalizeUrl('"example.com"')).toBe('https://example.com/');
  });

  it('drops the fragment', () => {
    expect(normalizeUrl('example.com/a#pricing')).toBe('https://example.com/a');
  });

  it('strips default ports but keeps a non-default one', () => {
    expect(normalizeUrl('https://example.com:443/')).toBe('https://example.com/');
    expect(normalizeUrl('http://example.com:80/')).toBe('http://example.com/');
    expect(normalizeUrl('https://example.com:8443/')).toBe('https://example.com:8443/');
  });

  it('removes tracking params and keeps real ones', () => {
    expect(normalizeUrl('example.com/p?utm_source=x&id=7&fbclid=abc&gclid=z')).toBe(
      'https://example.com/p?id=7',
    );
  });

  it('sorts remaining params so order cannot split the cache', () => {
    expect(normalizeUrl('example.com/p?b=2&a=1')).toBe(normalizeUrl('example.com/p?a=1&b=2'));
  });

  it('is stable: normalizing twice is a no-op', () => {
    const once = normalizeUrl('Example.com/Path?utm_source=x&z=1&a=2#frag');
    expect(normalizeUrl(once)).toBe(once);
  });

  it('maps protocol-relative input to https', () => {
    expect(normalizeUrl('//example.com')).toBe('https://example.com/');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com',
    'gopher://example.com',
  ])('rejects the non-web scheme %s', (bad) => {
    expect(() => normalizeUrl(bad)).toThrow(BadUrlError);
  });

  it('rejects embedded credentials', () => {
    expect(() => normalizeUrl('https://user:pass@example.com')).toThrow(BadUrlError);
  });

  it.each(['', '   ', 'not a url', 'http://', '???'])('rejects junk input %j', (bad) => {
    expect(() => normalizeUrl(bad)).toThrow(BadUrlError);
  });

  it('rejects a single-label host', () => {
    expect(() => normalizeUrl('intranet')).toThrow(BadUrlError);
  });

  it('rejects a URL with whitespace inside it', () => {
    expect(() => normalizeUrl('https://exa mple.com')).toThrow(BadUrlError);
  });

  it('rejects an absurdly long URL', () => {
    expect(() => normalizeUrl(`https://example.com/${'a'.repeat(3000)}`)).toThrow(BadUrlError);
  });

  it('rejects a non-string', () => {
    expect(() => normalizeUrl(undefined as unknown as string)).toThrow(BadUrlError);
  });
});

describe('displayUrl / siteName', () => {
  it('drops www, scheme and trailing slash', () => {
    expect(displayUrl('https://www.example.com/')).toBe('example.com');
  });

  it('keeps a meaningful path', () => {
    expect(displayUrl('https://example.com/pricing')).toBe('example.com/pricing');
  });

  it('titlecases the brand from the host', () => {
    expect(siteName('https://www.linear.app/')).toBe('Linear');
  });
});

describe('www collapsing', () => {
  it('treats www and the apex as one cache key', () => {
    expect(normalizeUrl('https://www.example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('www.example.com')).toBe(normalizeUrl('example.com'));
  });

  it('collapses www only, not other subdomains', () => {
    expect(normalizeUrl('https://blog.example.com/')).toBe('https://blog.example.com/');
    expect(normalizeUrl('https://www2.example.com/')).toBe('https://www2.example.com/');
  });

  it('keeps a bare two-label host that merely starts with www', () => {
    // "www.com" is a real apex domain; stripping it would leave nothing.
    expect(normalizeUrl('https://www.com/')).toBe('https://www.com/');
  });

  it('still normalizes www with tracking params and a path', () => {
    expect(normalizeUrl('https://www.linear.app/?utm_source=x')).toBe('https://linear.app/');
  });
});
