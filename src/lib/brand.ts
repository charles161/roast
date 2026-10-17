/**
 * THE MARK — a branding-iron stencil R with a sear cut struck through it.
 *
 * The geometry lives here because five surfaces draw it: the favicon, the
 * apple icon, the header lockup, the share card and the OG image. Three of
 * those are rendered by Satori, which needs plain paths rather than a React
 * component, so this file holds paths and nothing else.
 *
 * `src/app/icon.svg` is a static asset and therefore the one copy that cannot
 * import this; tests/brand.test.ts asserts it has not drifted.
 */

/** Every path below is drawn in a 32x32 box. */
export const MARK_VIEWBOX = '0 0 32 32';

/** The stem, the bowl and the leg. Drawn in the accent. */
export const MARK_R: string[] = [
  'M7 4 L12 4 L12 28 L7 28 Z',
  'M12 4 L22 4 L25 7 L25 14 L22 17 L12 17 L12 12 L20 12 L20 9 L12 9 Z',
  'M17 17 L23 17 L27 28 L21 28 Z',
];

/**
 * The sear: a bar struck through the glyph in the GROUND colour, not a hole.
 * Every surface that draws the mark sits on near-black, so a knockout and a
 * cut look identical — and a filled path renders everywhere, while fill-rule
 * holes do not survive Satori.
 */
export const MARK_SEAR = 'M3 19 L29 17.5 L29 21 L3 22.5 Z';

/** The ground. The sear is painted in this, so the two must stay in step. */
export const INK = '#0A0A0A';
/** The one accent. Committed to — there is no second brand colour. */
export const ACID = '#CCFF3F';
export const CHALK = '#EDEDED';
export const MUTE = '#7A7A7A';
export const LINE = '#242424';

export const WORDMARK = 'roast.lightslips.ai';
