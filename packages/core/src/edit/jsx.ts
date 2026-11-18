import { Project, SyntaxKind, type JsxElement, type JsxSelfClosingElement, type SourceFile, type Node } from 'ts-morph';

export type JsxLike = JsxElement | JsxSelfClosingElement;

export function parseTsx(code: string, name = 'App.tsx'): { project: Project; file: SourceFile } {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, compilerOptions: { jsx: 4 } });
  const file = project.createSourceFile(name, code);
  return { project, file };
}

export function allJsx(file: SourceFile): JsxLike[] {
  return [
    ...file.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ].sort((a, b) => a.getStart() - b.getStart());
}

export function openingOf(el: JsxLike) {
  return el.getKind() === SyntaxKind.JsxElement ? (el as JsxElement).getOpeningElement() : (el as JsxSelfClosingElement);
}

export function tagName(el: JsxLike): string {
  return openingOf(el).getTagNameNode().getText();
}

export function attr(el: JsxLike, name: string): string | undefined {
  const a = openingOf(el).getAttribute(name);
  if (!a || a.getKind() !== SyntaxKind.JsxAttribute) return undefined;
  const init = (a as any).getInitializer?.();
  if (!init) return '';
  const text = init.getText();
  if (init.getKind() === SyntaxKind.StringLiteral) return text.slice(1, -1);
  const inner = init.getKind() === SyntaxKind.JsxExpression ? init.getExpression?.() : undefined;
  if (inner && inner.getKind() === SyntaxKind.StringLiteral) return inner.getText().slice(1, -1);
  if (inner && inner.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) return inner.getText().slice(1, -1);
  return text;
}

export function classes(el: JsxLike): string[] {
  const c = attr(el, 'className') ?? '';
  return c.split(/\s+/).filter(Boolean);
}

export function hasClass(el: JsxLike, cls: string): boolean {
  return classes(el).includes(cls);
}

export function textOf(el: JsxLike): string {
  return el
    .getText()
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function find(file: SourceFile, pred: (el: JsxLike) => boolean): JsxLike | undefined {
  return allJsx(file).find(pred);
}

export function findAll(file: SourceFile, pred: (el: JsxLike) => boolean): JsxLike[] {
  return allJsx(file).filter(pred);
}

/** Finds the JSX element whose className list contains every class in `cls`. */
export function byClass(file: SourceFile, ...cls: string[]): JsxLike | undefined {
  return find(file, (el) => cls.every((c) => hasClass(el, c)));
}

/** Removes an element along with the whitespace line it sits on. */
export function removeElement(el: Node): void {
  const parent = el.getParent();
  if (!parent) return;
  const text = el.getText();
  const full = el.getFullText();
  if (full.includes(text)) {
    el.replaceWithText('');
  }
}

export function removeElements(els: Node[]): void {
  for (const el of [...els].sort((a, b) => b.getStart() - a.getStart())) removeElement(el);
}

export function replaceElement(el: Node, text: string): void {
  el.replaceWithText(text);
}

export function addImport(file: SourceFile, spec: string, moduleSpecifier: string, isDefault = false): void {
  const existing = file.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (existing) {
    if (isDefault) {
      if (!existing.getDefaultImport()) existing.setDefaultImport(spec);
    } else if (!existing.getNamedImports().some((n) => n.getName() === spec)) existing.addNamedImport(spec);
    return;
  }
  const last = file.getImportDeclarations().at(-1);
  const decl = { moduleSpecifier, ...(isDefault ? { defaultImport: spec } : { namedImports: [spec] }) };
  if (last) file.insertImportDeclaration(last.getChildIndex() + 1, decl);
  else file.insertImportDeclaration(0, decl);
}

export function addSideEffectImport(file: SourceFile, moduleSpecifier: string): void {
  if (file.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier)) return;
  const last = file.getImportDeclarations().at(-1);
  if (last) file.insertImportDeclaration(last.getChildIndex() + 1, { moduleSpecifier });
  else file.insertImportDeclaration(0, { moduleSpecifier });
}

/** Cleans blank lines left behind by removals. */
export function tidy(code: string): string {
  return code.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n').replace(/[ \t]+\n/g, '\n');
}

export function setAttr(el: JsxLike, name: string, value: string): void {
  const open = openingOf(el);
  const a = open.getAttribute(name);
  if (a && a.getKind() === SyntaxKind.JsxAttribute) (a as any).setInitializer(value);
  else open.addAttribute({ name, initializer: value });
}

export function setClassName(el: JsxLike, cls: string[]): void {
  setAttr(el, 'className', `"${cls.join(' ')}"`);
}

export function addClass(el: JsxLike, cls: string): void {
  const c = classes(el);
  if (!c.includes(cls)) setClassName(el, [...c, cls]);
}
