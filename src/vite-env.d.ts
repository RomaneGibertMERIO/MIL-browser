/**
 * Déclarations ambiantes pour les imports non-TypeScript résolus par Vite.
 *
 * Sans ce fichier, `import './index.css'` (src/main.tsx) échoue en TS2307
 * lors de `npm run build` (= `tsc && vite build`), car TypeScript ne sait pas
 * résoudre un module `.css`.
 *
 * On déclare les modules explicitement plutôt que d'utiliser
 * `/// <reference types="vite/client" />` : le résultat est identique pour ce
 * projet (aucun usage de `import.meta.env`) et cela évite toute dépendance à la
 * résolution des types de Vite dans le runner CI.
 */

declare module "*.css";
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
