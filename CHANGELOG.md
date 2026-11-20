# Changelog

This file is managed by Changesets. Run `pnpm changeset` to add an entry.

## Unreleased

- System view: reads the design system a project already has, from its rendered page and its
  stylesheets. Colours by role, type sizes and families, spacing steps and the grid they sit on,
  corner radii, shadows, repeated buttons, fields and cards grouped by how they look, motion, and
  the share of colour, size and spacing values that read from shared values. Shown as a specimen
  sheet beside the page, and available as `read_design_system` over MCP.
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
- The control room is redesigned as a dark app: film grain, one warm light behind the page, prism
  light for marks and the current step, and heavy expanded caps for the wordmark and headings.
  The start screen is plain: one URL field (a white card with the button inside), the samples,
  recent projects and an open-folder link. The workspace is a fixed shell: the page fills a
  browser window on the left, and the panel on the right scrolls on its own under a pinned
  header and versions footer. The steps are tabs in the top bar, the guide holds the change in
  focus as one card with Keep and Skip under it, and the full list gives the options its whole
  width.
- On the page itself, a previewed change is circled in a ring of prism light with a short note
  beside it, and the mark stays until the preview ends instead of flashing.
- Every direction says why it is there, the score says what it measures and ignores, saving ends on
  what was saved and how to step back, and the tab title follows the step.
- Dev servers Sitemaxxing starts (playgrounds, version previews, rebuilt sites) each get their own
  Vite cache, so two running at once no longer reload each other into a blank page.
- The side drawer no longer casts its shadow into the page while closed.
- A pasted page is now copied faithfully: its own elements, stylesheets and fonts, not a fixed
  template filled with its words. The copy's first screen is compared with the original and the
  match is shown. Every copied element has its own name, so a change lands on exactly that one.
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
