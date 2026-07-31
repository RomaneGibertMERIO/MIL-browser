/**
 * AppFrame — the shell every top-level page sits in (Browser and Management).
 * Guarantees the two pieces of global chrome required on ALL pages
 * (docs/UI-UX-SPEC.md §4): the brand (logo + name) is rendered by pages in
 * their top-left toolbar via <Brand/>, and a persistent footer (app version +
 * credits) is provided here.
 */

import type { ReactNode } from "react";
import { useAppStore } from "../../store/appStore";
import { UserGuideModal } from "./UserGuideModal";

export function AppFrame({ children }: { children: ReactNode }) {
  // Manuel utilisateur : rendu ICI (coquille commune au Browser et au Management)
  // pour être ouvrable partout depuis le menu natif Help → User Guide, et se
  // fermer en revenant exactement là où l'utilisateur était.
  const helpOpen = useAppStore((s) => s.helpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      <AppFooter />
      {helpOpen && <UserGuideModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function AppFooter() {
  return (
    <footer className="flex-shrink-0 h-6 bg-white border-t border-gray-200 px-4 flex items-center justify-between text-[11px] text-gray-400 select-none">
      <span className="font-mono">MIL-Browser v{__APP_VERSION__}</span>
      <span>THEON · Environmental Testing Knowledge Base</span>
    </footer>
  );
}

/** Brand mark + name, used top-left in every page toolbar. */
export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <img src="./favicon.svg" alt="" className="w-5 h-5 flex-shrink-0" />
      <span className="flex items-baseline gap-2 min-w-0">
        <span className="font-bold text-gray-900 tracking-tight">MIL-Browser</span>
        {subtitle && <span className="text-xs text-gray-400 truncate">{subtitle}</span>}
      </span>
    </div>
  );
}
