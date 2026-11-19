# Writing a pass

A pass is a plugin that detects one kind of problem and proposes **one patch that changes one
thing**. It never decides on its own whether it matters: the planner does that from the owner's
brief. The built-in passes in `packages/passes/src` are the reference implementations.

```ts
import { definePass, cssEdit } from 'sitemaxxing';

export const tighterTracking = definePass({
  id: 'tighter-tracking',
  name: 'Tighter tracking',
  kind: 'refine',            // 'direction' | 'refine' | 'component'
  order: 6.5,                // a hint; the planner orders by impact within the kind
  serves: ['polish', 'character'],   // what it improves; weighed against the goal
  moodBias: { energy: 0.2 },         // optional: moods it suits (+) or fights (-)
  dependsOn: ['font'],       // marked stale when these are rejected or change variant
  ruleCards: ['butterick-tracking'],
  description: 'Negative tracking on the headline',

  async detect(ctx) {
    const h1 = ctx.dom.first('h1');
    const applies = !!h1 && parseFloat(h1.styles.letterSpacing) >= 0;
    return { applies, findings: applies ? [{ message: 'display tracking is not negative', selector: 'h1', severity: 'warn' }] : [], reason: applies ? undefined : 'already tight' };
  },

  async propose(ctx) {
    const path = ctx.config.sources.styles;
    const before = ctx.files.read(path);
    // Read the brief: a bolder story gets tighter tracking.
    const em = -0.02 - 0.015 * Math.max(0, ctx.mood.energy);
    const after = cssEdit.setDeclarations(before, 'h1', { 'letter-spacing': `${em.toFixed(3)}em` });
    return { summary: `Headline tracking ${Math.round(em * 1000) / 10}%`, files: [{ path, before, after }] };
  },

  highlight() {
    return ['h1'];
  },
});
```

## How a pass gets into the queue

1. `detect` runs on every pass and returns findings (`warn` counts more than `info`).
2. The planner scores each pass: how severe the findings are, times how much the brief's goal
   cares about what the pass `serves`, times how well its `moodBias` fits the brief's mood.
3. Passes above the threshold are proposed with a one-line rationale ("For bookings: makes the next
   step to book obvious"). The rest are shown under *Left out for this story* with the reason.

So do not try to make your pass look important: report honest findings and declare what it serves.

## The context

- `ctx.brief`: the owner's story, audience, goal, feeling words, `keep`, `avoid`, `noise` (0 to 1)
  and `seed`. `ctx.mood`: the brief read into six axes (energy, warmth, formality, classic,
  density, dark), each from -1 to 1.
- `rngFor(ctx, 'your-pass-id')`: a seeded random generator. Use it for every random choice so the
  same seed reproduces the same proposal, and Randomize (a new seed) produces a new one.
- `ctx.dom`: the rendered page (nodes with tag, classes, text, box and computed styles).
- `ctx.files`, `ctx.config.sources`, `ctx.tokens`, `ctx.content` (the copy file), `ctx.llm`
  (undefined offline; only copy should need it).

Helpers: `cssEdit` (postcss), `jsxEdit` (ts-morph), `jsonEdit` (format-preserving), `GOALS`,
`avoidOf`, `moodFit`, plus `shared` from `@sitemaxxing/passes` for the nav, hero, copy column and
call to action.

## Variants come from the library

Do not hard-code a list of three looks. Add references to the library instead and let selection
pick for the brief:

```ts
import { selectComponents, componentIdOf } from '@sitemaxxing/components';

async variants(ctx) {
  return selectComponents('proof', { mood: ctx.mood, goal: ctx.brief.goal, noise: ctx.brief.noise, rng: rngFor(ctx, 'proof') })
    .map((p) => ({ id: p.id, label: p.label, thumbnail: p.spec.thumb, attributes: p.attributes }));
},
```

`selectComponents` returns a **Fit** (closest to the brief), a **Stretch** (on-brief but different
from the Fit) and a **Wildcard** (further away as noise rises), with numeric params perturbed by
noise. Variant ids look like `fit-metric-strip`; `componentIdOf` strips the slot. `propose` must
regenerate the same list from the same seed to find the chosen variant, so keep it deterministic.

To add a reference, give it a `mood`, the `goals` it serves, a thumbnail, and either its source
files and CSS (sections) or the id your pass's insertion code handles (navigation, preloaders).
Use the direction tokens (`--bg`, `--ink`, `--soft`, `--line`, `--acc`, `--display`, `--label`) so
it follows whatever palette the owner picks. Everything must be original work.

## Rules

1. `detect` must be honest: return `applies: false` with a `reason` when there is nothing to fix.
2. `propose` returns the full before/after of each file it touches; the engine diffs them.
3. Respect `ctx.brief.keep` and `avoidOf(ctx.brief)` (no dark palettes, no motion, no serifs).
4. Never invent content. Sections render only from keys that exist in the copy file.
5. Cite rule cards from `packages/rules/cards`, or add new ones in your own words.

## Shipping it

Inside this repo: add the file to `packages/passes/src`, register it in `index.ts`, add a unit
test. As a package: name it `sitemaxxing-pass-<name>`, export `passes`, and users list it in
`sitemaxxing.config.ts` under `passes: ['default', 'sitemaxxing-pass-<name>']`.
