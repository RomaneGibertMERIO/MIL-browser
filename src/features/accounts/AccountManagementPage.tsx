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
import { Icon } from "../../shared/components/ui/Icon";

// UI labels follow docs/UI-UX-SPEC.md §17 Tab 3: the internal `testing` role is
// surfaced as "Write". The stored value stays `testing` (access.json untouched).
const ROLES: { value: UserRole; label: string; help: string }[] = [
  { value: "readonly", label: "Read Only", help: "Can browse and read; can set the repository path." },
  { value: "testing", label: "Write", help: "Can create and push proposals." },
  { value: "admin", label: "Admin", help: "Manages accounts, approves/rejects proposals." },
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
      setError("Account management is unavailable outside the desktop application.");
      setSessions([]);
      return;
    }
    const result = await api.gitListSessions(gitRepoPath);
    if (!result.success) {
      setError(result.error ?? "Unable to load the session list.");
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
        "gitSetRole returned no result.",
      );
      if (!result.success) {
        setError(result.error ?? "Role change rejected.");
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
        <h2 className="text-lg font-semibold text-gray-900">Connected users</h2>
        <p className="text-sm text-gray-500 mt-1">
          All machines that have contacted the central repository. Assign a role to each.
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
            No sessions recorded yet. Machines appear here after their
            first synchronization with the repository.
          </p>
        ) : (
          sessions.map((s) => {
            const isSelf = s.username.trim().toLowerCase() === systemUsername.trim().toLowerCase();
            return (
              <div key={s.username} className="p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {s.username}
                    {isSelf && <span className="ml-2 text-xs font-normal text-blue-600">(you)</span>}
                  </p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    seen on {new Date(s.lastSeen).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5" role="group" aria-label={`Role for ${s.username}`}>
                  {ROLES.map((r) => {
                    const active = s.role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        title={r.help}
                        aria-pressed={active}
                        disabled={savingUser === s.username || active}
                        onClick={() => changeRole(s.username, r.value)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors disabled:cursor-default ${
                          active
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {active && <Icon name="check" size={13} />}
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
        An unlisted or newly connected account is read only by default. Access control is
        enforced by the desktop application based on the Windows session name.
      </p>
    </div>
  );
}
