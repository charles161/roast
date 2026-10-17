/**
 * The deterministic "fix prompt": a ready-to-paste brief for a coding agent
 * (Cursor / Claude Code / v0 / Lovable) to implement the glow-up on the user's
 * own site. Pure, zero-LLM — this is the fallback the pipeline uses whenever
 * the Haiku call omits its own `fixPrompt`, so a real landing page ALWAYS has
 * one. Imperative, agent-ready, no fluff.
 */

export type FixPromptInput = {
  siteName: string;
  displayUrl: string;
  after: { headline: string; subhead: string; cta: string };
  fixes: string[];
};

/** Collapse whitespace so an interpolated field never breaks the brief's shape. */
function tidy(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export function buildFixPrompt(input: FixPromptInput): string {
  const name = tidy(input.siteName) || tidy(input.displayUrl) || 'this site';
  const context = `Context: improve the landing page for ${name} (${tidy(input.displayUrl)}).`;

  const changes =
    `Replace the hero H1 with "${tidy(input.after.headline)}". ` +
    `Set the subhead to "${tidy(input.after.subhead)}". ` +
    `Make the primary CTA "${tidy(input.after.cta)}" and remove any competing CTA.`;

  const steps = input.fixes
    .map((f) => tidy(f))
    .filter(Boolean)
    .map((f, i) => `${i + 1}. ${f}`)
    .join('\n');

  const guardrail = 'Keep the existing brand voice and tech stack.';

  return [context, changes, steps, guardrail].filter(Boolean).join('\n\n');
}
