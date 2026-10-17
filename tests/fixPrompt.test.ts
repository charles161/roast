import { describe, expect, it } from 'vitest';
import { buildFixPrompt } from '@/lib/fixPrompt';

const input = {
  siteName: 'Acme',
  displayUrl: 'acme.com',
  after: {
    headline: 'Deploy your app globally in seconds',
    subhead: 'We host frontend apps with automatic scaling and previews on every push.',
    cta: 'Start deploying free',
  },
  fixes: [
    'Remove the purple gradient and cut the hero to two font sizes.',
    'Add one real metric beside the headline, like deploy time.',
    'Make the hero image show the actual product, not a generic dashboard.',
  ],
};

describe('buildFixPrompt', () => {
  const out = buildFixPrompt(input);

  it('opens with a context line naming the site', () => {
    expect(out.startsWith('Context: improve the landing page for Acme (acme.com).')).toBe(true);
  });

  it('states the exact verbatim hero / subhead / CTA changes', () => {
    expect(out).toContain('Replace the hero H1 with "Deploy your app globally in seconds".');
    expect(out).toContain(
      'Set the subhead to "We host frontend apps with automatic scaling and previews on every push.".',
    );
    expect(out).toContain('Make the primary CTA "Start deploying free" and remove any competing CTA.');
  });

  it('lists the three fixes as numbered imperative steps', () => {
    expect(out).toContain('1. Remove the purple gradient and cut the hero to two font sizes.');
    expect(out).toContain('2. Add one real metric beside the headline, like deploy time.');
    expect(out).toContain('3. Make the hero image show the actual product, not a generic dashboard.');
  });

  it('ends with the brand-voice guardrail', () => {
    expect(out.trimEnd().endsWith('Keep the existing brand voice and tech stack.')).toBe(true);
  });

  it('is always a non-empty multi-block brief', () => {
    expect(out.length).toBeGreaterThan(0);
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(4);
  });

  it('collapses stray whitespace in interpolated fields', () => {
    const messy = buildFixPrompt({
      ...input,
      after: { ...input.after, headline: '  Ship   faster\n\n today ' },
    });
    expect(messy).toContain('Replace the hero H1 with "Ship faster today".');
  });

  it('falls back to a generic name when siteName is empty', () => {
    const anon = buildFixPrompt({ ...input, siteName: '', displayUrl: 'acme.com' });
    expect(anon).toContain('improve the landing page for acme.com (acme.com).');
  });
});
