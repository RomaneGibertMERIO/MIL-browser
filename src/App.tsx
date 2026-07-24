import { useState } from 'react';
import { useAppStore, type AdminView } from './store/appStore';
import { useBootstrapStore } from './store/bootstrapStore';
import { useBootstrap } from './shared/hooks/useBootstrap';
import { useStandard, useStandards } from './shared/hooks/useStandards';
import { EmptyWorkspaceNotice } from './shared/components/ui/EmptyWorkspaceNotice';
import { AccountManagementPage } from './features/accounts/AccountManagementPage';
import { AppFrame, Brand } from './shared/components/AppFrame';
import { Icon } from './shared/components/ui/Icon';
import { stripHeavyJson } from './shared/previewSafe';
import { AssistantPage } from './features/assistant/AssistantPage';
import { LibraryPage } from './features/library/LibraryPage';
import { StandardsPage } from "./features/standards/StandardsPage";
import { SettingsPage } from './features/settings/SettingsPage';
import { Sidebar } from './app/Sidebar';
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
  const activeStdId = useAppStore((s) => s.activeStandardId);

  const gitRepoPath = useAppStore((s) => s.gitRepoPath);
  const systemUsername = useAppStore((s) => s.systemUsername);
  const syncError = useAppStore((s) => s.syncError);
  const setSyncError = useAppStore((s) => s.setSyncError);
  const repoMode = useAppStore((s) => s.repoMode);
  const isOffline = useAppStore((s) => s.isOffline);
  const role = useAppStore((s) => s.role);

  const standard = useStandard(activeStdId ?? '');

  // Le nom d'utilisateur OS est désormais résolu une seule fois, dans
  // useBootstrap. L'effet qui vivait ici testait `window.electronAPI` alors que
  // le preload exposait `window.electron` : il retombait donc toujours sur
  // "Browser-Session" et écrasait la valeur correcte.

  return (
    <AppFrame>
    <div className="flex h-full overflow-hidden bg-gray-50">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex-shrink-0 h-16 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
          <Brand />
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-md">
            MANAGEMENT
          </span>
          <span className="text-gray-200 select-none mx-1">|</span>
          <span className="text-base text-blue-600 font-extrabold capitalize">
            {adminView === 'library' ? 'Library'
              : adminView === 'standards' ? 'Standards'
              : adminView === 'settings' ? 'Settings'
              : adminView === 'validations' ? 'Pending Validations'
              : adminView === 'accounts' ? 'Accounts & Roles'
              : adminView}
          </span>
          {repoMode === 'shared' && (
            <span
              className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide rounded border text-indigo-700 bg-indigo-50 border-indigo-200"
              title="Your role in the shared repository"
            >
              {role}
            </span>
          )}
          
          {/* RECONSTRUCTED & ENLARGED SESSION INFO PANEL */}
          <div className="ml-auto flex items-center gap-3 pr-2">
            {/* Quelle source fait autorité : l'information la plus structurante
                de l'écran, et elle était totalement absente jusqu'ici. */}
            {repoMode === 'local' ? (
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-300 rounded-md">
                ⬤ Standalone — built-in standards
              </span>
            ) : isOffline ? (
              <span
                className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-md"
                title="Central repository unreachable — working from the last synchronised state."
              >
                ⬤ Offline — last synced data
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 rounded-md">
                ⬤ Shared repository
              </span>
            )}

            <div className="text-right border-l-2 border-gray-200 pl-4 py-1">
              <p className="text-sm font-extrabold text-gray-900 tracking-tight">👤 Active Session: {systemUsername}</p>
              <p className="text-xs text-gray-500 font-bold font-mono mt-0.5 max-w-xs truncate" title={gitRepoPath}>
                {repoMode === 'local' ? 'No central repository configured' : `Database Root: ${gitRepoPath}`}
              </p>
            </div>
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

        <main className={adminView === 'library' ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto px-6 py-6'}>
          <ContentPane
            adminView={adminView}
            standard={standard}
          />
        </main>
      </div>
    </div>
    </AppFrame>
  );
}

interface ContentPaneProps {
  adminView: AdminView;
  standard:  ReturnType<typeof useStandard>;
}

const ROLE_RANK = { readonly: 0, testing: 1, admin: 2 } as const;

function ContentPane({ adminView, standard }: ContentPaneProps) {
  const setMode = useAppStore((s) => s.setMode);
  const role = useAppStore((s) => s.role);
  const standards = useStandards();
  const workspaceEmpty = standards !== undefined && standards.length === 0;

  // Rôle minimal requis par vue. Second verrou d'affichage : un onglet masqué
  // dans la sidebar peut aussi être restauré via lastView. Le contrôle réel des
  // écritures reste appliqué par le processus principal.
  const minRoleByView: Record<AdminView, keyof typeof ROLE_RANK> = {
    settings: "readonly",
    browse: "testing",
    library: "testing",
    standards: "testing",
    validations: "admin",
    accounts: "admin",
  };

  if (ROLE_RANK[role] < ROLE_RANK[minRoleByView[adminView]]) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center px-6">
        This section requires a higher role.<br />
        Your current role is "{role}". Contact an administrator to request more permissions.
      </div>
    );
  }

  if (adminView === 'accounts') return <AccountManagementPage />;

  if (adminView === 'browse') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <p className="text-gray-500 text-sm">The Standards Browser is in full-screen Browse mode.</p>
        <button
          onClick={() => setMode('assistant')}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          Open Standards Browser ↗
        </button>
      </div>
    );
  }

  if (adminView === 'library') {
    // Le diagnostic prime sur "sélectionnez une norme" : la sidebar est vide et
    // le restera, l'invitation à y choisir quelque chose n'aide pas.
    // Volontairement PAS appliqué aux onglets Settings et Standards Config, qui
    // sont précisément ceux permettant de sortir de la situation.
    if (workspaceEmpty) return <EmptyWorkspaceNotice />;

    if (standard === undefined) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-gray-400">
          Select a standard in the sidebar to manage profiles.
        </div>
      );
    }
    return <LibraryPage standard={standard} />;
  }

  if (adminView === 'standards') return <StandardsPage />;
  if (adminView === 'settings') return <SettingsPage />;
  if (adminView === 'validations') return <AdminValidationsPage />;

  return null;
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
      alert(`Success: "${name}" has been approved and marked as Official!`);
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
      alert(`Discarded: "${name}" has been rejected. Its author will be notified on next sync.`);
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
            {activeCommit ? (
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
            )}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Reject proposal</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate" title={name}>{name}</p>
        </div>

        <div className="p-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
            Reason for rejection (sent to the author)
          </label>
          <textarea
            autoFocus
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
    </div>
  );
}
