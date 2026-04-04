const BTC_PATTERN = /^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90})$/;
const ETH_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export type Chain = 'btc' | 'eth';

export function detectChain(address: string): Chain | null {
  if (ETH_PATTERN.test(address)) return 'eth';
  if (BTC_PATTERN.test(address)) return 'btc';
  return null;
}

export function isValidAddress(address: string): boolean {
  return ETH_PATTERN.test(address) || BTC_PATTERN.test(address);
}
