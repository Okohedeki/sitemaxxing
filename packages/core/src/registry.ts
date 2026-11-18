import type { PassDefinition } from './types';

/**
 * Resolves the pass list for a project. 'default' expands to the built-in set; any other entry is
 * an npm package name (sitemaxxing-pass-*) exporting `passes`.
 */
export async function resolvePasses(
  names: string[],
  builtIns: PassDefinition[],
  importer: (name: string) => Promise<any> = (n) => import(n),
): Promise<PassDefinition[]> {
  const out: PassDefinition[] = [];
  for (const name of names) {
    if (name === 'default') {
      out.push(...builtIns);
      continue;
    }
    const mod = await importer(name);
    const passes: PassDefinition[] = mod.passes ?? mod.default?.passes ?? mod.default ?? [];
    for (const p of Array.isArray(passes) ? passes : [passes]) if (p && p.id) out.push(p);
  }
  const seen = new Set<string>();
  return out
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => a.order - b.order);
}

export const DEPENDENCY_GRAPH: Record<string, string[]> = {
  font: ['direction'],
  'font-size': ['font'],
  alignment: ['declutter'],
  'hero-art': ['imagery'],
};

export function downstreamOf(id: string, passes: PassDefinition[]): string[] {
  const out = new Set<string>();
  const walk = (x: string) => {
    for (const p of passes) {
      if ((p.dependsOn ?? []).includes(x) && !out.has(p.id)) {
        out.add(p.id);
        walk(p.id);
      }
    }
  };
  walk(id);
  return [...out];
}
