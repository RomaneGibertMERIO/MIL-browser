import { useMemo, useState } from "react";
import { useAppStore, type AdminView } from "../store/appStore";
import { useStandards } from "../shared/hooks/useStandards";
import { useProfilesByStandard } from "../shared/hooks/useProfiles";
import { buildTree } from "../core/engine/treeBuilder";
import { TaxonomyTree } from "../features/browse/TaxonomyTree";
import { saveActiveStandard } from "../core/db/repositories/settings.repo";
import { SubmitChangesModal } from "./SubmitChangesModal";

const NAV_ITEMS: { view: AdminView; label: string; icon: string }[] = [
  { view: "library",   label: "Library Space",   icon: "◧" },
  { view: "standards", label: "Standards Config", icon: "≡" },
  { view: "validations", label: "Admin Validations", icon: "🔧" },
  { view: "settings",  label: "Global Settings",  icon: "⚙" },
];

export function Sidebar() {
  const adminView       = useAppStore((s) => s.adminView);
  const activeStdId     = useAppStore((s) => s.activeStandardId);
  const activeNode      = useAppStore((s) => s.activeNode);
  const setAdminView    = useAppStore((s) => s.setAdminView);
  const setMode         = useAppStore((s) => s.setMode);
  const setActiveStd    = useAppStore((s) => s.setActiveStandard);
  const setActiveNode   = useAppStore((s) => s.setActiveNode);

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
    <div className="flex flex-col h-full bg-slate-900 w-80 flex-shrink-0 text-slate-200 border-r border-slate-800">
      {/* HEADER SECTION */}
      <div className="px-6 py-6 border-b border-slate-800 flex-shrink-0 space-y-4">
        <div>
          <p className="text-base font-black text-white tracking-wider uppercase">
            MIL-Browser
          </p>
          <p className="text-xs text-slate-400">Environmental Testing KB</p>
        </div>

        {/* CLARIFIED EXIT BUTTON AT THE TOP */}
        <button
          onClick={() => setMode("assistant")}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-700/50 rounded-lg hover:bg-amber-900/40 transition-all"
        >
          <span>◀ Exit Management Mode</span>
        </button>
      </div>

      {/* SUBMIT CHANGES ACTION BUTTON - HIGHLY VISIBLE IN THE LIST */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={() => setIsSyncOpen(true)}
          disabled={localChanges.length === 0}
          className="w-full flex items-center justify-center gap-3 px-4 py-3.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-500 disabled:opacity-20 disabled:hover:bg-blue-600 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.98]"
        >
          <span className="text-base">📤</span>
          <span>Push Local Changes ({localChanges.length})</span>
        </button>
      </div>

      {/* STANDARD SELECTOR (LARGER DROPDOWN) */}
      <div className="px-4 py-3 flex-shrink-0">
        <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
          Selected Standard
        </label>
        <select
          value={activeStdId ?? ""}
          onChange={(e) => handleStandardChange(e.target.value)}
          className="w-full px-3 py-3 text-sm bg-slate-800 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="" disabled>
            — Choose active database —
          </option>
          {(standards ?? []).map((s) => (
            <option key={s.manifest.id} value={s.manifest.id}>
              {s.manifest.label}
            </option>
          ))}
        </select>
      </div>

      {/* NAVIGATION TABS (LARGER FONTS & PADDINGS) */}
      <nav className="px-3 py-2 space-y-1.5 flex-shrink-0">
        {NAV_ITEMS.map(({ view, label, icon }) => (
          <button
            key={view}
            onClick={() => setAdminView(view)}
            className={`w-full text-left flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-semibold transition-colors ${
              adminView === view
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-center text-lg">{icon}</span>
              <span>{label}</span>
            </div>

            {view === "validations" && pendingCommits.length > 0 && (
              <span className="bg-amber-500 text-slate-950 text-[11px] px-2 py-0.5 rounded-md font-black shadow-xs">
                {pendingCommits.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* TAXONOMY TREE */}
      {showTree ? (
        <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0 border-t border-slate-800/60 mt-2">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-2 mb-3">
            Taxonomy Structure
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

      {/* MODAL CONTROL */}
      {isSyncOpen && <SubmitChangesModal onClose={() => setIsSyncOpen(false)} />}
    </div>
  );
}
