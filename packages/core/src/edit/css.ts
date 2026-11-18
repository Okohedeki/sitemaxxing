import postcss, { type Root, type Rule } from 'postcss';

/** Sets declarations on the first rule matching `selector`, creating the rule when missing. */
export function setDeclarations(css: string, selector: string, decls: Record<string, string>, opts: { important?: boolean } = {}): string {
  const root = postcss.parse(css);
  let rule = findRule(root, selector);
  if (!rule) {
    rule = postcss.rule({ selector });
    root.append(rule);
    if (root.nodes.length > 1) rule.raws.before = '\n\n';
  }
  for (const [prop, value] of Object.entries(decls)) {
    let hit = false;
    rule.walkDecls(prop, (d) => {
      d.value = value;
      if (opts.important) d.important = true;
      hit = true;
    });
    if (!hit) rule.append(postcss.decl({ prop, value, important: opts.important }));
  }
  return root.toString();
}

/** Removes declarations from a rule. Returns css unchanged if the rule is missing. */
export function removeDeclarations(css: string, selector: string, props: string[]): string {
  const root = postcss.parse(css);
  const rule = findRule(root, selector);
  if (!rule) return css;
  rule.walkDecls((d) => {
    if (props.includes(d.prop)) d.remove();
  });
  if (rule.nodes.length === 0) rule.remove();
  return root.toString();
}

export function findRule(root: Root, selector: string): Rule | undefined {
  let out: Rule | undefined;
  root.walkRules((r) => {
    if (out) return;
    if (r.parent && r.parent.type === 'atrule') return;
    if (r.selectors.map((s) => s.trim()).includes(selector)) out = r;
  });
  return out;
}

export function hasRule(css: string, selector: string): boolean {
  try {
    return !!findRule(postcss.parse(css), selector);
  } catch {
    return false;
  }
}

/** Appends a block of CSS text at the end, separated by a blank line. */
export function appendCss(css: string, block: string, marker?: string): string {
  if (marker && css.includes(marker)) return css;
  const sep = css.endsWith('\n') ? '\n' : '\n\n';
  return css + sep + (marker ? `/* ${marker} */\n` : '') + block.trim() + '\n';
}

/** Replaces or inserts custom properties on :root. */
export function setRootVars(css: string, vars: Record<string, string>): string {
  return setDeclarations(css, ':root', vars);
}

/** Collects every `px` value used in padding, margin and gap declarations. */
export function spacingValues(css: string): number[] {
  const out: number[] = [];
  try {
    const root = postcss.parse(css);
    root.walkDecls(/^(padding|margin|gap|row-gap|column-gap)/, (d) => {
      for (const m of d.value.matchAll(/(\d+(?:\.\d+)?)px/g)) out.push(parseFloat(m[1]));
    });
  } catch {
    /* ignore */
  }
  return out;
}

export function declValue(css: string, selector: string, prop: string): string | undefined {
  try {
    const rule = findRule(postcss.parse(css), selector);
    let v: string | undefined;
    rule?.walkDecls(prop, (d) => {
      v = d.value;
    });
    return v;
  } catch {
    return undefined;
  }
}
