/**
 * Top-level error boundary (docs/UI-UX-SPEC.md §25).
 *
 * Without it, any uncaught exception thrown during render white-screens the
 * whole app (a blank window with no recourse). This catches such errors, keeps
 * the window usable, shows the message, and offers a retry — turning a fatal
 * blank screen into a recoverable state. It also logs the component stack to the
 * renderer log for post-mortem diagnosis on lab machines.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorBanner } from "./ui/ErrorBanner";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaces in %APPDATA%/mil-browser/logs/renderer.log via the main-process
    // console capture — the only trace available when DevTools aren't open.
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-3">
            <ErrorBanner message={error.message || "An unexpected error occurred."} />
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
