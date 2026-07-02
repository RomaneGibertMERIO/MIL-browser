interface ErrorBannerProps {
  message: string;
  /** Optional dismiss handler. When provided, a close button is rendered. */
  onDismiss?: () => void;
}

/** Full-width error banner for fatal or page-level errors. */
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3"
      role="alert"
    >
      <span className="flex-1">
        <strong>Error: </strong>
        {message}
      </span>
      {onDismiss !== undefined && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-red-400 hover:text-red-700 transition-colors"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}
    </div>
  );
}
