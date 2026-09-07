/**
 * Verify a JSON Farcaster Signature envelope.
 *
 * Base App signs the webhook events it sends us. The envelope is three base64url
 * segments — header.payload.signature — where the header names the fid and the
 * app key that signed, and the signature is Ed25519 over `header.payload`.
 *
 * Checking the signature alone is not enough, and this is the part that is easy
 * to get wrong: anyone can generate an Ed25519 keypair, sign a payload with it,
 * and put any fid they like in the header. The signature would verify perfectly.
 * What makes it proof is the second step — asking Farcaster's Key Registry, on
 * Optimism, whether that key is actually registered and active FOR that fid. The
 * chain is the authority on who may speak for an account.
 *
 * Key Registry: 0x00000000Fc1237824fb747aBDE0FF18990E59b7e on OP Mainnet.
 * `keyDataOf(fid, key)` returns (state, keyType); state 1 means added and active.
 */
import { ethers } from 'ethers';
import { createPublicKey, verify as edVerify } from 'node:crypto';

const KEY_REGISTRY = '0x00000000Fc1237824fb747aBDE0FF18990E59b7e';
const KEY_REGISTRY_ABI = [
  'function keyDataOf(uint256 fid, bytes key) view returns (tuple(uint8 state, uint32 keyType))',
];
const OP_RPCS = [
  'https://mainnet.optimism.io',
  'https://optimism.publicnode.com',
  'https://optimism.drpc.org',
];

const STATE_ADDED = 1;
const KEY_TYPE_ED25519 = 1;

/** Raw 32 byte Ed25519 public key to something node's crypto will accept. */
function ed25519KeyFromRaw(raw: Buffer) {
  const DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
  return createPublicKey({
    key: Buffer.concat([DER_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

const b64url = (value: string) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

type Header = { fid?: number; type?: string; key?: string };

export type VerifiedEvent =
  | { ok: true; fid: number; event: Record<string, unknown> }
  | { ok: false; reason: string; retryable?: boolean };

/** Ask the chain whether this key may speak for this fid. */
async function keyIsActive(fid: number, keyHex: string): Promise<boolean | null> {
  for (const url of OP_RPCS) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(url);
      const registry = new ethers.Contract(KEY_REGISTRY, KEY_REGISTRY_ABI, provider);
      const data = await registry.keyDataOf(fid, keyHex);
      return Number(data.state) === STATE_ADDED && Number(data.keyType) === KEY_TYPE_ED25519;
    } catch (_) {
      // Try the next endpoint. A single unreachable RPC is not an answer.
    }
  }
  return null;   // no answer, which is not the same as "no"
}

export async function verifyWebhookEnvelope(raw: unknown): Promise<VerifiedEvent> {
  const body = raw as { header?: string; payload?: string; signature?: string };
  if (typeof body?.header !== 'string' || typeof body?.payload !== 'string'
    || typeof body?.signature !== 'string') {
    return { ok: false, reason: 'not a signed envelope' };
  }

  let header: Header;
  let event: Record<string, unknown>;
  try {
    header = JSON.parse(b64url(body.header).toString('utf8'));
    event = JSON.parse(b64url(body.payload).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed envelope' };
  }

  const fid = Number(header.fid);
  const keyHex = String(header.key || '');
  if (!Number.isInteger(fid) || fid <= 0) return { ok: false, reason: 'no fid' };
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyHex)) return { ok: false, reason: 'no app key' };
  if (header.type && header.type !== 'app_key') return { ok: false, reason: 'unexpected key type' };

  // 1. The signature must be valid for the key that claims to have made it.
  const signingInput = Buffer.from(`${body.header}.${body.payload}`);
  const signature = b64url(body.signature);
  let signatureValid = false;
  try {
    signatureValid = edVerify(
      null, signingInput, ed25519KeyFromRaw(Buffer.from(keyHex.slice(2), 'hex')), signature,
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return { ok: false, reason: 'bad signature' };

  // 2. And that key must be registered to that fid onchain. Without this, anyone
  //    can sign their own payload with their own key and claim any fid.
  const active = await keyIsActive(fid, keyHex);
  if (active === null) {
    // We could not reach the registry. Refusing is the safe answer, and asking
    // the client to retry is better than accepting something unverified.
    return { ok: false, reason: 'key registry unreachable', retryable: true };
  }
  if (!active) return { ok: false, reason: 'key not registered to that fid' };

  return { ok: true, fid, event };
}
