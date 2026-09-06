'use client';
/**
 * A token's own logo, round, at one size, everywhere.
 *
 * There is no logo in a token's onchain metadata: ERC-20 has name, symbol and
 * decimals and nothing else. Every interface that shows one is reading a list
 * keyed by contract address, which is why Aerodrome and Uniswap can draw a coin
 * for an asset they have never heard of. We read DefiLlama's, which covers Base
 * down to the Coinbase B20 stocks, and fall back through Trust Wallet's to a
 * monogram, so a row never renders a broken image.
 *
 * The address is the key, never the symbol: symbols are mutable onchain and two
 * tokens can share one.
 */
import { useState } from 'react';

const LLAMA = (address: string, size: number) =>
  `https://token-icons.llamao.fi/icons/tokens/8453/${address}?h=${size * 2}&w=${size * 2}`;

/** Trust Wallet keys its folders by EIP-55 checksummed address. */
function checksum(address: string): string {
  return address; // lowercase works for llama; trust wallet fallback is best effort
}

const TRUST = (address: string) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/${checksum(address)}/logo.png`;

/** A stable colour per token, so the fallback is still recognisable at a glance. */
const HUES = [210, 28, 145, 265, 340, 190, 45, 300];
function hueOf(seed: string): number {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[n % HUES.length];
}

export function TokenLogo({ address, symbol, size = 20, className = '' }: {
  address?: string | null;
  symbol?: string | null;
  size?: number;
  className?: string;
}) {
  const clean = (address || '').toLowerCase();
  const sources = clean ? [LLAMA(clean, size), TRUST(clean)] : [];
  const [step, setStep] = useState(0);

  const box = `${size}px`;
  const label = (symbol || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?';

  if (step >= sources.length) {
    const hue = hueOf(clean || label);
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
        style={{
          width: box, height: box,
          background: `hsl(${hue} 45% 22%)`,
          color: `hsl(${hue} 70% 78%)`,
          fontSize: `${Math.max(size * 0.36, 7)}px`,
          letterSpacing: '-0.02em',
        }}
        title={symbol || undefined}
      >
        {label.slice(0, 2)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sources[step]}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setStep((s) => s + 1)}
      className={`shrink-0 rounded-full bg-bg-elevated object-cover ${className}`}
      style={{ width: box, height: box }}
      title={symbol || undefined}
    />
  );
}

/** Two tokens, overlapped, the way every DEX draws a pair. */
export function TokenPair({ token0, token1, size = 20 }: {
  token0?: { address?: string | null; symbol?: string | null } | null;
  token1?: { address?: string | null; symbol?: string | null } | null;
  size?: number;
}) {
  return (
    <span className="inline-flex shrink-0 items-center" style={{ height: `${size}px` }}>
      <TokenLogo address={token0?.address} symbol={token0?.symbol} size={size}
        className="ring-2 ring-bg-surface" />
      <TokenLogo address={token1?.address} symbol={token1?.symbol} size={size}
        className="-ml-2 ring-2 ring-bg-surface" />
    </span>
  );
}
