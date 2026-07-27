/**
 * Accès React aux standards, filtré par espace de travail.
 *
 * Trois catégories de standards coexistent en base :
 *  - le socle d'usine (builtin) : repli autonome, hors réseau ;
 *  - les brouillons locaux : créés/édités sur ce poste, pas encore poussés ;
 *  - les standards partagés : tirés du dépôt central, qui fait autorité.
 *
 * Règles d'affichage :
 *  - En mode AUTONOME (aucun dépôt configuré) : socle d'usine + brouillons
 *    locaux. Les résidus « partagés » d'un dépôt précédemment configuré sont
 *    masqués.
 *  - En mode PARTAGÉ (dépôt configuré) : standards partagés + MES brouillons
 *    locaux (badgés « Local ») + le SOCLE d'usine (builtin), qui reste la base
 *    de travail. Autrement dit : le dépôt + mes modifications locales. (Le socle
 *    n'est plus masqué : le cacher faisait disparaître des normes livrées comme
 *    MIL-STD dès qu'un dépôt central était branché.)
 *
 * Le filtrage est appliqué ICI, et non dans chaque écran, parce que toute
 * l'interface (assistant, bibliothèque, sidebar, configuration des normes)
 * consomme ces hooks.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../core/db/schema";
import { standardWorkspace, type StandardPlugin } from "../../core/domain/standard";
import { useAppStore } from "../../store/appStore";

/**
 * Un standard est-il visible dans l'espace de travail courant ?
 *
 * PARTAGÉ  : tout — le dépôt central, mes brouillons locaux ET le socle d'usine
 *            (builtin), qui reste la base. « Le dépôt + mes modifications. »
 * AUTONOME : socle d'usine + brouillons locaux ; on masque le résidu « shared »
 *            laissé par un dépôt précédemment configuré.
 */
export function isVisibleInWorkspace(
  standard: { workspace?: "local" | "shared" },
  repoMode: "local" | "shared",
): boolean {
  if (repoMode === "shared") return true;
  return standardWorkspace(standard) === "local";
}

/**
 * Un standard est-il un brouillon local non encore poussé ?
 * Sert à afficher le badge « Local — non poussé ».
 */
export function isLocalDraft(standard: {
  status?: string;
  manifest: { isBuiltin: boolean };
}): boolean {
  return standard.manifest?.isBuiltin !== true && standard.status === "local";
}

/**
 * Retourne les standards visibles dans l'espace de travail actif, ou undefined
 * pendant le chargement.
 */
export function useStandards(): StandardPlugin[] | undefined {
  const repoMode = useAppStore((s) => s.repoMode);

  return useLiveQuery<StandardPlugin[]>(
    async () => {
      const all = await db.standards.toArray();
      return all.filter((standard) => isVisibleInWorkspace(standard, repoMode));
    },
    [repoMode],
  );
}

/**
 * Retourne un standard par son id s'il est visible dans l'espace actif.
 * Renvoie undefined s'il existe mais relève d'un espace masqué (ex. un socle
 * d'usine alors qu'un dépôt central est configuré).
 */
export function useStandard(id: string | null): StandardPlugin | undefined {
  const repoMode = useAppStore((s) => s.repoMode);

  return useLiveQuery<StandardPlugin | undefined>(
    async () => {
      if (id === null) return undefined;
      const standard = await db.standards.get(id);
      if (standard === undefined) return undefined;
      return isVisibleInWorkspace(standard, repoMode) ? standard : undefined;
    },
    [id, repoMode],
  );
}
