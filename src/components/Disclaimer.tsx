/**
 * The one line of legal text that stays on screen.
 *
 * What was here said three things: not investment advice, read only, and a
 * note about who may hold tokenized stocks. Two of those were removed. Read
 * only is visible from the product — nothing ever asks you to sign — and
 * saying it repeatedly reads as protesting. The tokenized stock line described
 * an eligibility rule that belongs to whoever issues and sells them, and we
 * neither issue nor sell anything.
 *
 * The advice line stays. It is the only sentence here that changes a reader's
 * position rather than describing the product: the screen shows money figures
 * and an assistant that discusses positions, and the distance between
 * information and advice is exactly what that sentence marks. Everything else
 * moved to Terms, where the people who need it will look.
 */
import Link from 'next/link';

export function Disclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`px-1 text-center text-[0.6875rem] leading-relaxed text-ink-muted ${className}`}>
      Not investment advice.{' '}
      <Link href="/privacy" className="underline-offset-2 hover:text-ink-secondary hover:underline">Privacy</Link>
      {' · '}
      <Link href="/terms" className="underline-offset-2 hover:text-ink-secondary hover:underline">Terms</Link>
    </p>
  );
}
