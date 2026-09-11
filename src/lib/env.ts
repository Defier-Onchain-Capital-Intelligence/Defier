/**
 * Environment variables.
 *
 * Server-only values are read lazily so a missing key never crashes the whole
 * app at startup: the route that needs it fails with a clear message instead.
 *
 * NEVER import the server helpers from a client component. Anything that must
 * reach the browser lives under NEXT_PUBLIC_ and is assumed to be public.
 */

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Copy .env.example to .env.local and fill it in, or add it in Vercel.`
    );
  }
  return val;
}

function optionalEnv(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

// ─── Server only. Never expose these to the client. ───────────────────────────

/** Alchemy app without domain restriction. Used by core/providers.js. */
export function getAlchemyKey(): string {
  return optionalEnv('ALCHEMY_KEY');
}

/** Anthropic key for the AI agent. Only used in /api/ask. */
export function getAnthropicKey(): string {
  return requireEnv('ANTHROPIC_API_KEY');
}

export function getAnthropicModel(): string {
  return optionalEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-5');
}

/** Supabase secret key. Bypasses Row Level Security, so server only. */
export function getSupabaseSecretKey(): string {
  return requireEnv('SUPABASE_SECRET_KEY');
}

// ─── Public by design. Assume these are printed on the home page. ─────────────

export const ONCHAINKIT_API_KEY = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || '';
/**
 * The site's own origin, and the one fallback when the variable is unset.
 *
 * Five files each carried their own fallback and two of them disagreed:
 * three said defier-alpha.vercel.app and two said www.getdefier.com. A
 * fallback that differs by file means a share card, a canonical URL and a
 * notification link can each point at a different host from the same deploy.
 */
export const CANONICAL_URL      = 'https://www.getdefier.com';
export const APP_URL            = process.env.NEXT_PUBLIC_APP_URL || CANONICAL_URL;
export const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
export const DEMO_WALLET        = process.env.NEXT_PUBLIC_DEMO_WALLET || '';
