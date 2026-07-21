/**
 * Accès React aux standards, filtré par espace de travail.
 *
 * Règle métier : le socle builtin n'est qu'une solution de repli, autonome et
 * hors réseau. Dès qu'un dépôt central est configuré, c'est LUI qui fait
 * autorité, et l'interface ne doit plus montrer que ses fichiers.
 *
 * Ce filtrage est appliqué ICI, et non dans chaque écran, parce que toute
 * l'interface (assistant, bibliothèque, sidebar, configuration des normes)
 * consomme ces deux hooks. Les corriger à la source garantit qu'aucun écran ne
 * peut afficher une norme d'usine périmée alors que l'équipe travaille sur le
 * dépôt partagé.
 *
 * Les enregistrements de l'espace inactif ne sont pas supprimés : ils restent
 * en base et réapparaissent si le dépôt est retiré des réglages.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../core/db/schema";
import { standardWorkspace, type StandardPlugin } from "../../core/domain/standard";
import { useAppStore } from "../../store/appStore";

/**
 * Retourne les standards de l'espace de travail actif, ou undefined pendant
 * le chargement. Les composants doivent afficher un état de chargement tant
 * que la valeur est undefined.
 */
export function useStandards(): StandardPlugin[] | undefined {
  const repoMode = useAppStore((s) => s.repoMode);

  return useLiveQuery<StandardPlugin[]>(
    async () => {
      const all = await db.standards.toArray();
      return all.filter((standard) => standardWorkspace(standard) === repoMode);
    },
    [repoMode],
  );
}

/**
 * Retourne un standard par son id s'il appartient à l'espace de travail actif.
 *
 * Renvoie undefined si le standard existe mais relève de l'autre espace : un
 * identifiant mémorisé dans les réglages ne doit pas ramener à l'écran une
 * norme d'usine que le dépôt central a remplacée.
 */
export function useStandard(id: string | null): StandardPlugin | undefined {
  const repoMode = useAppStore((s) => s.repoMode);

  return useLiveQuery<StandardPlugin | undefined>(
    async () => {
      if (id === null) return undefined;
      const standard = await db.standards.get(id);
      if (standard === undefined) return undefined;
      return standardWorkspace(standard) === repoMode ? standard : undefined;
    },
    [id, repoMode],
  );
}
