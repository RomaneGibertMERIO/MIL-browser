/**
 * ChangeCard — the CONTENT of one proposed change (no frame; the frame + coloured
 * header live in ChangePanel). Shared by the Synchronization page and the Admin
 * review. Same layout as the editor: a profile change renders ProfileDetail, a
 * standard change the read-only StandardCard. Colour uses the change-type palette
 * (blues, changeStyle.ts):
 *  - Created  → every populated field shown as an addition (sky).
 *  - Modified → changed fields highlighted (blue) with the old value struck.
 *  - Deleted  → the full card shown under a "will be removed" notice so the
 *    reviewer sees exactly what is removed before arbitrating.
 */
import type { ReactNode } from "react";
import type { StandardPlugin } from "../../core/domain/standard";
import type { Profile } from "../../core/domain/profile";
import type { MockChangeItem } from "../../store/appStore";
import { getEffectiveSchema } from "../../core/engine/profileEngine";
import { ProfileDetail } from "../../features/profile/ProfileDetail";
import { StandardCard } from "./StandardCard";
import { DynamicFields, DynamicDataset } from "./DiffView";
import { Icon } from "./ui/Icon";

export function ChangeCard({
  change,
  standards,
}: {
  change: MockChangeItem;
  standards: StandardPlugin[];
}) {
  const proposed = change.proposedData;
  const isDeleted = change.action === "Deleted";

  let body: ReactNode;
  if (change.type === "profile") {
    const std = proposed ? standards.find((s) => s.manifest.id === proposed.standardId) : undefined;
    const schema = std && proposed ? getEffectiveSchema(std, proposed.nodeId) : null;
    if (proposed && schema) {
      body = (
        <ProfileDetail
          profile={proposed as Profile}
          schema={schema}
          diff={
            isDeleted
              ? undefined
              : { action: change.action as "Created" | "Modified", previous: (change.originalData as Profile) ?? null }
          }
        />
      );
    } else if (proposed) {
      body = (
        <div className="space-y-4">
          <DynamicFields data={proposed} />
          {Array.isArray(proposed.dataset) && <DynamicDataset dataset={proposed.dataset} />}
        </div>
      );
    } else {
      body = <p className="text-sm text-gray-400">No preview available for this change.</p>;
    }
  } else {
    body = proposed ? (
      <StandardCard
        proposed={proposed}
        diff={isDeleted ? undefined : { action: change.action as "Created" | "Modified", previous: change.originalData }}
      />
    ) : (
      <p className="text-sm text-gray-400">No preview available for this change.</p>
    );
  }

  return (
    <>
      {isDeleted && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-indigo-300 bg-indigo-100 p-3 text-sm font-medium text-indigo-900">
          <Icon name="warning" size={16} className="mt-0.5 flex-shrink-0" />
          <span>This {change.type} will be removed from the central repository.</span>
        </div>
      )}
      {body}
    </>
  );
}
