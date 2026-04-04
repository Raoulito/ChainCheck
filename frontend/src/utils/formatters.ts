/**
 * Truncate a hash for display: "0xabcd...1234"
 */
export function truncateHash(hash: string, chars: number = 6): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

/**
 * Truncate an address for display: "0xabcd...1234"
 */
export function truncateAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2) return address;
  const prefix = address.startsWith('0x') ? chars + 2 : chars;
  return `${address.slice(0, prefix)}...${address.slice(-chars)}`;
}

/**
 * Format a Unix timestamp to human-readable date string.
 */
export function formatTimestamp(unix: number): string {
  if (unix === 0) return '—';
  const date = new Date(unix * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a raw blockchain value to human-readable with token symbol.
 */
export function formatValue(valueHuman: string, token: string): string {
  const num = parseFloat(valueHuman);
  if (isNaN(num)) return `${valueHuman} ${token}`;

  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M ${token}`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K ${token}`;
  }
  if (num < 0.001 && num > 0) {
    return `${num.toExponential(2)} ${token}`;
  }
  return `${parseFloat(num.toFixed(6))} ${token}`;
}

/**
 * Format a USD value for display.
 */
export function formatUsd(value: string | null): string {
  if (!value) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Convert BigInt raw value to a Number for chart rendering.
 * Preserves 6 decimal places of precision.
 */
export function bigIntToChartNumber(rawValue: string, decimals: number): number {
  const shift = Math.max(decimals - 6, 0);
  const remainder = Math.min(decimals, 6);
  return Number(BigInt(rawValue) / BigInt(10 ** shift)) / (10 ** remainder);
}

/**
 * Get Unix timestamp as a date string for price lookups: "2024-03-15"
 */
export function timestampToDateStr(unix: number): string {
  const date = new Date(unix * 1000);
  return date.toISOString().split('T')[0];
}
