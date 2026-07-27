/**
 * Single source of truth for status → label + color, shared by every screen
 * (Browser, Edit, Library, Standards, Taxonomy, Sync, Admin).
 *
 * See docs/UI-UX-SPEC.md §8. Historically each screen hard-coded its own badge
 * colors (Local was blue here, amber there; Pending grey vs amber; Official
 * green vs blue vs emerald). Everything now routes through `statusStyle`:
 *   local    → yellow
 *   pending  → orange
 *   approved → green  (labelled "Official")
 */

import type { BadgeVariant } from "./components/ui/Badge";

export type { BadgeVariant };

export interface StatusStyle {
  /** Human label, English. */
  label: string;
  /** Badge color variant. */
  variant: BadgeVariant;
  /** Tailwind background class for a small status dot. */
  dot: string;
}

export function statusStyle(status: string | undefined): StatusStyle {
  switch (status) {
    case "approved":
      return { label: "Official", variant: "green", dot: "bg-green-500" };
    case "pending":
      return { label: "Pending", variant: "orange", dot: "bg-orange-500" };
    case "local":
    default:
      return { label: "Local", variant: "yellow", dot: "bg-yellow-500" };
  }
}

/**
 * Source-aware variant. A `builtin` record ships inside the application binary
 * (the local fallback base) and is NOT a collaborative "Official" (approved)
 * entry — it renders as a neutral grey "Built-in" pill so it is never confused
 * with a green central-approved record. Everything else falls back to the
 * status color. See docs/UI-UX-SPEC.md §8.
 */
export function sourceStatusStyle(
  source: string | undefined,
  status: string | undefined,
): StatusStyle {
  if (source === "builtin") {
    return { label: "Built-in", variant: "gray", dot: "bg-gray-400" };
  }
  return statusStyle(status);
}

export interface StatusLabel {
  label: string;
  variant: BadgeVariant;
}

/** Back-compat helper (label + variant only). Prefer `statusStyle`. */
export function profileStatusLabel(status: string | undefined): StatusLabel {
  const s = statusStyle(status);
  return { label: s.label, variant: s.variant };
}
