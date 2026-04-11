interface WebSearchButtonProps {
  address: string;
  chain: string;
}

export function WebSearchButton({ address, chain }: WebSearchButtonProps) {
  const links =
    chain === 'eth'
      ? [
          { label: 'Google', url: `https://www.google.com/search?q=%22${address}%22` },
          { label: 'X/Twitter', url: `https://twitter.com/search?q=${address}` },
          { label: 'Etherscan', url: `https://etherscan.io/address/${address}#comments` },
        ]
      : [
          { label: 'Google', url: `https://www.google.com/search?q=%22${address}%22` },
          { label: 'Blockchair', url: `https://blockchair.com/bitcoin/address/${address}` },
          { label: 'OXT.me', url: `https://oxt.me/address/${address}` },
        ];

  return (
    <div className="inline-flex items-center gap-1">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="cs-btn-ghost"
          style={{ padding: '2px 6px', fontSize: '10px' }}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
