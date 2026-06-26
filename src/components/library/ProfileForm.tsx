import { useState, type FormEvent } from 'react';
import type { TaxonomyNode, ProfileDraft, DataPointDraft, Standard, CanonicalCondition } from '../../types';
import { DatasetEditor } from './DatasetEditor';
import { Card } from '../ui/Card';

interface ProfileFormProps {
  taxonomyNodes: ReadonlyArray<TaxonomyNode>;
  standards: ReadonlyArray<Standard>;
  initialDraft: ProfileDraft | null;
  submitLabel: string;
  onSubmit: (draft: ProfileDraft) => void;
  onCancel: () => void;
}

function buildEmptyDraft(): ProfileDraft {
  return { name: '', description: '', standardId: '', taxonomyPath: [], dataset: [] };
}

// ---------------------------------------------------------------------------
// CascadingSelector — progressive taxonomy path builder
// ---------------------------------------------------------------------------

interface CascadingSelectorProps {
  nodes: ReadonlyArray<TaxonomyNode>;
  selectedPath: string[];
  onChange: (path: string[]) => void;
}

function getChildNodes(parentId: string | null, nodes: ReadonlyArray<TaxonomyNode>): TaxonomyNode[] {
  return [...nodes]
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

function CascadingSelector({ nodes, selectedPath, onChange }: CascadingSelectorProps) {
  // Build levels: [{options, selectedId}] — one entry per depth level to show
  const levels: Array<{ options: TaxonomyNode[]; selectedId: string | null }> = [];
  let parentId: string | null = null;
  let depth = 0;

  while (true) {
    const options = getChildNodes(parentId, nodes);
    if (options.length === 0) break;

    const selectedId: string | null =
      depth < selectedPath.length
        ? (options.find((n) => n.label === selectedPath[depth])?.id ?? null)
        : null;

    levels.push({ options, selectedId });

    if (selectedId === null) break;
    parentId = selectedId;
    depth++;
  }

  function handleChange(levelIndex: number, nodeId: string) {
    // Rebuild path up to and including this level
    const newPath: string[] = [];
    for (let i = 0; i < levelIndex; i++) {
      if (levels[i]?.selectedId !== null) {
        const node = levels[i]?.options.find((n) => n.id === levels[i]?.selectedId);
        if (node) newPath.push(node.label);
      }
    }
    if (nodeId) {
      const chosenNode = levels[levelIndex]?.options.find((n) => n.id === nodeId);
      if (chosenNode) newPath.push(chosenNode.label);
    }
    onChange(newPath);
  }

  if (levels.length === 0) {
    return (
      <p className="text-sm text-amber-600">
        No taxonomy categories defined. Add categories in the Taxonomy tab first.
      </p>
    );
  }

  const levelNames = ['Category', 'Subcategory', 'Zone', 'Exposure Mode', 'Source', 'Shape'];

  return (
    <div className="space-y-3">
      {levels.map(({ options, selectedId }, levelIndex) => (
        <div key={levelIndex}>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {levelNames[levelIndex] ?? `Level ${levelIndex + 1}`}
          </label>
          <select
            value={selectedId ?? ''}
            onChange={(e) => handleChange(levelIndex, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">— Select —</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {selectedPath.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 mr-1">Selected path:</span>
          {selectedPath.map((label, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300 select-none text-xs">›</span>}
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                {label}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Derives the canonical condition from the taxonomy path by finding the first
// node in the path that has a canonicalCondition set.
function deriveConditionType(
  path: string[],
  nodes: ReadonlyArray<TaxonomyNode>,
): CanonicalCondition | undefined {
  let parentId: string | null = null;
  for (const label of path) {
    const node = nodes.find((n) => n.parentId === parentId && n.label === label);
    if (!node) break;
    if (node.canonicalCondition) return node.canonicalCondition;
    parentId = node.id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// ProfileForm
// ---------------------------------------------------------------------------

export function ProfileForm({
  taxonomyNodes,
  standards,
  initialDraft,
  submitLabel,
  onSubmit,
  onCancel,
}: ProfileFormProps) {
  const [draft, setDraft] = useState<ProfileDraft>(() => initialDraft ?? buildEmptyDraft());
  const [errors, setErrors] = useState<{
    name?: string;
    standardId?: string;
    taxonomyPath?: string;
    dataset?: string;
  }>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (draft.name.trim() === '') next.name = 'Name is required.';
    if (!draft.standardId) next.standardId = 'Select a standard.';
    if (draft.taxonomyPath.length === 0) next.taxonomyPath = 'Select a taxonomy path.';
    if (draft.dataset.length === 0) next.dataset = 'At least one data point is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit(draft);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* ── Profile Information ─────────────────────────────────── */}
      <Card title="Profile Information">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, name: e.target.value }));
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="Profile name"
              className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                errors.name ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Standard <span className="text-red-500">*</span>
            </label>
            <select
              value={draft.standardId}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, standardId: e.target.value }));
                setErrors((prev) => ({ ...prev, standardId: undefined }));
              }}
              className={`w-full px-3 py-2 text-sm border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                errors.standardId ? 'border-red-400' : 'border-gray-300'
              }`}
            >
              <option value="">— Select standard —</option>
              {standards.map((std) => (
                <option key={std.id} value={std.id}>
                  {std.label}
                </option>
              ))}
            </select>
            {errors.standardId && <p className="mt-1 text-xs text-red-600">{errors.standardId}</p>}
          </div>
        </div>
      </Card>

      {/* ── Taxonomy Path ────────────────────────────────────────── */}
      <Card title="Taxonomy Path">
        {errors.taxonomyPath && (
          <p className="mb-3 text-xs text-red-600">{errors.taxonomyPath}</p>
        )}
        <CascadingSelector
          nodes={taxonomyNodes}
          selectedPath={draft.taxonomyPath}
          onChange={(path) => {
            const conditionType = deriveConditionType(path, taxonomyNodes);
            setDraft((prev) => ({ ...prev, taxonomyPath: path, conditionType }));
            setErrors((prev) => ({ ...prev, taxonomyPath: undefined }));
          }}
        />
        {draft.conditionType && (
          <p className="mt-2 text-xs text-gray-400">
            Condition type: <span className="font-medium text-gray-600">{draft.conditionType}</span>
          </p>
        )}
      </Card>

      {/* ── Dataset ─────────────────────────────────────────────── */}
      <Card title="Dataset">
        <DatasetEditor
          rows={draft.dataset}
          onChange={(dataset: DataPointDraft[]) => {
            setDraft((prev) => ({ ...prev, dataset }));
            if (dataset.length > 0) setErrors((prev) => ({ ...prev, dataset: undefined }));
          }}
        />
        {errors.dataset && <p className="mt-2 text-xs text-red-600">{errors.dataset}</p>}
      </Card>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 pt-1 pb-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
