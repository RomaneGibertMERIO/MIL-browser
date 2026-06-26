import { useState, useMemo, Fragment } from "react";
import type { RepoProfile, Standard, TaxonomyNodeItem } from "../../types";
import type { UseTaxonomyResult } from "../../hooks/useTaxonomy";
import {
  buildTaxonomyTree,
  navigateToPath,
  getProfilesForNode,
} from "../../lib/treeBuilder";
import { RepoProfileView } from "../profile/RepoProfileView";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface TestAssistantProps {
  standards: ReadonlyArray<Standard>;
  taxonomy: UseTaxonomyResult;
  allProfiles: ReadonlyArray<RepoProfile>;
}

type WizardMode = "standard" | "choosing" | "results" | "detail";

const STEP_LABELS = ["Test Type", "Zone", "Condition", "Procedure"];

function stepTitle(depth: number): string {
  return `Select ${STEP_LABELS[depth] ?? "Option"}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TestAssistant({
  standards,
  taxonomy,
  allProfiles,
}: TestAssistantProps) {
  const [standardId, setStandardId] = useState<string | null>(null);
  const [userPath, setUserPath] = useState<string[]>([]);
  const [viewingProfile, setViewingProfile] = useState<RepoProfile | null>(
    null
  );

  const selectedStandard = standardId
    ? standards.find((s) => s.id === standardId) ?? null
    : null;

  // ── Wizard context ────────────────────────────────────────────────────────
  const wizardCtx = useMemo(() => {
    if (!standardId) return null;
    const standardProfiles = allProfiles.filter(
      (p) => p.standardId === standardId
    );
    const tree = buildTaxonomyTree(taxonomy.nodes, standardProfiles);

    // Auto-skip a single container root (e.g., "Environmental Testing") so the
    // user's first choice is a meaningful test type, not a generic container.
    const autoSkipPrefix: string[] = [];
    let rootNodes: TaxonomyNodeItem[] = tree;
    while (
      rootNodes.length === 1 &&
      rootNodes[0] &&
      !rootNodes[0].hasProfiles
    ) {
      autoSkipPrefix.push(rootNodes[0].label);
      rootNodes = rootNodes[0].children;
    }

    return { standardProfiles, tree, autoSkipPrefix };
  }, [standardId, allProfiles, taxonomy.nodes]);

  /** The full taxonomy path: auto-skipped prefix + what the user has selected. */
  const fullPath = wizardCtx ? [...wizardCtx.autoSkipPrefix, ...userPath] : [];

  /** Next-step options (children of current path node that still have profiles). */
  const currentOptions = useMemo((): TaxonomyNodeItem[] => {
    if (!wizardCtx) return [];
    let nodes: TaxonomyNodeItem[] = wizardCtx.tree;
    for (const label of fullPath) {
      const node = nodes.find((n) => n.label === label);
      if (!node) return [];
      nodes = node.children;
    }
    return nodes.filter((n) => n.hasProfiles);
  }, [wizardCtx, fullPath]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Profiles matching the current full path. */
  const matchingProfiles = useMemo(() => {
    if (!wizardCtx || fullPath.length === 0) return [];
    return getProfilesForNode(fullPath, wizardCtx.standardProfiles);
  }, [wizardCtx, fullPath]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Taxonomy node at the tip of fullPath (used for visual aid lookup). */
  const currentStepNode = useMemo(() => {
    if (!wizardCtx || fullPath.length === 0) return null;
    return navigateToPath(wizardCtx.tree, fullPath);
  }, [wizardCtx, fullPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Breadcrumb display path ───────────────────────────────────────────────
  /** userPath translated to standard-specific display labels. */
  const displayPath = useMemo((): string[] => {
    if (!wizardCtx || !selectedStandard) return [...userPath];
    const result: string[] = [];
    // Navigate through auto-skip prefix first
    let nodes: TaxonomyNodeItem[] = wizardCtx.tree;
    for (const label of wizardCtx.autoSkipPrefix) {
      const node = nodes.find((n) => n.label === label);
      if (!node) break;
      nodes = node.children;
    }
    // Translate each user-selected step
    for (const label of userPath) {
      const node = nodes.find((n) => n.label === label);
      if (!node) {
        result.push(label);
        break;
      }
      result.push(nodeDisplayLabel(node, selectedStandard));
      nodes = node.children;
    }
    return result;
  }, [wizardCtx, userPath, selectedStandard]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Translate a node label using standard-specific condition labels if applicable. */
  function nodeDisplayLabel(
    node: TaxonomyNodeItem,
    standard: Standard
  ): string {
    if (node.canonicalCondition) {
      return standard.conditionLabels[node.canonicalCondition];
    }
    return node.label;
  }

  // ── Mode ──────────────────────────────────────────────────────────────────
  const mode: WizardMode = viewingProfile
    ? "detail"
    : !standardId
    ? "standard"
    : currentOptions.length === 0 && matchingProfiles.length > 0
    ? "results"
    : "choosing";

  // ── Navigation ────────────────────────────────────────────────────────────
  function handleStandardSelect(id: string) {
    setStandardId(id);
    setUserPath([]);
    setViewingProfile(null);
  }

  function handleOptionSelect(label: string) {
    setUserPath((prev) => [...prev, label]);
    setViewingProfile(null);
  }

  function handleBack() {
    if (viewingProfile) {
      setViewingProfile(null);
      return;
    }
    if (userPath.length > 0) {
      setUserPath((prev) => prev.slice(0, -1));
      return;
    }
    setStandardId(null);
  }

  /** Go to the step that shows choices immediately AFTER displayPath[stepIndex-1]. */
  function handleGoToStep(keepCount: number) {
    setUserPath((prev) => prev.slice(0, keepCount));
    setViewingProfile(null);
  }

  function handleReset() {
    setStandardId(null);
    setUserPath([]);
    setViewingProfile(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50">
      {mode === "standard" && (
        <StandardSelectionScreen
          standards={standards}
          onSelect={handleStandardSelect}
        />
      )}

      {mode === "choosing" && selectedStandard && wizardCtx && (
        <ChoiceScreen
          standard={selectedStandard}
          displayPath={displayPath}
          stepTitle={stepTitle(userPath.length)}
          options={currentOptions}
          currentStepImageKey={currentStepNode?.imageKey}
          onReset={handleReset}
          onGoToStep={handleGoToStep}
          onSelect={handleOptionSelect}
          getDisplayLabel={(node) => nodeDisplayLabel(node, selectedStandard)}
        />
      )}

      {mode === "results" && selectedStandard && (
        <ResultsScreen
          standard={selectedStandard}
          displayPath={displayPath}
          profiles={matchingProfiles}
          onReset={handleReset}
          onGoToStep={handleGoToStep}
          onViewProfile={setViewingProfile}
        />
      )}

      {mode === "detail" && viewingProfile && selectedStandard && (
        <DetailScreen
          standard={selectedStandard}
          displayPath={displayPath}
          profile={viewingProfile}
          onReset={handleReset}
          onGoToStep={handleGoToStep}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WizardBreadcrumb
// ---------------------------------------------------------------------------

interface WizardBreadcrumbProps {
  standard: Standard;
  displayPath: string[];
  onReset: () => void;
  onGoToStep: (keepCount: number) => void;
}

function WizardBreadcrumb({
  standard,
  displayPath,
  onReset,
  onGoToStep,
}: WizardBreadcrumbProps) {
  return (
    <nav
      className="flex items-center gap-1.5 text-sm flex-wrap"
      aria-label="Selection path"
    >
      <button
        onClick={onReset}
        className="font-semibold text-blue-600 hover:text-blue-800 transition-colors"
      >
        {standard.label}
      </button>
      {displayPath.map((segment, i) => (
        <Fragment key={i}>
          <span className="text-gray-300 select-none">›</span>
          <button
            onClick={() => onGoToStep(i + 1)}
            className={
              i === displayPath.length - 1
                ? "text-gray-900 font-medium cursor-default"
                : "text-gray-500 hover:text-gray-800 transition-colors"
            }
          >
            {segment}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// StandardSelectionScreen
// ---------------------------------------------------------------------------

function StandardSelectionScreen({
  standards,
  onSelect,
}: {
  standards: ReadonlyArray<Standard>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Environmental Test Assistant
        </h1>
        <p className="text-lg text-gray-500">
          Select the applicable testing standard for your program.
        </p>
      </div>

      {standards.length === 0 && (
        <p className="text-center text-gray-400">No standards available.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {standards.map((std) => (
          <StandardCard key={std.id} standard={std} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function StandardCard({
  standard,
  onSelect,
}: {
  standard: Standard;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(standard.id)}
      className="text-left p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-lg transition-all group focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
    >
      <div className="font-bold text-xl text-gray-900 mb-1 group-hover:text-blue-700 transition-colors">
        {standard.label}
      </div>
      <div className="text-xs font-medium text-blue-500 uppercase tracking-wide mb-3">
        {standard.organization} · v{standard.version}
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">
        {standard.description}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ChoiceScreen
// ---------------------------------------------------------------------------

interface ChoiceScreenProps {
  standard: Standard;
  displayPath: string[];
  stepTitle: string;
  options: TaxonomyNodeItem[];
  currentStepImageKey: string | undefined;
  onReset: () => void;
  onGoToStep: (keepCount: number) => void;
  onSelect: (label: string) => void;
  getDisplayLabel: (node: TaxonomyNodeItem) => string;
}

function ChoiceScreen({
  standard,
  displayPath,
  stepTitle,
  options,
  currentStepImageKey,
  onReset,
  onGoToStep,
  onSelect,
  getDisplayLabel,
}: ChoiceScreenProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <WizardBreadcrumb
          standard={standard}
          displayPath={displayPath}
          onReset={onReset}
          onGoToStep={onGoToStep}
        />
      </div>

      {currentStepImageKey && (
        <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 max-h-52">
          <img
            src={`/images/${currentStepImageKey}`}
            alt="Visual aid"
            className="w-full h-52 object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <h2 className="text-xl font-semibold text-gray-900 mb-6">{stepTitle}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {options.map((node) => (
          <ChoiceCard
            key={node.id}
            label={getDisplayLabel(node)}
            onClick={() => onSelect(node.label)}
          />
        ))}
      </div>

      {options.length === 0 && (
        <p className="text-gray-400 text-center py-12">
          No options available for this selection.
        </p>
      )}
    </div>
  );
}

function ChoiceCard({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-4 bg-white border-2 border-gray-200 rounded-xl text-center font-medium text-gray-800 hover:border-blue-400 hover:text-blue-700 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ResultsScreen
// ---------------------------------------------------------------------------

interface ResultsScreenProps {
  standard: Standard;
  displayPath: string[];
  profiles: ReadonlyArray<RepoProfile>;
  onReset: () => void;
  onGoToStep: (keepCount: number) => void;
  onViewProfile: (profile: RepoProfile) => void;
}

function ResultsScreen({
  standard,
  displayPath,
  profiles,
  onReset,
  onGoToStep,
  onViewProfile,
}: ResultsScreenProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <WizardBreadcrumb
          standard={standard}
          displayPath={displayPath}
          onReset={onReset}
          onGoToStep={onGoToStep}
        />
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        {profiles.length === 1
          ? "1 profile found"
          : `${profiles.length} profiles found`}
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Select a profile to view its details.
      </p>

      <div className="space-y-3">
        {profiles.map((profile) => (
          <ProfileResultCard
            key={profile.id}
            profile={profile}
            onView={onViewProfile}
          />
        ))}
      </div>

      {profiles.length === 0 && (
        <p className="text-gray-400 text-center py-12">
          No profiles found for this selection.
        </p>
      )}
    </div>
  );
}

function ProfileResultCard({
  profile,
  onView,
}: {
  profile: RepoProfile;
  onView: (profile: RepoProfile) => void;
}) {
  return (
    <button
      onClick={() => onView(profile)}
      className="w-full text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
            {profile.name}
          </div>
          {profile.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
              {profile.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
              {profile.dataset.length} data points
            </span>
            {profile.source === "builtin" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                Built-in
              </span>
            )}
          </div>
        </div>
        <span className="text-blue-400 group-hover:text-blue-600 text-lg flex-shrink-0 mt-0.5">
          ›
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// DetailScreen
// ---------------------------------------------------------------------------

interface DetailScreenProps {
  standard: Standard;
  displayPath: string[];
  profile: RepoProfile;
  onReset: () => void;
  onGoToStep: (keepCount: number) => void;
  onBack: () => void;
}

function DetailScreen({
  standard,
  displayPath,
  profile,
  onReset,
  onGoToStep,
  onBack,
}: DetailScreenProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <WizardBreadcrumb
          standard={standard}
          displayPath={displayPath}
          onReset={onReset}
          onGoToStep={onGoToStep}
        />
        <button
          onClick={onBack}
          className="flex-shrink-0 text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors"
        >
          ‹ Back to results
        </button>
      </div>

      <RepoProfileView profile={profile} />
    </div>
  );
}
