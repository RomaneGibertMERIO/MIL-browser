/**
 * DiffView primitives — dynamic, schema-agnostic renderers for change review,
 * shared by the Synchronization page (proposed state) and, later, the Admin
 * review (old → new diff). See docs/UI-UX-SPEC.md §10/§13/§16.
 *
 * They never assume specific fields: whatever keys the object carries are
 * rendered (id/standardId/nodeId/dataset are handled specially). Heavy values
 * (base64 images, large objects) are summarized via stripHeavyJson so a diff of
 * multi-MB payloads never freezes the renderer.
 */
import { stripHeavyJson } from "../previewSafe";

const HIDDEN_KEYS = new Set(["dataset", "id", "standardId", "nodeId"]);

/** Grid of a record's scalar fields (the proposed / current state). */
export function DynamicFields({ data }: { data: Record<string, any> | undefined }) {
  if (!data || typeof data !== "object") return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Object.entries(data).map(([key, value]) => {
        if (HIDDEN_KEYS.has(key)) return null;
        let display: string;
        if (value === null || value === undefined) display = "—";
        else if (typeof value === "object") display = stripHeavyJson(value);
        else if (key === "imageData" && typeof value === "string") display = `[image — ${value.length} characters]`;
        else display = String(value);
        return (
          <div key={key} className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{key}</span>
            <span className="break-words text-sm font-medium text-gray-800">{display}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Zebra table of a profile's time-series dataset. */
export function DynamicDataset({ dataset }: { dataset: Array<Record<string, any>> | undefined }) {
  if (!dataset || dataset.length === 0) return null;
  const headers = Object.keys(dataset[0]);
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-100 text-xs font-semibold uppercase text-gray-600">
              {headers.map((h) => (
                <th key={h} className="select-none px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
            {dataset.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50/50">
                {headers.map((h) => (
                  <td key={h} className="px-4 py-2.5 font-mono tabular-nums text-gray-900">
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
}

/** Property table highlighting differences: original (struck, red) → proposed (green). */
export function DynamicDiff({
  original,
  proposed,
}: {
  original: Record<string, any>;
  proposed: Record<string, any>;
}) {
  const keys = Array.from(new Set([...Object.keys(original ?? {}), ...Object.keys(proposed ?? {})]))
    .filter((k) => !HIDDEN_KEYS.has(k));

  const rows = keys
    .map((key) => ({
      key,
      origVal: original?.[key],
      propVal: proposed?.[key],
      // Comparaison sur la version allégée : diffuser deux chaînes base64 de
      // plusieurs Mo gèlerait l'interface. Un changement portant UNIQUEMENT sur
      // une image n'apparaît donc pas ici (il reste visible via l'aperçu du nœud).
      origStr: stripHeavyJson(original?.[key]),
      propStr: stripHeavyJson(proposed?.[key]),
    }))
    .filter((r) => r.origStr !== r.propStr);

  if (rows.length === 0) {
    return (
      <p className="text-sm italic text-gray-400">
        No field-level differences (an image-only change is shown in the node preview).
      </p>
    );
  }

  const cell = (v: any, s: string) =>
    v !== null && v !== undefined
      ? typeof v === "object" || (typeof v === "string" && v.startsWith("data:"))
        ? s
        : String(v)
      : "—";

  return (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
      <div className="grid grid-cols-3 bg-gray-100 px-4 py-2.5 text-xs font-semibold uppercase text-gray-600">
        <div>Property</div>
        <div>Original</div>
        <div>Proposed</div>
      </div>
      {rows.map(({ key, origVal, propVal, origStr, propStr }) => (
        <div key={key} className="grid grid-cols-3 items-center gap-2 px-4 py-2.5 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{key}</div>
          <div className="break-all rounded border border-red-100 bg-red-50 px-2 py-1 font-mono text-red-600 line-through">
            {cell(origVal, origStr)}
          </div>
          <div className="break-all rounded border border-green-100 bg-green-50 px-2 py-1 font-mono font-medium text-green-700">
            {cell(propVal, propStr)}
          </div>
        </div>
      ))}
    </div>
  );
}
