/**
 * Deterministic HTML -> structured facts. No LLM here: regex extraction is
 * faster, free, and gives the models a clean, bounded prompt.
 * Shape is intentionally reusable (AutoGTM wants the same object).
 */

export type PageFacts = {
  url: string;
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  favicon: string;
  h1: string;
  h2s: string[];
  heroText: string;
  ctas: string[];
  navLabels: string[];
  buzzwords: string[];
  wordCount: number;
  signals: {
    hasOgImage: boolean;
    hasMetaDescription: boolean;
    hasFavicon: boolean;
    hasH1: boolean;
    hasTestimonial: boolean;
    hasLogoWall: boolean;
    hasPricing: boolean;
    hasNumbers: boolean;
    scriptCount: number;
    imageCount: number;
  };
};

/** Marketing words that mean nothing on their own. Used for the roast ammo. */
const BUZZWORDS = [
  'synergy', 'synergize', 'leverage', 'seamless', 'seamlessly', 'frictionless',
  'revolutionary', 'disrupt', 'disruptive', 'game-changing', 'game changer',
  'next-generation', 'next generation', 'cutting-edge', 'cutting edge',
  'best-in-class', 'best in class', 'world-class', 'world class',
  'end-to-end', 'holistic', 'robust', 'scalable', 'turnkey', 'bespoke',
  'innovative', 'innovation', 'empower', 'empowering', 'unlock', 'unleash',
  'supercharge', 'transform', 'transformative', 'paradigm', 'ecosystem',
  'solutions', 'platform', 'enterprise-grade', 'mission-critical',
  'ai-powered', 'ai powered', 'powered by ai', 'ai-driven', 'data-driven',
  'cloud-native', 'future-proof', 'streamline', 'streamlined', 'optimize',
  'elevate', 'reimagine', 'redefine', 'unparalleled', 'state-of-the-art',
  'one-stop', 'all-in-one', 'hyper-', 'blazing fast', 'lightning fast',
];

const CTA_WORDS = /^(get|start|try|book|request|sign|join|buy|claim|schedule|download|create|build|see|watch|talk|contact|learn|explore|discover|launch|begin|subscribe|add|install|upgrade|demo|pricing|free|connect|ask|chat|open|use|deploy|send|generate|upload|register|order|shop|apply)/i;

// Auth links ("Sign in", "Log in") are navigation for existing users, not the page's ask.
const AUTH_LINK = /^(sign\s*in|log\s*in|login|signin|my account)$/i;

function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—',
  ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”',
  ldquo: '“', trade: '™', reg: '®', copy: '©', middot: '·', bull: '•',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) return ' ';
  try { return String.fromCodePoint(code); } catch { return ' '; }
}

/**
 * Collapse whitespace, strip anything that could be read as prompt structure,
 * and hard-cap the length. Everything that reaches a model goes through here.
 */
export function sanitizeText(s: string, max = 400): string {
  const cleaned = decodeEntities(s)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .replace(/```+/g, "'")
    .replace(/<\|[^|]*\|>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

function attr(tag: string, name: string): string {
  const m =
    tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i')) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s">]+)`, 'i'));
  return m?.[1] ?? '';
}

function metaContent(html: string, keys: string[]): string {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of keys) {
    for (const tag of metas) {
      const name = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop')).toLowerCase();
      if (name === key.toLowerCase()) {
        const c = sanitizeText(attr(tag, 'content'), 320);
        if (c) return c;
      }
    }
  }
  return '';
}

export function extractFacts(html: string, finalUrl: string): PageFacts {
  const head = html.slice(0, 200_000);

  const title = sanitizeText(html.match(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i)?.[1] ?? '', 200);
  const metaDescription = metaContent(head, ['description']);
  const ogTitle = metaContent(head, ['og:title', 'twitter:title']);
  const ogDescription = metaContent(head, ['og:description', 'twitter:description']);
  const ogImageRaw = metaContent(head, ['og:image', 'og:image:secure_url', 'twitter:image']);

  let ogImage = '';
  try { ogImage = ogImageRaw ? new URL(ogImageRaw, finalUrl).toString() : ''; } catch { ogImage = ''; }

  // Favicon: declared <link rel="...icon">, else the conventional /favicon.ico.
  let favicon = '';
  const iconTag = (head.match(/<link\b[^>]*>/gi) ?? []).find((t) =>
    /\brel\s*=\s*["']?[^"'>]*\bicon\b/i.test(t),
  );
  try {
    const href = iconTag ? attr(iconTag, 'href') : '';
    favicon = new URL(href || '/favicon.ico', finalUrl).toString();
  } catch { favicon = ''; }

  const h1 = sanitizeText(stripTags(html.match(/<h1\b[^>]*>([\s\S]{0,600}?)<\/h1>/i)?.[1] ?? ''), 220);

  const h2s = Array.from(html.matchAll(/<h2\b[^>]*>([\s\S]{0,400}?)<\/h2>/gi))
    .map((m) => sanitizeText(stripTags(m[1] ?? ''), 160))
    .filter((t) => t.length > 2)
    .slice(0, 6);

  // Hero = the readable prose near the top of <body>, after nav noise.
  // Slice past the whole <body ...> tag; starting mid-tag leaks a literal
  // "body>" into the hero text, which then gets roasted as if it were copy.
  const bodyOpen = html.match(/<body\b[^>]*>/i);
  const bodyHtml = bodyOpen?.index !== undefined
    ? html.slice(bodyOpen.index + bodyOpen[0].length)
    : html;
  const heroText = sanitizeText(
    stripTags(bodyHtml.slice(0, 60_000))
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 24 && /[a-z]/.test(l) && !/^(cookie|we use cookies|accept all)/i.test(l))
      .slice(0, 8)
      .join(' · '),
    900,
  );

  // CTA labels: buttons, links that look like actions.
  const clickables = Array.from(
    bodyHtml.matchAll(/<(a|button)\b[^>]*>([\s\S]{0,160}?)<\/\1>/gi),
  ).map((m) => sanitizeText(stripTags(m[2] ?? ''), 60));

  const ctas = dedupe(
    clickables.filter((t) => t.length >= 2 && t.length <= 40 && CTA_WORDS.test(t)),
  ).slice(0, 8);

  const navHtml = bodyHtml.match(/<(nav|header)\b[^>]*>([\s\S]{0,20000}?)<\/\1>/i)?.[2] ?? '';
  const navLabels = dedupe(
    Array.from(navHtml.matchAll(/<a\b[^>]*>([\s\S]{0,120}?)<\/a>/gi))
      .map((m) => sanitizeText(stripTags(m[1] ?? ''), 40))
      .filter((t) => t.length >= 2 && t.length <= 30),
  ).slice(0, 10);

  const visible = stripTags(bodyHtml).replace(/\s+/g, ' ');
  const visibleLower = decodeEntities(visible).toLowerCase();
  const wordCount = visible.trim() ? visible.trim().split(/\s+/).length : 0;

  const copyForBuzz = `${title} ${ogTitle} ${metaDescription} ${ogDescription} ${h1} ${h2s.join(' ')} ${heroText}`.toLowerCase();
  const buzzwords = dedupe(BUZZWORDS.filter((b) => copyForBuzz.includes(b))).slice(0, 12);

  return {
    url: finalUrl,
    title,
    metaDescription,
    ogTitle,
    ogDescription,
    ogImage,
    favicon,
    h1,
    h2s,
    heroText,
    ctas,
    navLabels,
    buzzwords,
    wordCount,
    signals: {
      hasOgImage: Boolean(ogImage),
      hasMetaDescription: Boolean(metaDescription),
      hasFavicon: Boolean(iconTag),
      hasH1: Boolean(h1),
      hasTestimonial: /testimonial|what our (customers|users|clients)|loved by|trusted by|case stud/i.test(visibleLower),
      hasLogoWall: /trusted by|as seen (in|on)|our (customers|partners|clients)|backed by/i.test(visibleLower),
      hasPricing: /\bpricing\b|\bper month\b|\/mo\b|\bfree trial\b|\$\d/i.test(visibleLower),
      hasNumbers: /\b\d[\d,.]*\s*(k|m|x|%|\+)\b|\b\d{3,}\b/i.test(visibleLower),
      scriptCount: (html.match(/<script\b/gi) ?? []).length,
      imageCount: (bodyHtml.match(/<img\b/gi) ?? []).length,
    },
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const k = i.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(i); }
  }
  return out;
}

/** The best guess at "the headline" for the before/after comparison. */
export function currentHeadline(f: PageFacts): string {
  return f.h1 || f.ogTitle || f.title || f.h2s[0] || '(no headline found)';
}

export function currentSubhead(f: PageFacts): string {
  return f.metaDescription || f.ogDescription || f.h2s[0] || f.heroText.split(' · ')[0] || '(no subhead found)';
}

export function currentCta(f: PageFacts): string {
  return f.ctas.find((c) => !AUTH_LINK.test(c.trim())) || f.ctas[0] || '(no clear CTA found)';
}

/** Is there enough copy here to judge at all? */
export function hasEnoughContent(f: PageFacts): boolean {
  const copy = `${f.title}${f.h1}${f.metaDescription}${f.ogTitle}${f.heroText}`.trim();
  return copy.length >= 40 || f.wordCount >= 40;
}
