/**
 * ChangeCard — unified, human-readable rendering of one proposed change, shared
 * by the Synchronization page and the Admin review (docs/UI-UX-SPEC.md §13/§16/§17).
 *
 * Same layout as the editor: a profile change renders the real Profile Card
 * (ProfileDetail — grouped fields + chart), a standard change the read-only
 * StandardCard (same layout as the editor's StandardInfoPanel). Colour uses the
 * CHANGE-TYPE palette (blues, changeStyle.ts), distinct from the status palette:
 *  - Created  → light blue: every populated field shown as an addition.
 *  - Modified → medium blue: changed fields highlighted, old value struck.
 *  - Deleted  → dark blue: the full card shown under a "will be removed" banner
 *    so the reviewer sees exactly what is being removed before arbitrating.
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
import { changeStyle } from "../changeStyle";

export function ChangeCard({
  change,
  standards,
}: {
  change: MockChangeItem;
  standards: StandardPlugin[];
}) {
  const cs = changeStyle(change.action);
  const proposed = change.proposedData;
  // Le diff n'est passé qu'aux cartes Created/Modified ; une suppression montre la
  // carte telle quelle (sous un bandeau) pour qu'on voie CE QU'on retire.
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
      // Repli quand le standard/schéma est indisponible (toujours pas de JSON brut).
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
    // Standard / taxonomie → carte read-only au layout de l'éditeur.
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
    <div className={`border-l-4 ${cs.accent} pl-4`}>
      {isDeleted && (
        <div className={`mb-4 flex items-start gap-2 rounded-lg p-3 text-sm ${cs.tag}`}>
          <Icon name="warning" size={16} className="mt-0.5 flex-shrink-0" />
          <span>This {change.type} will be removed from the central repository.</span>
        </div>
      )}
      {body}
    </div>
  );
}
