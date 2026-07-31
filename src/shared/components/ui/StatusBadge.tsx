/**
 * Status badge & dot — the canonical way to render local/pending/official status.
 * Wraps `statusStyle` (single source of truth). See docs/UI-UX-SPEC.md §8.
 */

import { Badge } from "./Badge";
import { statusStyle, sourceStatusStyle } from "../../profileStatus";

/** Coloured pill: "Local" (yellow) / "Pending" (orange) / "Official" (green). */
export function StatusBadge({ status }: { status: string | undefined }) {
  const s = statusStyle(status);
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

/**
 * Small coloured dot for compact contexts (Miller rows, tree nodes).
 * Passe `source` pour un rendu SOURCE-AWARE (un « builtin » = pastille grise
 * « Built-in », jamais confondu avec un vert officiel) — cf. EditProfileRow et
 * StandardInfoPanel qui distinguent déjà le socle de l'officiel.
 */
export function StatusDot({
  status,
  source,
  title,
}: {
  status: string | undefined;
  source?: string;
  title?: string;
}) {
  const s = source !== undefined ? sourceStatusStyle(source, status) : statusStyle(status);
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`}
      title={title ?? s.label}
      aria-label={s.label}
    />
  );
}
