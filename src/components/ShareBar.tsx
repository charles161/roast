'use client';

import { useState } from 'react';
import { xIntentUrl } from '@/lib/share';
import { track } from '@/lib/track';
import type { RoastResult } from '@/lib/types';

const BTN =
  'flex items-center justify-center gap-2 border px-5 py-3.5 text-label transition-colors';

/** The viral loop: post it, copy the link, or go roast another site. */
export function ShareBar({
  r,
  shareUrl,
  onAnother,
}: {
  r: RoastResult;
  shareUrl: string;
  onAnother?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    track('share_clicked', { surface: 'copy' });
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 grid gap-px bg-line sm:grid-cols-3">
      <a
        href={xIntentUrl(r, shareUrl)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('share_clicked', { surface: 'x' })}
        className={`${BTN} border-acid bg-acid text-ink hover:bg-chalk hover:border-chalk`}
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Post on X
      </a>
      <button
        type="button"
        onClick={copy}
        className={`${BTN} border-line bg-ink text-chalk hover:border-line-2 hover:bg-ink-2`}
      >
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      <RoastAnother onAnother={onAnother} />
    </div>
  );
}

/**
 * The conversion button. Resetting in place beats a navigation when we can —
 * someone arriving on a shared card gets the form instantly, no reload.
 */
export function RoastAnother({
  onAnother,
  className = '',
  children = 'Roast another',
}: {
  onAnother?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const style = className || `${BTN} border-line bg-ink text-acid hover:border-acid hover:bg-ink-2`;

  if (!onAnother) {
    return (
      <a href="/" className={style}>
        {children} <span aria-hidden>&rarr;</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={onAnother} className={style}>
      {children} <span aria-hidden>&rarr;</span>
    </button>
  );
}
