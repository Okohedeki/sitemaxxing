/* The planner decides which passes matter for this brief and this page, in what order, and says
   why. It replaces a fixed points table: the same page with a different goal gets a different plan. */

import { GOALS, avoidOf, moodFit } from './brief';
import type { Brief, Finding, Mood, PassDefinition, PassKind, Serve } from './types';

export interface Detection {
  applies: boolean;
  findings: Finding[];
  reason?: string;
}

export interface PlanItem {
  defId: string;
  include: boolean;
  /** 0–100. */
  impact: number;
  rationale: string;
  skipReason?: string;
  order: number;
}

/** Minimum impact for a pass to be proposed. Lower = more passes; noise lowers it a little. */
export const INCLUDE_THRESHOLD = 28;

const KIND_BASE: Record<PassKind, number> = { direction: 0, refine: 100, component: 200 };

const SERVE_LINES: Record<Serve, (brief: Brief) => string> = {
  action: (b) => `makes the next step to ${GOALS[b.goal].verb} obvious`,
  clarity: (b) => (b.audience ? `tells ${b.audience} what this is in one read` : 'says what this is in one read'),
  trust: (b) => (b.audience ? `gives ${b.audience} a reason to believe it` : 'gives visitors a reason to believe it'),
  character: () => 'gives the page a face of its own',
  mood: (b) => (b.feeling.length ? `makes it feel ${b.feeling.slice(0, 2).join(' and ')}` : 'sets the mood before anyone reads'),
  polish: () => 'removes the small tells of a template',
};

function severity(findings: Finding[]): number {
  let s = 0;
  for (const f of findings) s += f.severity === 'warn' ? 1 : 0.35;
  return Math.min(1, s / 2.5);
}

/** Impact of one pass: how broken the page is on this axis × how much the goal cares × mood fit. */
export function scorePass(def: PassDefinition, det: Detection, brief: Brief, mood: Mood): { impact: number; rationale: string; top: Serve } {
  const weights = GOALS[brief.goal].serves;
  const serves = def.serves.length ? def.serves : (['polish'] as Serve[]);
  const ranked = [...serves].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
  const top = ranked[0];
  // The best-served axis counts most; the rest add a little.
  const w = (s: Serve) => weights[s] ?? 0.3;
  const rest = ranked.slice(1);
  const goalFit = rest.length ? 0.75 * w(top) + (0.25 * rest.reduce((a, s) => a + w(s), 0)) / rest.length : w(top);
  const sev = severity(det.findings);
  const raw = (0.25 + 0.75 * sev) * goalFit * moodFit(def.moodBias, mood);
  const impact = Math.round(Math.max(0, Math.min(1, raw)) * 100);
  return { impact, rationale: `For ${GOALS[brief.goal].label.toLowerCase()}: ${SERVE_LINES[top](brief)}`, top };
}

/**
 * Plans the queue. Direction always comes first (it sets the tokens everything else uses); within
 * refine and component passes the order follows impact, while dependencies still come first.
 */
export function plan(defs: PassDefinition[], detections: Map<string, Detection>, brief: Brief, mood: Mood): PlanItem[] {
  const avoid = avoidOf(brief);
  const threshold = INCLUDE_THRESHOLD - 10 * brief.noise;
  const items: PlanItem[] = defs.map((def) => {
    const det = detections.get(def.id) ?? { applies: false, findings: [], reason: 'not checked' };
    const { impact, rationale } = scorePass(def, det, brief, mood);
    let skipReason: string | undefined;
    // keep.colors does not skip Direction: it anchors the generated palettes on the existing accent.
    if (!det.applies) skipReason = det.reason ?? 'already fine';
    else if (brief.keep.fonts && def.id === 'font') skipReason = 'you asked to keep your fonts';
    else if (brief.keep.copy && def.id === 'copy') skipReason = 'you asked to keep your copy';
    else if (avoid.motion && (def.moodBias?.energy ?? 0) > 0.3 && def.kind === 'component') skipReason = 'you asked for nothing that moves';
    else if (def.kind !== 'direction' && impact < threshold) skipReason = `low impact for ${GOALS[brief.goal].label.toLowerCase()} (${impact}/100)`;
    return { defId: def.id, include: !skipReason, impact, rationale, skipReason, order: 0 };
  });

  // Order: by kind, then impact, then respect dependsOn (a pass never precedes what it depends on).
  const byId = new Map(defs.map((d) => [d.id, d]));
  const itemById = new Map(items.map((i) => [i.defId, i]));
  const sorted = [...defs].sort((a, b) => KIND_BASE[a.kind] - KIND_BASE[b.kind] || (itemById.get(b.id)!.impact - itemById.get(a.id)!.impact) || a.order - b.order);
  const placed: string[] = [];
  const visit = (id: string, stack = new Set<string>()) => {
    if (placed.includes(id) || stack.has(id)) return;
    stack.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) if (byId.has(dep)) visit(dep, stack);
    placed.push(id);
  };
  for (const d of sorted) visit(d.id);
  placed.forEach((id, i) => {
    const item = itemById.get(id)!;
    item.order = KIND_BASE[byId.get(id)!.kind] + i;
  });
  return items.sort((a, b) => a.order - b.order);
}
