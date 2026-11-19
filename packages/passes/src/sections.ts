/* Section passes: proof, features and the closing call to action. Each picks three components from
   the library for the brief, renders them from the copy file, and inserts them in the right place. */

import { defineComponent, cssEdit, jsxEdit, jsonEdit, rngFor, GOALS, hashSeed, type Finding, type Mood, type PassContext, type PatchFile, type PassDefinition, type Serve, type Variant } from '@sitemaxxing/core';
import { EMOJI_RE } from '@sitemaxxing/rules';
import { COMPONENT_DIR, COMPONENTS, selectComponents, type ComponentSlot, type SelectedComponent } from '@sitemaxxing/components';
import { appendChild, contentIdentifier, heroOf, importPath, insertAfterNode, jsxFor, readSources, rootElement } from './shared';

interface SectionPassSpec {
  id: string;
  name: string;
  slot: ComponentSlot;
  order: number;
  serves: Serve[];
  moodBias?: Partial<Mood>;
  ruleCards: string[];
  description: string;
  /** Where it goes: right after the hero, at the end of <main>, or as a sibling of the root's content. */
  place: 'after-hero' | 'end-of-main' | 'end-of-root';
  /** Finds problems this section answers, given the content file and the page. */
  findings(ctx: PassContext): Finding[];
  /** An existing element this section replaces (e.g. emoji feature cards). */
  replaces?: (ctx: PassContext) => string | undefined;
}

const has = (ctx: PassContext) => (key: string) => {
  const v = (ctx.content?.data as any)?.[key];
  return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
};

function tagsIn(app: string, slot: ComponentSlot): string[] {
  return COMPONENTS.filter((c) => c.slot === slot)
    .flatMap((c) => c.files ?? [])
    .map((f) => f.name.replace(/\.tsx?$/, ''))
    .filter((n) => n !== 'section-types' && new RegExp(`<${n}\\b`).test(app));
}

export function sectionPass(spec: SectionPassSpec): PassDefinition {
  const picks = (ctx: PassContext): SelectedComponent[] => selectComponents(spec.slot, { mood: ctx.mood, goal: ctx.brief.goal, noise: ctx.brief.noise, rng: rngFor(ctx, spec.id), has: has(ctx) });
  return defineComponent({
    id: spec.id,
    name: spec.name,
    order: spec.order,
    serves: spec.serves,
    moodBias: spec.moodBias,
    ruleCards: spec.ruleCards,
    description: spec.description,
    async detect(ctx) {
      const src = readSources(ctx);
      if (!ctx.content) return { applies: false, findings: [], reason: `needs a copy file (${ctx.config.content}) to draw from` };
      const present = tagsIn(src.app, spec.slot);
      if (present.length) return { applies: false, findings: [], reason: `already has ${present.join(', ')}` };
      if (!picks(ctx).length) {
        const needs = [...new Set(COMPONENTS.filter((c) => c.slot === spec.slot).flatMap((c) => c.requires ?? []))];
        return { applies: false, findings: [], reason: `add ${needs.map((n) => `"${n}"`).join(' or ')} to the copy file to unlock this` };
      }
      const findings = spec.findings(ctx);
      return { applies: true, findings };
    },
    async variants(ctx) {
      return picks(ctx).map((p): Variant => ({ id: p.id, label: p.label, thumbnail: p.spec.thumb, attributes: p.attributes, source: 'library' }));
    },
    async propose(ctx, variantId) {
      const all = picks(ctx);
      const pick = all.find((p) => p.id === variantId) ?? all[0];
      const c = pick.spec;
      const src = readSources(ctx);
      const files: PatchFile[] = [];
      for (const f of c.files ?? []) {
        const path = `${COMPONENT_DIR}/${f.name}`;
        files.push({ path, before: ctx.files.exists(path) ? ctx.files.read(path) : '', after: f.code });
      }
      const { file } = jsxEdit.parseTsx(src.app);
      const content = contentIdentifier(file, ctx.config.content) ?? 'content';
      const data = (ctx.content?.data ?? {}) as Record<string, unknown>;
      // The closing line must not repeat the hero: it comes from the copy file, or the story.
      let title = typeof data.closing === 'string' ? `${content}.closing` : `${content}.headline`;
      if (spec.slot === 'cta' && typeof data.closing !== 'string' && ctx.content) {
        const line = closingLine(ctx);
        if (line) {
          const before = ctx.files.read(ctx.content.path);
          files.push({ path: ctx.content.path, before, after: jsonEdit.setJsonValues(before, { closing: line }) });
          title = `${content}.closing`;
        }
      }
      const jsx = c.usage!({ content, params: pick.params, seed: hashSeed(ctx.seeds[spec.id] ?? 0, c.id) % 100000, title });
      const replaceSel = spec.replaces?.(ctx);
      const replaceEl = replaceSel ? jsxEdit.find(file, (e) => jsxEdit.hasClass(e, replaceSel)) : undefined;
      let placed = false;
      if (replaceEl) {
        replaceEl.replaceWithText(jsx);
        placed = true;
      } else if (spec.place === 'after-hero') {
        placed = insertAfterNode(file, jsxFor(file, heroOf(ctx.dom)), jsx);
      }
      if (!placed && spec.place !== 'end-of-root') {
        const main = jsxEdit.find(file, (e) => jsxEdit.tagName(e) === 'main');
        placed = appendChild(file, main as any, jsx);
      }
      if (!placed) placed = appendChild(file, rootElement(file), jsx);
      if (!placed) throw new Error('could not find where to place the section');
      const tag = (c.files ?? []).map((f) => f.name.replace(/\.tsx?$/, '')).find((n) => n !== 'section-types')!;
      jsxEdit.addImport(file, tag, importPath(ctx, COMPONENT_DIR, tag));
      files.push({ path: ctx.config.sources.app, before: src.app, after: jsxEdit.tidy(file.getFullText()) });
      files.push({ path: ctx.config.sources.styles, before: src.styles, after: cssEdit.appendCss(src.styles, c.css ?? '', `sitemaxxing: ${c.id}`) });
      return { summary: `${c.label}: ${c.description.charAt(0).toLowerCase()}${c.description.slice(1)}${replaceEl ? ', in place of the old section' : ''}`, files: files.filter((f) => f.before !== f.after) };
    },
    highlight(ctx, variantId) {
      const id = variantId?.replace(/^(fit|stretch|wildcard)-/, '');
      const cls: Record<string, string> = {
        'metric-strip': '.sm-metrics',
        'pull-quote': '.sm-quote',
        'fact-ticker': '.sm-ticker',
        'numbered-rows': '.sm-rows',
        'bento-grid': '.sm-bento',
        'spec-list': '.sm-spec',
        'closing-band': '.sm-closing',
        'sticky-bar': '.sm-sticky',
        'split-cta': '.sm-split',
      };
      return [id && cls[id] ? cls[id] : 'main > section:last-child'];
    },
  });
}

/** A closing line that is not the hero headline: a later sentence of the story, or who it is for. */
export function closingLine(ctx: PassContext): string | undefined {
  const data = (ctx.content?.data ?? {}) as Record<string, unknown>;
  const hero = `${data.headline ?? ''} ${data.subhead ?? ''}`.toLowerCase();
  const sentences = ctx.brief.story.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const fresh = sentences.slice(1).find((x) => x.split(/\s+/).length <= 14 && !hero.includes(x.toLowerCase().slice(0, 24)));
  if (fresh) return fresh;
  if (ctx.brief.audience) return `Made for ${ctx.brief.audience}. ${GOALS[ctx.brief.goal].cta[0]} when you are ready.`;
  return undefined;
}

const featuresSection = (ctx: PassContext) => ctx.dom.nodes.find((n) => n.tag === 'section' && n.classes.some((c) => /feature/i.test(c)));

export const proof = sectionPass({
  id: 'proof',
  name: 'Proof',
  slot: 'proof',
  order: 13,
  serves: ['trust'],
  ruleCards: ['laws-of-ux-millers', 'human-md-specificity', 'nng-aesthetic-usability'],
  description: 'Show the evidence: your figures or a customer voice, given room',
  place: 'after-hero',
  findings(ctx) {
    const out: Finding[] = [];
    const data = (ctx.content?.data ?? {}) as any;
    const pageText = ctx.dom.nodes.map((n) => n.text).join(' ');
    const facts: Array<{ value: string }> = Array.isArray(data.facts) ? data.facts : [];
    const shown = facts.filter((f) => pageText.includes(f.value));
    if (facts.length && shown.length < facts.length) out.push({ message: `${facts.length - shown.length} of your figures are not shown above the footer`, severity: 'warn' });
    if (data.quote?.text && !pageText.includes(String(data.quote.text).slice(0, 30))) out.push({ message: 'a customer quote in the copy file is not on the page', severity: 'warn' });
    if (!out.length) out.push({ message: 'no proof section near the top' });
    return out;
  },
});

export const features = sectionPass({
  id: 'features',
  name: 'Features',
  slot: 'features',
  order: 14,
  serves: ['clarity', 'trust'],
  ruleCards: ['laws-of-ux-millers', 'refactoring-ui-hierarchy', 'every-layout'],
  description: 'Say what it does in a form that suits the story: rows, a grid, or a spec sheet',
  place: 'after-hero',
  replaces: (ctx) => featuresSection(ctx)?.classes.find((c) => /feature/i.test(c)),
  findings(ctx) {
    const out: Finding[] = [];
    const sec = featuresSection(ctx);
    if (sec) {
      const kids = ctx.dom.nodes.filter((n) => n.parent === sec.index);
      const emoji = ctx.dom.nodes.filter((n) => EMOJI_RE.test(n.text) && n.text.length <= 4);
      if (emoji.length) out.push({ message: 'feature cards use emoji as icons', selector: sec.selector, severity: 'warn' });
      if (kids.some((k) => (k.styles.boxShadow ?? 'none') !== 'none')) out.push({ message: 'equal shadowed cards with no hierarchy', selector: sec.selector, severity: 'warn' });
    } else out.push({ message: 'the features in your copy file are not on the page', severity: 'warn' });
    return out;
  },
});

export const closingCta = sectionPass({
  id: 'closing-cta',
  name: 'Closing call to action',
  slot: 'cta',
  order: 15,
  serves: ['action'],
  ruleCards: ['refactoring-ui-buttons', 'laws-of-ux-fitts', 'vercel-content'],
  description: 'End the page on the one next step',
  place: 'end-of-main',
  findings(ctx) {
    const out: Finding[] = [];
    const ctaText = String((ctx.content?.data as any)?.cta ?? '');
    const h1 = ctx.dom.first('h1');
    const later = ctx.dom.nodes.filter((n) => (n.tag === 'a' || n.tag === 'button') && h1 && n.box.y > h1.box.y + 900 && ctaText && n.text.includes(ctaText.slice(0, 8)));
    if (!later.length) out.push({ message: 'the page ends without asking for the next step', severity: 'warn' });
    return out;
  },
});
