/**
 * Admin → History tab (docs/UI-UX-SPEC.md §17, Tab 2).
 *
 * A read-only, time-ordered timeline of validated changes. Progressive by
 * design: a linear list built from the store's `approvedHistory` now; a full
 * Git commit graph (via a read-only git:log IPC) is future work (§26). No Git
 * logic is modified here — this only reads state the app already maintains.
 */
import { useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import { Icon } from "../../shared/components/ui/Icon";
import { EmptyState } from "../../shared/components/ui/EmptyState";

export function HistoryPage() {
  const history = useAppStore((s) => s.approvedHistory);

  const sorted = useMemo(
    () => [...history].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [history],
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No history yet"
        message="Approved submissions appear here as a time-ordered history of what changed, when, and by whom."
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="relative border-l border-gray-200 pl-6">
        {sorted.map((h) => (
          <li key={h.id} className="mb-5 last:mb-0">
            <span className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full bg-green-500 ring-4 ring-white" />
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <Icon name="gitCommit" size={14} className="flex-shrink-0 text-gray-400" />
                <span className="truncate text-sm font-semibold text-gray-900">{h.name}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Approved by <b className="text-gray-700">{h.approvedBy}</b>
                {h.author ? (
                  <>
                    {" "}· authored by <b className="text-gray-700">{h.author}</b>
                  </>
                ) : null}
              </p>
              {h.date ? <p className="mt-0.5 font-mono text-xs text-gray-400">{h.date}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
