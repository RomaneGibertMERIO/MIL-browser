/**
 * Construction de l'arbre de taxonomie.
 *
 * buildTree alimente la sidebar, l'assistant et la vue Browse. Une erreur ici
 * rend des branches entières du standard invisibles à l'utilisateur.
 */

import { describe, expect, it } from "vitest";
import { buildTree, getProfilesForNode, navigateToNode } from "../src/core/engine/treeBuilder";
import { makeNode, makeProfile } from "./fixtures";

const nodes = [
  makeNode({ id: "m507", parentId: null, label: "Method 507", order: 10 }),
  makeNode({ id: "m501", parentId: null, label: "Method 501", order: 20 }),
  makeNode({ id: "p1a", parentId: "m507", label: "Procedure Ia", order: 10 }),
  makeNode({ id: "p1b", parentId: "m507", label: "Procedure Ib", order: 20 }),
  makeNode({ id: "b3", parentId: "p1a", label: "Zone B3", order: 10 }),
];

describe("buildTree", () => {
  it("construit la hiérarchie depuis la liste plate", () => {
    const tree = buildTree(nodes, []);

    expect(tree.map((n) => n.id)).toEqual(["m507", "m501"]);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["p1a", "p1b"]);
    expect(tree[0]!.children[0]!.children.map((n) => n.id)).toEqual(["b3"]);
  });

  it("trie les frères par `order`, pas par ordre d'insertion", () => {
    const shuffled = [
      makeNode({ id: "c", parentId: null, order: 30 }),
      makeNode({ id: "a", parentId: null, order: 10 }),
      makeNode({ id: "b", parentId: null, order: 20 }),
    ];
    expect(buildTree(shuffled, []).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("calcule le chemin complet de labels depuis la racine", () => {
    const tree = buildTree(nodes, []);
    const b3 = tree[0]!.children[0]!.children[0]!;

    expect(b3.path).toEqual(["Method 507", "Procedure Ia", "Zone B3"]);
  });

  it("propage hasProfiles aux ancêtres", () => {
    // Un profil sur la feuille doit rendre visible toute la branche.
    const tree = buildTree(nodes, [makeProfile({ nodeId: "b3" })]);

    expect(tree[0]!.hasProfiles).toBe(true);
    expect(tree[0]!.children[0]!.hasProfiles).toBe(true);
    expect(tree[0]!.children[0]!.children[0]!.hasProfiles).toBe(true);
    expect(tree[0]!.children[1]!.hasProfiles).toBe(false);
    expect(tree[1]!.hasProfiles).toBe(false);
  });

  it("renvoie un arbre vide sans nœuds", () => {
    expect(buildTree([], [])).toEqual([]);
  });

  it("omet les nœuds dont le parent n'existe pas", () => {
    // Un nœud orphelin ne doit pas apparaître à la racine par accident.
    const orphaned = [
      makeNode({ id: "racine", parentId: null }),
      makeNode({ id: "orphelin", parentId: "disparu" }),
    ];
    const tree = buildTree(orphaned, []);

    expect(tree.map((n) => n.id)).toEqual(["racine"]);
  });
});

describe("getProfilesForNode", () => {
  it("retourne les profils du nœud ET de tous ses descendants", () => {
    const tree = buildTree(nodes, []);
    const m507 = tree[0]!;

    const profiles = [
      makeProfile({ id: "sur-m507", nodeId: "m507" }),
      makeProfile({ id: "sur-b3", nodeId: "b3" }),
      makeProfile({ id: "ailleurs", nodeId: "m501" }),
    ];

    expect(getProfilesForNode(m507, profiles).map((p) => p.id)).toEqual(["sur-m507", "sur-b3"]);
  });

  it("ne retourne que les profils de la feuille quand on la sélectionne", () => {
    const tree = buildTree(nodes, []);
    const b3 = tree[0]!.children[0]!.children[0]!;

    const profiles = [
      makeProfile({ id: "sur-m507", nodeId: "m507" }),
      makeProfile({ id: "sur-b3", nodeId: "b3" }),
    ];

    expect(getProfilesForNode(b3, profiles).map((p) => p.id)).toEqual(["sur-b3"]);
  });
});

describe("navigateToNode", () => {
  it("descend l'arbre en suivant une suite d'identifiants", () => {
    const tree = buildTree(nodes, []);
    expect(navigateToNode(tree, ["m507", "p1a", "b3"])?.id).toBe("b3");
  });

  it("renvoie null si un identifiant du chemin est introuvable", () => {
    const tree = buildTree(nodes, []);
    expect(navigateToNode(tree, ["m507", "inexistant"])).toBeNull();
  });

  it("renvoie null pour un chemin vide", () => {
    expect(navigateToNode(buildTree(nodes, []), [])).toBeNull();
  });
});
