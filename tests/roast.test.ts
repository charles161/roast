import { describe, expect, it } from 'vitest';
import { normalizeRoast, parseJsonLoose } from '@/lib/roast';

const good = {
  roast: [
    'This headline could be stapled to a toaster and nobody would notice.',
    'Your subhead promises everything and therefore commits to nothing at all.',
    'The CTA reads like a polite cough at the end of a meeting.',
  ],
  verdict: 'Gorgeous packaging, no label.',
  reasons: { hook: 'Names a category, not an outcome.', clarity: 'Jargon hides the product.', trust: 'No proof anywhere.', design: 'Clean but generic.' },
  glowup: {
    headline: 'Deploy your app globally in seconds',
    subhead: 'We host frontend apps with automatic scaling and previews on every push.',
    cta: 'Start deploying free',
  },
  fixes: [
    'Replace the abstract headline with the concrete deploy promise in the hero.',
    'Swap the vague subhead for one sentence naming what gets hosted.',
    'Change the demo button to a self-serve action like start free.',
  ],
};

describe('parseJsonLoose', () => {
  it('parses clean JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips a markdown fence', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('finds the object inside surrounding prose', () => {
    expect(parseJsonLoose('Sure! Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('handles nested braces', () => {
    expect(parseJsonLoose('noise {"a":{"b":{"c":2}}} more')).toEqual({ a: { b: { c: 2 } } });
  });

  it('is not fooled by braces inside strings', () => {
    expect(parseJsonLoose('x {"a":"a } brace","b":2} y')).toEqual({ a: 'a } brace', b: 2 });
  });

  it('handles escaped quotes inside strings', () => {
    expect(parseJsonLoose('{"a":"she said \\"hi\\" loudly"}')).toEqual({ a: 'she said "hi" loudly' });
  });

  it('throws when there is no object', () => {
    expect(() => parseJsonLoose('no json here')).toThrow();
  });

  it('throws on an unterminated object', () => {
    expect(() => parseJsonLoose('{"a":1')).toThrow();
  });
});

describe('normalizeRoast', () => {
  it('accepts a well-formed payload', () => {
    const r = normalizeRoast(good, 'fallback');
    expect(r.roast).toHaveLength(3);
    expect(r.fixes).toHaveLength(3);
    expect(r.glowup.headline).toBe('Deploy your app globally in seconds');
    expect(r.verdict).toBe('Gorgeous packaging, no label.');
  });

  it('caps the roast at five lines', () => {
    const r = normalizeRoast({ ...good, roast: Array(9).fill('A roast line long enough to pass.') }, 'f');
    expect(r.roast).toHaveLength(5);
  });

  it('rejects a payload with fewer than three usable roast lines', () => {
    expect(() => normalizeRoast({ ...good, roast: ['too short', 'x'] }, 'f')).toThrow();
  });

  it('rejects an incomplete glow-up', () => {
    expect(() => normalizeRoast({ ...good, glowup: { headline: 'a', subhead: '', cta: 'c' } }, 'f')).toThrow();
  });

  it('rejects fewer than three fixes', () => {
    expect(() => normalizeRoast({ ...good, fixes: ['only one fix here'] }, 'f')).toThrow();
  });

  it('rejects junk input', () => {
    expect(() => normalizeRoast(null, 'f')).toThrow();
    expect(() => normalizeRoast('a string', 'f')).toThrow();
    expect(() => normalizeRoast({}, 'f')).toThrow();
  });

  it('fills missing reasons with the fallback', () => {
    const r = normalizeRoast({ ...good, reasons: {} }, 'fallback reason');
    expect(r.reasons.hook).toBe('fallback reason');
    expect(r.reasons.design).toBe('fallback reason');
  });

  it('falls back to the first roast line when no verdict is given', () => {
    const r = normalizeRoast({ ...good, verdict: '' }, 'f');
    expect(r.verdict).toBe(good.roast[0]);
  });

  it('collapses whitespace in model output', () => {
    const r = normalizeRoast(
      { ...good, glowup: { ...good.glowup, headline: '  Ship   faster\n\n today  ' } },
      'f',
    );
    expect(r.glowup.headline).toBe('Ship faster today');
  });

  it('strips a fully-quoted line but keeps a quote that opens a citation', () => {
    const wrapped = normalizeRoast(
      { ...good, verdict: '"Gorgeous packaging, no label."' },
      'f',
    );
    expect(wrapped.verdict).toBe('Gorgeous packaging, no label.');

    // A line that quotes the site's own copy mid-sentence must keep both marks.
    const cited = normalizeRoast(
      {
        ...good,
        roast: [
          '"Agentic Infrastructure" is a headline that means absolutely nothing at all.',
          ...good.roast.slice(1),
        ],
      },
      'f',
    );
    expect(cited.roast[0]).toBe(
      '"Agentic Infrastructure" is a headline that means absolutely nothing at all.',
    );
  });

  it('truncates an over-long line instead of dropping it', () => {
    const r = normalizeRoast({ ...good, verdict: 'x'.repeat(400) }, 'f');
    expect(r.verdict.length).toBeLessThanOrEqual(90);
  });

  it('ignores non-string entries in the arrays', () => {
    const r = normalizeRoast({ ...good, roast: [...good.roast, 42, null, {}] }, 'f');
    expect(r.roast).toHaveLength(3);
  });
});
