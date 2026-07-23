import { useState } from "react";
import { useAppStore, type AdminView } from "../store/appStore";
import { useStandards } from "../shared/hooks/useStandards";
import { saveActiveStandard } from "../core/db/repositories/settings.repo";
import { SubmitChangesModal } from "./SubmitChangesModal";

type Role = "admin" | "testing" | "readonly";

// `minRole` : rôle minimal pour voir l'entrée.
// - readonly ne voit que Settings (pour régler le chemin du dépôt).
// - testing voit Library/Standards (créer et pousser) + Settings.
// - admin voit tout, plus Validations et Accounts.
const NAV_ITEMS: { view: AdminView; label: string; icon: string; minRole: Role }[] = [
  { view: "library",     label: "Library Space",     icon: "◧", minRole: "testing" },
  { view: "standards",   label: "Standards Config",  icon: "≡", minRole: "testing" },
  { view: "validations", label: "Admin Validations", icon: "🔧", minRole: "admin" },
  { view: "accounts",    label: "Accounts & Roles",  icon: "👥", minRole: "admin" },
  { view: "settings",    label: "Global Settings",   icon: "⚙", minRole: "readonly" },
];

const ROLE_RANK: Record<Role, number> = { readonly: 0, testing: 1, admin: 2 };

export function Sidebar() {
  const adminView       = useAppStore((s) => s.adminView);
  const activeStdId     = useAppStore((s) => s.activeStandardId);
  const setAdminView    = useAppStore((s) => s.setAdminView);
  const setMode         = useAppStore((s) => s.setMode);
  const setActiveStd    = useAppStore((s) => s.setActiveStandard);

  const localChanges    = useAppStore((s) => s.localStagedChanges);
  const pendingCommits  = useAppStore((s) => s.pendingCommits);
  const role            = useAppStore((s) => s.role);

  // Gating d'affichage uniquement : le refus d'accès réel est appliqué par le
  // processus principal, à partir du compte système (non falsifiable).
  const visibleNavItems = NAV_ITEMS.filter((item) => ROLE_RANK[role] >= ROLE_RANK[item.minRole]);
  const canContribute = ROLE_RANK[role] >= ROLE_RANK.testing;

  const [isSyncOpen, setIsSyncOpen] = useState(false);

  const standards   = useStandards();

  function handleStandardChange(id: string) {
    setActiveStd(id);
    void saveActiveStandard(id);
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

        {/* EXIT BUTTON */}
        <button
          onClick={() => setMode("assistant")}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-700/50 rounded-lg hover:bg-amber-900/40 transition-all"
        >
          <span>◀ Exit Management Mode</span>
        </button>
      </div>

      {/* SUBMIT CHANGES ACTION BUTTON — masqué en lecture seule */}
      {canContribute && (
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
      )}

      {/* STANDARD SELECTOR */}
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

      {/* NAVIGATION TABS */}
      <nav className="px-3 py-2 space-y-1.5 flex-shrink-0">
        {visibleNavItems.map(({ view, label, icon }) => (
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

      {/* spacer to fill height cleanly without taxonomy tree */}
      <div className="flex-1" />

      {/* MODAL CONTROL */}
      {isSyncOpen && <SubmitChangesModal onClose={() => setIsSyncOpen(false)} />}
    </div>
  );
}
