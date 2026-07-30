/**
 * Synchronization page (Management → Sync). Replaces the old SubmitChangesModal.
 * See docs/UI-UX-SPEC.md §15.3/§16 and docs/WORKFLOW-MODEL.md.
 *
 * Only reachable when ONLINE (a central repo is configured AND reachable — the
 * rail hides this destination otherwise). It lists the local staged changes
 * grouped by entity, lets the user pick which ones to submit for review, and
 * shows what each change will send. `submitCommit` (unchanged) does the push.
 *
 * Q6: an empty central repository is NOT auto-seeded anymore; the user publishes
 * the built-in baseline explicitly, with confirmation, from the banner here.
 */
import { useMemo, useState } from "react";
import { useAppStore, type MockChangeItem } from "../../store/appStore";
import type { StandardPlugin } from "../../core/domain/standard";
import { Icon } from "../../shared/components/ui/Icon";
import { ChangeCard } from "../../shared/components/ChangeCard";
import { ChangeTag } from "../../shared/components/ChangeTag";
import { ChangePanel } from "../../shared/components/ChangePanel";
import { changeStyle } from "../../shared/changeStyle";
import { useStandards } from "../../shared/hooks/useStandards";
import { useConfirm } from "../../shared/components/ui/ConfirmDialog";
import { toast } from "../../shared/toast/toastStore";

type Filter = "all" | "standard" | "profile";

export function SyncPage() {
  const changes = useAppStore((s) => s.localStagedChanges);
  const standards = useStandards();
  const submitCommit = useAppStore((s) => s.submitCommit);
  const centralIsEmpty = useAppStore((s) => s.centralIsEmpty);
  const publishBaselineToCentral = useAppStore((s) => s.publishBaselineToCentral);
  const { confirm, dialog } = useConfirm();

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const filtered = useMemo(
    () => changes.filter((c) => filter === "all" || c.type === filter),
    [changes, filter],
  );
  const groups = useMemo(
    () => ({
      standard: filtered.filter((c) => c.type !== "profile"),
      profile: filtered.filter((c) => c.type === "profile"),
    }),
    [filtered],
  );

  const selected = changes.find((c) => c.id === selectedId) ?? null;
  const checkedCount = checked.size;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll(items: MockChangeItem[]) {
    const ids = items.map((c) => c.id);
    const allOn = ids.length > 0 && ids.every((id) => checked.has(id));
    setChecked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function handleSend() {
    const ids = [...checked].filter((id) => changes.some((c) => c.id === id));
    if (ids.length === 0) return;
    const ok = await confirm({
      title: "Send to admin",
      message: `Submit ${ids.length} change${ids.length !== 1 ? "s" : ""} to the central repository for review?`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await submitCommit("", ids);
      if (res.success) {
        toast.success(`${ids.length} change${ids.length !== 1 ? "s" : ""} submitted for review.`);
        setChecked(new Set());
        setSelectedId(null);
      } else {
        toast.error(res.error ?? "Submission failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    const ok = await confirm({
      title: "Publish built-in baseline",
      message:
        "This central repository is empty. Publish the built-in standards as the shared baseline for the whole team? Everyone connecting will start from this common set.",
      confirmLabel: "Publish",
    });
    if (!ok) return;
    setPublishing(true);
    try {
      const res = await publishBaselineToCentral();
      if (res.success) toast.success("Built-in baseline published to the central repository.");
      else toast.error(res.error ?? "Publishing the baseline failed.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {dialog}

      {/* En-tête + zone d'action (cohérente avec le Save d'Edit) */}
      <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Synchronization</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Review your local changes and submit them to the central repository for review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={checkedCount === 0 || submitting}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="push" size={16} />
          {submitting ? "Sending…" : `Send to admin (${checkedCount})`}
        </button>
      </div>

      {/* Q6 : dépôt vide → publication explicite du socle */}
      {centralIsEmpty && (
        <div className="mx-6 mt-4 flex flex-shrink-0 items-center justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-800">
            This central repository is <b>empty</b>. Publish the built-in standards as the shared
            baseline so your team starts from a common set.
          </p>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishing}
            className="flex-shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {publishing ? "Publishing…" : "Publish baseline"}
          </button>
        </div>
      )}

      {changes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
            Everything is synchronized. No local changes pending.
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Liste groupée + cases à cocher */}
          <div className="flex w-1/2 min-w-[320px] flex-col overflow-hidden border-r border-gray-200">
            <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-gray-100 px-4 py-2">
              {(["all", "standard", "profile"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    filter === f ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {f === "all" ? "All" : f === "standard" ? "Standards" : "Profiles"}
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-400">
                {filtered.length} change{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ChangeGroup
                title="Standards"
                items={groups.standard}
                checked={checked}
                selectedId={selectedId}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onSelect={setSelectedId}
              />
              <ChangeGroup
                title="Profiles"
                items={groups.profile}
                checked={checked}
                selectedId={selectedId}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onSelect={setSelectedId}
              />
            </div>
          </div>

          {/* Détail : ce qui sera envoyé */}
          <div className="min-w-0 flex-1 overflow-y-auto bg-gray-50/40 p-6">
            {selected ? (
              <ChangeDetail change={selected} standards={standards ?? []} />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-gray-400">
                Select a change to inspect what will be sent.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeGroup({
  title,
  items,
  checked,
  selectedId,
  onToggle,
  onToggleAll,
  onSelect,
}: {
  title: string;
  items: MockChangeItem[];
  checked: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onToggleAll: (items: MockChangeItem[]) => void;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const allOn = items.every((c) => checked.has(c.id));
  return (
    <div>
      <div className="sticky top-0 flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <input
          type="checkbox"
          checked={allOn}
          onChange={() => onToggleAll(items)}
          aria-label={`Select all ${title}`}
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</span>
        <span className="text-xs text-gray-300">({items.length})</span>
      </div>
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={`flex w-full items-start gap-2.5 border-b border-gray-100 border-l-4 ${changeStyle(c.action).accent} ${changeStyle(c.action).listBg} px-4 py-2.5 text-left transition-colors ${
            selectedId === c.id ? "ring-2 ring-inset ring-blue-500" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={checked.has(c.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggle(c.id)}
            aria-label={`Select ${c.name}`}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <ChangeTag action={c.action} />
              <span className="truncate text-sm font-medium text-gray-900">{c.name}</span>
            </span>
            <span className="mt-0.5 block truncate font-mono text-xs text-gray-400">{c.location}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ChangeDetail({ change, standards }: { change: MockChangeItem; standards: StandardPlugin[] }) {
  // Panneau teinté + en-tête coloré (action + nom) ; contenu à plat, pleine largeur.
  return (
    <ChangePanel change={change}>
      <ChangeCard change={change} standards={standards} />
    </ChangePanel>
  );
}
