/**
 * Augmentation globale de `Window` pour le pont Electron.
 *
 * Le contrat lui-même est défini dans `src/shared/electronBridge.ts` : c'est la
 * source de vérité unique, partagée avec `electron/preloads.ts`. Ce fichier ne
 * fait que l'attacher à `window`.
 *
 * Les deux propriétés sont OPTIONNELLES à dessein : en mode navigateur (dev
 * Vite sans Electron) aucune des deux n'existe. Le typage force donc les
 * appelants à traiter ce cas — utilisez `getElectronBridge()` plutôt que
 * d'accéder directement à `window`.
 */

import type { ElectronBridge } from "./shared/electronBridge";

declare global {
  interface Window {
    /** Nom exposé par le preload actuel. */
    electron?: ElectronBridge;
    /** Alias historique, conservé en repli pour les anciens builds packagés. */
    electronAPI?: ElectronBridge;
  }
}

export {};
