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
    <div className="flex flex-wrap gap-2 justify-center mt-6">
      <span className="text-xs font-display self-center" style={{ color: 'var(--cs-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Try</span>
      {EXAMPLES.map((ex, i) => (
        <button
          key={ex.address}
          onClick={() => onSelect(ex.chain, ex.address)}
          className="cs-btn-ghost cs-fade-up"
          style={{ animationDelay: `${0.3 + i * 0.05}s` }}
        >
          {ex.label}
        </button>
      ))}
    </div>
  );
}
