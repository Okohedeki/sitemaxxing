import {
  definePass,
  cssEdit,
  rngFor,
  type Finding,
  type PassContext,
  type SnapNode,
  type Variant,
} from '@sitemaxxing/core';
import {
  heroLayoutCss,
  selectHeroLayouts,
  type HeroParts,
  type SelectedLayout,
} from '@sitemaxxing/components';
import { artOf } from './imagery';
import { changed, copyColumnOf, h1Of, heroOf, readSources, selFor } from './shared';

/** Selectors for the hero's parts, or undefined when the page has no hero with a copy column. */
export function heroParts(
  ctx: Pick<PassContext, 'dom'>,
): (HeroParts & { mediaNode?: SnapNode }) | undefined {
  const heroNode = heroOf(ctx.dom);
  const col = copyColumnOf(ctx.dom);
  const h1 = h1Of(ctx.dom);
  if (!heroNode || !col || !h1 || col === heroNode || ctx.dom.parentOf(col) !== heroNode)
    return undefined;
  const hero = selFor(heroNode, 'main > section');
  const copy = selFor(col, `${hero} > div`);
  // The headline as a direct child of the copy column, so grid placement reaches it.
  let head: SnapNode | undefined = h1;
  while (head && ctx.dom.parentOf(head) !== col) head = ctx.dom.parentOf(head);
  const headline = `${copy} > ${selFor(head ?? h1, 'h1')}`;
  const mediaNode = artOf(ctx);
  return {
    hero,
    copy,
    headline,
    media: mediaNode ? selFor(mediaNode, ':last-child') : undefined,
    mediaNode,
  };
}

/** What the hero looks like now, in the library's words. */
function currentLayout(ctx: PassContext, parts: NonNullable<ReturnType<typeof heroParts>>): string {
  const heroNode = heroOf(ctx.dom)!;
  const cols = (heroNode.styles.gridTemplateColumns ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (!parts.mediaNode) return 'text only';
  const media = parts.mediaNode;
  const col = copyColumnOf(ctx.dom)!;
  if (media.box.w >= heroNode.box.w * 0.9 && media.box.h >= heroNode.box.h * 0.8) return 'poster';
  if (cols >= 2 || Math.abs(media.box.y - col.box.y) < col.box.h)
    return media.box.x < col.box.x ? 'picture-first' : 'split';
  return 'stacked';
}

function picks(ctx: PassContext): SelectedLayout[] {
  const parts = heroParts(ctx);
  return selectHeroLayouts({
    mood: ctx.mood,
    goal: ctx.brief.goal,
    noise: ctx.brief.noise,
    rng: rngFor(ctx, 'hero-layout'),
    hasMedia: !!parts?.media,
  });
}

export const heroLayout = definePass({
  id: 'hero-layout',
  name: 'Hero layout',
  kind: 'refine',
  order: 1.5,
  serves: ['character', 'clarity'],
  ruleCards: ['refactoring-ui-hierarchy', 'every-layout', 'tuch-2012-prototypicality'],
  description:
    'Compose the first screen for this story: where the headline, the picture and the step sit',
  async detect(ctx) {
    const findings: Finding[] = [];
    const parts = heroParts(ctx);
    if (!parts)
      return { applies: false, findings, reason: 'no hero with a copy column to arrange' };
    const now = currentLayout(ctx, parts);
    const col = copyColumnOf(ctx.dom)!;
    const centred = (col.styles.textAlign ?? '') === 'center';
    if (now === 'split' && centred)
      findings.push({
        message: 'copy is centred inside one half of a split, so nothing lines up',
        selector: parts.copy,
        severity: 'warn',
      });
    const top = picks(ctx)[0];
    const flawed = findings.length > 0;
    // When the current composition is already the brief's closest reference and nothing is wrong
    // with it, leave it alone: changing layout for its own sake is how sites drift to one look.
    if (!flawed && (!top || top.ref.id === now))
      return {
        applies: false,
        findings,
        reason: `already composed as ${now.replace('-', ' ')}, which suits this story`,
      };
    if (now === 'split')
      findings.push({
        message: 'the template split: copy on the left, picture on the right',
        selector: parts.hero,
      });
    if (top && top.ref.id !== now)
      findings.push({
        message: `this story reads closer to ${top.ref.label.toLowerCase()} than to ${now.replace('-', ' ')}`,
        severity: now === 'split' ? 'warn' : 'info',
      });
    return { applies: true, findings };
  },
  async variants(ctx) {
    return picks(ctx).map(
      (p): Variant => ({
        id: p.id,
        label: p.label,
        thumbnail: p.ref.thumb,
        attributes: p.attributes,
        source: 'library',
      }),
    );
  },
  async propose(ctx, variantId) {
    const parts = heroParts(ctx);
    if (!parts) throw new Error('no hero to arrange');
    const all = picks(ctx);
    const pick = all.find((p) => p.id === variantId) ?? all[0];
    const src = readSources(ctx);
    const css = cssEdit.appendCss(
      src.styles,
      heroLayoutCss(pick, parts),
      'sitemaxxing: hero layout',
    );
    const shape = Object.entries(pick.params)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    return {
      summary: `${pick.ref.label}: ${pick.ref.description.charAt(0).toLowerCase()}${pick.ref.description.slice(1)} (${shape})`,
      files: changed([{ path: ctx.config.sources.styles, before: src.styles, after: css }]),
    };
  },
  highlight(ctx) {
    return [selFor(heroOf(ctx.dom), 'main > section')];
  },
});
