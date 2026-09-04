/**
 * In-memory rate limiter for API routes.
 *
 * Simple sliding window counter per IP.
 * Works on Vercel (each serverless function instance gets its own memory,
 * so this is per-instance — good enough for launch, use Upstash Redis for prod scale).
 *
 * Usage in an API route:
 *   const { limited, remaining } = rateLimit(request, { max: 20, windowMs: 60_000 });
 *   if (limited) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
 */

type Window = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Window>();

// Cleanup stale entries every 5 minutes to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of store.entries()) {
    if (now > window.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

type RateLimitOptions = {
  /** Max requests in the window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Key prefix (differentiates endpoints) */
  prefix?: string;
};

type RateLimitResult = {
  limited: boolean;
  remaining: number;
  resetAt: number;
};

export function rateLimit(
  request: Request,
  { max, windowMs, prefix = '' }: RateLimitOptions
): RateLimitResult {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const key = `${prefix}:${ip}`;
  const now = Date.now();

  let window = store.get(key);
  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + windowMs };
    store.set(key, window);
  }

  window.count++;

  return {
    limited:   window.count > max,
    remaining: Math.max(0, max - window.count),
    resetAt:   window.resetAt,
  };
}
