/** Full-page loading spinner. */
export function LoadingSpinner() {
  return (
    <div
      className="flex items-center justify-center h-full w-full"
      role="status"
      aria-label="Loading"
    >
      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}
