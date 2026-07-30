/**
 * ChangePanel — the framed, tinted container for one change's detail, shared by
 * the Synchronization detail pane and the Admin review. It replaces the old
 * "card inside a bordered block inside a card" nesting: ONE tinted panel with a
 * coloured header (big action word + entity + name) and an optional actions slot
 * (Approve/Reject). The change content (ProfileDetail / StandardCard) sits flat
 * inside, on the panel's soft tint.
 */
import type { ReactNode } from "react";
import type { MockChangeItem } from "../../store/appStore";
import { changeStyle } from "../changeStyle";
import { ChangeTag } from "./ChangeTag";

export function ChangePanel({
  change,
  actions,
  children,
}: {
  change: MockChangeItem;
  /** Optional right-aligned actions (e.g. Approve / Reject in the Admin review). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const cs = changeStyle(change.action);
  return (
    <div className={`overflow-hidden rounded-xl border ${cs.accent} ${cs.panelBg}`}>
      {/* En-tête coloré : action + entité + nom (+ actions). Voyant, non manquable. */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 ${cs.header}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <ChangeTag action={change.action} size="lg" />
          <span className="text-xs font-semibold uppercase tracking-wide opacity-60">
            {change.type}
          </span>
          <span className="truncate text-base font-semibold">{change.name}</span>
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {/* Contenu à plat (même layout que l'éditeur), sur la teinte du panneau. */}
      <div className="p-5">{children}</div>
    </div>
  );
}
