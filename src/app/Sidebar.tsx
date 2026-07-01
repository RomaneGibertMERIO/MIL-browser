/**
 * Admin sidebar.
 *
 * Left navigation panel for admin mode. Shows:
 *   - Top navigation tabs: Browse / Library / Standards / Settings
 *   - Browse + Library: shows the TaxonomyTree for the active standard
 *   - Standard selector dropdown
 *   - Mode toggle to switch back to the assistant
 *
 * All state reads and writes go through the Zustand appStore.
 * The sidebar never interacts with IndexedDB directly.
 */

import { useMemo } from "react";
import { useAppStore, type AdminView } from "../../store/appStore";
import { useStandards } from "../../shared/hooks/useStandards";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { buildTree } from "../../core/engine/treeBuilder";
import { TaxonomyTree } from "../../features/browse/TaxonomyTree";
import { saveActiveStandard } from "../../core/db/repositories/settings.repo";

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS: { view: AdminView; label: string; icon: string }[] = [
  { view: "browse",    label: "Browse",    icon: "⊞" },
  { view: "library",  label: "Library",   icon: "◧" },
  { view: "standards", label: "Standards", icon: "≡" },
  { view: "settings",  label: "Settings",  icon: "⚙" },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const adminView       = useAppStore((s) => s.adminView);
  const activeStdId     = useAppStore((s) => s.activeStandardId);
  const activeNode      = useAppStore((s) => s.activeNode);
  const setAdminView    = useAppStore((s) => s.setAdminView);
  const setMode         = useAppStore((s) => s.setMode);
  const setActiveStd    = useAppStore((s) => s.setActiveStandard);
  const setActiveNode   = useAppStore((s) => s.setActiveNode);

  const standards  = useStandards();
  const allProfiles = useProfilesByStandard(activeStdId ?? "");
  const activeStandard = standards?.find((s) => s.manifest.id === activeStdId) ?? null;

  const tree = useMemo(() => {
    if (activeStandard === null) return [];
    return buildTree(activeStandard.nodes, allProfiles ?? []);
  }, [activeStandard, allProfiles]);

  const showTree =
    (adminView === "browse" || adminView === "library") &&
    activeStandard !== null;

  function handleStandardChange(id: string) {
    setActiveStd(id);
    void saveActiveStandard(id);
  }

  function handleNodeSelect(nodeId: string) {
    if (activeStdId === null) return;
    setActiveNode({ standardId: activeStdId, nodeId });
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 w-56 flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-800">
        <p className="text-xs font-bold text-slate-300 tracking-widest uppercase">
          MIL-Browser
        </p>
        <p className="text-xs text-slate-500 mt-0.5">Env. Testing KB</p>
      </div>

      {/* Standard selector */}
      <div className="px-3 py-3 border-b border-slate-800">
        <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wide">
          Standard
        </label>
        <select
          value={activeStdId ?? ""}
          onChange={(e) => handleStandardChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="" disabled>
            — Select —
          </option>
          {(standards ?? []).map((s) => (
            <option key={s.manifest.id} value={s.manifest.id}>
              {s.manifest.label}
            </option>
          ))}
        </select>
      </div>

      {/* Nav tabs */}
      <nav className="px-2 py-2 border-b border-slate-800">
        {NAV_ITEMS.map(({ view, label, icon }) => (
          <button
            key={view}
            onClick={() => setAdminView(view)}
            className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
              adminView === view
                ? "bg-blue-600 text-white font-medium"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <span className="w-4 text-center">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* Taxonomy tree — shown for browse + library views */}
      {showTree && (
        <div className="flex-1 overflow-y-auto px-2 py-3 min-h-0">
          <p className="text-xs text-slate-500 uppercase tracking-wider px-1 mb-2">
            Taxonomy
          </p>
          <TaxonomyTree
            tree={tree}
            activeNodeId={activeNode?.nodeId ?? null}
            onSelect={handleNodeSelect}
          />
        </div>
      )}

      {!showTree && <div className="flex-1" />}

      {/* Mode toggle */}
      <div className="px-3 py-3 border-t border-slate-800">
        <button
          onClick={() => setMode("assistant")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <span className="w-4 text-center">◈</span>
          Assistant Mode
        </button>
      </div>
    </div>
  );
}
