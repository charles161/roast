/** Shared score -> colour/label mapping. Used by the UI and the OG image. */
export type Band = {
  label: string;
  hex: string;
  soft: string;
  tailwind: string;
};

export function band(score: number): Band {
  if (score >= 80) return { label: 'Sharp', hex: '#34d399', soft: 'rgba(52,211,153,0.14)', tailwind: 'text-mint' };
  if (score >= 60) return { label: 'Decent', hex: '#a3e635', soft: 'rgba(163,230,53,0.14)', tailwind: 'text-lime2' };
  if (score >= 40) return { label: 'Mid', hex: '#ffb020', soft: 'rgba(255,176,32,0.14)', tailwind: 'text-amber2' };
  return { label: 'Rough', hex: '#ff5d47', soft: 'rgba(255,93,71,0.14)', tailwind: 'text-ember' };
}

/** The one-word temperature we put above the score on the card. */
export function temperature(score: number): string {
  if (score >= 85) return 'Genuinely good';
  if (score >= 70) return 'Pretty strong';
  if (score >= 55) return 'Needs a hook';
  if (score >= 40) return 'Needs work';
  if (score >= 25) return 'Rough shape';
  return 'Oh dear';
}
