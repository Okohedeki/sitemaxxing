# Sitemaxxing v1 plan

This is the file-by-file plan for Phase 1, written before the code. It maps every mockup
interaction to real code and records the assumptions made along the way.

## Guiding decisions

1. **Patches are unified diffs, applied in-process.** Every pass produces one `.patch` file under
   `<target>/.sitemaxxing/patches/`. The engine applies and reverses them with the `diff` package
   (fuzzy hunk matching), so a preview is a file write plus a Vite hot reload, well under a second.
   Git is used only to refuse dirty trees, to commit, and to serve old versions from a worktree.
2. **Passes edit code, not classes.** The mockups toggle CSS classes; the real passes rewrite
   `src/content.json`, `src/tokens.css`, `src/styles.css` and `src/App.tsx` in the target, using
   `postcss` for CSS, `ts-morph` for JSX and JSON edits for copy. Component passes write new files
   under `src/sitemaxxing/` and splice them into `App.tsx`.
3. **One hub process.** `sitemaxxing dev` starts a single Node process on port 3333 that serves the
   MCP endpoint (`/mcp`), the WebSocket hub (`/live`), the overlay script (`/overlay.js`) and a
   small JSON-RPC used by the control room over the same WebSocket. The control room is a Vite app
   on 4747 that talks only to the hub.
4. **Sample sites are copied into a playground before use.** The samples under `apps/` are pristine
   sources inside this monorepo. `pnpm dev` copies each into `.playground/<name>`, runs `git init`
   there, and starts its dev server. Commits therefore happen in a throwaway repo, never in this one.
5. **The Mog score is a heuristic.** Playwright screenshots the first viewport and reads computed
   styles; `packages/mog-score` turns seven metrics into a 0 to 100 number using weights from one
   JSON file. It gates and reports; it never ranks.
6. **Phases 2 to 5 have seams, not code.** The decision log records everything the taste engine
   needs (`shown_alongside`, `dwell_ms`, reason chips), the `Variant.attributes` field carries
   readable attributes, and `rank_for_me`, `get_trend` and `taste_card` are stubbed MCP tools.

## Repo layout and what each file does

### Root
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`,
  `eslint.config.js`, `.prettierrc`, `.editorconfig`, `.gitignore`, `.npmrc`
- `scripts/dev.mjs`: builds packages, prepares the playground copies, starts both sample dev
  servers, the hub and the control room, and prints the ports.
- `scripts/playground.mjs`: copies a sample app into `.playground/`, links `node_modules`, runs
  `git init` and a first commit.
- `scripts/check-licenses.mjs`: runs the dependency license check and fails on non-OSI licenses.
- OSS files: `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`,
  `LICENSE`, `.github/workflows/ci.yml`, issue and PR templates, `.changeset/config.json`.

### packages/core (`@sitemaxxing/core`)
- `src/types.ts`: `Project`, `Section`, `PassDefinition`, `PassContext`, `Variant`, `Patch`,
  `Finding`, `RuleCard`, `DesignTokens`, statuses, events.
- `src/plugin.ts`: `definePass`, `defineComponent`, `defineRuleCard`.
- `src/registry.ts`: pass registry; loads built-ins and `sitemaxxing-pass-*` packages.
- `src/db.ts`: SQLite schema (all tables from the brief) and typed queries.
- `src/patches.ts`: create, apply and reverse unified diffs; patch files on disk.
- `src/queue.ts`: the patch queue state machine (proposed, previewing, approved, rejected, stale,
  skipped, committed), dependencies and staleness, "Current" vs "With changes".
- `src/git.ts`: dirty-tree check, commit, worktree for read-only versions.
- `src/versions.ts`: version rows, screenshots per viewport.
- `src/decisions.ts`: decision log writer.
- `src/snapshot.ts`: Playwright DOM snapshot (rendered DOM, computed styles, boxes).
- `src/sections.ts`: splits the page into sections from the snapshot.
- `src/tokens.ts`: reads design tokens from `tokens.css` or `:root`.
- `src/edit/css.ts`, `src/edit/jsx.ts`, `src/edit/json.ts`: AST edit helpers.
- `src/llm/*`: `LLM` interface, Anthropic, OpenAI and local adapters, hashed cache.
- `src/engine.ts`: the service layer every surface calls (MCP, WebSocket, CLI).
- `src/protocol.ts`: WebSocket event and RPC types shared with the control room and overlay
  (no Node imports so it can be bundled for the browser).
- `src/config.ts`: `defineConfig`, config loading with `jiti`.

### packages/rules (`@sitemaxxing/rules`)
- `cards/*.json`: 30+ rule cards, CC BY 4.0, with `cards/LICENSE`.
- `slop-words.json`: the slop word and phrase list.
- `src/index.ts`: loader and `searchRules`.

### packages/passes (`@sitemaxxing/passes`)
One file per pass: `direction.ts`, `declutter.ts`, `spacing.ts`, `copy.ts`, `alignment.ts`,
`font.ts`, `font-size.ts`, `imagery.ts`, `nav-dropdown.ts`, `arrow-button.ts`, `reveal-hero.ts`,
plus `shared/` helpers (finding the hero, nav, CTA and copy keys in a snapshot). `index.ts`
exports the default set in order.

### packages/components (`@sitemaxxing/components`)
- `src/hero-art.ts` (dot field: morphing shapes, dot globe, field wave) and `src/preloader.ts`
  (counter wipe, split curtain, image stack). Each carries the original component source as
  template strings that the pass writes into the target repo, plus inline SVG thumbnails.

### packages/mog-score (`@sitemaxxing/mog-score`)
- `src/metrics/*`: colorfulness, complexity, type contrast, slop, focus, alignment, line length.
- `src/weights.json`, `src/index.ts` (`scorePage(page) -> { score, metrics, notes }`).

### packages/overlay (`@sitemaxxing/overlay`)
- `src/overlay.ts`: corner pill, dashed highlight with label tag, copy typewriter, forced
  states, reduced motion. Built as one IIFE served by the hub.

### packages/vite-plugin (`@sitemaxxing/vite-plugin`)
- `src/index.ts`: injects the overlay script into `index.html` during `serve` only, with a test
  that `vite build` output contains no overlay reference.

### packages/mcp-server (`@sitemaxxing/mcp-server`)
- `src/hub.ts`: HTTP server, WebSocket hub, overlay static route, JSON-RPC over WS.
- `src/mcp.ts`: all MCP tools from the brief mapped onto `Engine`.
- `src/index.ts`: `startHub({ port })`.

### packages/cli (`sitemaxxing`)
- `src/index.ts`: `init`, `dev`, `audit`, `commit`, `export`; re-exports `defineConfig`.

### apps/control-room
- Vite + React, dark single theme from mockup v2. `src/App.tsx`, `src/state.ts` (hub client),
  `src/components/*` (TopBar, StepRail, LivePreview, Queue, Row, Variants, Versions, Recreate).

### apps/sample-fieldnote, apps/sample-isvik
- Vite + React. `src/content.json`, `src/tokens.css`, `src/styles.css`, `src/App.tsx`,
  `src/fonts.ts`. Deliberately sloppy, original copy, self-hosted fonts.

## Mockup interaction to code map

| Mockup behavior | Real implementation |
|---|---|
| Hover a row previews it | Control room sends `preview_pass` on mouseenter, `end_preview` on mouseleave; the hub applies the patch and broadcasts `pass.previewed` with selectors; the overlay outlines them |
| Hover a thumbnail previews that variant | Same, with `variantId`; the patch for that variant is precomputed after the audit |
| Click a thumbnail picks it | `decide_pass` with action `pick` |
| Approve / reject toggle | `decide_pass` with `approve` or `reject` (sending the same action again resets to proposed) |
| Reject reason chips | Chips appear under a rejected row; chosen chip is sent as `reason_chip` on the decision |
| Copy diff in the row | `copyDiff()` from the Copy pass, rendered with `del` / `ins` |
| Typewriter in the site | Overlay receives `copy.changed` with old and new text and types into `[data-copy=key]` |
| Forced states (menu open, hover) | `forceState` on the pass; the overlay toggles `sm-force-open` / `sm-force-hover` classes that the inserted components style |
| Play all live | Client-side loop calling `preview_pass` with the mockup timings |
| Mog score ring and delta | `score.updated` events; metrics in a tooltip |
| Commit N to vX | `commit_version`: formats, commits, screenshots, scores, broadcasts `version.committed` |
| Versions strip | `versions` from `list_passes`; clicking an old one calls `view_version`, which checks out that commit into a worktree on a second port and switches the iframe |
| Current / With changes | `set_view`: reverses or reapplies the approved patches in the working tree |
| Any URL path | `recreate_url` captures the page, writes it as a project from `apps/site-template`, commits v1, serves it and registers it; the overlay shows each step live |
| Keyboard | Arrow keys, Space, A, R, 1/2/3, C in the control room |
| Stale rows with Regenerate | Dependency graph in `queue.ts`; `regenerate_pass` re-runs `propose` against the current tree |

## Assumptions

- Target repos are git repositories with Vite. Non-Vite sites get the one-line script tag.
- Copy lives in a JSON file (default `src/content.json`) and elements carry `data-copy="key"`;
  without those, the Copy pass still rewrites by matching text in JSX string literals.
- Facts for copy come from the page text plus an optional `facts` array in the content file.
- Offline, the Copy pass produces a rule-based rewrite and says so in its finding.
- Only the first viewport (1440x900) is scored; both viewports are screenshotted on commit.
- `ffmpeg` must be on PATH for `export --timelapse`; the labels are burned into the frames by
  the overlay before capture, so no `drawtext` font setup is needed.
- Reduced motion is read from the OS by both the overlay and the control room.

## Revision: story first, no house style

The first build ran a fixed list of passes with fixed points and three fixed looks per change.
That pushes every site toward the same result, so the plan was revised:

- **Brief required.** A story, audience, goal, feeling, keep, avoid and noise must be set before
  anything is planned (`brief.ts`, Story step in the control room, `set_brief` over MCP).
- **Planner instead of points.** Passes declare what they serve; the planner weighs that against
  the goal and the mood, proposes what matters with a reason, and sets the rest aside
  (`planner.ts`).
- **Reference library.** Directions, type pairings and components are curated references on mood
  axes; passes ask for a Fit, a Stretch and a Wildcard (`packages/components/src/library`). New
  high-value sections: proof, features and closing call to action, rendered only from real content.
- **Noise and Randomize.** All generation is seeded (`random.ts`); noise widens the Wildcard and
  perturbs palettes and params; Randomize re-rolls seeds per pass or for every open pass.
- **Brief-aware Mog score.** Targets bend to the mood, and the ring is re-measured on the page.
