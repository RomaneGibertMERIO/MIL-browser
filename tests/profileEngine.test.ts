/**
 * Moteur de profils — validation métier et coercition de saisie.
 *
 * validateProfile est appelé avant chaque écriture : c'est le dernier rempart
 * avant qu'une donnée d'essai invalide n'entre en base.
 */

import { describe, expect, it } from "vitest";
import {
  buildEmptyProfile,
  buildProfileFromDraft,
  getEffectiveSchema,
  validateProfile,
} from "../src/core/engine/profileEngine";
import { makeColumn, makeField, makeNode, makeProfile, makeProfileSchema, makeStandard } from "./fixtures";

describe("validateProfile — champs", () => {
  it("signale un champ requis vide", () => {
    const schema = makeProfileSchema({
      fields: [makeField({ key: "duration", label: "Duration", required: true })],
    });
    const result = validateProfile(makeProfile({ fields: { duration: null } }), schema);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.field).toBe("duration");
  });

  it("traite la chaîne vide comme manquante pour un champ requis", () => {
    const schema = makeProfileSchema({
      fields: [makeField({ key: "duration", required: true })],
    });
    expect(validateProfile(makeProfile({ fields: { duration: "" } }), schema).valid).toBe(false);
  });

  it("accepte 0 et false comme valeurs renseignées", () => {
    // Piège classique : un test de véracité rejetterait 0 et false à tort.
    const schema = makeProfileSchema({
      fields: [
        makeField({ key: "zero", required: true }),
        makeField({ key: "flag", type: "boolean", required: true }),
      ],
    });
    const result = validateProfile(makeProfile({ fields: { zero: 0, flag: false } }), schema);

    expect(result.valid).toBe(true);
  });

  it("rejette une valeur d'enum hors options", () => {
    const schema = makeProfileSchema({
      fields: [
        makeField({
          key: "mode",
          type: "enum",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        }),
      ],
    });
    expect(validateProfile(makeProfile({ fields: { mode: "z" } }), schema).valid).toBe(false);
    expect(validateProfile(makeProfile({ fields: { mode: "a" } }), schema).valid).toBe(true);
  });

  it("applique les règles min et max", () => {
    const schema = makeProfileSchema({
      fields: [
        makeField({
          key: "temp",
          validation: [
            { type: "min", value: 0, message: "trop froid" },
            { type: "max", value: 100, message: "trop chaud" },
          ],
        }),
      ],
    });

    expect(validateProfile(makeProfile({ fields: { temp: -5 } }), schema).errors[0]!.message).toBe("trop froid");
    expect(validateProfile(makeProfile({ fields: { temp: 150 } }), schema).errors[0]!.message).toBe("trop chaud");
    expect(validateProfile(makeProfile({ fields: { temp: 50 } }), schema).valid).toBe(true);
  });

  it("applique une règle pattern", () => {
    const schema = makeProfileSchema({
      fields: [
        makeField({
          key: "ref",
          type: "text",
          validation: [{ type: "pattern", value: "^[A-Z]{3}-\\d+$", message: "format invalide" }],
        }),
      ],
    });

    expect(validateProfile(makeProfile({ fields: { ref: "ABC-12" } }), schema).valid).toBe(true);
    expect(validateProfile(makeProfile({ fields: { ref: "abc" } }), schema).valid).toBe(false);
  });

  it("remonte TOUTES les erreurs, pas seulement la première", () => {
    const schema = makeProfileSchema({
      fields: [
        makeField({ key: "a", required: true }),
        makeField({ key: "b", required: true }),
        makeField({ key: "c", required: true }),
      ],
    });
    const result = validateProfile(makeProfile({ fields: {} }), schema);

    expect(result.errors).toHaveLength(3);
  });
});

describe("validateProfile — dataset", () => {
  it("signale une colonne requise manquante avec le numéro de ligne", () => {
    const schema = makeProfileSchema({
      datasetColumns: [makeColumn({ key: "temp_c", label: "Temp", required: true })],
    });
    const result = validateProfile(
      makeProfile({ dataset: [{ temp_c: 20 }, { autre: 1 }] }),
      schema,
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain("row 2");
  });

  it("rejette une valeur non numérique dans une colonne number", () => {
    const schema = makeProfileSchema({
      datasetColumns: [makeColumn({ key: "temp_c", type: "number", required: true })],
    });
    const result = validateProfile(makeProfile({ dataset: [{ temp_c: "abc" }] }), schema);

    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain("must be a number");
  });

  it("ignore les colonnes optionnelles absentes", () => {
    const schema = makeProfileSchema({
      datasetColumns: [makeColumn({ key: "temp_c", required: false })],
    });
    expect(validateProfile(makeProfile({ dataset: [{}] }), schema).valid).toBe(true);
  });
});

describe("buildProfileFromDraft", () => {
  const schema = makeProfileSchema({
    datasetColumns: [
      makeColumn({ key: "minutes", type: "number" }),
      makeColumn({ key: "phase", type: "string" }),
    ],
  });

  const draft = {
    name: "  Essai humidité  ",
    description: "  desc  ",
    nodeId: "node-1",
    standardId: "std-1",
    author: "alice",
    fields: { temp: 20 },
    datasetRows: [{ minutes: "30", phase: "  montée  " }],
  };

  it("convertit les colonnes number en nombres et trime les chaînes", () => {
    const profile = buildProfileFromDraft(draft, schema);

    expect(profile.dataset[0]!.minutes).toBe(30);
    expect(profile.dataset[0]!.phase).toBe("montée");
  });

  it("trime le nom et la description", () => {
    const profile = buildProfileFromDraft(draft, schema);

    expect(profile.name).toBe("Essai humidité");
    expect(profile.description).toBe("desc");
  });

  it("conserve l'id et la date de création lors d'une édition", () => {
    const profile = buildProfileFromDraft(draft, schema, "existing-id", "2020-01-01T00:00:00.000Z");

    expect(profile.id).toBe("existing-id");
    expect(profile.createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(profile.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("produit NaN — et donc un échec de validation — sur un nombre non saisissable", () => {
    // Comportement voulu : la coercition ne masque pas une saisie invalide.
    const bad = { ...draft, datasetRows: [{ minutes: "", phase: "x" }] };
    const profile = buildProfileFromDraft(bad, schema);

    expect(Number.isNaN(profile.dataset[0]!.minutes as number)).toBe(true);

    const required = makeProfileSchema({
      datasetColumns: [makeColumn({ key: "minutes", type: "number", required: true })],
    });
    expect(validateProfile(profile, required).valid).toBe(false);
  });
});

describe("buildEmptyProfile", () => {
  it("initialise les champs à leur valeur par défaut, sinon à null", () => {
    const schema = makeProfileSchema({
      fields: [
        makeField({ key: "avec", defaultValue: 42 }),
        makeField({ key: "sans" }),
      ],
    });
    const profile = buildEmptyProfile("node-1", "std-1", schema);

    expect(profile.fields.avec).toBe(42);
    expect(profile.fields.sans).toBeNull();
    expect(profile.dataset).toEqual([]);
    expect(profile.source).toBe("user");
  });
});

describe("getEffectiveSchema", () => {
  it("retourne le schéma du standard quand le nœud n'a pas de surcharge", () => {
    const standard = makeStandard();
    expect(getEffectiveSchema(standard, "node-1")).toBe(standard.profileSchema);
  });

  it("privilégie les champs du nœud quand ils existent", () => {
    const nodeField = makeField({ key: "specifique" });
    const standard = makeStandard({
      profileSchema: makeProfileSchema({ fields: [makeField({ key: "global" })] }),
      nodes: [
        makeNode({
          nodeSchema: { fields: [nodeField], datasetColumns: [] },
        }),
      ],
    });

    const effective = getEffectiveSchema(standard, "node-1");

    expect(effective.fields).toEqual([nodeField]);
    // datasetColumns du nœud est vide → repli sur le standard.
    expect(effective.datasetColumns).toBe(standard.profileSchema.datasetColumns);
  });

  it("retombe sur le schéma du standard pour un nodeId inconnu", () => {
    const standard = makeStandard();
    expect(getEffectiveSchema(standard, "inexistant")).toBe(standard.profileSchema);
  });
});
