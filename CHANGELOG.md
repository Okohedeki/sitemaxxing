# Changelog

This file is managed by Changesets. Run `pnpm changeset` to add an entry.

## Unreleased

- Story first: a brief (story, audience, goal, feeling, keep, avoid, noise) is required before
  planning, from the control room's Story step, `set_brief` over MCP, the config, or
  `audit --brief`.
- The planner replaces fixed points. It weighs what each pass serves against the goal and mood,
  proposes what matters with a reason, and sets the rest aside.
- Reference library: 12 directions generated in OKLCH, 12 open type pairings, hero fields
  (contour lines and orbits added), and new proof, features and closing call-to-action sections.
- Fit, Stretch and Wildcard picks per pass; seeded noise; Randomize per pass or for every open pass.
- The Mog score targets follow the brief, and the ring re-measures the page after each change.
- Previews write each file once, so the dev server never serves a stale palette.
- Hero layout: seven compositions for the first screen, picked per brief like palettes and
  sections. Imagery no longer forces every photo into one full-bleed overlay.
- New sections: lead figure, step path and inline ask, so Randomize always has another option.
- Opening a project a second time keeps the changes already applied on disk.
- `scripts/dev.mjs --fresh` rebuilds the sample playgrounds; the end-to-end tests use it.

## 0.1.0

- First open-source release: repo mode, live overlay, control room, direction pass, the ten
  day-one techniques, hero art and preloader components, Mog score v1, patch queue, commits and
  versions, MCP server with WebSocket hub, decision log, plugin API and CLI.
