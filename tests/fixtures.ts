/**
 * Fabriques d'objets de domaine valides pour les tests.
 *
 * Chaque fabrique produit le MINIMUM valide au regard des schémas Zod, et
 * accepte un patch partiel. Les tests n'expriment ainsi que ce qui les
 * intéresse, et un ajout de champ obligatoire au domaine ne casse qu'ici.
 *
 * Ce fichier n'est pas un test (vitest n'inclut que `tests/**\/*.test.ts`).
 */

import type {
  ColumnDefinition,
  FieldDefinition,
  ProfileDefinition,
  StandardNode,
  StandardPlugin,
} from "../src/core/domain/standard";
import type { Profile } from "../src/core/domain/profile";

export const ISO_NOW = "2026-01-01T00:00:00.000Z";

export function makeField(patch: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    key: "temperature",
    label: "Temperature",
    group: "conditions",
    type: "number",
    required: false,
    validation: [],
    ...patch,
  } as FieldDefinition;
}

export function makeColumn(patch: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    key: "temp_c",
    label: "Temperature",
    unit: "°C",
    type: "number",
    axis: "left",
    color: null,
    required: false,
    ...patch,
  } as ColumnDefinition;
}

export function makeProfileSchema(patch: Partial<ProfileDefinition> = {}): ProfileDefinition {
  return {
    version: 1,
    fields: [],
    datasetColumns: [],
    ...patch,
  };
}

export function makeNode(patch: Partial<StandardNode> = {}): StandardNode {
  return {
    id: "node-1",
    parentId: null,
    standardId: "std-1",
    type: "method",
    code: "507",
    label: "Humidity",
    order: 10,
    tags: [],
    metadata: {},
    ...patch,
  } as StandardNode;
}

export function makeStandard(patch: Partial<StandardPlugin> = {}): StandardPlugin {
  return {
    manifest: {
      id: "std-1",
      version: "1.0.0",
      schemaVersion: 1,
      organization: "MIL",
      label: "Test Standard",
      description: "",
      isBuiltin: true,
    },
    nodes: [makeNode()],
    profileSchema: makeProfileSchema(),
    migrations: [],
    ...patch,
  } as StandardPlugin;
}

export function makeProfile(patch: Partial<Profile> = {}): Profile {
  return {
    id: "profile-1",
    nodeId: "node-1",
    standardId: "std-1",
    schemaVersion: 1,
    name: "Test profile",
    description: "",
    source: "user",
    status: "local",
    author: "tester",
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW,
    fields: {},
    dataset: [],
    ...patch,
  } as Profile;
}
