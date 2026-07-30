/**
 * Change-tracking colour palette — DISTINCT from the status palette.
 *
 * Two independent visual axes in the app:
 *  - STATUS (profileStatus.ts): local = yellow, pending = orange, official = green.
 *    Used on the Browser/Editor cards to say WHERE an object stands.
 *  - CHANGE TYPE (this file): shades of BLUE — added = light, modified = medium,
 *    deleted = dark. Used ONLY in the change-tracking views (Synchronization and
 *    Admin Review) to say WHAT a proposed change does.
 *
 * Keeping them separate is deliberate (user request): the old code reused
 * green/yellow/red for Created/Modified/Deleted, which collided with the status
 * colours and made the two meanings indistinguishable.
 */

export type ChangeAction = "Created" | "Modified" | "Deleted";

export interface ChangeStyle {
  /** Left-accent border (list rows + detail card frame). */
  accent: string;
  /** Recolored action word pill (background + text + ring). No new label — it
   *  replaces the old status-coloured badge on the SAME word. */
  tag: string;
  /** Card frame border. */
  border: string;
}

const CARD: Record<ChangeAction, ChangeStyle> = {
  // Ajout → bleu clair
  Created: {
    accent: "border-l-blue-300",
    tag: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
    border: "border-blue-200",
  },
  // Modification → bleu moyen
  Modified: {
    accent: "border-l-blue-500",
    tag: "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-300",
    border: "border-blue-300",
  },
  // Suppression → bleu foncé
  Deleted: {
    accent: "border-l-blue-800",
    tag: "bg-blue-800 text-white",
    border: "border-blue-800",
  },
};

export function changeStyle(action: string): ChangeStyle {
  return CARD[action as ChangeAction] ?? CARD.Modified;
}

// ── Coloration AU NIVEAU DU CHAMP, à l'intérieur d'une carte de diff ──────────
// La teinte reflète ce qui arrive AU CHAMP, indépendamment de l'action globale
// de la carte : un champ nouvellement rempli = ajout (clair), une valeur changée
// = modif (moyen), une valeur vidée = suppression (foncé, barrée).
/** Champ ajouté (vide avant, rempli maintenant) → bleu clair. */
export const FIELD_ADDED = "rounded bg-blue-50 px-1 text-blue-800";
/** Champ modifié (valeur différente) → bleu moyen. */
export const FIELD_MODIFIED = "rounded bg-blue-100 px-1 text-blue-900";
/** Ancienne valeur rappelée à côté d'une modification (barrée, discrète). */
export const OLD_VALUE = "font-normal text-slate-400 line-through";
/** Champ supprimé (rempli avant, vide maintenant) → bleu foncé barré. */
export const FIELD_REMOVED = "text-blue-900 line-through";
