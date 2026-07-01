/**
 * Barrel export for the entire core/domain layer.
 *
 * All domain types and Zod schemas are re-exported from this single entry
 * point so that consumers only need one import path for domain types.
 * The only exception is when a consuming module needs to import just the
 * Zod schema itself (e.g. for .parse()); in that case it imports directly
 * from the relevant file to keep tree-shaking optimal.
 */

export * from "./standard";
export * from "./profile";
export * from "./sync";
export * from "./tree";
