/**
 * Admin → History tab (docs/UI-UX-SPEC.md §17, Tab 2).
 *
 * Historique COMMUN du dépôt central : qui a soumis / validé / refusé / supprimé
 * quoi, tous postes confondus. Lit le journal d'audit central partagé via l'IPC
 * lecture seule `gitHistory` (et non plus le git local d'une machine), pour que
 * chaque admin voie la même chronologie collaborative.
 */
import { useEffect, useState } from "react";
import { getElectronBridge, type HistoryEvent } from "../../shared/electronBridge";
import { Icon } from "../../shared/components/ui/Icon";
import { EmptyState } from "../../shared/components/ui/EmptyState";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";

/** Présentation sémantique par type d'action (§8 — couleur + libellé + pastille). */
const ACTION_STYLE: Record<HistoryEvent["action"], { dot: string; label: string; badge: string }> = {
  submit: { dot: "bg-orange-500", label: "Submitted", badge: "bg-orange-50 text-orange-700" },
  approve: { dot: "bg-green-500", label: "Approved", badge: "bg-green-50 text-green-700" },
  reject: { dot: "bg-red-500", label: "Rejected", badge: "bg-red-50 text-red-700" },
  delete: { dot: "bg-gray-400", label: "Deleted", badge: "bg-gray-100 text-gray-600" },
};

type Filter = "all" | HistoryEvent["action"];
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "submit", label: "Submitted" },
  { value: "approve", label: "Approved" },
  { value: "reject", label: "Rejected" },
  { value: "delete", label: "Deleted" },
];

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const api = getElectronBridge();
      if (api === null) {
        if (!cancelled) {
          setError("History is unavailable outside the desktop application.");
          setEntries([]);
        }
        return;
      }
      const result = await api.gitHistory();
      if (cancelled) return;
      if (!result.success) {
        setError(result.error ?? "Unable to read the repository history.");
        setEntries([]);
        return;
      }
      setError(null);
      setEntries(result.entries ?? []);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (entries === null) return <LoadingSpinner />;

  if (error !== null) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No shared history yet"
        message="Submissions, approvals, rejections and deletions on the central repository appear here — who did what, and when."
      />
    );
  }

  const shown = filter === "all" ? entries : entries.filter((e) => e.action === filter);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f.value ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No entries for this filter.</p>
      ) : (
        <ol className="relative border-l border-gray-200 pl-6">
          {shown.map((entry, i) => {
            const style = ACTION_STYLE[entry.action];
            return (
              <li key={`${entry.at}-${entry.id}-${i}`} className="mb-5 last:mb-0">
                <span
                  className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-white ${style.dot}`}
                />
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <Icon name="gitCommit" size={14} className="flex-shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                      {entry.entity} · {entry.name}
                    </span>
                    <span
                      className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}
                    >
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    by <b className="text-gray-700">{entry.by}</b>
                  </p>
                  {entry.reason ? (
                    <p className="mt-1 rounded-md border border-red-100 bg-red-50 p-1.5 text-xs text-red-700">
                      {entry.reason}
                    </p>
                  ) : null}
                  <p className="mt-0.5 font-mono text-xs text-gray-400">
                    {entry.at ? new Date(entry.at).toLocaleString() : "—"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
