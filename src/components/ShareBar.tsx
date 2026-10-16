'use client';

import { useState } from 'react';
import type { RoastResult } from '@/lib/types';

/** The viral loop: post it, copy the link, or go roast another site. */
export function ShareBar({ r, shareUrl }: { r: RoastResult; shareUrl: string }) {
  const [copied, setCopied] = useState(false);

  const tweet = `${r.displayUrl} scored ${r.score.overall}/100.\n\n"${r.verdict}"\n\nBefore: ${r.before.headline}\nAfter: ${r.after.headline}`;
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(shareUrl)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
      <a
        href={intent}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-chalk px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-white active:scale-[0.99]"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Post this on X
      </a>
      <button
        type="button"
        onClick={copy}
        className="flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-chalk transition hover:bg-white/[0.08] active:scale-[0.99]"
      >
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      <a
        href="/"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-sm font-semibold text-ember transition hover:bg-ember/20 active:scale-[0.99]"
      >
        Roast yours <span aria-hidden>&rarr;</span>
      </a>
    </div>
  );
}
