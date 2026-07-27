import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore, type AdminView } from './store/appStore';
import { useBootstrapStore } from './store/bootstrapStore';
import { useBootstrap } from './shared/hooks/useBootstrap';
import { AccountManagementPage } from './features/accounts/AccountManagementPage';
import { HistoryPage } from './features/accounts/HistoryPage';
import { AppFrame, Brand } from './shared/components/AppFrame';
import { Icon, type IconName } from './shared/components/ui/Icon';
import { RepoBadge, RoleBadge } from './shared/components/ui/RepoBadge';
import { stripHeavyJson } from './shared/previewSafe';
import { canAccess, canAccessNow, roleLabel } from './shared/roles';
import { AssistantPage } from './features/assistant/AssistantPage';
import { HomePage } from './features/home/HomePage';
import { EditProfilesPage } from './features/edit/EditProfilesPage';
import { EditTaxonomyPage } from './features/edit/EditTaxonomyPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { Sidebar } from './app/Sidebar';
import { SyncPage } from './features/sync/SyncPage';
import { toast } from './shared/toast/toastStore';
import { LoadingSpinner } from './shared/components/ui/LoadingSpinner';
import { ErrorBanner } from './shared/components/ui/ErrorBanner';



export default function App() {
  useBootstrap();

  const ready = useBootstrapStore((s) => s.ready);
  const error = useBootstrapStore((s) => s.error);
  const mode  = useAppStore((s) => s.mode);

  if (error !== null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorBanner message={error} />
        </div>
      </div>
    );
  }

  if (!ready) return <LoadingSpinner />;

  if (mode === 'assistant') return <AssistantPage />;

  return <AdminLayout />;
}

function AdminLayout() {
  const adminView   = useAppStore((s) => s.adminView);
  const setAdminView = useAppStore((s) => s.setAdminView);
  const syncError = useAppStore((s) => s.syncError);
  const setSyncError = useAppStore((s) => s.setSyncError);
  const repoMode = useAppStore((s) => s.repoMode);
  const isOffline = useAppStore((s) => s.isOffline);
  const role = useAppStore((s) => s.role);

  // Si la vue courante devient inaccessible (passage hors-ligne / autonome, ou
  // rôle abaissé par une synchro), on retombe sur Home : sinon on afficherait
  // Sync/Admin alors que leur entrée de rail a disparu.
  const online = repoMode === "shared" && !isOffline;
  useEffect(() => {
    if (!canAccessNow(adminView, role, online)) setAdminView("home");
  }, [adminView, role, online, setAdminView]);

  // Le nom d'utilisateur OS est désormais résolu une seule fois, dans
  // useBootstrap. L'effet qui vivait ici testait `window.electronAPI` alors que
  // le preload exposait `window.electron` : il retombait donc toujours sur
  // "Browser-Session" et écrasait la valeur correcte.

  return (
    <AppFrame>
    <div className="flex h-full overflow-hidden bg-gray-50">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex-shrink-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
          <Brand />
          <span className="text-gray-200 select-none">/</span>
          <span className="text-sm font-semibold text-gray-900">{VIEW_TITLES[adminView]}</span>
          <div className="ml-auto flex items-center gap-2">
            {repoMode === 'shared' && <RoleBadge />}
            <RepoBadge />
          </div>
        </header>

        {syncError !== null && (
          <div className="flex-shrink-0 px-6 pt-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex-1 text-xs font-semibold text-red-700">{syncError}</div>
              <button
                type="button"
                onClick={() => setSyncError(null)}
                aria-label="Dismiss synchronization error"
                className="text-red-400 hover:text-red-600 leading-none"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-hidden">
          <ContentPane adminView={adminView} />
        </main>
      </div>
    </div>
    </AppFrame>
  );
}

const VIEW_TITLES: Record<AdminView, string> = {
  home: 'Home',
  edit: 'Edit database',
  sync: 'Synchronization',
  settings: 'Settings',
  admin: 'Admin',
};

interface ContentPaneProps {
  adminView: AdminView;
}

function ContentPane({ adminView }: ContentPaneProps) {
  const role = useAppStore((s) => s.role);
  const repoMode = useAppStore((s) => s.repoMode);
  const isOffline = useAppStore((s) => s.isOffline);
  const online = repoMode === "shared" && !isOffline;

  // Second verrou d'affichage (le premier étant le filtrage du rail). Le
  // contrôle réel des écritures reste appliqué par le processus principal.
  if (!canAccessNow(adminView, role, online)) {
    const roleOk = canAccess(adminView, role);
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center px-6">
        {roleOk ? (
          <span>
            This section is only available when connected to the central repository.<br />
            You are currently {repoMode === "local" ? "in standalone mode" : "offline"}.
          </span>
        ) : (
          <span>
            This section requires a higher role.<br />
            Your current role is "{roleLabel(role)}". Contact an administrator to request more permissions.
          </span>
        )}
      </div>
    );
  }

  switch (adminView) {
    case 'home':
      return <div className="h-full overflow-y-auto px-6 py-6"><HomePage /></div>;
    case 'edit':
      return <EditSection />;
    case 'sync':
      return <SyncSection />;
    case 'settings':
      return <div className="h-full overflow-y-auto px-6 py-6"><SettingsPage /></div>;
    case 'admin':
      return <AdminSection />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Sections interim — la coquille (phase 3) route vers les écrans existants.
// Les phases 4/5/6 remplaceront le contenu de ces sections (Miller éditable,
// DiffView, onglets Admin) sans toucher au rail ni au gate.
// ---------------------------------------------------------------------------

/**
 * Edit : bascule engrenage entre le mode Profils (EditProfilesPage) et le mode
 * Taxonomie (EditTaxonomyPage), tous deux en Miller éditable. La norme active
 * est choisie dans la 1re colonne du Miller (partagée par les deux modes).
 */
function EditSection() {
  const [tab, setTab] = useState<'profiles' | 'taxonomy'>('profiles');

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-white">
        <SubTab active={tab === 'profiles'} onClick={() => setTab('profiles')} icon="edit" label="Profiles" />
        <SubTab active={tab === 'taxonomy'} onClick={() => setTab('taxonomy')} icon="settings" label="Taxonomy" />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'taxonomy' ? <EditTaxonomyPage /> : <EditProfilesPage />}
      </div>
    </div>
  );
}

/** Sync : la page Synchronisation (features/sync/SyncPage). N'est routée que
 *  lorsqu'on est en ligne (le rail masque Sync en autonome/hors-ligne). */
function SyncSection() {
  return <SyncPage />;
}

/** Admin : revue (AdminValidationsPage) + comptes (AccountManagementPage). */
function AdminSection() {
  const [tab, setTab] = useState<'review' | 'history' | 'users'>('review');
  const pendingCommits = useAppStore((s) => s.pendingCommits);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-white">
        <SubTab active={tab === 'review'} onClick={() => setTab('review')} icon="review" label="Review" badge={pendingCommits.length || undefined} />
        <SubTab active={tab === 'history'} onClick={() => setTab('history')} icon="gitBranch" label="History" />
        <SubTab active={tab === 'users'} onClick={() => setTab('users')} icon="users" label="Users" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {tab === 'review' ? <AdminValidationsPage /> : tab === 'history' ? <HistoryPage /> : <AccountManagementPage />}
      </div>
    </div>
  );
}

function SubTab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
      {badge ? (
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">{badge}</span>
      ) : null}
    </button>
  );
}

export function AdminValidationsPage() {
  const pendingCommits = useAppStore((s) => s.pendingCommits);
  const approvedHistory = useAppStore((s) => s.approvedHistory);
  const resolveSingleChange = useAppStore((s) => s.resolveSingleChange);

  // État de sélection non figé : `pendingCommits` est rempli de façon
  // asynchrone par triggerGitSync, donc un useState initialisé au montage
  // restait bloqué sur `null`. On retombe sur le premier commit disponible.
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  // Cible du refus en cours. Remplace window.prompt(), qu'Electron interdit
  // ("prompt() is and will not be supported") : on affiche une vraie modale.
  const [rejectTarget, setRejectTarget] = useState<
    { commitId: string; changeId: string; name: string } | null
  >(null);

  const activeCommit =
    pendingCommits.find((c) => c.id === selectedCommitId) ?? pendingCommits[0];

  // On attend le résultat réel avant d'annoncer quoi que ce soit : auparavant,
  // l'alerte de succès s'affichait même quand l'opération Git avait échoué.
  const handleApproveChange = async (commitId: string, changeId: string, name: string) => {
    const result = await resolveSingleChange(commitId, changeId, 'approve');
    if (result.success) {
      toast.success(`"${name}" has been approved and marked as Official.`);
    }
    // En cas d'échec, le message détaillé est déjà affiché par la bannière
    // syncError d'AdminLayout, et la proposition reste dans la file.
  };

  const confirmReject = async (reason: string) => {
    if (rejectTarget === null) return;
    const { commitId, changeId, name } = rejectTarget;
    setRejectTarget(null);

    const result = await resolveSingleChange(commitId, changeId, 'reject', reason);
    if (result.success) {
      toast.success(`"${name}" has been rejected. Its author will be notified on next sync.`);
    }
  };

  const renderDynamicFields = (data: Record<string, any>) => {
    if (!data || typeof data !== 'object') return null;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Object.entries(data).map(([key, value]) => {
          if (key === 'dataset' || key === 'id' || key === 'standardId' || key === 'nodeId') return null;

          let displayValue = "";
          if (value === null || value === undefined) displayValue = "—";
          else if (typeof value === "object") displayValue = stripHeavyJson(value);
          else if (key === "imageData" && typeof value === "string") displayValue = `[image — ${value.length} characters]`;
          else displayValue = String(value);

          return (
            <div key={key} className="p-4 bg-gray-50 border border-gray-150 rounded-lg flex flex-col gap-1.5">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{key}</span>
              <span className="text-base font-semibold text-gray-800 break-words">{displayValue}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDynamicDataset = (dataset: Array<Record<string, any>>) => {
    if (!dataset || dataset.length === 0) return null;
    const headers = Object.keys(dataset[0]);

    return (
      <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs font-bold uppercase border-b border-gray-200">
                {headers.map((h) => (
                  <th key={h} className="p-4 select-none">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm font-medium text-gray-700">
              {dataset.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  {headers.map((h) => (
                    <td key={h} className="p-4 font-mono text-gray-900">
                      {row[h] !== null && row[h] !== undefined ? String(row[h]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDynamicDiff = (original: Record<string, any>, proposed: Record<string, any>) => {
    const allKeys = Array.from(new Set([...Object.keys(original), ...Object.keys(proposed)]))
      .filter((k) => k !== 'dataset' && k !== 'id' && k !== 'standardId' && k !== 'nodeId');

    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-200 shadow-xs">
        <div className="grid grid-cols-3 bg-gray-100 font-bold text-xs text-gray-600 uppercase p-4">
          <div>Property</div>
          <div>Original Value</div>
          <div>Proposed Value</div>
        </div>
        {allKeys.map((key) => {
          const origVal = original[key];
          const propVal = proposed[key];

          // Comparaison sur la version allégée : diffuser deux chaînes base64 de
          // plusieurs Mo via JSON.stringify gèle l'interface. Conséquence
          // acceptée : un changement portant UNIQUEMENT sur une image n'est pas
          // détaillé dans le diff (il reste visible via l'aperçu du nœud).
          const origStr = stripHeavyJson(origVal);
          const propStr = stripHeavyJson(propVal);
          if (origStr === propStr) return null;

          const cell = (v: any, s: string) =>
            v !== null && v !== undefined
              ? (typeof v === "object" || (typeof v === "string" && v.startsWith("data:")) ? s : String(v))
              : "—";

          return (
            <div key={key} className="grid grid-cols-3 p-4 items-center text-sm hover:bg-yellow-50/20">
              <div className="font-bold text-gray-500 uppercase tracking-wide text-xs">{key}</div>
              <div className="line-through text-red-600 bg-red-50/50 px-2.5 py-1.5 rounded-lg border border-red-100 font-mono inline-block max-w-max break-all">
                {cell(origVal, origStr)}
              </div>
              <div className="text-emerald-700 bg-emerald-50/50 px-2.5 py-1.5 rounded-lg border border-emerald-100 font-bold font-mono inline-block max-w-max break-all">
                {cell(propVal, propStr)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Le rendu des diffs (stripHeavyJson sur des normes volumineuses + tableaux de
  // dataset non bornés) est coûteux. On le mémorise par commit : ouvrir la
  // modale de refus (état rejectTarget) ne doit PAS le recalculer — c'était la
  // cause du gel de la zone de saisie du refus (le portail seul n'y suffisait
  // pas puisque le fil principal était bloqué par le re-rendu).
  const activeCommitReview = useMemo(
    () =>
      activeCommit ? (
        <div className="flex flex-col h-full divide-y-2 divide-gray-150 overflow-hidden">
          <div className="p-6 bg-gray-50 border-b-2 border-gray-100 flex-shrink-0">
            <span className="text-[10px] bg-indigo-150 border border-indigo-200 text-indigo-700 font-black px-2.5 py-1 rounded-md tracking-wider">
              COMMIT CONTROLLER ID: {activeCommit.id}
            </span>
            <h3 className="font-extrabold text-gray-900 text-xl tracking-tight leading-tight mt-2">
              {activeCommit.commitMessage}
            </h3>
            <p className="text-xs text-gray-400 font-semibold mt-1">
              Submitted by <b className="text-gray-600">{activeCommit.author}</b> on {activeCommit.date}
            </p>
          </div>

          <div className="p-6 overflow-y-auto space-y-8 flex-1">
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest block">
              Review and Validate Items One by One
            </span>

            {activeCommit.changes.map((change) => (
              <div key={change.id} className="border-2 border-gray-150 rounded-2xl overflow-hidden bg-white shadow-xs hover:border-gray-300 transition-all">
                <div className="p-4 bg-gray-50 flex items-center justify-between border-b border-gray-150 flex-wrap gap-3">
                  <div>
                    <p className="text-base font-extrabold text-gray-950">{change.name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{change.location}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRejectTarget({ commitId: activeCommit.id, changeId: change.id, name: change.name })}
                      className="px-3.5 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-all active:scale-[0.98]"
                    >
                      Reject ❌
                    </button>
                    <button
                      onClick={() => handleApproveChange(activeCommit.id, change.id, change.name)}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all active:scale-[0.98]"
                    >
                      Approve & Merge ✓
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-6">
                  {change.action === "Created" && change.proposedData && (
                    <div className="space-y-6">
                      <div className="bg-emerald-50/30 text-emerald-900 p-4 rounded-xl border border-emerald-200/60">
                        <span className="font-extrabold text-sm block mb-1">✓ Complete Structural Addition</span>
                        <p className="text-xs text-emerald-800">Properties proposed to be added in the database branch:</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Target Field Properties</h4>
                        {renderDynamicFields(change.proposedData)}
                      </div>
                      {change.proposedData.dataset && Array.isArray(change.proposedData.dataset) && (
                        <div>
                          <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Discrete Curve Dataset</h4>
                          {renderDynamicDataset(change.proposedData.dataset)}
                        </div>
                      )}
                    </div>
                  )}

                  {change.action === "Deleted" && (
                    <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-4 rounded-xl font-bold">
                      ⚠️ Warning: Approving this change will remove this taxonomy and its linked data elements.
                    </div>
                  )}

                  {change.action === "Modified" && change.originalData && change.proposedData && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Field Differences Mapping</h4>
                        {renderDynamicDiff(change.originalData, change.proposedData)}
                      </div>
                      {change.proposedData.dataset && Array.isArray(change.proposedData.dataset) && (
                        <div>
                          <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Proposed Structural Dataset</h4>
                          {renderDynamicDataset(change.proposedData.dataset)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-base p-12 gap-2">
          <span className="text-3xl">🔍</span>
          <span>Select a submission in the queue to inspect and merge individual assets.</span>
        </div>
      ),
    [activeCommit],
  );

  return (
    <div className="h-full flex flex-col space-y-6 w-full max-w-full px-4">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Repository Validation Dashboard</h2>
          <p className="text-base text-gray-500 mt-1">
            Accept or reject individual modifications proposed by technical operators.
          </p>
        </div>
      </div>

      {pendingCommits.length === 0 && approvedHistory.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center text-gray-400 text-base shadow-xs">
          🎉 No pending requests and no previous approvals. Everything is fully synchronized!
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-8 min-h-0 overflow-hidden">
          <div className="lg:col-span-2 flex flex-col space-y-6 overflow-y-auto pr-2">
            <div>
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-3">Pending Pull Requests</span>
              {pendingCommits.length === 0 ? (
                <div className="bg-gray-100 text-gray-500 text-sm p-4 rounded-xl text-center font-semibold">
                  Queue empty
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingCommits.map((commit) => {
                    const isActive = commit.id === selectedCommitId;
                    return (
                      <div
                        key={commit.id}
                        onClick={() => setSelectedCommitId(commit.id)}
                        className={`p-5 rounded-2xl border-2 transition-all cursor-pointer text-left shadow-xs ${
                          isActive
                            ? "bg-blue-50/40 border-blue-500 shadow-md ring-1 ring-blue-500"
                            : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold bg-gray-100 text-gray-700 px-3 py-0.5 rounded-full">👤 {commit.author}</span>
                          <span className="text-xs text-gray-400 font-semibold">{commit.date}</span>
                        </div>
                        <h4 className="font-bold text-base text-gray-900 leading-snug mb-2">{commit.commitMessage}</h4>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                          <span className="text-xs font-semibold text-blue-600">
                            📦 {commit.changes.length} line item(s)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {approvedHistory.length > 0 && (
              <div className="pt-4 border-t border-gray-200">
                <span className="text-xs font-black text-emerald-600 uppercase tracking-widest block mb-3">
                  Approved & Merged Assets
                </span>
                <div className="space-y-2">
                  {approvedHistory.map((hist) => (
                    <div key={hist.id} className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-xl flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-sm text-slate-900 truncate max-w-[150px]">{hist.name}</p>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-600 text-white shadow-xs uppercase tracking-wider">
                          ✓ Official
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                        <span>By: <b className="text-slate-700">{hist.author}</b></span>
                        <span>Approved by: <b className="text-emerald-700">{hist.approvedBy}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-3 flex flex-col bg-white border-2 border-gray-200 rounded-2xl overflow-hidden shadow-sm h-full">
            {activeCommitReview}
          </div>
        </div>
      )}

      {rejectTarget !== null && (
        <RejectReasonModal
          name={rejectTarget.name}
          onCancel={() => setRejectTarget(null)}
          onConfirm={confirmReject}
        />
      )}
    </div>
  );
}

/**
 * Boîte de dialogue de saisie du motif de refus.
 *
 * Remplace window.prompt(), qu'Electron bloque en production. Le motif est
 * transmis à l'auteur de la proposition via le dépôt central.
 */
function RejectReasonModal({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus une seule fois au montage. On focalise via ref plutôt que par
  // l'attribut `autoFocus` : la modale est rendue dans un portail (voir plus
  // bas), ce qui garantit un focus fiable hors de tout conteneur défilant.
  // Effet distinct de la touche Echap pour NE PAS re-focaliser (et donc
  // interrompre la saisie) à chaque re-rendu du parent.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Fermeture par Echap. `onCancel` est recréé à chaque rendu parent : se
  // réabonner est sans effet de bord (contrairement au focus ci-dessus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Rendu dans un portail attaché à <body>. La modale échappe ainsi à tout
  // ancêtre (overflow, stacking context, transform) susceptible de rendre la
  // zone de texte non cliquable — cause du gel signalé sur le refus.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reject proposal"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Reject proposal</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate" title={name}>{name}</p>
        </div>

        <div className="p-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
            Reason for rejection (sent to the author)
          </label>
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Explain why this proposal is being rejected…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={reason.trim() === ""}
            className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:bg-red-300 disabled:cursor-not-allowed"
          >
            Confirm rejection
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
