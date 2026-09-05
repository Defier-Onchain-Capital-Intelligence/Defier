'use client';
/**
 * The quiet (i). Detail for whoever wants it, invisible to whoever does not.
 *
 * Click, not hover: a tooltip that only opens on hover does not exist on a
 * phone, and this product is read on phones. Hover still works as a shortcut on
 * a desktop, but the click is the contract.
 */
import { useEffect, useRef, useState } from 'react';

export function InfoDot({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={`More about ${label}`}
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={`ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[0.5625rem] leading-none transition-colors ${
          open
            ? 'border-accent text-accent'
            : 'border-ink-muted/50 text-ink-muted hover:border-ink-secondary hover:text-ink-secondary'
        }`}
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-5 z-20 w-56 -translate-x-1/2 rounded-xl border border-bg-border bg-bg-elevated p-3 text-left text-[0.6875rem] font-normal leading-relaxed text-ink-secondary shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
