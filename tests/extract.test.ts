import { describe, expect, it } from 'vitest';
import {
  currentCta,
  currentHeadline,
  currentSubhead,
  extractFacts,
  hasEnoughContent,
  sanitizeText,
} from '@/lib/extract';

const page = (body: string, head = '') =>
  extractFacts(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`, 'https://site.com/');

describe('sanitizeText', () => {
  it('collapses whitespace and decodes entities', () => {
    expect(sanitizeText('  a &amp;   b\n\nc ')).toBe('a & b c');
  });

  it('strips characters that could be read as prompt structure', () => {
    expect(sanitizeText('a ```json b')).not.toContain('```');
    expect(sanitizeText('x <|im_start|> y')).not.toContain('<|');
  });

  it('truncates to the cap', () => {
    expect(sanitizeText('a'.repeat(50), 10)).toHaveLength(10);
  });

  it('decodes numeric and hex entities', () => {
    expect(sanitizeText('&#65;&#x42;')).toBe('AB');
  });
});

describe('extractFacts', () => {
  it('strips nested tags out of a heading', () => {
    const f = page('<h1><em class="a">Real headline.</em> <span>And more.</span></h1>');
    expect(f.h1).toBe('Real headline. And more.');
    expect(f.h1).not.toContain('<');
  });

  it('never leaks the body tag name into the hero text', () => {
    const f = page('<p>This is a decent length sentence of hero copy for the page.</p>');
    expect(f.heroText.startsWith('body>')).toBe(false);
    expect(f.heroText).not.toContain('body>');
  });

  it('ignores script and style content', () => {
    const f = page('<script>var secret = "leaked";</script><p>Visible copy that is long enough.</p>');
    expect(f.heroText).not.toContain('secret');
  });

  it('reads title, meta description and og tags', () => {
    const f = page(
      '<h1>Hi</h1>',
      '<title>T</title><meta name="description" content="D"><meta property="og:title" content="OT"><meta property="og:image" content="/i.png">',
    );
    expect(f.title).toBe('T');
    expect(f.metaDescription).toBe('D');
    expect(f.ogTitle).toBe('OT');
    expect(f.ogImage).toBe('https://site.com/i.png');
  });

  it('resolves a declared favicon and falls back to the conventional path', () => {
    expect(page('', '<link rel="shortcut icon" href="/a.ico">').favicon).toBe('https://site.com/a.ico');
    expect(page('').favicon).toBe('https://site.com/favicon.ico');
    expect(page('').signals.hasFavicon).toBe(false);
  });

  it('picks up action-shaped CTA labels and skips prose links', () => {
    const f = page('<a href="/a">Start free trial</a><a href="/b">Some unrelated essay link</a>');
    expect(f.ctas).toContain('Start free trial');
    expect(f.ctas).not.toContain('Some unrelated essay link');
  });

  it('detects buzzwords in the copy', () => {
    const f = page('<h1>Seamlessly leverage our scalable platform</h1>');
    expect(f.buzzwords).toContain('seamlessly');
    expect(f.buzzwords).toContain('scalable');
  });

  it('reports trust signals it can see', () => {
    const f = page('<p>Trusted by 400 teams. What our customers say. Pricing from $9 per month.</p>');
    expect(f.signals.hasLogoWall).toBe(true);
    expect(f.signals.hasTestimonial).toBe(true);
    expect(f.signals.hasPricing).toBe(true);
  });

  it('falls back through headline sources', () => {
    expect(currentHeadline(page('<h1>H</h1>'))).toBe('H');
    expect(currentHeadline(page('', '<meta property="og:title" content="OG">'))).toBe('OG');
    expect(currentHeadline(page('', '<title>T</title>'))).toBe('T');
    expect(currentHeadline(page(''))).toBe('(no headline found)');
  });

  it('falls back for subhead and CTA', () => {
    expect(currentSubhead(page('', '<meta name="description" content="D">'))).toBe('D');
    expect(currentCta(page(''))).toBe('(no clear CTA found)');
  });

  it('handles malformed HTML without throwing', () => {
    expect(() => extractFacts('<h1>unclosed <div><p>', 'https://site.com/')).not.toThrow();
    expect(() => extractFacts('', 'https://site.com/')).not.toThrow();
  });
});

describe('CTA detection', () => {
  it('recognises "Connect …" style actions as CTAs', () => {
    const f = page('<a href="#/signup">Connect my agents</a>');
    expect(f.ctas).toContain('Connect my agents');
  });

  it('prefers a real action over a nav sign-in link as the primary CTA', () => {
    const f = page('<nav><a href="#/login">Sign in</a></nav><a class="btn" href="#/signup">Connect my agents</a>');
    expect(currentCta(f)).toBe('Connect my agents');
  });

  it('still falls back to sign-in when it is the only action', () => {
    expect(currentCta(page('<a href="/login">Sign in</a>'))).toBe('Sign in');
  });
});

describe('hasEnoughContent', () => {
  it('rejects an effectively empty page', () => {
    expect(hasEnoughContent(page('<p>hi</p>'))).toBe(false);
  });

  it('accepts a page with real copy', () => {
    expect(
      hasEnoughContent(page('<h1>Deploy your Next.js app globally in seconds, with no config at all</h1>')),
    ).toBe(true);
  });
});
