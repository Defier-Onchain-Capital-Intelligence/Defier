'use client';
/**
 * Ask. The agent reads the engine's output and nothing else.
 *
 * The suggested questions are not decoration: they teach what this can answer,
 * which is the hardest part of putting a chat box in a financial product.
 * People type "how do I make money" into an empty box and leave disappointed.
 */
import { useEffect, useRef, useState } from 'react';
import { Card, Label, EmptyState } from '@/components/ui/Primitives';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTED = [
  'Why am I behind holding?',
  'What happens to my portfolio if the market drops?',
  'Which of my positions is not earning fees?',
  'How exposed am I to NVDA?',
];

export function AskView({ address }: { address: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    const next = [...messages, { role: 'user' as const, content: question }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, messages: next }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setMessages([...next, { role: 'assistant', content: data.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Ask</h1>
        <p className="muted mt-1 text-[0.8125rem] leading-relaxed">
          Answers come from the figures DeFier computed for this wallet. If a number
          was not computed, the answer says so rather than guessing.
        </p>
      </header>

      {messages.length === 0 ? (
        <Card>
          <Label>Try asking</Label>
          <div className="mt-3 space-y-2">
            {SUGGESTED.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="w-full rounded-xl border border-bg-border bg-bg-elevated px-3 py-2.5 text-left text-sm text-ink-secondary transition-colors hover:text-ink-primary"
              >
                {q}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === 'user'
              ? 'ml-8 rounded-xl2 bg-accent px-4 py-3 text-sm text-white'
              : 'card-p text-sm leading-relaxed whitespace-pre-wrap'}
          >
            {m.content}
          </div>
        ))}
        {busy ? (
          <div className="card-p text-sm text-ink-muted">Reading your positions…</div>
        ) : null}
        <div ref={endRef} />
      </div>

      {error ? <EmptyState title="Could not answer" body={error} /> : null}

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="sticky bottom-24 flex gap-2"
      >
        <input
          className="input"
          placeholder="Ask about this wallet"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="btn-primary px-5" disabled={busy || !input.trim()}>Ask</button>
      </form>

      <p className="px-1 text-center text-[0.6875rem] leading-relaxed text-ink-muted">
        Informational only. Not investment advice. The assistant does not predict prices
        and cannot execute anything.
      </p>
    </div>
  );
}
