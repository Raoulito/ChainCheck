interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="rounded-xl p-5 text-center" style={{ background: 'var(--cs-red-dim)', border: '1px solid var(--cs-red)' }}>
      <p className="font-semibold font-display" style={{ color: 'var(--cs-red)' }}>Error</p>
      <p className="text-sm mt-1 font-display" style={{ color: 'var(--cs-red)', opacity: 0.8 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="cs-btn-danger mt-3"
          style={{ padding: '6px 20px', fontSize: '12px' }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
