interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-center">
      <p className="text-red-400 font-medium">Error</p>
      <p className="text-red-300 text-sm mt-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-4 py-1.5 bg-red-800 hover:bg-red-700 text-red-200 text-sm rounded transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
