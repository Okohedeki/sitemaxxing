/* Format-preserving JSON edits: only the span of a changed value is rewritten, so two passes
   editing different keys of the same file produce patches that apply independently. */

interface Span {
  start: number;
  end: number;
}

/** Minimal JSON walker that records the text span of every value, keyed by dotted path. */
function spans(text: string): Map<string, Span> {
  const out = new Map<string, Span>();
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const str = (): string => {
    // assumes text[i] === '"'
    let j = i + 1;
    let s = '';
    while (j < text.length) {
      const c = text[j];
      if (c === '\\') {
        s += JSON.parse(`"${text.slice(j, j + (text[j + 1] === 'u' ? 6 : 2))}"`);
        j += text[j + 1] === 'u' ? 6 : 2;
        continue;
      }
      if (c === '"') break;
      s += c;
      j++;
    }
    i = j + 1;
    return s;
  };
  const value = (path: string): void => {
    ws();
    const start = i;
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') i++;
      else
        while (i < text.length) {
          ws();
          const key = str();
          ws();
          i++; // :
          value(path ? `${path}.${key}` : key);
          ws();
          if (text[i] === ',') {
            i++;
            continue;
          }
          if (text[i] === '}') {
            i++;
            break;
          }
          break;
        }
    } else if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') i++;
      else {
        let n = 0;
        while (i < text.length) {
          value(`${path}.${n++}`);
          ws();
          if (text[i] === ',') {
            i++;
            continue;
          }
          if (text[i] === ']') {
            i++;
            break;
          }
          break;
        }
      }
    } else if (c === '"') str();
    else {
      while (i < text.length && !/[,\]}\s]/.test(text[i])) i++;
    }
    out.set(path, { start, end: i });
  };
  value('');
  return out;
}

function indentOf(text: string, pos: number): string {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  return (text.slice(lineStart, pos).match(/^[ \t]*/) ?? [''])[0];
}

function detectIndent(text: string): string {
  const m = text.match(/\n([ \t]+)"/);
  return m ? m[1] : '  ';
}

/** Replaces the values at the given dotted keys, keeping every other byte of the file. */
export function setJsonValues(text: string, values: Record<string, unknown>): string {
  let out = text;
  for (const [key, v] of Object.entries(values)) {
    const map = spans(out);
    const span = map.get(key);
    const unit = detectIndent(out);
    if (!span) {
      // Append a new top-level key at the end of the root object.
      const root = map.get('')!;
      const closing = out.lastIndexOf('}', root.end);
      const before = out.slice(0, closing).replace(/\s+$/, '');
      const needsComma = !/\{\s*$/.test(before);
      out = `${before}${needsComma ? ',' : ''}\n${unit}${JSON.stringify(key)}: ${JSON.stringify(v)}\n${out.slice(closing)}`;
      continue;
    }
    const indent = indentOf(out, span.start);
    const rendered = typeof v === 'object' && v !== null ? JSON.stringify(v, null, unit).replace(/\n/g, '\n' + indent) : JSON.stringify(v);
    out = out.slice(0, span.start) + rendered + out.slice(span.end);
  }
  return out;
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
