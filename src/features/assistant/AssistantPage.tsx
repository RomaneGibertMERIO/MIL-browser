/**
 * Assistant feature page.
 *
 * Guides the user through four sequential phases:
 *   1. standard_selection — choose which standard to explore
 *   2. choosing          — navigate the taxonomy tree for the selected standard
 *   3. results           — browse profiles for the selected node
 *   4. detail            — view a single profile in full
 *
 * All navigation is by stable node ID, never by label.
 * The assistant mode does not modify any data.
 */

import { useState, useMemo } from "react";
import type { Profile } from "../../core/domain/profile";
import type { StandardPlugin } from "../../core/domain/standard";
import type { TaxonomyNodeItem } from "../../core/domain/tree";
import { buildTree } from "../../core/engine/treeBuilder";
import { getProfilesForNode } from "../../core/engine/treeBuilder";
import { useStandards } from "../../shared/hooks/useStandards";
import { useProfilesByStandard } from "../../shared/hooks/useProfiles";
import { EmptyState } from "../../shared/components/ui/EmptyState";
import { LoadingSpinner } from "../../shared/components/ui/LoadingSpinner";
import { Badge } from "../../shared/components/ui/Badge";
import { ProfileDetail } from "../profile/ProfileDetail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AssistantPhase =
  | "standard_selection"
  | "choosing"
  | "results"
  | "detail";

interface AssistantState {
  phase: AssistantPhase;
  selectedStandardId: string | null;
  selectedNodeId: string | null;
  selectedProfile: Profile | null;
}

const INITIAL_STATE: AssistantState = {
  phase: "standard_selection",
  selectedStandardId: null,
  selectedNodeId: null,
  selectedProfile: null,
};

// ---------------------------------------------------------------------------
// AssistantPage
// ---------------------------------------------------------------------------

export function AssistantPage() {
  const [state, setState] = useState<AssistantState>(INITIAL_STATE);

  const standards = useStandards();

  if (standards === undefined) return <LoadingSpinner />;

  function reset() {
    setState(INITIAL_STATE);
  }

  function selectStandard(standardId: string) {
    setState({
      phase: "choosing",
      selectedStandardId: standardId,
      selectedNodeId: null,
      selectedProfile: null,
    });
  }

  function selectNode(nodeId: string) {
    setState((prev) => ({ ...prev, phase: "results", selectedNodeId: nodeId }));
  }

  function selectProfile(profile: Profile) {
    setState((prev) => ({ ...prev, phase: "detail", selectedProfile: profile }));
  }

  function backToChoosing() {
    setState((prev) => ({ ...prev, phase: "choosing", selectedProfile: null }));
  }

  function backToResults() {
    setState((prev) => ({ ...prev, phase: "results", selectedProfile: null }));
  }

  const selectedStandard = standards.find(
    (s) => s.manifest.id === state.selectedStandardId,
  ) ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <ProgressBreadcrumb
        phase={state.phase}
        standardLabel={selectedStandard?.manifest.label ?? null}
        onReset={reset}
      />

      <div className="max-w-5xl mx-auto px-6 py-6">
        {state.phase === "standard_selection" && (
          <StandardSelectionPhase
            standards={standards}
            onSelect={selectStandard}
          />
        )}

        {state.phase === "choosing" && selectedStandard !== null && (
          <ChoosingPhase
            standard={selectedStandard}
            selectedNodeId={state.selectedNodeId}
            onSelectNode={selectNode}
            onBack={reset}
          />
        )}

        {state.phase === "results" &&
          selectedStandard !== null &&
          state.selectedNodeId !== null && (
            <ResultsPhase
              standard={selectedStandard}
              selectedNodeId={state.selectedNodeId}
              onSelectNode={selectNode}
              onSelectProfile={selectProfile}
              onBack={backToChoosing}
            />
          )}

        {state.phase === "detail" &&
          selectedStandard !== null &&
          state.selectedProfile !== null && (
            <ProfileDetail
              profile={state.selectedProfile}
              schema={selectedStandard.profileSchema}
              onBack={backToResults}
              backLabel="Back to results"
            />
          )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Standard Selection
// ---------------------------------------------------------------------------

interface StandardSelectionPhaseProps {
  standards: StandardPlugin[];
  onSelect: (standardId: string) => void;
}

function StandardSelectionPhase({
  standards,
  onSelect,
}: StandardSelectionPhaseProps) {
  if (standards.length === 0) {
    return (
      <EmptyState
        title="No standards loaded"
        message="No standards are available. Please check the application configuration."
      />
    );
  }

  return (
    <div>
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Environmental Testing Browser
        </h1>
        <p className="text-gray-500 max-w-xl mx-auto">
          Select the applicable standard to browse test profiles and
          environmental limit profiles.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {standards.map((s) => (
          <button
            key={s.manifest.id}
            onClick={() => onSelect(s.manifest.id)}
            className="group text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-sm font-bold text-blue-700">
                {s.manifest.id.toUpperCase().replace(/-/g, " ")}
              </span>
              {s.manifest.isBuiltin && (
                <Badge variant="blue">Built-in</Badge>
              )}
            </div>
            <p className="font-semibold text-gray-900 mb-1 group-hover:text-blue-700 transition-colors text-sm">
              {s.manifest.label}
            </p>
            {s.manifest.description !== undefined && (
              <p className="text-xs text-gray-400 line-clamp-2">
                {s.manifest.description}
              </p>
            )}
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
              <span>{s.nodes.length} nodes</span>
              <span>{s.manifest.organization}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Choosing (tree navigation)
// ---------------------------------------------------------------------------

interface ChoosingPhaseProps {
  standard: StandardPlugin;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onBack: () => void;
}

function ChoosingPhase({
  standard,
  selectedNodeId,
  onSelectNode,
  onBack,
}: ChoosingPhaseProps) {
  const allProfiles = useProfilesByStandard(standard.manifest.id);
  const tree = useMemo(
    () => buildTree(standard.nodes, allProfiles ?? []),
    [standard.nodes, allProfiles],
  );

  const [localNodeId, setLocalNodeId] = useState<string | null>(selectedNodeId);

  function handleSelect(nodeId: string) {
    setLocalNodeId(nodeId);
  }

  function handleConfirm() {
    if (localNodeId !== null) onSelectNode(localNodeId);
  }

  const selectedNode = localNodeId !== null ? findNode(tree, localNodeId) : null;
  const profileCount =
    selectedNode !== null && allProfiles !== undefined
      ? getProfilesForNode(selectedNode, allProfiles).length
      : null;

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mb-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
          </svg>
          Change standard
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {standard.manifest.label}
        </h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Select a test method or condition category.
        </p>
      </div>

      <div className="flex gap-6">
        <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-gray-200 p-3 self-start sticky top-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">
            Taxonomy
          </p>
          <AssistantTree
            tree={tree}
            activeNodeId={localNodeId}
            onSelect={handleSelect}
          />
        </div>

        <div className="flex-1">
          {selectedNode !== null ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-1">
                {selectedNode.label}
              </h3>
              {selectedNode.code !== undefined && (
                <p className="text-xs font-mono text-gray-400 mb-3">
                  {selectedNode.code}
                </p>
              )}
              {profileCount !== null && (
                <p className="text-sm text-gray-500 mb-5">
                  <span className="font-semibold text-gray-800">
                    {profileCount}
                  </span>{" "}
                  profile{profileCount !== 1 ? "s" : ""} available in this
                  category and sub-categories.
                </p>
              )}
              <button
                onClick={handleConfirm}
                disabled={profileCount === 0}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Browse profiles →
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Select a category on the left
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Results
// ---------------------------------------------------------------------------

interface ResultsPhaseProps {
  standard: StandardPlugin;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onSelectProfile: (profile: Profile) => void;
  onBack: () => void;
}

function ResultsPhase({
  standard,
  selectedNodeId,
  onSelectProfile,
  onBack,
}: ResultsPhaseProps) {
  const allProfiles = useProfilesByStandard(standard.manifest.id);
  const tree = useMemo(
    () => buildTree(standard.nodes, allProfiles ?? []),
    [standard.nodes, allProfiles],
  );

  const selectedNode = findNode(tree, selectedNodeId);
  const nodeProfiles =
    selectedNode !== null && allProfiles !== undefined
      ? getProfilesForNode(selectedNode, allProfiles)
      : [];

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mb-5"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z" />
        </svg>
        Back to navigation
      </button>

      {selectedNode !== null && (
        <div className="mb-5">
          <div className="flex flex-wrap items-center gap-1 text-sm mb-1">
            {selectedNode.path.map((label, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">›</span>}
                <span
                  className={
                    i === selectedNode.path.length - 1
                      ? "font-semibold text-gray-900"
                      : "text-gray-400"
                  }
                >
                  {label}
                </span>
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-400">
            {nodeProfiles.length} profile{nodeProfiles.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {nodeProfiles.length === 0 ? (
        <EmptyState
          title="No profiles"
          message="No profiles found for this category. Try a different selection."
        />
      ) : (
        <div className="space-y-3">
          {nodeProfiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => onSelectProfile(profile)}
              className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-gray-900 group-hover:text-blue-700 transition-colors">
                      {profile.name}
                    </span>
                    <Badge variant={profile.source === "builtin" ? "blue" : "gray"}>
                      {profile.source === "builtin" ? "Built-in" : "User"}
                    </Badge>
                  </div>
                  {profile.description !== "" && (
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {profile.description}
                    </p>
                  )}
                </div>
                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full flex-shrink-0">
                  {profile.dataset.length} pts
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProgressBreadcrumb
// ---------------------------------------------------------------------------

interface ProgressBreadcrumbProps {
  phase: AssistantPhase;
  standardLabel: string | null;
  onReset: () => void;
}

function ProgressBreadcrumb({
  phase,
  standardLabel,
  onReset,
}: ProgressBreadcrumbProps) {
  const steps: { id: AssistantPhase; label: string }[] = [
    { id: "standard_selection", label: "Select Standard" },
    { id: "choosing",           label: standardLabel ?? "Navigate" },
    { id: "results",            label: "Results" },
    { id: "detail",             label: "Profile" },
  ];

  const activeIndex = steps.findIndex((s) => s.id === phase);

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="max-w-5xl mx-auto flex items-center gap-2">
        {steps.map((step, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          return (
            <div key={step.id} className="flex items-center gap-2">
              {i > 0 && <span className="text-gray-300">›</span>}
              {isDone ? (
                <button
                  onClick={i === 0 ? onReset : undefined}
                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {step.label}
                </button>
              ) : (
                <span
                  className={`text-sm ${
                    isActive ? "font-semibold text-gray-900" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssistantTree — simplified tree for the choosing phase sidebar
// ---------------------------------------------------------------------------

interface AssistantTreeProps {
  tree: TaxonomyNodeItem[];
  activeNodeId: string | null;
  onSelect: (nodeId: string) => void;
}

function AssistantTree({ tree, activeNodeId, onSelect }: AssistantTreeProps) {
  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <AssistantTreeNode
          key={node.id}
          node={node}
          activeNodeId={activeNodeId}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}

interface AssistantTreeNodeProps {
  node: TaxonomyNodeItem;
  activeNodeId: string | null;
  onSelect: (nodeId: string) => void;
  depth: number;
}

function AssistantTreeNode({
  node,
  activeNodeId,
  onSelect,
  depth,
}: AssistantTreeNodeProps) {
  const isSelected = node.id === activeNodeId;
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v);
          onSelect(node.id);
        }}
        className={`w-full text-left flex items-center gap-1.5 py-1.5 pr-2 rounded transition-colors text-sm ${
          isSelected
            ? "bg-blue-600 text-white"
            : "text-slate-700 hover:bg-slate-100"
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="flex-shrink-0 w-3 text-center text-xs leading-none text-slate-400">
          {hasChildren ? (expanded ? "▾" : "▸") : "·"}
        </span>
        <span className="flex-1 truncate">{node.label}</span>
        {node.hasProfiles && (
          <span
            className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
              isSelected ? "bg-blue-200" : "bg-blue-400"
            }`}
          />
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <AssistantTreeNode
              key={child.id}
              node={child}
              activeNodeId={activeNodeId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNode(
  tree: TaxonomyNodeItem[],
  nodeId: string,
): TaxonomyNodeItem | null {
  for (const node of tree) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children, nodeId);
    if (found !== null) return found;
  }
  return null;
}
