import { describe, expect, it } from 'vitest';
import { notFoundMarkdown, resultToMarkdown } from '@/lib/resultMarkdown';
import type { RoastResult } from '@/lib/types';

const base: RoastResult = {
  id: 'abcdef123456',
  url: 'https://acme.com/',
  displayUrl: 'acme.com',
  siteName: 'Acme',
  favicon: 'https://acme.com/favicon.ico',
  createdAt: 1_700_000_000_000,
  score: {
    overall: 62,
    subs: [
      { key: 'hero', label: 'Hero', score: 70, reason: 'Names a category, not an outcome.' },
      { key: 'cta', label: 'CTA', score: 40, reason: 'The button says Learn more.' },
    ],
  },
  roast: [
    'Your headline could be stapled to a toaster and nobody would notice.',
    'The subhead promises everything and commits to nothing.',
    'The CTA reads like a polite cough at the end of a meeting.',
  ],
  verdict: 'Gorgeous packaging, no label.',
  before: { headline: 'Agentic Infrastructure', subhead: 'The future of work.', cta: 'Learn more' },
  after: {
    headline: 'Deploy your app globally in seconds',
    subhead: 'We host frontend apps with automatic scaling and previews on every push.',
    cta: 'Start deploying free',
  },
  fixes: [
    'Replace the abstract headline with the concrete deploy promise.',
    'Swap the vague subhead for one sentence naming what gets hosted.',
    'Change the demo button to a self-serve action like start free.',
  ],
  fixPrompt: 'Context: improve the landing page for Acme (acme.com).',
  pageType: 'landing',
  isLandingPage: true,
};

describe('resultToMarkdown — landing page', () => {
  const md = resultToMarkdown(base);

  it('leads with the title and score', () => {
    expect(md.startsWith('# Roast of acme.com — 62/100')).toBe(true);
  });

  it('includes the verdict, every roast line and every sub-score', () => {
    expect(md).toContain('> Gorgeous packaging, no label.');
    expect(md).toContain('- Your headline could be stapled to a toaster and nobody would notice.');
    expect(md).toContain('- **Hero** 70/100 — Names a category, not an outcome.');
  });

  it('includes the exact new headline, subhead and CTA', () => {
    expect(md).toContain('- **Headline:** Deploy your app globally in seconds');
    expect(md).toContain(
      '- **Subhead:** We host frontend apps with automatic scaling and previews on every push.',
    );
    expect(md).toContain('- **CTA:** Start deploying free');
  });

  it('lists the three fixes as numbered steps and a one-line rationale', () => {
    expect(md).toContain('1. Replace the abstract headline with the concrete deploy promise.');
    expect(md).toContain('3. Change the demo button to a self-serve action like start free.');
    expect(md).toContain('customer-acquisition channel');
  });

  it('carries the brand wordmark', () => {
    expect(md).toContain('roast.lightslips.ai');
  });
});

describe('resultToMarkdown — app / utility shell', () => {
  const app = resultToMarkdown({
    ...base,
    siteName: 'Google',
    displayUrl: 'google.com',
    pageType: 'app',
    isLandingPage: false,
    fixPrompt: undefined,
    after: { headline: 'Nothing to fix', subhead: "Nothing to fix — Google doesn't need a landing page 🤷", cta: '—' },
  });

  it('keeps the roast but shows the cheeky no-fix state', () => {
    expect(app).toContain('## The roast');
    expect(app).toContain('## Nothing to fix');
    expect(app).toContain("doesn't need a landing page");
  });

  it('suppresses the glow-up fix, the ship list and the fix prompt', () => {
    expect(app).not.toContain('## The fix');
    expect(app).not.toContain('## Ship these three');
    expect(app).not.toContain('## Fix prompt');
  });
});

describe('notFoundMarkdown', () => {
  it('distinguishes expired from unknown', () => {
    expect(notFoundMarkdown(true)).toContain('expired');
    expect(notFoundMarkdown(false)).toContain('not found');
  });
});
