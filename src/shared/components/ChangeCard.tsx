/**
 * ChangeCard — unified, human-readable rendering of one proposed change, shared
 * by the Synchronization page and the Admin review (docs/UI-UX-SPEC.md §13/§16/§17).
 *
 * Goal (from QA 13.3/14.2): stop showing raw JSON manifests. A profile change is
 * shown as the real Profile Card (grouped fields + chart), a standard/taxonomy
 * change as a clean manifest field grid — the same visual language as everywhere
 * else. When the previous version is available (`originalData`), a field-level
 * diff (old struck red → new green) is shown above the card; today the sync
 * journal does not capture the previous version, so most changes render as the
 * proposed card only (the diff section appears automatically once it does).
 */
import type { StandardPlugin } from "../../core/domain/standard";
import type { Profile } from "../../core/domain/profile";
import type { MockChangeItem } from "../../store/appStore";
import { getEffectiveSchema } from "../../core/engine/profileEngine";
import { ProfileDetail } from "../../features/profile/ProfileDetail";
import { DynamicFields, DynamicDataset, DynamicDiff } from "./DiffView";
import { Icon } from "./ui/Icon";

const HIDDEN_MANIFEST_KEYS = new Set(["nodes", "profileSchema", "migrations"]);

/** Clean field grid for a standard manifest (replaces the raw JSON dump). */
function ManifestGrid({ manifest, nodeCount }: { manifest: Record<string, any>; nodeCount?: number }) {
  const entries = Object.entries(manifest ?? {}).filter(([k]) => !HIDDEN_MANIFEST_KEYS.has(k));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{key}</span>
            <span className="break-words text-sm font-medium text-gray-800">
              {value === null || value === undefined ? "—" : String(value)}
            </span>
          </div>
        ))}
      </div>
      {nodeCount !== undefined && (
        <p className="text-xs text-gray-400">
          {nodeCount} node{nodeCount !== 1 ? "s" : ""} in this standard's taxonomy.
        </p>
      )}
    </div>
  );
}

export function ChangeCard({
  change,
  standards,
}: {
  change: MockChangeItem;
  standards: StandardPlugin[];
}) {
  if (change.action === "Deleted") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <Icon name="warning" size={16} className="mt-0.5 flex-shrink-0 text-red-600" />
        <span>This {change.type} will be removed from the central repository.</span>
      </div>
    );
  }

  const proposed = change.proposedData;
  if (!proposed) {
    return <p className="text-sm text-gray-400">No preview available for this change.</p>;
  }

  // ── Profile change → the real Profile Card (grouped fields + chart) ──
  if (change.type === "profile") {
    const std = standards.find((s) => s.manifest.id === proposed.standardId);
    const schema = std ? getEffectiveSchema(std, proposed.nodeId) : null;
    if (schema) {
      return (
        <div className="space-y-4">
          {change.originalData && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Field changes
              </h4>
              <DynamicDiff original={change.originalData} proposed={proposed} />
            </div>
          )}
          <ProfileDetail profile={proposed as Profile} schema={schema} />
        </div>
      );
    }
    // Fallback when the standard/schema isn't available (still no raw dump).
    return (
      <div className="space-y-4">
        <DynamicFields data={proposed} />
        {Array.isArray(proposed.dataset) && <DynamicDataset dataset={proposed.dataset} />}
      </div>
    );
  }

  // ── Standard / taxonomy change → clean manifest grid (no raw JSON) ──
  const manifest = proposed.manifest ?? proposed;
  const nodeCount = Array.isArray(proposed.nodes) ? proposed.nodes.length : undefined;
  return (
    <div className="space-y-4">
      {change.originalData ? (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Field changes
          </h4>
          <DynamicDiff
            original={change.originalData.manifest ?? change.originalData}
            proposed={manifest}
          />
        </div>
      ) : (
        <ManifestGrid manifest={manifest} nodeCount={nodeCount} />
      )}
    </div>
  );
}
