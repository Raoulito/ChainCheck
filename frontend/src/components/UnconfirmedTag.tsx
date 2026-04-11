interface UnconfirmedTagProps {
  confirmations: number | null;
  chain: string;
}

export function UnconfirmedTag({ confirmations, chain }: UnconfirmedTagProps) {
  const threshold = chain === 'btc' ? 6 : 64;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold font-display cursor-help"
      style={{ background: 'var(--cs-yellow-dim)', color: 'var(--cs-yellow)', border: '1px solid var(--cs-yellow)' }}
      title={`This transaction has ${confirmations ?? 0}/${threshold} confirmations. It may be reversed.`}
    >
      <span className="mr-1">&#9203;</span>
      {confirmations ?? 0}/{threshold}
    </span>
  );
}
