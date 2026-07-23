import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Version lue depuis package.json au moment du build et injectée dans le bundle
// via `define`. C'est la source de vérité unique : bumper package.json met à
// jour l'affichage dans l'app ET le nom de l'installeur electron-builder.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
  },
  base: "./",
  publicDir: "public",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    sourcemap: true,
  },
});
