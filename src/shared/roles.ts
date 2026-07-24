/**
 * Contrôle d'accès par rôle — source unique de vérité côté affichage.
 *
 * Le vrai refus d'accès (écritures, validations, push) est appliqué par le
 * processus principal à partir du compte système Windows, non falsifiable. Ce
 * module ne sert QU'À l'affichage : quelles destinations du rail et quelles
 * vues du routeur sont montrées pour un rôle donné. Il remplace la logique de
 * gating auparavant dupliquée dans Sidebar (NAV_ITEMS.minRole) et App
 * (ContentPane.minRoleByView).
 */
import type { UserRole } from "./electronBridge";
import type { AdminView } from "../store/appStore";

export const ROLE_RANK: Record<UserRole, number> = {
  readonly: 0,
  testing: 1,
  admin: 2,
};

/**
 * Rôle minimal requis pour accéder à chaque destination du Management.
 * - home / settings : lecture seule (readonly doit pouvoir régler le dépôt).
 * - edit / sync     : contribution (testing et plus).
 * - admin           : administration.
 */
export const MIN_ROLE_BY_VIEW: Record<AdminView, UserRole> = {
  home: "readonly",
  settings: "readonly",
  edit: "testing",
  sync: "testing",
  admin: "admin",
};

/** Un rôle peut-il accéder à cette vue ? (affichage uniquement) */
export function canAccess(view: AdminView, role: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE_BY_VIEW[view]];
}

/**
 * Libellé du rôle présenté à l'utilisateur. En interne le rôle reste
 * "testing" (cf. access.json, gitService), mais l'interface le nomme "Write"
 * pour rester lisible par un ingénieur.
 */
export function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "testing":
      return "Write";
    case "readonly":
      return "Read Only";
  }
}
