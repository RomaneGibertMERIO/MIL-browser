/**
 * Intégrité structurelle des standards.
 *
 * assertValidStandard garde les invariants que Zod ne peut pas exprimer :
 * unicité des identifiants, cohérence des références parent/enfant, absence de
 * cycle. Ces contrôles s'exécutent au seed comme à l'import manuel : un cycle
 * non détecté provoquerait une récursion infinie dans buildTree.
 */

import { describe, expect, it } from "vitest";
import { assertValidStandard, getProfileIntegrityErrors } from "../src/core/engine/dataIntegrity";
import { makeColumn, makeField, makeNode, makeProfile, makeProfileSchema, makeStandard } from "./fixtures";

describe("assertValidStandard", () => {
  it("accepte un standard cohérent", () => {
    const standard = makeStandard({
      nodes: [
        makeNode({ id: "a", parentId: null }),
        makeNode({ id: "b", parentId: "a" }),
      ],
    });
    expect(() => assertValidStandard(standard)).not.toThrow();
  });

  it("rejette deux nœuds partageant le même id", () => {
    const standard = makeStandard({
      nodes: [makeNode({ id: "dup" }), makeNode({ id: "dup" })],
    });
    expect(() => assertValidStandard(standard)).toThrow(/Duplicate node id/);
  });

  it("rejette un nœud rattaché à un standard étranger", () => {
    const standard = makeStandard({
      nodes: [makeNode({ id: "a", standardId: "autre-std" })],
    });
    expect(() => assertValidStandard(standard)).toThrow(/belongs to/);
  });

  it("rejette une référence vers un parent inexistant", () => {
    const standard = makeStandard({
      nodes: [makeNode({ id: "a", parentId: "fantome" })],
    });
    expect(() => assertValidStandard(standard)).toThrow(/missing parent/);
  });

  it("détecte un cycle dans la taxonomie", () => {
    const standard = makeStandard({
      nodes: [
        makeNode({ id: "a", parentId: "b" }),
        makeNode({ id: "b", parentId: "a" }),
      ],
    });
    expect(() => assertValidStandard(standard)).toThrow(/cycle/i);
  });

  it("rejette deux champs de profil portant la même clé", () => {
    const standard = makeStandard({
      profileSchema: makeProfileSchema({
        fields: [makeField({ key: "dup" }), makeField({ key: "dup" })],
      }),
    });
    expect(() => assertValidStandard(standard)).toThrow(/Duplicate profile field key/);
  });

  it("rejette deux colonnes de dataset portant la même clé", () => {
    const standard = makeStandard({
      profileSchema: makeProfileSchema({
        datasetColumns: [makeColumn({ key: "dup" }), makeColumn({ key: "dup" })],
      }),
    });
    expect(() => assertValidStandard(standard)).toThrow(/Duplicate dataset column key/);
  });

  it("contrôle aussi l'unicité des clés dans un nodeSchema", () => {
    const standard = makeStandard({
      nodes: [
        makeNode({
          id: "a",
          nodeSchema: {
            fields: [makeField({ key: "dup" }), makeField({ key: "dup" })],
            datasetColumns: [],
          },
        }),
      ],
    });
    expect(() => assertValidStandard(standard)).toThrow(/node "a"/);
  });
});

describe("getProfileIntegrityErrors", () => {
  const standard = makeStandard({
    nodes: [makeNode({ id: "node-1" })],
    profileSchema: makeProfileSchema({ version: 1 }),
  });

  it("ne renvoie aucune erreur pour un profil cohérent", () => {
    expect(getProfileIntegrityErrors(makeProfile(), standard)).toEqual([]);
  });

  it("détecte un profil rattaché à un autre standard", () => {
    const errors = getProfileIntegrityErrors(makeProfile({ standardId: "autre" }), standard);
    expect(errors[0]).toContain("standardId");
  });

  it("détecte un nodeId absent du standard", () => {
    const errors = getProfileIntegrityErrors(makeProfile({ nodeId: "fantome" }), standard);
    expect(errors[0]).toContain("does not exist");
  });

  it("détecte une schemaVersion décalée", () => {
    const errors = getProfileIntegrityErrors(makeProfile({ schemaVersion: 99 }), standard);
    expect(errors[0]).toContain("schemaVersion");
  });

  it("remonte les erreurs de validation métier du profil", () => {
    const strict = makeStandard({
      nodes: [makeNode({ id: "node-1" })],
      profileSchema: makeProfileSchema({
        fields: [makeField({ key: "obligatoire", label: "Obligatoire", required: true })],
      }),
    });

    const errors = getProfileIntegrityErrors(makeProfile({ fields: {} }), strict);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("obligatoire");
  });
});
