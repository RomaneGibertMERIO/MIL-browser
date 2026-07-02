/**
 * Migration engine.
 *
 * Upgrades stored Profile records when a StandardPlugin's profileSchema.version
 * increments. Migrations are declarative transformations defined inside the
 * standard plugin JSON itself, so no code changes are needed when a standard
 * evolves its schema.
 *
 * Design decisions:
 * - Migrations are applied in ascending order of toVersion.
 * - Each migration is applied only if the profile's schemaVersion equals
 *   the migration's fromVersion. This prevents double-application.
 * - After all applicable migrations, the profile's schemaVersion is set to
 *   the standard's current profileSchema.version.
 * - If the final schemaVersion still does not match (gap in migration chain),
 *   a warning is logged but the profile is still saved with the highest
 *   version reached. This is intentional: a broken migration should not
 *   prevent the app from loading.
 * - This module has no database calls — it receives profiles and returns
 *   upgraded profiles. The caller (standardLoader.ts) handles persistence.
 */

import type { Profile } from "../domain/profile";
import type { SchemaMigration, StandardPlugin } from "../domain/standard";

// ---------------------------------------------------------------------------
// migrateProfiles
// ---------------------------------------------------------------------------

/**
 * Upgrades an array of profiles to the current schema version of the given
 * standard plugin. Returns a new array — the originals are not mutated.
 *
 * Profiles already at the current version are returned unchanged.
 */
export function migrateProfiles(
  profiles: Profile[],
  standard: StandardPlugin,
): Profile[] {
  const targetVersion = standard.profileSchema.version;
  const migrations = [...standard.migrations].sort(
    (a, b) => a.toVersion - b.toVersion,
  );

  return profiles.map((profile) => {
    if (profile.standardId !== standard.manifest.id) return profile;
    if (profile.schemaVersion >= targetVersion) return profile;

    return applyMigrationsToProfile(profile, migrations, targetVersion);
  });
}

// ---------------------------------------------------------------------------
// applyMigrationsToProfile
// ---------------------------------------------------------------------------

/**
 * Applies a sorted list of migrations to a single profile until it reaches
 * the target version. Returns a new profile object — never mutates in place.
 */
function applyMigrationsToProfile(
  profile: Profile,
  migrations: SchemaMigration[],
  targetVersion: number,
): Profile {
  let current = profile;

  for (const migration of migrations) {
    if (current.schemaVersion !== migration.fromVersion) continue;

    current = applyOneMigration(current, migration);
  }

  if (current.schemaVersion < targetVersion) {
    console.warn(
      `[migrationEngine] Profile "${current.id}" reached schemaVersion ` +
        `${current.schemaVersion} but target is ${targetVersion}. ` +
        `Check migration chain for standard "${current.standardId}".`,
    );
  }

  return current;
}

// ---------------------------------------------------------------------------
// applyOneMigration
// ---------------------------------------------------------------------------

/**
 * Applies a single migration step to a profile and increments its
 * schemaVersion. Returns a new profile — never mutates.
 */
function applyOneMigration(profile: Profile, migration: SchemaMigration): Profile {
  const fields = { ...profile.fields };

  switch (migration.type) {
    case "rename_field": {
      if (migration.from in fields) {
        fields[migration.to] = fields[migration.from];
        delete fields[migration.from];
      }
      break;
    }

    case "remove_field": {
      delete fields[migration.key];
      break;
    }

    case "add_field": {
      if (!(migration.key in fields)) {
        fields[migration.key] = migration.defaultValue;
      }
      break;
    }
  }

  return {
    ...profile,
    fields,
    schemaVersion: migration.toVersion,
    updatedAt: new Date().toISOString(),
  };
}
