/** Replaces top-level or dotted keys in a JSON document while keeping its formatting style. */
export function setJsonValues(text: string, values: Record<string, unknown>): string {
  const data = JSON.parse(text);
  for (const [key, value] of Object.entries(values)) {
    const parts = key.split('.');
    let cur: any = data;
    for (const p of parts.slice(0, -1)) {
      if (cur[p] === undefined || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p];
    }
    cur[parts.at(-1)!] = value;
  }
  const indent = detectIndent(text);
  return JSON.stringify(data, null, indent) + (text.endsWith('\n') ? '\n' : '');
}

export function getJsonValue(text: string, key: string): unknown {
  try {
    let cur: any = JSON.parse(text);
    for (const p of key.split('.')) cur = cur?.[p];
    return cur;
  } catch {
    return undefined;
  }
}

function detectIndent(text: string): number | string {
  const m = text.match(/\n([ \t]+)"/);
  if (!m) return 2;
  return m[1].includes('\t') ? '\t' : m[1].length;
}

/** Finds the dotted key path whose string value equals `value`. */
export function findKeyByValue(data: unknown, value: string, prefix = ''): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' && v.replace(/\s+/g, ' ').trim() === value.replace(/\s+/g, ' ').trim()) return key;
    if (v && typeof v === 'object') {
      const hit = findKeyByValue(v, value, key);
      if (hit) return hit;
    }
  }
  return undefined;
}
