/**
 * Schémas de domaine — non-régression sur la perte silencieuse de champs.
 *
 * Zod supprime les clés inconnues lors d'un `.parse()`. `status`, `source` et
 * `lastModifiedBy` n'étant pas déclarés dans StandardPluginSchema, ils étaient
 * effacés à chaque import, seed ou synchronisation Git — alors même que le
 * schéma Dexie les indexe et que tout le workflow de validation en dépend.
 */

import { describe, expect, it } from "vitest";
import { StandardPluginSchema } from "../src/core/domain/standard";
import { ProfileSchema } from "../src/core/domain/profile";
import { makeProfile, makeStandard } from "./fixtures";

describe("StandardPluginSchema", () => {
  it("accepte un standard minimal sans champs de synchronisation", () => {
    const parsed = StandardPluginSchema.parse(makeStandard());
    expect(parsed.manifest.id).toBe("std-1");
    expect(parsed.status).toBeUndefined();
  });

  it("PRÉSERVE status, source, lastModifiedBy et updatedAt", () => {
    const raw = {
      ...makeStandard(),
      status: "pending",
      source: "user",
      lastModifiedBy: "alice",
      updatedAt: "2026-02-03T10:00:00.000Z",
    };

    const parsed = StandardPluginSchema.parse(raw);

    expect(parsed.status).toBe("pending");
    expect(parsed.source).toBe("user");
    expect(parsed.lastModifiedBy).toBe("alice");
    expect(parsed.updatedAt).toBe("2026-02-03T10:00:00.000Z");
  });

  it("survit à un aller-retour parse → parse sans rien perdre", () => {
    // C'est exactement le trajet d'un standard synchronisé : fichier Git →
    // parse → Dexie → export → parse. Chaque étape perdait le statut.
    const original = { ...makeStandard(), status: "approved", source: "user" };

    const once = StandardPluginSchema.parse(original);
    const twice = StandardPluginSchema.parse(once);

    expect(twice.status).toBe("approved");
    expect(twice.source).toBe("user");
  });

  it("rejette un statut hors énumération", () => {
    const raw = { ...makeStandard(), status: "merged" };
    expect(() => StandardPluginSchema.parse(raw)).toThrow();
  });

  it("applique la valeur par défaut des migrations", () => {
    const raw = makeStandard();
    delete (raw as Record<string, unknown>).migrations;
    expect(StandardPluginSchema.parse(raw).migrations).toEqual([]);
  });
});

describe("ProfileSchema", () => {
  it("préserve status et author", () => {
    const parsed = ProfileSchema.parse(makeProfile({ status: "pending", author: "bob" }));
    expect(parsed.status).toBe("pending");
    expect(parsed.author).toBe("bob");
  });

  it("applique les valeurs par défaut de status et author", () => {
    const raw = makeProfile() as Record<string, unknown>;
    delete raw.status;
    delete raw.author;

    const parsed = ProfileSchema.parse(raw);
    expect(parsed.status).toBe("local");
    expect(parsed.author).toBe("unknown");
  });

  it("accepte des cellules nulles dans le dataset", () => {
    const parsed = ProfileSchema.parse(
      makeProfile({ dataset: [{ temp_c: null, label: "t0", minutes: 30 }] }),
    );
    expect(parsed.dataset[0]!.temp_c).toBeNull();
  });

  it("rejette un profil sans nom", () => {
    expect(() => ProfileSchema.parse(makeProfile({ name: "" }))).toThrow();
  });
});
