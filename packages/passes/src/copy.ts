import { definePass, jsonEdit, rngFor, GOALS, type CopyChange, type Finding, type PassContext, type PatchFile } from '@sitemaxxing/core';
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
/**
 * Splits the owner's story into a headline-sized main clause and the rest. The story is their own
 * words, so it is the most specific material available offline.
 */
export function storyClauses(story: string): { head?: string; rest?: string } {
  const first = (story.split(/(?<=[.!?])\s+/)[0] ?? '').replace(/[.!?]+$/, '').trim();
  if (!first) return {};
  const m = first.match(/^(.*?)(?:,\s+|\s+(?:so|so that|which|that|because|while|for)\s+|\s+[—–-]\s+)(.*)$/i);
  const head = (m ? m[1] : first).trim();
  const rest = m ? m[2].trim().replace(/^(so that|so|which|that|because|while|and)\s+/i, '') : '';
  if (wordCount(head) > 9 || wordCount(head) < 3) return { rest: first };
  return { head, rest: rest || undefined };
}

export function ruleBasedRewrite(inp: CopyInputs, facts: Fact[], opts: { cta?: string; story?: string } = {}): CopyInputs {
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
  const story = storyClauses(opts.story ?? '');
  const needsNew = wasSlop || wordCount(headline) < 3 || wordCount(headline) > 8;
  let usedFact = 0;
  let storyRest: string | undefined;
  if (needsNew && story.head && !slopHits(story.head).length) {
    headline = sentenceCase(story.head) + '.';
    storyRest = story.rest;
  } else if (needsNew && facts.length) {
    headline = sentenceCase(f(0)) + '.';
    usedFact = 1;
  }
  if (wordCount(headline) > 8) headline = headline.split(/\s+/).slice(0, 8).join(' ');
  // Skip facts the headline or story clause already says (in any words: "12" or "twelve").
  const said = `${headline} ${storyRest ?? ''}`.toLowerCase();
  const NUM: Record<string, string> = { '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten', '12': 'twelve', '20': 'twenty' };
  const alreadySaid = (fact: Fact) => {
    const words = `${fact.value} ${fact.label}`.toLowerCase().match(/[a-z]{4,}|\d+/g) ?? [];
    const hits = words.filter((w) => said.includes(w) || (NUM[w] && said.includes(NUM[w])));
    return words.length > 0 && hits.length / words.length >= 0.5;
  };
  const rest = facts
    .slice(usedFact)
    .filter((fact) => !alreadySaid(fact))
    .map((fact) => `${fact.value} ${fact.label.toLowerCase()}`);
  const factLine = rest.length ? sentenceCase(rest.join(', ')) + '.' : '';
  let subhead = storyRest ? [sentenceCase(storyRest) + '.', factLine].filter(Boolean).join(' ') : factLine || (facts.length ? sentenceCase(f(0)) + '.' : strip(inp.subhead));
  if (wordCount(subhead) > 25) subhead = storyRest ? sentenceCase(storyRest) + '.' : subhead;
  if (wordCount(subhead) > 25) subhead = subhead.split(/\s+/).slice(0, 25).join(' ');
  let cta = strip(inp.cta).replace(/\b(free|now|today)\b/gi, '').trim();
  // A button that was slop gets the goal's own verb ("Check dates" for bookings).
  if (opts.cta && (slopHits(inp.cta).length || wordCount(cta) < 2)) cta = opts.cta;
  cta = wordCount(cta) >= 2 ? sentenceCase(cta.toLowerCase()) : 'See how it works';
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
    'The button says what happens next for the goal, at most 4 words, no exclamation marks.',
    'Write for the audience and in the feeling given; the story is the owner’s own description, use its nouns.',
    'The pill, if given, becomes a 3 to 5 word plain descriptor with no emoji.',
    'Never use these words: ' + SLOP_WORDS.join(', ') + '. No emoji. No stacked adjectives.',
    'Never invent numbers; only use figures that appear in the facts or page text. If there are no facts, keep the original text and add "note": "need a fact".',
  ].join('\n');
  const user = JSON.stringify({
    story: ctx.brief.story,
    audience: ctx.brief.audience,
    goal: `get visitors to ${GOALS[ctx.brief.goal].verb}`,
    feeling: ctx.brief.feeling,
    category: ctx.config.category ?? ctx.project.category ?? 'unknown',
    section: 'hero',
    original: inp,
    facts,
    pageText,
  });
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
  serves: ['clarity', 'action', 'trust'],
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
    const goalCta = rngFor(ctx, 'copy').pick(GOALS[ctx.brief.goal].cta);
    const out = viaLlm ?? ruleBasedRewrite(inp, facts, { cta: goalCta, story: ctx.brief.story });
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
    // Feature copy: filler entries are dropped, never half-rewritten. If too few real ones are
    // left, the features stay as they are and the pass says what is missing.
    const feats = (ctx.content?.data as any)?.features;
    if (ctx.content && Array.isArray(feats)) {
      const isFiller = (f: any) => slopHits(`${f?.title ?? ''} ${f?.text ?? ''}`).length > 0;
      const keep = feats.filter((f: any) => !isFiller(f));
      const dropped = feats.filter(isFiller);
      if (dropped.length && keep.length >= 2) {
        keysToSet.features = keep;
        copyDiff.push({ key: 'features', old: dropped.map((f: any) => f.title).join(' · '), new: `kept ${keep.map((f: any) => f.title).join(' · ')}`, selector: '[class*="feature"], .sm-rows, .sm-bento, .sm-spec' });
        const before = ctx.files.read(ctx.content.path);
        const rest = files.filter((f) => f.path !== ctx.content!.path);
        files.length = 0;
        files.push(...rest, { path: ctx.content.path, before, after: jsonEdit.setJsonValues(before, keysToSet) });
      } else if (dropped.length) {
        notes.push(`${dropped.length} of ${feats.length} feature descriptions read as filler; add real details to ${ctx.content.path}${ctx.llm ? '' : ' or set an LLM key'}`);
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
