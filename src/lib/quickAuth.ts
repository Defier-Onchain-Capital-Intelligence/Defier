/**
 * Verify a Quick Auth token, server side.
 *
 * Quick Auth is how a mini app proves who is using it. Base App asks the
 * Farcaster auth service for a short lived JWT bound to the viewer's fid and to
 * OUR domain, the client sends it with the request, and we check the signature
 * against the service's public key. The fid then comes from something signed by
 * a third party, not from a number the browser typed into a JSON body.
 *
 * Why that matters here: without it, anyone could POST an fid that is not theirs
 * and subscribe a real person to alerts about a wallet they have never seen. The
 * notification would be delivered — the token is genuine, the request was not.
 *
 * The audience check is the other half. A token minted for another mini app is a
 * perfectly valid token; accepting it would let that app's users be impersonated
 * here. It is only valid for us if `aud` is our own domain.
 */
import { createPublicKey, createVerify, verify as edVerify } from 'node:crypto';

const JWKS_URL = 'https://auth.farcaster.xyz/.well-known/jwks.json';
const ISSUER = 'https://auth.farcaster.xyz';
const JWKS_TTL_MS = 60 * 60 * 1000;

type Jwk = { kty: string; kid?: string; alg?: string; n?: string; e?: string; crv?: string; x?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;

function b64urlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try { return JSON.parse(b64urlToBuffer(segment).toString('utf8')); } catch { return null; }
}

async function jwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const json = await res.json();
  // The endpoint has served both a key set and a bare key. Accept either rather
  // than breaking every sign in the day it changes shape.
  const keys: Jwk[] = Array.isArray(json?.keys) ? json.keys : [json];
  jwksCache = { at: Date.now(), keys };
  return keys;
}

export type QuickAuthResult =
  | { ok: true; fid: number }
  | { ok: false; reason: string };

/**
 * @param token   the raw JWT from the Authorization header
 * @param domain  our own hostname, e.g. "defier-alpha.vercel.app"
 */
export async function verifyQuickAuth(token: string, domain: string): Promise<QuickAuthResult> {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson(headerPart);
  const payload = decodeJson(payloadPart);
  if (!header || !payload) return { ok: false, reason: 'malformed token' };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return { ok: false, reason: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return { ok: false, reason: 'not yet valid' };
  if (typeof payload.iss === 'string' && !payload.iss.startsWith(ISSUER)) {
    return { ok: false, reason: 'wrong issuer' };
  }

  // A token minted for a different mini app is genuine and still not ours.
  const aud = String(payload.aud ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (aud !== domain) return { ok: false, reason: 'wrong audience' };

  let keys: Jwk[];
  try { keys = await jwks(); } catch { return { ok: false, reason: 'key set unavailable' }; }

  const kid = typeof header.kid === 'string' ? header.kid : null;
  const candidates = kid ? keys.filter((k) => !k.kid || k.kid === kid) : keys;
  const signingInput = Buffer.from(`${headerPart}.${payloadPart}`);
  const signature = b64urlToBuffer(signaturePart);

  const verified = candidates.some((jwk) => {
    try {
      const key = createPublicKey({ key: jwk as never, format: 'jwk' });
      if (jwk.kty === 'OKP') return edVerify(null, signingInput, key, signature);
      const alg = String(header.alg || jwk.alg || 'RS256');
      const hash = alg.endsWith('512') ? 'sha512' : alg.endsWith('384') ? 'sha384' : 'sha256';
      const verifier = createVerify(hash);
      verifier.update(signingInput);
      verifier.end();
      return verifier.verify(key, signature);
    } catch {
      return false;
    }
  });

  if (!verified) return { ok: false, reason: 'bad signature' };

  const fid = Number(payload.sub);
  if (!Number.isInteger(fid) || fid <= 0) return { ok: false, reason: 'no fid in token' };

  return { ok: true, fid };
}

/** Pull and verify the bearer token off a request. */
export async function fidFromRequest(req: Request): Promise<QuickAuthResult> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return { ok: false, reason: 'no token' };
  const domain = new URL(req.url).host;
  return verifyQuickAuth(token, domain);
}
