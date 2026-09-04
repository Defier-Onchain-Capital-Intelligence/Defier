import { NextResponse } from 'next/server';
/**
 * POST /api/ask { address, question, history[] } → { answer, citations[] }
 * Claude tool use (ANTHROPIC_MODEL) with tools:
 *   get_portfolio(address) · get_position(id) · simulate(input) · get_pool(id) · get_exposure(address)
 * System prompt rules: only use numbers returned by tools; cite the figure and date; never advise to buy/sell;
 * add one-line disclaimer; if a tool fails say so. See 02_PLAN_DESARROLLO.md Part 4.
 */
export async function POST() {
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
