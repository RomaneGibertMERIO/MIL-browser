/**
 * Gestion des comptes et des rôles (réservée aux administrateurs).
 *
 * Liste toutes les sessions ayant contacté le dépôt central (enregistrées à
 * chaque synchronisation, pull inclus) et permet d'attribuer à chacune un rôle :
 * lecture seule, testing ou admin. Le contrôle réel est appliqué par le
 * processus principal ; cette page n'est qu'une façade d'administration.
 */

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../../store/appStore";
import { getElectronBridge, toIpcResult, type SessionInfo, type UserRole } from "../../shared/electronBridge";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";

const ROLES: { value: UserRole; label: string; help: string }[] = [
  { value: "readonly", label: "Lecture seule", help: "Peut seulement régler le chemin du dépôt." },
  { value: "testing", label: "Testing team", help: "Peut créer et pousser des propositions." },
  { value: "admin", label: "Admin", help: "Gère les comptes, valide/refuse les propositions." },
];

export function AccountManagementPage() {
  const gitRepoPath = useAppStore((s) => s.gitRepoPath);
  const systemUsername = useAppStore((s) => s.systemUsername);

  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = getElectronBridge();
    if (api === null) {
      setError("Gestion des comptes indisponible hors de l'application de bureau.");
      setSessions([]);
      return;
    }
    const result = await api.gitListSessions(gitRepoPath);
    if (!result.success) {
      setError(result.error ?? "Impossible de charger la liste des sessions.");
      setSessions([]);
      return;
    }
    setError(null);
    setSessions(result.sessions ?? []);
  }, [gitRepoPath]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(username: string, role: UserRole) {
    const api = getElectronBridge();
    if (api === null) return;

    setSavingUser(username);
    try {
      const result = toIpcResult(
        await api.gitSetRole({ repoPath: gitRepoPath, username, role }),
        "gitSetRole n'a renvoyé aucun résultat.",
      );
      if (!result.success) {
        setError(result.error ?? "Changement de rôle refusé.");
        return;
      }
      setError(null);
      await load();
    } finally {
      setSavingUser(null);
    }
  }

  if (sessions === null) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Comptes &amp; rôles</h2>
        <p className="text-sm text-gray-500 mt-1">
          Tous les postes ayant contacté le dépôt central. Attribuez un rôle à chacun.
        </p>
      </div>

      {error !== null && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {sessions.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">
            Aucune session enregistrée pour l'instant. Les postes apparaissent ici après leur
            première synchronisation avec le dépôt.
          </p>
        ) : (
          sessions.map((s) => {
            const isSelf = s.username.trim().toLowerCase() === systemUsername.trim().toLowerCase();
            return (
              <div key={s.username} className="p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {s.username}
                    {isSelf && <span className="ml-2 text-xs font-normal text-blue-600">(vous)</span>}
                  </p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    vu le {new Date(s.lastSeen).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5" role="group" aria-label={`Rôle de ${s.username}`}>
                  {ROLES.map((r) => {
                    const active = s.role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        title={r.help}
                        disabled={savingUser === s.username || active}
                        onClick={() => changeRole(s.username, r.value)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:cursor-default ${
                          active
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {active ? "☑ " : "☐ "}
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-gray-400">
        Un compte non listé ou nouvellement connecté est en lecture seule par défaut. Le contrôle
        d'accès est appliqué par l'application de bureau à partir du nom de session Windows.
      </p>
    </div>
  );
}
