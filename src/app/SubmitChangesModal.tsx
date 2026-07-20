import { useState } from "react";
import { useAppStore, type MockChangeItem } from "../store/appStore";

interface SubmitChangesModalProps {
  onClose: () => void;
}

export function SubmitChangesModal({ onClose }: SubmitChangesModalProps) {
  const localChanges = useAppStore((s) => s.localStagedChanges);
  const submitCommit = useAppStore((s) => s.submitCommit);

  // CORRECTION : Décoché par défaut (tableau vide initial au lieu d'inclure toutes les clés)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Onglet de prévisualisation des détails de modification
  const [selectedPreviewChange, setSelectedPreviewChange] = useState<MockChangeItem | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === localChanges.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(localChanges.map(c => c.id));
    }
  };

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setError("Please select at least one change to submit.");
      return;
    }
    if (commitMessage.trim() === "") {
      setError("A commit description is required for the audit trail.");
      return;
    }

    // Attente synchrone du traitement du push
    await submitCommit(commitMessage, selectedIds);
    onClose();
    alert("Changes successfully pushed to central repository!");
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-5xl w-full flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Push to Common Repository</h3>
            <p className="text-xs text-gray-400">Assemble your changes and request a merge validation.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
        </div>

        {/* Double colonne pour la prévisualisation des modifications */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* Formulaire et liste des modifications à gauche */}
          <form onSubmit={handleSubmit} className="w-1/2 p-4 flex flex-col gap-4 overflow-y-auto border-r border-gray-100">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-lg">
                ⚠️ {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase">Change Explanation (for Admin review)</label>
              <textarea
                value={commitMessage}
                onChange={(e) => {
                  setError(null);
                  setCommitMessage(e.target.value);
                }}
                placeholder="Explain why you added, changed or calibrated these profiles..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 placeholder-gray-400 bg-white"
              />
            </div>

            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-500 uppercase">Select items to include ({selectedIds.length})</label>
                <button 
                  type="button" 
                  onClick={handleSelectAll} 
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  {selectedIds.length === localChanges.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-y-auto bg-gray-50/50 flex-1">
                {localChanges.length === 0 ? (
                  <p className="text-xs text-gray-400 p-4 text-center">No local changes found.</p>
                ) : (
                  localChanges.map((change) => {
                    const isChecked = selectedIds.includes(change.id);
                    const isInspecting = selectedPreviewChange?.id === change.id;
                    return (
                      <div 
                        key={change.id} 
                        className={`flex items-start justify-between gap-2 p-3 hover:bg-gray-100/70 transition-colors cursor-pointer ${
                          isInspecting ? "bg-blue-50/50 border-l-2 border-l-blue-500" : ""
                        }`}
                        onClick={() => setSelectedPreviewChange(change)}
                      >
                        <div className="flex items-start gap-3 select-none flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation(); // Évite d'interférer avec le clic de prévisualisation
                              toggleSelect(change.id);
                            }}
                            className="mt-1 h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="text-xs">
                            <p className="font-bold text-gray-800">
                              <span className={`mr-1.5 px-1.5 py-0.5 rounded-sm font-extrabold ${
                                change.action === 'Created' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>{change.action}</span>
                              {change.name}
                            </p>
                            <p className="text-gray-400 font-mono mt-0.5">{change.location}</p>
                          </div>
                        </div>
                        <button 
                          type="button"
                          className="text-[10px] text-blue-600 hover:underline font-bold mt-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPreviewChange(change);
                          }}
                        >
                          View Diff
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              >
                Submit to Admin Area
              </button>
            </div>
          </form>

          {/* Comparateur visuel interactif (Diff JSON) à droite */}
          <div className="w-1/2 p-4 flex flex-col bg-slate-50 overflow-y-auto">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Changes Inspector</h4>
            {selectedPreviewChange ? (
              <div className="flex flex-col gap-4">
                <div className="p-3 bg-white rounded-lg border border-gray-200 text-xs">
                  <p className="font-bold text-gray-800 text-sm mb-1">{selectedPreviewChange.name}</p>
                  <p className="text-gray-400 font-mono">Entity: <span className="font-bold text-gray-600">{selectedPreviewChange.type}</span></p>
                  <p className="text-gray-400 font-mono">Action: <span className="font-bold text-gray-600">{selectedPreviewChange.action}</span></p>
                </div>

                <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Proposed Payload JSON</span>
                  <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg text-[10px] font-mono overflow-auto max-h-[50vh] whitespace-pre-wrap leading-relaxed shadow-inner">
                    {JSON.stringify(selectedPreviewChange.proposedData, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center gap-2 p-8">
                <span className="text-3xl">🔍</span>
                <p className="text-xs font-medium">Click on any modification in the list to inspect its proposed values before submission.</p>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
