/**
 * Toaster — renders the stack of non-blocking notifications (see toastStore.ts).
 * Mounted once, at the app root (main.tsx), so it is present in both the Browser
 * and Management modes regardless of which page is showing.
 */
import { createPortal } from "react-dom";
import { useToastStore, type ToastType } from "./toastStore";
import { Icon, type IconName } from "../components/ui/Icon";

const STYLE: Record<ToastType, { icon: IconName; accent: string; iconColor: string }> = {
  success: { icon: "check", accent: "border-l-green-500", iconColor: "text-green-600" },
  error: { icon: "warning", accent: "border-l-red-500", iconColor: "text-red-600" },
  info: { icon: "info", accent: "border-l-blue-500", iconColor: "text-blue-600" },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const s = STYLE[t.type];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 rounded-lg border border-l-4 border-gray-200 bg-white px-3 py-2.5 shadow-md ${s.accent}`}
          >
            <span className={`mt-0.5 flex-shrink-0 ${s.iconColor}`}>
              <Icon name={s.icon} size={16} />
            </span>
            <span className="min-w-0 flex-1 break-words text-sm font-medium text-gray-800">
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="flex-shrink-0 text-gray-400 transition-colors hover:text-gray-600"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
