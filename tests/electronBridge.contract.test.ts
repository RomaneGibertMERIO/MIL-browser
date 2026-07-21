/**
 * Test de contrat du pont Electron.
 *
 * Ce test existe à cause d'une classe de bugs qui a réellement coûté cher :
 * le renderer, le preload et le main process définissaient chacun leur version
 * du contrat, sans que rien ne les compare.
 *
 *   - le preload exposait `window.electron`, les types déclaraient
 *     `window.electronAPI` → tous les appels compilaient et valaient
 *     `undefined` à l'exécution ;
 *   - les handlers IPC `git:reject-*` existaient dans main.ts, mais les
 *     méthodes correspondantes manquaient dans le preload → rejeter une
 *     proposition ne faisait rien, silencieusement.
 *
 * TypeScript ne peut pas attraper ça : les trois fichiers ne partagent aucun
 * type au niveau du canal IPC (une string). On compare donc les sources.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const bridgeSource = read("src/shared/electronBridge.ts");
const preloadSource = read("electron/preloads.ts");
const mainSource = read("electron/main.ts");

/** Méthodes déclarées par l'interface ElectronBridge (contrat de référence). */
function declaredBridgeMethods(): string[] {
  const body = /export interface ElectronBridge \{([\s\S]*?)\n\}/.exec(bridgeSource);
  expect(body, "interface ElectronBridge introuvable").not.toBeNull();
  return [...body![1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
}

/** Méthodes réellement exposées par le preload. */
function preloadMethods(): string[] {
  const body = /const bridge = \{([\s\S]*?)\n\};/.exec(preloadSource);
  expect(body, "objet `bridge` introuvable dans preloads.ts").not.toBeNull();
  return [...body![1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
}

/** Canaux IPC invoqués par le preload. */
function invokedChannels(): string[] {
  return [...preloadSource.matchAll(/ipcRenderer\.invoke\(\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Canaux IPC effectivement traités par le main process. */
function handledChannels(): string[] {
  return [...mainSource.matchAll(/ipcMain\.handle\(\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("contrat du pont Electron", () => {
  it("expose dans le preload exactement les méthodes déclarées par ElectronBridge", () => {
    const declared = declaredBridgeMethods();
    const exposed = preloadMethods();

    expect(declared.length).toBeGreaterThan(0);
    expect([...exposed].sort()).toEqual([...declared].sort());
  });

  it("n'invoque que des canaux IPC réellement traités par le main process", () => {
    const handled = handledChannels();
    const orphans = invokedChannels().filter((channel) => !handled.includes(channel));

    expect(orphans, `canaux invoqués sans handler : ${orphans.join(", ")}`).toEqual([]);
  });

  it("ne laisse aucun handler IPC inaccessible depuis le renderer", () => {
    const invoked = invokedChannels();
    const unreachable = handledChannels().filter((channel) => !invoked.includes(channel));

    expect(
      unreachable,
      `handlers définis mais jamais atteignables : ${unreachable.join(", ")}`,
    ).toEqual([]);
  });

  it("expose le pont sous les deux noms attendus par le renderer", () => {
    // getElectronBridge() lit window.electron puis window.electronAPI :
    // les deux doivent exister, sinon on retombe sur le bug d'origine.
    expect(preloadSource).toContain('exposeInMainWorld("electron"');
    expect(preloadSource).toContain('exposeInMainWorld("electronAPI"');
  });

  it("importe dans main.ts toutes les fonctions gitService qu'il utilise", () => {
    // Régression directe : `rejectProfileInGit` / `rejectStandardInGit` étaient
    // appelées sans être importées → TS2304, build CI cassé.
    // `[^}]*` et non `[\s\S]*?` : sinon la correspondance démarre sur le premier
    // `import {` du fichier (celui d'electron) et absorbe tout jusqu'à
    // gitService, ce qui fausse la liste des symboles importés.
    const importBlock = /import \{([^}]*)\} from "\.\/gitService";/.exec(mainSource);
    expect(importBlock, "import de ./gitService introuvable").not.toBeNull();

    const imported = importBlock![1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const body = mainSource.slice(importBlock!.index! + importBlock![0].length);
    const usedGitFunctions = [
      ...body.matchAll(/\b(initOrCloneRepository|pullRepository|submit\w+ToGit|approve\w+InGit|reject\w+InGit)\b/g),
    ].map((m) => m[1]);

    const missing = [...new Set(usedGitFunctions)].filter((fn) => !imported.includes(fn));

    expect(missing, `fonctions utilisées mais non importées : ${missing.join(", ")}`).toEqual([]);
  });
});
