/**
 * Admin → History tab (docs/UI-UX-SPEC.md §17, Tab 2).
 *
 * A read-only, time-ordered timeline of the local Git history that `gitService`
 * already writes on submit/approve. Data comes from the additive, read-only
 * `git:log` IPC — no Git logic is modified here. This is the "linear commit
 * list" the spec sanctions as the progressive first step before a full commit
 * graph (§26).
 */
import { useEffect, useState } from "react";
import { getElectronBridge, type GitLogEntry } from "../../shared/electronBridge";
import { Icon } from "../../shared/components/ui/Icon";
import { EmptyState } from "../../shared/components/ui/EmptyState";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";

/** Semantic presentation per commit kind (§8 — status is color + label + dot). */
const KIND_STYLE: Record<GitLogEntry["kind"], { dot: string; label: string; badge: string }> = {
  approval: { dot: "bg-green-500", label: "Approved", badge: "bg-green-50 text-green-700" },
  proposal: { dot: "bg-orange-500", label: "Submitted", badge: "bg-orange-50 text-orange-700" },
  other: { dot: "bg-gray-400", label: "Change", badge: "bg-gray-100 text-gray-600" },
};

/** "Proposal: …" / "Approval: …" — the kind is shown as a badge, so drop the prefix. */
function cleanMessage(message: string): string {
  return message.replace(/^(Proposal|Approval):\s*/, "").trim();
}

export function HistoryPage() {
  const [entries, setEntries] = useState<GitLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const result = await api.gitLog();
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
        title="No history yet"
        message="Submitted and approved changes appear here as a time-ordered history of what changed, when, and by whom."
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="relative border-l border-gray-200 pl-6">
        {entries.map((entry) => {
          const style = KIND_STYLE[entry.kind];
          return (
            <li key={entry.oid} className="mb-5 last:mb-0">
              <span
                className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-white ${style.dot}`}
              />
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Icon name="gitCommit" size={14} className="flex-shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                    {cleanMessage(entry.message)}
                  </span>
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  by <b className="text-gray-700">{entry.author}</b>
                </p>
                <p className="mt-0.5 font-mono text-xs text-gray-400">
                  {new Date(entry.timestamp * 1000).toLocaleString()}
                  <span className="ml-2 text-gray-300">{entry.oid.slice(0, 7)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
