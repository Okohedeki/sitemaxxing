import { definePass, jsxEdit, jsonEdit, cssEdit, type CopyChange, type Finding, type PassContext, type PatchFile } from '@sitemaxxing/core';
import { SLOP_WORDS, SLOP_PHRASES, adjectiveRuns, slopHits, stripEmoji, EMOJI_RE } from '@sitemaxxing/rules';
import { cleanText, copyColumnOf, ctaOf, descendants, h1Of, heroOf, readSources, selFor, wordCount } from './shared';

interface CopyInputs {
  headline: string;
  subhead: string;
  cta: string;
  pill?: string;
}

interface Fact {
  value: string;
  label: string;
}

function factsOf(ctx: PassContext): Fact[] {
  const fromContent = (ctx.content?.data as any)?.facts;
  if (Array.isArray(fromContent)) return fromContent.filter((f) => f && f.value && f.label);
  // Extract figures from page text: "12 cm resolution", "38 countries".
  const text = ctx.dom.nodes.map((n) => n.text).join(' · ');
  const out: Fact[] = [];
  for (const m of text.matchAll(/(\d[\d,.]*\s?(?:cm|mm|km|m|%|x)?)\s+([a-z][a-z ]{2,24})/gi)) {
    if (out.length >= 3) break;
    out.push({ value: m[1].trim(), label: m[2].trim() });
  }
  return out;
}

function subheadOf(ctx: PassContext): { text: string; node?: ReturnType<typeof h1Of> } {
  const col = copyColumnOf(ctx.dom);
  const h1 = h1Of(ctx.dom);
  const p = (col ? ctx.dom.childrenOf(col) : ctx.dom.byTag('p')).find((n) => n.tag === 'p' && h1 && n.box.y > h1.box.y && n.text.length > 30);
  return { text: p?.text ?? '', node: p };
}

function pillOf(ctx: PassContext) {
  const col = copyColumnOf(ctx.dom);
  const h1 = h1Of(ctx.dom);
  if (!col || !h1) return undefined;
  return ctx.dom.childrenOf(col).find((n) => n.box.y < h1.box.y && n.box.h < 48 && n.text.length > 0 && n.text.length < 60);
}

function inputsOf(ctx: PassContext): CopyInputs {
  return {
    headline: cleanText(h1Of(ctx.dom)?.text ?? ''),
    subhead: cleanText(subheadOf(ctx).text),
    cta: cleanText(ctaOf(ctx.dom)?.text ?? ''),
    pill: pillOf(ctx)?.text,
  };
}

function sentenceCase(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Deterministic rewrite used offline: strip slop and emoji, then build claims from facts. */
export function ruleBasedRewrite(inp: CopyInputs, facts: Fact[]): CopyInputs {
  const strip = (t: string) =>
    SLOP_PHRASES.reduce((acc, ph) => acc.replace(new RegExp(ph, 'gi'), ''), stripEmoji(t))
      .replace(new RegExp(`\\b(${SLOP_WORDS.map((w) => w.replace(/-/g, '\\-')).join('|')})\\b`, 'gi'), '')
      .replace(/\b(the|of|your|and|with|to)\b\s+(?=(the|of|your|and|with|to)\b)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,!?])/g, '$1')
      .trim();
  const f = (i: number) => (facts[i] ? `${facts[i].value} ${facts[i].label.toLowerCase()}` : '');
  let headline = sentenceCase(strip(inp.headline).replace(/^(the|a|an)\s+/i, ''));
  const wasSlop = slopHits(inp.headline).length > 0;
  if (facts.length && (wasSlop || wordCount(headline) < 3 || wordCount(headline) > 8)) headline = sentenceCase(f(0)) + '.';
  if (wordCount(headline) > 8) headline = headline.split(/\s+/).slice(0, 8).join(' ');
  let subhead = facts.length ? sentenceCase(facts.map((_, i) => f(i)).filter(Boolean).join(', ')) + '.' : strip(inp.subhead);
  if (wordCount(subhead) > 25) subhead = subhead.split(/\s+/).slice(0, 25).join(' ');
  let cta = strip(inp.cta).replace(/\b(free|now|today)\b/gi, '').trim();
  cta = cta ? sentenceCase(cta.toLowerCase()) : 'See how it works';
  if (wordCount(cta) > 4) cta = cta.split(/\s+/).slice(0, 4).join(' ');
  const pill = inp.pill ? sentenceCase(strip(inp.pill).toLowerCase()) : undefined;
  return { headline, subhead, cta, pill };
}

async function llmRewrite(ctx: PassContext, inp: CopyInputs, facts: Fact[]): Promise<CopyInputs | null> {
  if (!ctx.llm) return null;
  const pageText = ctx.dom.aboveFold().map((n) => n.text).filter(Boolean).slice(0, 60).join(' | ');
  const system = [
    'You rewrite landing-page copy. Reply with JSON only: {"headline","subhead","cta","pill"}.',
    'Rules: the headline is ONE concrete, specific claim of at most 8 words.',
    'The subhead is at most 25 words, specific (numbers, places, who it is for), roughly half the length of the original.',
    'The button says what happens next, at most 4 words, no exclamation marks.',
    'The pill, if given, becomes a 3 to 5 word plain descriptor with no emoji.',
    'Never use these words: ' + SLOP_WORDS.join(', ') + '. No emoji. No stacked adjectives.',
    'Never invent numbers; only use figures that appear in the facts or page text. If there are no facts, keep the original text and add "note": "need a fact".',
  ].join('\n');
  const user = JSON.stringify({ category: ctx.config.category ?? ctx.project.category ?? 'unknown', section: 'hero', original: inp, facts, pageText });
  try {
    const raw = await ctx.llm.complete([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 400, json: true });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const out = JSON.parse(m[0]);
    const ok = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && !slopHits(s).length && !EMOJI_RE.test(s);
    if (!ok(out.headline) || !ok(out.subhead) || !ok(out.cta)) return null;
    if (wordCount(out.headline) > 8 || wordCount(out.subhead) > 25 || wordCount(out.cta) > 4) return null;
    const allowed = (facts.map((f) => f.value).join(' ') + ' ' + pageText).replace(/[^\d]/g, ' ');
    const digits = `${out.headline} ${out.subhead}`.match(/\d+/g) ?? [];
    if (digits.some((d) => !allowed.includes(d))) return null;
    return { headline: out.headline.trim(), subhead: out.subhead.trim(), cta: out.cta.trim(), pill: inp.pill ? (ok(out.pill) ? out.pill.trim() : stripEmoji(inp.pill)) : undefined };
  } catch {
    return null;
  }
}

export const copy = definePass({
  id: 'copy',
  name: 'Copy',
  kind: 'refine',
  order: 3,
  points: 10,
  ruleCards: ['human-md-specificity', 'human-md-no-slop', 'vercel-content'],
  description: 'One concrete claim instead of filler; the subhead cut by half and made specific; buttons say what happens',
  async detect(ctx) {
    const inp = inputsOf(ctx);
    const findings: Finding[] = [];
    const h1Hits = slopHits(inp.headline);
    if (h1Hits.length) findings.push({ message: `headline slop: ${h1Hits.map((h) => h.term).join(', ')}`, selector: 'h1', severity: 'warn' });
    const subHits = slopHits(inp.subhead);
    if (subHits.length) findings.push({ message: `subhead slop: ${subHits.map((h) => h.term).join(', ')}`, severity: 'warn' });
    if (wordCount(inp.subhead) > 25) findings.push({ message: `subhead is ${wordCount(inp.subhead)} words (over 25)`, severity: 'warn' });
    if (adjectiveRuns(inp.subhead) || adjectiveRuns(inp.headline)) findings.push({ message: 'three or more adjectives in a row' });
    const ctaHits = slopHits(inp.cta);
    if (ctaHits.length) findings.push({ message: `button slop or emoji: ${ctaHits.map((h) => h.term).join(', ')}`, severity: 'warn' });
    if (inp.pill && EMOJI_RE.test(inp.pill)) findings.push({ message: 'emoji in the eyebrow' });
    const emojiCards = descendants(ctx.dom, heroOf(ctx.dom)?.parent !== undefined ? ctx.dom.nodes[0] : undefined).filter((n) => n.classes.some((c) => /emoji|icon/.test(c)) && EMOJI_RE.test(n.text));
    if (emojiCards.length >= 2) findings.push({ message: `${emojiCards.length} feature cards use emoji as icons` });
    const applies = findings.some((f) => f.severity === 'warn');
    return { applies, findings, reason: applies ? undefined : 'copy already specific' };
  },
  async propose(ctx) {
    const inp = inputsOf(ctx);
    const facts = factsOf(ctx);
    const viaLlm = await llmRewrite(ctx, inp, facts);
    const out = viaLlm ?? ruleBasedRewrite(inp, facts);
    const notes = viaLlm
      ? [`Rewritten with ${ctx.llm!.provider} (${ctx.llm!.model}) from ${facts.length} facts found on the page`]
      : [ctx.llm ? 'LLM reply failed validation; rule-based rewrite used instead' : 'LLM not configured: rule-based rewrite (set ANTHROPIC_API_KEY or OPENAI_API_KEY for a sharper headline)'];
    const files: PatchFile[] = [];
    const copyDiff: CopyChange[] = [];
    const src = readSources(ctx);
    const keysToSet: Record<string, unknown> = {};
    const resolveKey = (text: string, hint: string) => {
      if (!ctx.content) return undefined;
      const data = ctx.content.data as any;
      if (typeof data[hint] === 'string') return hint;
      return jsonEdit.findKeyByValue(data, text);
    };
    const pairs: Array<[string, string, string, string]> = [
      ['headline', inp.headline, out.headline, '[data-copy="headline"], h1'],
      ['subhead', inp.subhead, out.subhead, '[data-copy="subhead"]'],
      ['cta', inp.cta, out.cta, '[data-copy="cta"]'],
    ];
    if (inp.pill && out.pill) pairs.push(['pill', inp.pill, out.pill, '[data-copy="pill"]']);
    let appAfter = src.app;
    for (const [hint, oldText, newText, selector] of pairs) {
      if (!oldText || !newText || oldText === newText) continue;
      const key = resolveKey(oldText, hint);
      if (key) {
        keysToSet[key] = newText;
        copyDiff.push({ key, old: oldText, new: newText, selector });
      } else if (appAfter.includes(oldText)) {
        appAfter = appAfter.split(oldText).join(newText);
        copyDiff.push({ key: hint, old: oldText, new: newText, selector });
      }
    }
    if (ctx.content && 'highlight' in (ctx.content.data as any) && keysToSet.headline !== undefined) keysToSet.highlight = '';
    if (ctx.content && Object.keys(keysToSet).length) {
      const before = ctx.files.read(ctx.content.path);
      files.push({ path: ctx.content.path, before, after: jsonEdit.setJsonValues(before, keysToSet) });
    }
    // Feature cards with emoji become a spec row of real figures.
    const { file } = jsxEdit.parseTsx(appAfter);
    const cards = jsxEdit.find(file, (e) => jsxEdit.tagName(e) === 'section' && jsxEdit.classes(e).some((c) => /feature/.test(c)) && EMOJI_RE.test(e.getText()) === false && /emoji|icon/.test(e.getText()));
    if (cards && facts.length && ctx.content && Array.isArray((ctx.content.data as any).facts)) {
      cards.replaceWithText(`<section className="spec">
          {content.facts.map((f) => (
            <div key={f.label}>
              <b>{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </section>`);
      appAfter = jsxEdit.tidy(file.getFullText());
      copyDiff.push({ key: 'features', old: 'three emoji feature cards', new: facts.map((f) => `${f.value} ${f.label}`).join(' · '), selector: '.spec' });
      if (!cssEdit.hasRule(src.styles, '.spec')) {
        const block = `.spec { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line, #ddd); margin: 0 clamp(20px, 5vw, 64px); }
.spec div { padding: 28px 0 28px 24px; border-right: 1px solid var(--line, #ddd); }
.spec div:first-child { padding-left: 0; } .spec div:last-child { border-right: 0; }
.spec b { display: block; font-family: var(--display, inherit); font-weight: 400; font-size: clamp(32px, 3.2vw, 48px); line-height: 1; letter-spacing: -0.02em; }
.spec span { font-family: var(--label, inherit); font-size: 13px; color: var(--soft, #666); text-transform: uppercase; letter-spacing: 0.06em; }`;
        files.push({ path: ctx.config.sources.styles, before: src.styles, after: cssEdit.appendCss(src.styles, block, 'sitemaxxing: spec row') });
      }
    }
    if (appAfter !== src.app) files.push({ path: ctx.config.sources.app, before: src.app, after: appAfter });
    return { summary: `"${out.headline}"`, files, copyDiff, notes };
  },
  highlight(ctx) {
    const sel = ['h1'];
    const sub = subheadOf(ctx).node;
    if (sub) sel.push(selFor(sub));
    const cta = ctaOf(ctx.dom);
    if (cta) sel.push(cta.selector);
    return sel;
  },
  copyDiff() {
    return [];
  },
});
