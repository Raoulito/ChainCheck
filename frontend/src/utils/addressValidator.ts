const BTC_PATTERN = /^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90})$/;
const EVM_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export type Chain = 'btc' | 'eth' | 'bsc' | 'polygon';

export const EVM_CHAINS: Chain[] = ['eth', 'bsc', 'polygon'];
export const SUPPORTED_CHAINS: Chain[] = ['btc', ...EVM_CHAINS];

export function detectChain(address: string): Chain | null {
  if (EVM_PATTERN.test(address)) return 'eth'; // Default; needs disambiguation for EVM
  if (BTC_PATTERN.test(address)) return 'btc';
  return null;
}

export function isEvmAddress(address: string): boolean {
  return EVM_PATTERN.test(address);
}

export function isValidAddress(address: string): boolean {
  return EVM_PATTERN.test(address) || BTC_PATTERN.test(address);
}
