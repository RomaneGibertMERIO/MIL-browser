/**
 * ChangeTag — the Created / Modified / Deleted word, recoloured with the
 * change-type palette (blues, changeStyle.ts). Shared by the Synchronization
 * list and the Admin review so both read identically. It is NOT a new label — it
 * replaces the old status-coloured badge on the same existing word.
 */
import { changeStyle, type ChangeAction } from "../changeStyle";

export function ChangeTag({ action }: { action: ChangeAction | string }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${changeStyle(action).tag}`}
    >
      {action}
    </span>
  );
}
