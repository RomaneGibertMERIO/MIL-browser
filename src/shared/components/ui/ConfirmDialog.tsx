/**
 * useConfirm — promise-based in-app confirmation, replacing native
 * window.confirm() which freezes the whole renderer main thread until dismissed
 * (docs/UI-UX-SPEC.md §21). Non-blocking: it renders on the React tree.
 *
 * Usage:
 *   const { confirm, dialog } = useConfirm();
 *   async function onSomething() {
 *     if (!(await confirm({ message: "Discard your changes?", destructive: true }))) return;
 *     ...proceed...
 *   }
 *   // ...and render {dialog} once inside the component's JSX.
 *
 * Safety detail: for a `destructive` prompt the SAFE button ("Keep editing") is
 * focused by default, so a reflexive Enter/Space *protects* the user's work
 * instead of discarding it — the opposite of a native confirm, whose default
 * button is the affirmative one.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + safe (cancel) button focused by default. */
  destructive?: boolean;
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(result);
  }, []);

  const dialog = options ? (
    <ConfirmDialog options={options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return { confirm, dialog };
}

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const destructive = options.destructive ?? false;
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus the SAFE button for destructive prompts (see file header).
    (destructive ? cancelBtnRef : confirmBtnRef).current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [destructive, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="p-5">
          {options.title && (
            <h3 className="mb-1 text-base font-semibold text-gray-900">{options.title}</h3>
          )}
          <div className="text-sm text-gray-600">{options.message}</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
          >
            {options.cancelLabel ?? "Keep editing"}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-colors ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
