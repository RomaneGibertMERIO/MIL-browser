import { create } from "zustand";

/**
 * Non-blocking in-app notifications, replacing native window.alert().
 *
 * A native alert() is SYNCHRONOUS: it freezes the entire renderer main thread
 * (every text field, everywhere) until the OS dialog is dismissed. A profiling
 * trace of the reported "editor freeze" showed exactly this — the only
 * multi-second task in the whole session was a native `alert` shown after a
 * push/approve. Toasts render on the React tree and never block input.
 *
 * See docs/UI-UX-SPEC.md §21 ("No native alert/confirm/prompt").
 */
export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (type: ToastType, message: string, durationMs?: number) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (type, message, durationMs = 4500) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    if (durationMs > 0) {
      // setTimeout (not a React effect) so the auto-dismiss survives re-renders
      // and StrictMode double-mounts.
      setTimeout(() => get().dismiss(id), durationMs);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Callable from anywhere — React components or plain modules (e.g. the
 * window.alert guard). Errors linger a little longer than successes.
 */
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message, 8000),
  info: (message: string) => useToastStore.getState().push("info", message),
};
