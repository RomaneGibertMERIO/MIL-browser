import { useState } from "react";
import { useAppStore } from "../store/appStore";

interface SubmitChangesModalProps {
  onClose: () => void;
}

export function SubmitChangesModal({ onClose }: SubmitChangesModalProps) {
  const localChanges = useAppStore((s) => s.localStagedChanges);
  const submitCommit = useAppStore((s) => s.submitCommit);

  const [selectedIds, setSelectedIds] = useState<string[]>(localChanges.map((c) => c.id));
  const [commitMessage, setCommitMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setError("Please select at least one change to submit.");
      return;
    }
    if (commitMessage.trim() === "") {
      setError("A commit description is required for the audit trail.");
      return;
    }

    submitCommit(commitMessage, selectedIds);
    onClose();
    alert("Changes successfully queued for administrator approval!");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-2xl w-full flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Push to Common Repository</h3>
            <p className="text-xs text-gray-400">Assemble your changes and request a merge validation.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4 overflow-y-auto">
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

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Select items to include ({selectedIds.length})</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto bg-gray-50/50">
              {localChanges.map((change) => {
                const isChecked = selectedIds.includes(change.id);
                return (
                  <label key={change.id} className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer text-left select-none">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(change.id)}
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
                  </label>
                );
              })}
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
      </div>
    </div>
  );
}
