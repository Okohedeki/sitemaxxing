# Writing a pass

A pass is a plugin that detects one kind of slop and proposes **one patch that changes one
thing**. The built-in passes in `packages/passes/src` are the reference implementations.

```ts
import { definePass } from 'sitemaxxing';

export const tighterTracking = definePass({
  id: 'tighter-tracking',
  name: 'Tighter tracking',
  kind: 'refine',            // 'direction' | 'refine' | 'component'
  order: 6.5,                // where it sits in the coarse-to-fine order
  points: 2,                 // expected Mog gain, shown as +2
  dependsOn: ['font'],       // marked stale when these are rejected or change variant
  ruleCards: ['butterick-tracking'],
  description: 'Negative tracking on the headline',

  async detect(ctx) {
    const h1 = ctx.dom.first('h1');
    const applies = !!h1 && parseFloat(h1.styles.letterSpacing) >= 0;
    return { applies, findings: applies ? [{ message: 'display tracking is not negative', selector: 'h1' }] : [], reason: applies ? undefined : 'already tight' };
  },

  async propose(ctx) {
    const path = ctx.config.sources.styles;
    const before = ctx.files.read(path);
    const after = cssEdit.setDeclarations(before, 'h1', { 'letter-spacing': '-0.03em' });
    return { summary: 'Headline tracking −3%', files: [{ path, before, after }] };
  },

  highlight() {
    return ['h1'];
  },
});
```

## The context

`ctx` gives you everything a pass needs without touching the network:

- `ctx.dom`: the rendered page (nodes with tag, classes, text, box and computed styles) with
  `query`, `first`, `byTag`, `aboveFold`, `parentOf`, `childrenOf`.
- `ctx.files`: read files in the target repo; `ctx.config.sources` names the app, styles,
  tokens and fonts files.
- `ctx.tokens`: the `--custom-properties` declared on `:root`.
- `ctx.content`: the parsed copy file (`src/content.json` by default), when it exists.
- `ctx.llm`: an adapter when a key is configured, otherwise `undefined`. Everything except the
  Copy pass must work without it.
- `ctx.choices`: the variant chosen for every pass so far; `ctx.applied`: passes currently
  applied in the tree.

Helpers: `cssEdit` (postcss), `jsxEdit` (ts-morph) and `jsonEdit` (format-preserving) from
`@sitemaxxing/core`, plus `shared` from `@sitemaxxing/passes` for finding the nav, hero, copy
column and call to action.

## Rules

1. `detect` must be honest: return `applies: false` with a `reason` when there is nothing to fix.
   The queue shows "Skipped: <reason>".
2. `propose` returns the full before/after of each file it touches. Keep hunks small; the engine
   diffs them. Never write to disk yourself.
3. Variants: implement `variants(ctx)` returning `{ id, label, thumbnail }` (inline SVG) and
   accept `variantId` in `propose`. Put readable `attributes` on each variant; Phase 2 learns
   from them.
4. `highlight` returns the selectors the overlay outlines. Use `forceState` to open a menu or
   hold a hover while previewing, and `replay: true` to replay an entrance.
5. Be deterministic. The engine re-runs `propose` when another pass shifted your context.
6. Cite rule cards from `packages/rules/cards`, or add new ones in your own words.

## Shipping it

Inside this repo: add the file to `packages/passes/src`, register it in `index.ts` at the right
order, add a unit test. As a package: name it `sitemaxxing-pass-<name>`, export `passes`, and
users list it in `sitemaxxing.config.ts` under `passes: ['default', 'sitemaxxing-pass-<name>']`.
