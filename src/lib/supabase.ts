/**
 * Server side Supabase client.
 *
 * Uses the secret key, which bypasses Row Level Security, so this module must
 * never be imported from a client component. See SECURITY.md section 1.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

let client: SupabaseClient | null = null;

/** Null when Supabase is not configured, so callers degrade instead of throwing. */
export function getServerSupabase(): SupabaseClient | null {
  if (client) return client;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !secret) return null;

  client = createClient(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
