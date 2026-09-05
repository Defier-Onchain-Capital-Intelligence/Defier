/**
 * Display formatting. The engine produces numbers; this decides how many of
 * their digits are worth a reader's attention.
 *
 * No calculation happens here, by design: a number that appears on screen was
 * computed in src/core and nowhere else.
 */

/** Money, with precision that scales to the amount. $9.62 and $3,015 both read cleanly. */
export function usd(value: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs === 0 ? 2 : abs < 1 ? 4 : abs < 1000 ? 2 : 0;
  const formatted = abs.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
  if (!opts.sign) return value < 0 ? `-${formatted}` : formatted;
  return `${value < 0 ? '-' : '+'}${formatted}`;
}

/** Token amounts. Dust stays dust instead of becoming a wall of zeros. */
export function amount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs < 0.000001) return value.toExponential(2);
  if (abs < 1) return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (abs < 1000) return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Prices span from 0.03 cbBTC per WETH to 230 dollars a share. One rule for both. */
export function price(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  if (value < 0.0001) return value.toExponential(2);
  if (value < 1) return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (value < 1000) return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address || '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function dateOf(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function relativeDays(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return '—';
  if (days < 1) return 'today';
  if (days < 30) return `${Math.round(days)} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

/** Tailwind colour class for a signed figure. Sign, never decoration. */
export function toneOf(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return 'text-ink-primary';
  return value > 0 ? 'text-gain' : 'text-loss';
}
