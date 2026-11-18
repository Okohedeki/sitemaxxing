import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRuleCard, type RuleCard } from './schema';
import slop from '../slop-words.json';

export type { RuleCard } from './schema';
export { isRuleCard } from './schema';

function cardsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, '..', 'cards'), path.join(here, '..', '..', 'cards')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(here, '..', 'cards');
}

let cache: RuleCard[] | null = null;

export function loadRuleCards(): RuleCard[] {
  if (cache) return cache;
  const dir = cardsDir();
  const out: RuleCard[] = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (isRuleCard(c)) out.push(c);
      } catch {
        /* skip bad card */
      }
    }
  }
  cache = out.sort((a, b) => a.id.localeCompare(b.id));
  return cache;
}

export function ruleCard(id: string): RuleCard | undefined {
  return loadRuleCards().find((c) => c.id === id);
}

export function cardsForPass(passId: string): RuleCard[] {
  return loadRuleCards().filter((c) => c.passes.includes(passId));
}

/** Simple ranked keyword search across every text field. */
export function searchRules(query: string, limit = 8): RuleCard[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (!terms.length) return loadRuleCards().slice(0, limit);
  return loadRuleCards()
    .map((c) => {
      const hay = `${c.id} ${c.passes.join(' ')} ${c.principle} ${c.detect} ${c.fix} ${c.source.title} ${c.source.author}`.toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0) + (c.id.includes(t) ? 2 : 0) + (c.passes.includes(t) ? 2 : 0), 0);
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

export const rules = { search: searchRules, byId: ruleCard, all: loadRuleCards, forPass: cardsForPass };

// ---------- slop words ----------

export const SLOP_WORDS: string[] = slop.words;
export const SLOP_PHRASES: string[] = slop.phrases;
export const EMOJI_RE = new RegExp(slop.emoji, 'gu');

export interface SlopHit {
  term: string;
  kind: 'word' | 'phrase' | 'emoji';
}

export function slopHits(text: string): SlopHit[] {
  const out: SlopHit[] = [];
  const lower = text.toLowerCase();
  for (const w of SLOP_WORDS) {
    if (new RegExp(`(^|[^a-z-])${w.replace(/[-]/g, '\\-')}([^a-z-]|$)`, 'i').test(lower)) out.push({ term: w, kind: 'word' });
  }
  for (const p of SLOP_PHRASES) {
    if (new RegExp(p, 'i').test(lower)) out.push({ term: p, kind: 'phrase' });
  }
  const emoji = text.match(EMOJI_RE);
  if (emoji) for (const e of new Set(emoji)) out.push({ term: e, kind: 'emoji' });
  return out;
}

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

/** Counts runs of three or more adjectives, approximated by common adjective suffixes. */
export function adjectiveRuns(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  const isAdj = (w: string) => /(?:ful|less|ous|ive|able|ible|ing|ed|ary|ic|al|ate|ent|est|ier|y)$/.test(w) && w.length > 4;
  let run = 0;
  let count = 0;
  for (const w of words) {
    if (isAdj(w)) run++;
    else run = 0;
    if (run === 3) count++;
  }
  return count;
}
