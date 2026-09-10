'use client';
/**
 * What a crash looks like.
 *
 * Without this file Next renders "Sorry, we had an unhandled error" on a blank
 * page, which tells the person nothing and tells us nothing either. A product
 * about money cannot fail silently: say that it failed, say we did not lose
 * anything of theirs because we hold nothing of theirs, and give them the way
 * back. "Start over" reloads rather than soft navigating: the tree that just
 * threw is still in memory, and routing inside it can land on the same error.
 */
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[screen]', error); }, [error]);

  return (
    <div className="rounded-2xl border border-bg-border bg-bg-elevated p-6 text-center">
      <h2 className="text-base font-semibold">This screen did not load</h2>
      <p className="muted mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed">
        Something broke on our side. Nothing of yours is affected: DeFier only reads
        public onchain data and never holds funds or keys.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl border border-bg-border bg-bg-base px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="rounded-xl border border-bg-border bg-bg-base px-4 py-2 text-sm font-medium"
        >
          Start over
        </button>
      </div>
      {error.digest ? (
        <p className="muted mt-4 text-[0.6875rem]">Reference {error.digest}</p>
      ) : null}
    </div>
  );
}
