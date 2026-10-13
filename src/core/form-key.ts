/**
 * A short React key built from the values a form shows. When any saved value
 * changes, the key changes, so React redraws the form from the server's values
 * instead of patching the old one. Without it, a form whose fields were edited
 * (or altered by a browser extension) could keep showing the old values after
 * a save, and the confirmation could fail to appear.
 */
export function savedValuesKey(values: unknown): string {
  // FNV-1a over a key-order-independent JSON form: short, and the same for the same values.
  const text = stableJson(values);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}
