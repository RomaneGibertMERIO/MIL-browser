import { defineConfig } from "vitest/config";

/**
 * Configuration Vitest, volontairement SÉPARÉE de vite.config.ts.
 *
 * Raison : vite.config.ts est type-vérifié par tsconfig.node.json pendant le
 * build. Y ajouter un bloc `test` imposerait `vitest/config` à la compilation de
 * production. Ce fichier n'est couvert par aucun tsconfig : il ne peut donc pas
 * casser `npm run build`.
 *
 * Les tests vivent dans tests/ (et non dans src/) pour la même raison : `tsc`
 * ne compile que src/, donc aucun fichier de test ne peut faire échouer un build.
 */
export default defineConfig({
  test: {
    // Aucun test n'a besoin du DOM : tout ce qui est couvert ici est du code
    // pur (moteurs, schémas, contrats). Pas de jsdom à installer.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: "default",
  },
});
