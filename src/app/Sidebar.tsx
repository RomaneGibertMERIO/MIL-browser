import { useMemo, useState } from "react";
import { useAppStore, type AdminView } from "../store/appStore";
import { useStandards } from "../shared/hooks/useStandards";
import { useProfilesByStandard } from "../shared/hooks/useProfiles";
import { buildTree } from "../core/engine/treeBuilder";
import { TaxonomyTree } from "../features/browse/TaxonomyTree";
import { saveActiveStandard } from "../core/db/repositories/settings.repo";
import { SubmitChangesModal } from "./SubmitChangesModal";

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------
const NAV_ITEMS: { view: AdminView; label: string; icon: string }[] = [
  { view: "library",   label: "Library",   icon: "◧" },
  { view: "standards", label: "Standards", icon: "≡" },
  { view: "validations", label: "Validations", icon: "🔧" },
  { view: "settings",  label: "Settings",  icon: "⚙" },
];

// ---------------------------------------------------------------------------
// Sidebar Component
// ---------------------------------------------------------------------------
export function Sidebar() {
  const adminView       = useAppStore((s) => s.adminView);
  const activeStdId     = useAppStore((s) => s.activeStandardId);
  const activeNode      = useAppStore((s) => s.activeNode);
  const setAdminView    = useAppStore((s) => s.setAdminView);
  const setMode         = useAppStore((s) => s.setMode);
  const setActiveStd    = useAppStore((s) => s.setActiveStandard);
  const setActiveNode   = useAppStore((s) => s.setActiveNode);

  // Dynamic lists from store for our badges
  const localChanges    = useAppStore((s) => s.localStagedChanges);
  const pendingCommits  = useAppStore((s) => s.pendingCommits);

  const [isSyncOpen, setIsSyncOpen] = useState(false);

  const standards   = useStandards();
  const allProfiles = useProfilesByStandard(activeStdId ?? "");
  const activeStandard = standards?.find((s) => s.manifest.id === activeStdId) ?? null;

  const tree = useMemo(() => {
    if (activeStandard === null) return [];
    return buildTree(activeStandard.nodes, allProfiles ?? []);
  }, [activeStandard, allProfiles]);

  const showTree = adminView === "library" && activeStandard !== null;

  function handleStandardChange(id: string) {
    setActiveStd(id);
    void saveActiveStandard(id);
  }

  function handleNodeSelect(nodeId: string) {
    if (activeStdId === null) return;
    setActiveNode({ standardId: activeStdId, nodeId });
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 w-72 flex-shrink-0 text-slate-300">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800 flex-shrink-0">
        <p className="text-sm font-bold text-white tracking-widest uppercase">
          MIL-Browser
        </p>
        <p className="text-xs text-slate-400 mt-0.5">Environmental Testing KB</p>
        <span className="inline-block mt-2 px-2 py-0.5 text-xs font-semibold text-amber-300 bg-amber-900/50 border border-amber-700 rounded-md tracking-wide">
          ✏ MANAGEMENT
        </span>
      </div>

      {/* Standard selector */}
      <div className="px-4 py-4 border-b border-slate-800 flex-shrink-0">
        <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
          Active Standard
        </label>
        <select
          value={activeStdId ?? ""}
          onChange={(e) => handleStandardChange(e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-slate-800 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="" disabled>
            — Select a standard —
          </option>
          {(standards ?? []).map((s) => (
            <option key={s.manifest.id} value={s.manifest.id}>
              {s.manifest.label}
            </option>
          ))}
        </select>
      </div>

      {/* Nav tabs */}
      <nav className="px-3 py-3 border-b border-slate-800 space-y-1 flex-shrink-0">
        {NAV_ITEMS.map(({ view, label, icon }) => (
          <button
            key={view}
            onClick={() => setAdminView(view)}
            className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              adminView === view
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-5 text-center text-base">{icon}</span>
              <span>{label}</span>
            </div>

            {/* Dynamic visual indicator for pending validations */}
            {view === "validations" && pendingCommits.length > 0 && (
              <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
                {pendingCommits.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Taxonomy tree — shown for browse + library views */}
      {showTree ? (
        <div className="flex-1 overflow-y-auto px-3 py-4 min-h-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-3">
            Taxonomy
          </p>
          <TaxonomyTree
            tree={tree}
            activeNodeId={activeNode?.nodeId ?? null}
            onSelect={handleNodeSelect}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Local Workspace / Sync Actions Section */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Local Workspace</span>
          {localChanges.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {localChanges.length} changes
            </span>
          )}
        </div>

        <button
          onClick={() => setIsSyncOpen(true)}
          disabled={localChanges.length === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <span>Submit Changes to Admin 📤</span>
        </button>
      </div>

      {/* Mode toggle */}
      <div className="px-4 py-4 border-t border-slate-800 flex-shrink-0">
        <button
          onClick={() => setMode("assistant")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <span className="text-base">❖</span>
          <div className="text-left">
            <div className="text-slate-300">Browse Standards</div>
            <div className="text-xs text-slate-500 mt-0.5">Read-only exploration ↗</div>
          </div>
        </button>
      </div>

      {/* Modal handler */}
      {isSyncOpen && <SubmitChangesModal onClose={() => setIsSyncOpen(false)} />}
    </div>
  );
}
