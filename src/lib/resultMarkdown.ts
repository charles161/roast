/**
 * Render a stored RoastResult as clean Markdown for agents/curl (the HTML page
 * is for humans). ZERO extra LLM — it is the same stored result reformatted, so
 * an AI coding agent handed `/r/<id>.md` gets everything it needs to implement
 * the fix on the user's repo: the roast, the exact new headline/subhead/CTA,
 * the three fixes as imperative steps, and the one-line rationale.
 */
import { WORDMARK } from './brand';
import { appCheekySubhead } from './appState';
import type { RoastResult } from './types';

/** Our stance, in one line — the rationale an agent should keep in mind. */
const RATIONALE =
  'A landing page is a customer-acquisition channel, not an art project — every line should earn the next scroll.';

function esc(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export function resultToMarkdown(r: RoastResult): string {
  const out: string[] = [];

  out.push(`# Roast of ${esc(r.displayUrl)} — ${r.score.overall}/100`);
  if (r.verdict) out.push(`> ${esc(r.verdict)}`);

  out.push('## The roast');
  out.push(r.roast.map((l) => `- ${esc(l)}`).join('\n'));

  out.push('## Scores');
  out.push(
    r.score.subs
      .map((s) => `- **${esc(s.label)}** ${s.score}/100 — ${esc(s.reason)}`)
      .join('\n'),
  );

  // App / utility shell: there is nothing to sell, so there is no glow-up.
  if (r.isLandingPage === false) {
    out.push('## Nothing to fix');
    out.push(appCheekySubhead(r.siteName));
  } else {
    out.push('## The fix (same product, better words)');
    out.push(
      [
        `- **Headline:** ${esc(r.after.headline)}`,
        `- **Subhead:** ${esc(r.after.subhead)}`,
        `- **CTA:** ${esc(r.after.cta)}`,
      ].join('\n'),
    );

    out.push('## Ship these three');
    out.push(r.fixes.map((f, i) => `${i + 1}. ${esc(f)}`).join('\n'));

    if (r.fixPrompt) {
      out.push('## Fix prompt (paste into your coding agent)');
      out.push('```\n' + r.fixPrompt.trim() + '\n```');
    }
  }

  out.push('## Why');
  out.push(RATIONALE);

  out.push('---');
  out.push(`Roasted by ${WORDMARK}`);

  return out.join('\n\n') + '\n';
}

/** A markdown 404 body for an unknown or expired id. */
export function notFoundMarkdown(expired: boolean): string {
  const title = expired ? '# Roast expired' : '# Roast not found';
  const body = expired
    ? 'That roast has expired. Roast the site again at'
    : 'No roast exists for that id. Roast a site at';
  return `${title}\n\n${body} ${WORDMARK}.\n`;
}
