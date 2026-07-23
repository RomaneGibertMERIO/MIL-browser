/**
 * Étiquette de statut d'un profil, partagée entre l'édition et le browser.
 *
 * Historique du bug corrigé : le browser étiquetait les profils selon leur
 * `source` (builtin/user) — l'ancien modèle à deux états — tandis que l'édition
 * les étiquette selon leur `status` (local/pending/approved). Un profil
 * approuvé s'affichait donc « Official » à l'édition mais « User » au browser.
 *
 * On centralise ici pour que les deux vues restent cohérentes. La sémantique
 * est celle du cycle de validation (statut), pas celle de la provenance.
 */

export type BadgeVariant = "blue" | "gray" | "green" | "red";

export interface StatusLabel {
  label: string;
  variant: BadgeVariant;
}

/**
 * Traduit le statut d'un profil en libellé + couleur.
 * Aligné sur les libellés de LibraryPage (Local / Pending / Official).
 */
export function profileStatusLabel(status: string | undefined): StatusLabel {
  switch (status) {
    case "approved":
      return { label: "Official", variant: "green" };
    case "pending":
      return { label: "Pending", variant: "gray" };
    case "local":
    default:
      return { label: "Local", variant: "blue" };
  }
}
