/**
 * Status badge & dot — the canonical way to render local/pending/official status.
 * Wraps `statusStyle` (single source of truth). See docs/UI-UX-SPEC.md §8.
 */

import { Badge } from "./Badge";
import { statusStyle } from "../../profileStatus";

/** Coloured pill: "Local" (yellow) / "Pending" (orange) / "Official" (green). */
export function StatusBadge({ status }: { status: string | undefined }) {
  const s = statusStyle(status);
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

/** Small coloured dot for compact contexts (Miller rows, tree nodes). */
export function StatusDot({ status, title }: { status: string | undefined; title?: string }) {
  const s = statusStyle(status);
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`}
      title={title ?? s.label}
      aria-label={s.label}
    />
  );
}
