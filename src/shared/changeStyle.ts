/**
 * Change-tracking colour palette — DISTINCT from the status palette.
 *
 * Two independent visual axes in the app:
 *  - STATUS (profileStatus.ts): local = yellow, pending = orange, official = green.
 *    Says WHERE an object stands. Shown on the Browser/Editor.
 *  - CHANGE TYPE (this file): three distinguishable blue-family hues — added = sky
 *    (light), modified = blue (medium), deleted = indigo (deep). Says WHAT a
 *    proposed change does. Used ONLY in the change-tracking views (Synchronization
 *    and Admin Review).
 *
 * The hues are deliberately different (sky / blue / indigo), not just three tints
 * of the same blue, so the three actions are impossible to miss and clearly
 * separated. Everything is tunable from this one file.
 */

export type ChangeAction = "Created" | "Modified" | "Deleted";

export interface ChangeStyle {
  /** Soft tint for a LIST card (readable, unmissable) + hover + border. */
  listBg: string;
  /** Very soft tint for the DETAIL panel (so inner field cards stay readable). */
  panelBg: string;
  /** Stronger tint for the DETAIL header bar (action + name). */
  header: string;
  /** Bold action-word pill. */
  tag: string;
  /** Border/accent colour for panels and rows. */
  accent: string;
}

const CARD: Record<ChangeAction, ChangeStyle> = {
  // Ajout → SKY (bleu clair)
  Created: {
    listBg: "bg-sky-50 hover:bg-sky-100",
    panelBg: "bg-sky-50",
    header: "bg-sky-100 text-sky-900",
    tag: "bg-sky-200 text-sky-900",
    accent: "border-sky-300",
  },
  // Modification → BLUE (bleu moyen)
  Modified: {
    listBg: "bg-blue-50 hover:bg-blue-100",
    panelBg: "bg-blue-50",
    header: "bg-blue-100 text-blue-900",
    tag: "bg-blue-200 text-blue-900",
    accent: "border-blue-400",
  },
  // Suppression → INDIGO (bleu profond)
  Deleted: {
    listBg: "bg-indigo-50 hover:bg-indigo-100",
    panelBg: "bg-indigo-50",
    header: "bg-indigo-100 text-indigo-900",
    tag: "bg-indigo-200 text-indigo-900",
    accent: "border-indigo-400",
  },
};

export function changeStyle(action: string): ChangeStyle {
  return CARD[action as ChangeAction] ?? CARD.Modified;
}

// ── Coloration AU NIVEAU DU CHAMP / DE LA CELLULE, dans une carte de diff ─────
// La teinte reflète ce qui arrive au champ, dans la même famille que l'action :
// ajouté = sky, modifié = blue, supprimé = indigo.
/** Champ/cellule ajouté (vide avant, rempli maintenant) → sky. */
export const FIELD_ADDED = "rounded bg-sky-100 px-1 text-sky-900";
/** Champ/cellule modifié (valeur différente) → blue. */
export const FIELD_MODIFIED = "rounded bg-blue-100 px-1 text-blue-900";
/** Ancienne valeur rappelée à côté d'une modification (barrée, discrète). */
export const OLD_VALUE = "font-normal text-slate-400 line-through";
/** Champ/cellule supprimé (rempli avant, vide maintenant) → indigo barré. */
export const FIELD_REMOVED = "text-indigo-900 line-through";
/** Fond de cellule de tableau pour chaque type (sans le rounded/px des champs). */
export const CELL_ADDED = "bg-sky-100 text-sky-900";
export const CELL_MODIFIED = "bg-blue-100 text-blue-900";
export const CELL_REMOVED = "bg-indigo-50 text-indigo-900 line-through";
