/**
 * Neutralise les champs lourds avant un rendu JSON.
 *
 * Les nœuds de taxonomie peuvent porter une image (`imageData`) stockée en
 * base64 : un seul standard illustré pèse alors plusieurs Mo. Sérialiser un tel
 * objet avec JSON.stringify au moment du rendu (aperçu de soumission, diff de
 * validation) est SYNCHRONE et gèle l'interface pendant plusieurs secondes.
 *
 * Ces helpers produisent une copie allégée destinée UNIQUEMENT à l'affichage :
 * les images et les très longues chaînes sont remplacées par un résumé. Ne
 * jamais persister le résultat — c'est une vue, pas une donnée.
 */

const MAX_STRING = 2000;

export function stripHeavyFields(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `[image ${value.length} caractères — masquée]`;
    if (value.length > MAX_STRING) return `${value.slice(0, MAX_STRING)}… [${value.length} caractères]`;
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripHeavyFields(item, seen));
  }

  if (value !== null && typeof value === "object") {
    if (seen.has(value)) return "[référence circulaire]";
    seen.add(value);

    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === "imageData" && typeof v === "string") {
        out[key] = `[image ${v.length} caractères — masquée]`;
        continue;
      }
      out[key] = stripHeavyFields(v, seen);
    }
    return out;
  }

  return value;
}

/** Version compacte pour une cellule (pas d'indentation). */
export function stripHeavyJson(value: unknown): string {
  try {
    return JSON.stringify(stripHeavyFields(value));
  } catch {
    return "[aperçu indisponible]";
  }
}

/** Version indentée pour un bloc <pre>. */
export function safePreviewJson(value: unknown): string {
  try {
    return JSON.stringify(stripHeavyFields(value), null, 2);
  } catch {
    return "[aperçu indisponible]";
  }
}
