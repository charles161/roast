'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

const BTN =
  'flex items-center justify-center gap-2 border px-5 py-3 text-label transition-colors';

/** "Copied" state for a button, auto-clearing after a beat. */
function useCopied(): [boolean, (text: string, after?: () => void) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  async function copy(text: string, after?: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      after?.();
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return [copied, copy];
}

/**
 * B + B+: the fix prompt (paste into any coding agent) and the agent-handoff
 * directive (point your agent at the result link, it fetches + acts). Rendered
 * only for real landing pages — an app shell has nothing to fix.
 */
export function FixPrompt({ fixPrompt, shareUrl }: { fixPrompt: string; shareUrl: string }) {
  const [promptCopied, copyPrompt] = useCopied();
  const [handoffCopied, copyHandoff] = useCopied();

  const directive = shareUrl ? `Implement the fixes in this roast on my site: ${shareUrl}` : '';

  return (
    <div className="border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="label text-acid">Ship the fix</span>
        <span className="label">paste into your coding agent</span>
      </div>

      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-4 py-4 text-micro leading-relaxed text-chalk/90 sm:text-body">
        {fixPrompt}
      </pre>

      <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
        <button
          type="button"
          onClick={() => copyPrompt(fixPrompt, () => track('fix_prompt_copied'))}
          className={`${BTN} border-acid bg-acid text-ink hover:border-chalk hover:bg-chalk`}
        >
          {promptCopied ? 'Prompt copied' : '🛠️ Copy the fix prompt'}
        </button>
        {directive ? (
          <button
            type="button"
            onClick={() => copyHandoff(directive, () => track('agent_handoff_copied'))}
            className={`${BTN} border-line bg-ink text-chalk hover:border-line-2 hover:bg-ink-2`}
            title={directive}
          >
            {handoffCopied ? 'Directive copied' : '🤝 Hand to your AI agent'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
