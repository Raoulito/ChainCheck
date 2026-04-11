export function FailedTag() {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold font-display"
      style={{ background: 'var(--cs-red-dim)', color: 'var(--cs-red)', border: '1px solid var(--cs-red)' }}
    >
      FAILED
    </span>
  );
}
