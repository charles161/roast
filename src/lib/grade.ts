/**
 * Score -> colour. Three functional states, not a gradient: a page is rough,
 * middling, or sharp. The top state IS the brand accent, so the palette never
 * grows a second personality.
 */
import { ACID } from './brand';

export type Band = {
  label: string;
  hex: string;
  soft: string;
};

export const ROUGH = '#FF4B3E';
export const MID = '#FFB020';

export function band(score: number): Band {
  if (score >= 80) return { label: 'SHARP', hex: ACID, soft: 'rgba(204,255,63,0.12)' };
  if (score >= 50) return { label: 'MID', hex: MID, soft: 'rgba(255,176,32,0.12)' };
  return { label: 'ROUGH', hex: ROUGH, soft: 'rgba(255,75,62,0.12)' };
}

/** The verdict stamp above the score. Said the way the roast talks. */
export function temperature(score: number): string {
  if (score >= 95) return 'WORLD CLASS';
  if (score >= 85) return 'GENUINELY GOOD';
  if (score >= 70) return 'SOLID, NOT SHARP';
  if (score >= 55) return 'NEEDS A HOOK';
  if (score >= 40) return 'NEEDS WORK';
  if (score >= 25) return 'ROUGH SHAPE';
  return 'SLOP';
}
