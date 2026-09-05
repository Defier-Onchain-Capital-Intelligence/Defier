'use client';
/**
 * What we noticed. Observations, never instructions.
 *
 * Each item states something true about this wallet and, where one exists, what
 * is available on Base for that situation. The difference matters: a product
 * that tells people what to do with their money is giving investment advice; one
 * that hands them their own situation back is giving them what they lack.
 *
 * Three at a time, the ones asking for attention first. A list of eleven things
 * to think about is a list nobody reads.
 */
import { useState } from 'react';
import Link from 'next/link';
import type { Observation } from '@/types/portfolio';
import { Card, Label } from '@/components/ui/Primitives';

const PREVIEW = 3;

export function ObservationsCard({ observations, address }: {
  observations: Observation[];
  address: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!observations?.length) return null;

  const ordered = [...observations].sort(
    (a, b) => Number(b.severity === 'attention') - Number(a.severity === 'attention'),
  );
  const shown = expanded ? ordered : ordered.slice(0, PREVIEW);
  const hidden = ordered.length - shown.length;

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>What we noticed</Label>
        <Link href={`/ask?wallet=${address}`} className="text-xs text-accent">Ask about it</Link>
      </div>

      <ul className="divide-hair mt-1">
        {shown.map((o) => (
          <li key={o.id} className="py-3">
            <div className="flex gap-2.5">
              <span
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  o.severity === 'attention' ? 'bg-warn' : 'bg-ink-muted'
                }`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">{o.title}</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-secondary">{o.detail}</p>
                {o.available ? (
                  <p className="mt-2 rounded-lg bg-bg-elevated px-2.5 py-2 text-[0.75rem] leading-relaxed text-ink-muted">
                    <span className="text-ink-secondary">Available on Base: </span>
                    {o.available}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-xs text-accent"
        >
          Show {hidden} more
        </button>
      ) : null}

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-muted">
        Observations about what you hold and what exists on Base. Not a recommendation
        to buy, sell or deposit anything.
      </p>
    </Card>
  );
}
