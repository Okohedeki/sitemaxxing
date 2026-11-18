import postcss from 'postcss';
import type { DesignTokens, FileSystem, ResolvedConfig } from './types';

/** Reads `--custom-properties` declared on :root from the tokens file (or the stylesheet). */
export function readTokens(files: FileSystem, config: ResolvedConfig): DesignTokens {
  const candidates = [config.sources.tokens, config.sources.styles, 'src/index.css'];
  for (const file of candidates) {
    if (!files.exists(file)) continue;
    const vars = rootVars(files.read(file));
    if (Object.keys(vars).length) return { file, vars };
  }
  return { vars: {} };
}

export function rootVars(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    const root = postcss.parse(css);
    root.walkRules((rule) => {
      if (!rule.selectors.some((s) => s.trim() === ':root' || s.trim() === 'html')) return;
      rule.walkDecls((d) => {
        if (d.prop.startsWith('--')) vars[d.prop] = d.value;
      });
    });
  } catch {
    /* unparsable css: no tokens */
  }
  return vars;
}
