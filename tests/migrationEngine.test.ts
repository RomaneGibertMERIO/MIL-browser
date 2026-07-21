/**
 * Moteur de migration — transformations déclaratives de profils.
 *
 * Enjeu métier : ces migrations s'appliquent aux données de profils d'essai des
 * clients. Une double application ou une migration sautée corrompt des données
 * qui ne sont pas reproductibles.
 */

import { describe, expect, it } from "vitest";
import { migrateProfiles } from "../src/core/engine/migrationEngine";
import type { SchemaMigration } from "../src/core/domain/standard";
import { makeProfile, makeProfileSchema, makeStandard } from "./fixtures";

const renameV1toV2: SchemaMigration = {
  type: "rename_field",
  fromVersion: 1,
  toVersion: 2,
  description: "temp → temperature",
  from: "temp",
  to: "temperature",
};

const addV2toV3: SchemaMigration = {
  type: "add_field",
  fromVersion: 2,
  toVersion: 3,
  description: "ajout de humidity",
  key: "humidity",
  defaultValue: 50,
};

const removeV3toV4: SchemaMigration = {
  type: "remove_field",
  fromVersion: 3,
  toVersion: 4,
  description: "retrait de legacy",
  key: "legacy",
};

function standardAtVersion(version: number, migrations: SchemaMigration[]) {
  return makeStandard({
    profileSchema: makeProfileSchema({ version }),
    migrations,
  });
}

describe("migrateProfiles", () => {
  it("renomme un champ et met à jour schemaVersion", () => {
    const profile = makeProfile({ schemaVersion: 1, fields: { temp: 25 } });
    const [migrated] = migrateProfiles([profile], standardAtVersion(2, [renameV1toV2]));

    expect(migrated!.fields).toEqual({ temperature: 25 });
    expect(migrated!.schemaVersion).toBe(2);
  });

  it("enchaîne plusieurs migrations jusqu'à la version cible", () => {
    const profile = makeProfile({
      schemaVersion: 1,
      fields: { temp: 25, legacy: "x" },
    });

    const [migrated] = migrateProfiles(
      [profile],
      standardAtVersion(4, [renameV1toV2, addV2toV3, removeV3toV4]),
    );

    expect(migrated!.schemaVersion).toBe(4);
    expect(migrated!.fields).toEqual({ temperature: 25, humidity: 50 });
  });

  it("applique les migrations dans l'ordre croissant même si la liste est désordonnée", () => {
    const profile = makeProfile({ schemaVersion: 1, fields: { temp: 25 } });

    const [migrated] = migrateProfiles(
      [profile],
      standardAtVersion(3, [addV2toV3, renameV1toV2]),
    );

    expect(migrated!.schemaVersion).toBe(3);
    expect(migrated!.fields).toEqual({ temperature: 25, humidity: 50 });
  });

  it("n'applique JAMAIS deux fois la même migration", () => {
    const profile = makeProfile({ schemaVersion: 1, fields: { temp: 25 } });
    const standard = standardAtVersion(2, [renameV1toV2]);

    const once = migrateProfiles([profile], standard);
    const twice = migrateProfiles(once, standard);

    expect(twice[0]!.fields).toEqual({ temperature: 25 });
    expect(twice[0]!.schemaVersion).toBe(2);
  });

  it("laisse intact un profil déjà à la version cible", () => {
    const profile = makeProfile({ schemaVersion: 2, fields: { temperature: 25 } });
    const [migrated] = migrateProfiles([profile], standardAtVersion(2, [renameV1toV2]));

    expect(migrated).toBe(profile);
  });

  it("laisse intact un profil appartenant à un autre standard", () => {
    const foreign = makeProfile({ standardId: "autre-std", schemaVersion: 1, fields: { temp: 1 } });
    const [migrated] = migrateProfiles([foreign], standardAtVersion(2, [renameV1toV2]));

    expect(migrated).toBe(foreign);
  });

  it("ne mute pas le profil d'origine", () => {
    const profile = makeProfile({ schemaVersion: 1, fields: { temp: 25 } });
    migrateProfiles([profile], standardAtVersion(2, [renameV1toV2]));

    expect(profile.fields).toEqual({ temp: 25 });
    expect(profile.schemaVersion).toBe(1);
  });

  it("n'écrase pas une valeur existante lors d'un add_field", () => {
    const profile = makeProfile({ schemaVersion: 2, fields: { humidity: 90 } });
    const [migrated] = migrateProfiles([profile], standardAtVersion(3, [addV2toV3]));

    expect(migrated!.fields.humidity).toBe(90);
  });

  it("s'arrête sans planter quand la chaîne de migration est trouée", () => {
    // v1 → v2 existe, mais rien pour aller de v2 à v5.
    const profile = makeProfile({ schemaVersion: 1, fields: { temp: 25 } });
    const [migrated] = migrateProfiles([profile], standardAtVersion(5, [renameV1toV2]));

    // Le profil est conservé au niveau atteint plutôt que perdu ou corrompu.
    expect(migrated!.schemaVersion).toBe(2);
    expect(migrated!.fields).toEqual({ temperature: 25 });
  });

  it("ne perd pas un champ absent lors d'un rename", () => {
    const profile = makeProfile({ schemaVersion: 1, fields: { autre: 1 } });
    const [migrated] = migrateProfiles([profile], standardAtVersion(2, [renameV1toV2]));

    expect(migrated!.fields).toEqual({ autre: 1 });
    expect(migrated!.schemaVersion).toBe(2);
  });
});
