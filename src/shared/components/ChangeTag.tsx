/**
 * ChangeTag — the Created / Modified / Deleted word, recoloured with the
 * change-type palette (blues, changeStyle.ts). Shared by the Synchronization
 * list and the Admin review so both read identically. It is NOT a new label — it
 * replaces the old status-coloured badge on the same existing word.
 */
import { changeStyle, type ChangeAction } from "../changeStyle";

export function ChangeTag({ action, size = "sm" }: { action: ChangeAction | string; size?: "sm" | "lg" }) {
  const sizing = size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded font-bold uppercase tracking-wide ${sizing} ${changeStyle(action).tag}`}
    >
      {action}
    </span>
  );
}
