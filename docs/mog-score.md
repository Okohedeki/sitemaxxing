# Mog score v1

The Mog score estimates first-impression appeal from 0 to 100. It is a **transparent heuristic**,
not a trained model, and it is a **check, not a target**: it tells you whether a change made the
first viewport calmer and clearer, and later phases use it only to gate options, never to rank
them.

It is computed on the first viewport (1440×900) from a Playwright screenshot and the computed
styles of the rendered DOM.

| Metric | How it is measured | Target | Weight |
|---|---|---|---|
| Colorfulness | Hasler–Süsstrunk colourfulness of the screenshot, downsampled 4× | fine below 15, zero at 75 | 0.15 |
| Visual complexity | Sobel edge density plus the count of connected "busy" cells on a coarse grid | low within limits | 0.10 |
| Type contrast | h1 font size ÷ body font size | ≥ 2.75 (ramp from 2.1) | 0.15 |
| Copy slop | hits from `slop-words.json` plus emoji in h1–h3 and buttons above the fold | 0 (−0.2 per hit) | 0.25 |
| Focus | solid buttons above the fold, excluding menu toggles | 1 primary, at most 1 quiet secondary | 0.20 |
| Alignment | distinct left edges among block-level text above the fold | ≤ 1 (zero at 4) | 0.10 |
| Line length | capacity of the first paragraph's measure in characters | 45 to 90 | 0.05 |

Each metric becomes a sub-score from 0 to 1, the weighted sum is multiplied by 100, and the
metrics with a sub-score under 0.6 become the notes shown in the score tooltip. Weights and
targets live in `packages/mog-score/src/weights.json`.

## Calibration

On the two sample sites, the sloppy baselines score 31 (Fieldnote) and 39 (Isvik); with every
pass approved they score 94 and 91. The end-to-end test in `packages/core/src/engine.test.ts`
asserts those ranges so a change to the passes or the weights that breaks them fails CI.

## What it is not

It does not know your audience, your brand or your category. Research it leans on (Lindgaard
2006, Tuch 2012, Reinecke 2013) describes averages; Reinecke and Gajos 2014 shows preferences
differ by group, which is exactly why Phase 2 learns a personal offset instead of chasing this
number.
