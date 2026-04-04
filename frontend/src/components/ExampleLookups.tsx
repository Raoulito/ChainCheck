interface ExampleLookupsProps {
  onSelect: (chain: string, address: string) => void;
}

const EXAMPLES = [
  {
    label: 'Vitalik (ETH)',
    chain: 'eth',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  },
  {
    label: 'Binance Hot Wallet (ETH)',
    chain: 'eth',
    address: '0x28C6c06298d514Db089934071355E5743bf21d60',
  },
  {
    label: 'Satoshi (BTC)',
    chain: 'btc',
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  },
  {
    label: 'Small BTC Wallet',
    chain: 'btc',
    address: '3E8ociqZa9mZUSwGdSmAEMAoAxBK3FNDcd',
  },
];

export function ExampleLookups({ onSelect }: ExampleLookupsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center mt-4">
      <span className="text-gray-400 text-sm self-center">Try:</span>
      {EXAMPLES.map((ex) => (
        <button
          key={ex.address}
          onClick={() => onSelect(ex.chain, ex.address)}
          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md border border-gray-700 transition-colors"
        >
          {ex.label}
        </button>
      ))}
    </div>
  );
}
