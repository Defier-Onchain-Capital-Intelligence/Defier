'use client';
/**
 * Turn range alerts on for one position.
 *
 * Only appears inside Base App, because that is where the notification comes
 * from: the client issues the permission and the client delivers the message.
 * Outside it there is nothing honest to offer, so the control is absent rather
 * than present and broken.
 */
import { useEffect, useState } from 'react';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import type { LpPosition } from '@/types/portfolio';
import { InfoDot } from '@/components/ui/InfoDot';

export function AlertToggle({ pos, wallet }: { pos: LpPosition; wallet: string }) {
  const { context } = useMiniKit();
  const fid = context?.user?.fid;

  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!fid) return;
    let live = true;
    fetch(`/api/alerts?fid=${fid}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { positionIds?: string[] }) => {
        if (live) setOn(Boolean(d.positionIds?.includes(pos.id)));
      })
      .catch(() => { /* the toggle simply starts off */ });
    return () => { live = false; };
  }, [fid, pos.id]);

  if (!fid || pos.closed) return null;

  const toggle = async () => {
    setBusy(true); setNote(null);
    const next = !on;
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fid, wallet, positionId: pos.id, enable: next,
          poolAddress: pos.poolAddress, tickLower: pos.tickLower,
          tickUpper: pos.tickUpper, pair: pos.symbol,
        }),
      });
      const json = await res.json();
      if (!res.ok) setNote(json?.error || 'Could not save that.');
      else setOn(next);
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-bg-border bg-bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Tell me when this leaves its range
            <InfoDot label="Range alerts">
              A position that leaves its range stops earning immediately and silently: no
              transaction, no event, nothing in your wallet to notice. Base App delivers the
              message, so we hold no phone number and no chat id. You get one when it leaves
              and one when it comes back, not one every five minutes.
            </InfoDot>
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {on ? 'On. Base App will notify you.' : 'Off'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Range alerts"
          disabled={busy}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            on ? 'bg-accent' : 'bg-bg-elevated'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink-primary transition-transform ${
              on ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      {note ? <p className="mt-2 text-xs text-warn">{note}</p> : null}
    </div>
  );
}
