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
- A welcome screen: one focused URL field that reads back the address it understood and explains
  an empty or malformed one inline, the four steps ahead, and a real before and after of a sample
  that sweeps once and then follows your drag. Samples and recent projects are one click away.
- The control room is restyled: one accent kept for the action, focus and progress; a display
  serif for headlines; small muted section labels; regions separated by tone and space instead of
  lines; one primary button per view with quieter secondary and link-style tertiary actions;
  press feedback on every control and no animation on keyboard-driven rows; AA contrast for every
  text colour. Each direction says why it is there, the score says what it measures and ignores,
  saving ends on what was saved and how to step back, and the tab title follows the step.
- Dev servers Sitemaxxing starts (playgrounds, version previews, rebuilt sites) each get their own
  Vite cache, so two running at once no longer reload each other into a blank page.
- The side drawer no longer casts its shadow into the page while closed.
- Any URL: paste a public page and it is rebuilt as an editable Vite + React project, committed as
  v1, served and opened, with a first draft of the story read from the page. Pages behind a bot
  check are refused with a clear message.
- Guided control room: one decision at a time (direction, then each change, already previewed),
  with Keep / Skip / Show me others, a "why skip?" question that leans the next options, and a
  Save step. The full queue is one click away.
- The hub records what it has applied on disk and takes it back on the next start, so a killed
  process no longer leaves a project looking like it has someone else's uncommitted edits.
- Reason chips steer: saying why a pass was rejected leans its next roll (calmer, bolder, closer
  to the brief, more classic), and the rest of the page a little. The row shows the lean.
- Opening a project a second time keeps the changes already applied on disk.
- `scripts/dev.mjs --fresh` rebuilds the sample playgrounds; the end-to-end tests use it.

## 0.1.0

- First open-source release: repo mode, live overlay, control room, direction pass, the ten
  day-one techniques, hero art and preloader components, Mog score v1, patch queue, commits and
  versions, MCP server with WebSocket hub, decision log, plugin API and CLI.
