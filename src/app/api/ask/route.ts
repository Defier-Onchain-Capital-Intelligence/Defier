import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { rateLimit } from '@/lib/rateLimit';
import { getAnthropicKey, getAnthropicModel } from '@/lib/env';
import { buildPortfolio } from '@/core/portfolio.js';
import { portfolioFacts, observe } from '@/core/advisor.js';
import { generateSimulationCurve } from '@/core/math.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const MAX_TURNS = 6;
const MAX_HISTORY = 8;

/**
 * The agent answers with figures the engine produced, and with nothing else.
 *
 * Every tool below is read only and computes nothing new: they hand over what
 * src/core already calculated. That is the whole design. A model that can do
 * arithmetic on a portfolio will eventually do it wrong and state the result
 * with total confidence, and in a product about money that is not a rough edge,
 * it is the failure that ends the product.
 */
const SYSTEM = `You are the analyst inside DeFier, a read only tool that measures onchain capital on Base.

Rules you do not break:
- Every figure you state must come from a tool result in this conversation. If a tool did not return it, you do not know it. Say so.
- Never estimate, extrapolate, or "roughly" calculate. No arithmetic of your own on top of tool output beyond quoting it.
- Never tell anyone to buy, sell, deposit, or withdraw. You describe what they hold and what exists on Base for that situation. Observation and option, never instruction.
- Never predict prices or returns.
- If data is marked partial, say what was missing before answering around it.

How you write:
- Answer first, in one or two sentences. Detail after, only if it helps.
- Plain English. No emoji, no exclamation marks, no hype.
- Quote figures with their units and periods: "$3,017 against holding, since September 2025".
- Currency of the product is the US dollar. Percentages to one decimal.
- If asked something outside this wallet's data or outside Base, say that is outside what you can see.

You are talking to someone about their own money. Be exact, be brief, and never sound like a salesperson.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_portfolio',
    description: 'Every figure DeFier has computed for this wallet: value, positions, exposure, P&L against holding, and what the portfolio converts into if the market moves either way.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_observations',
    description: 'Observations about this portfolio\'s composition, each paired with what exists on Base for that situation. Use these verbatim rather than inventing your own.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'simulate',
    description: 'The LP versus holding curve for a hypothetical position. Returns value at each price. Use it when asked what would happen at a different price or range.',
    input_schema: {
      type: 'object',
      properties: {
        entryPrice: { type: 'number', description: 'price of token0 in token1 terms' },
        lowerPrice: { type: 'number' },
        upperPrice: { type: 'number' },
        positionUsd: { type: 'number' },
        aprPct: { type: 'number', description: 'expected fee APR, percent' },
        days: { type: 'number' },
      },
      required: ['entryPrice', 'lowerPrice', 'upperPrice', 'positionUsd'],
    },
  },
];

export async function POST(req: Request) {
  const { limited } = rateLimit(req, { max: 5, windowMs: 60_000, prefix: 'ask' });
  if (limited) {
    return NextResponse.json({ error: 'Too many questions in a short time. Try again in a minute.' }, { status: 429 });
  }

  let body: { address?: string; messages?: Array<{ role: 'user' | 'assistant'; content: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const address = body.address?.toLowerCase() ?? '';
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'A wallet address is required.' }, { status: 400 });
  }

  const history = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = getAnthropicKey();
  } catch {
    return NextResponse.json({ error: 'The assistant is not configured.' }, { status: 503 });
  }

  const client = new Anthropic({ apiKey });
  // One portfolio build per request, shared by every tool call in the loop.
  let portfolio: Awaited<ReturnType<typeof buildPortfolio>> | null = null;
  const getPortfolio = async () => {
    if (!portfolio) portfolio = await buildPortfolio(address, { deep: true });
    return portfolio;
  };

  const runTool = async (name: string, input: Record<string, unknown>) => {
    if (name === 'get_portfolio') return portfolioFacts(await getPortfolio());
    if (name === 'get_observations') return observe(await getPortfolio());
    if (name === 'simulate') {
      const n = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
      const entry = n(input.entryPrice, 0);
      const low = n(input.lowerPrice, 0);
      const high = n(input.upperPrice, 0);
      const size = n(input.positionUsd, 0);
      if (entry <= 0 || low <= 0 || high <= low || size <= 0) {
        return { error: 'Invalid simulation parameters.' };
      }
      const points = generateSimulationCurve(entry, low, high, size, n(input.aprPct, 0) / 100, n(input.days, 30), 40);
      return { points };
    }
    return { error: `Unknown tool ${name}` };
  };

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: getAnthropicModel(),
        max_tokens: 900,
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        return NextResponse.json({ answer: text || 'I could not answer that from the data available.' });
      }

      messages.push({ role: 'assistant', content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>);
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: results });
    }

    return NextResponse.json({ answer: 'That took more steps than I can take in one go. Try asking something narrower.' });
  } catch (err) {
    console.error('[ask]', err);
    return NextResponse.json({ error: 'The assistant could not answer right now.' }, { status: 502 });
  }
}
