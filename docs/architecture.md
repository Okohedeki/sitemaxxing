# Architecture

Sitemaxxing is a local-first tool with one long-running process (the hub) and three surfaces
that talk to it: the control room, the overlay inside the target site, and MCP clients such as
Claude Code.

```
                 ┌──────────────────────────────────────────────┐
                 │  hub (packages/mcp-server)  localhost:3333    │
  control room ──┤  /live   WebSocket: events + JSON-RPC         │
  (4747, Vite)   │  /mcp    Streamable HTTP MCP tools            │
  overlay.js ────┤  /overlay.js  served to the target dev server │
  Claude Code ───┤                                               │
                 │  Engine (packages/core)                       │
                 │   ├ snapshot (Playwright)  ─┐                 │
                 │   ├ pass registry           │ target repo     │
                 │   ├ patch queue  ───────────┼─▶ working tree  │
                 │   ├ git (commit, worktrees) │   .sitemaxxing/ │
                 │   ├ Mog score (mog-score)   │     db, patches,│
                 │   └ decision log (SQLite) ──┘     screenshots │
                 └──────────────────────────────────────────────┘
```

## The loop

1. **Story.** `set_brief` stores the owner's story, audience, goal, feeling, keep, avoid, noise and
   seed (`.sitemaxxing/brief.json` plus a `briefs` row, so the history is kept). The words are read
   into a mood on six axes (`packages/core/src/brief.ts`). Nothing is planned without a brief.
   - **Any URL.** `recreate_url` (`packages/core/src/recreate.ts`) reads a public page in Playwright
     and writes it as a Vite + React project from `apps/site-template` (whose installed dependencies
     it links). `mirror.ts` keeps the page as it rendered: its elements as JSX, each with a
     `data-sm` name so passes can aim at exactly one, its stylesheets as `styles.css`, and the font
     files it downloaded under `public/fonts`. The copy that could be read as plain text goes in
     `content.json`, and the main colours and fonts in `tokens.css`. It commits that as v1, serves
     it on a free port, compares its first screen with the original (`fidelity.ts`) and runs Intake
     on it. The hub restarts its dev server when the project is opened again.
2. **Intake.** `init_project` loads the config, makes sure the repo has a commit, opens SQLite,
   snapshots the dev URL with Playwright and scores it. Version 1 is HEAD at that moment.
3. **Plan.** `audit_page` runs every pass's `detect`, then the planner
   (`packages/core/src/planner.ts`) scores each pass from its findings, what it `serves` against
   the goal, and its `moodBias` against the mood. Proposed passes get a rationale; the rest are
   skipped with a reason. Direction stays first; dependencies come before dependents.
4. **Generate.** Proposed passes ask the reference library (`packages/components/src/library`) for
   a Fit, a Stretch and a Wildcard. Every pick uses a per-pass seed (`rngFor`), and noise sets how far
   the Wildcard reaches and how much palettes and params are perturbed. **Every (pass, variant)
   patch is precomputed** under `.sitemaxxing/patches/`. Reason chips on rejected passes lean the
   mood and noise a pass generates from (`packages/core/src/taste.ts`); the lean is rebuilt from the
   decision log since the story was last told, so it survives restarts and resets with a new story.
5. **Stage.** `preview_pass` applies the patch through an in-memory staging area and writes each
   file once, then touches the written files once writes go quiet so the dev server's watcher
   always sees the final content. The overlay highlights the change, and the score is re-measured
   shortly after.
6. **Randomize.** `reroll_pass` gives one pass (or every open pass) a new seed and regenerates its
   variants and patches. Approved and committed passes are left alone.
7. **Commit.** `commit_version` re-applies the approved passes one at a time for the timelapse,
   formats, makes one git commit, screenshots every viewport, scores the result and records the
   version.
8. **Learn.** Every preview, pick, approve, reject, re-roll and commit writes a `decisions` row
   with `shown_alongside`, `dwell_ms` and `meta` (seed, goal, noise, mood, variant attributes).

## Patches

Passes return `{ files: [{ path, before, after }] }`. Core turns that into a unified diff and
applies it in-process with fuzzy hunk matching. A pass is **deterministic**, so when another
applied pass shifts its context the engine re-proposes it against the current tree and applies
the fresh diff. Only a real failure marks a pass stale, which shows **Regenerate** in the row.
Rejecting a pass or switching its variant marks its dependents stale on purpose
(`direction → font → font-size`, `declutter → alignment`, `imagery → hero-art`; hero layout owns where the picture sits, imagery only how it is treated).

## Where state lives

| What | Where |
|---|---|
| Project registry | `~/.sitemaxxing/projects.json` |
| Database, patches, screenshots, LLM cache, version worktrees | `<target>/.sitemaxxing/` (gitignored) |
| Approved-but-uncommitted changes | the target's working tree |
| Versions | git commits in the target repo plus `versions` rows |

## Packages

- `core`: types, plugin API, engine, patch queue, git, snapshot, SQLite, LLM adapters, config.
- `rules`: rule cards (CC BY 4.0) and the slop-word list.
- `passes`: the built-in passes. `components`: the component sources passes write into a repo.
- `mog-score`: the first-impression heuristic. `overlay`: the injected dev script.
- `vite-plugin`: injects the overlay during `vite serve` only. `mcp-server`: the hub.
- `cli`: the `sitemaxxing` binary, which also re-exports `defineConfig` and the Vite plugin.

## Ports

| Port | What |
|---|---|
| 3333 | hub: `/mcp`, `/live`, `/overlay.js`, `/health` |
| 4747 | control room |
| 5173, 5174 | sample sites (Fieldnote, Isvik) when running `pnpm dev` |
| 5300 + n | read-only server for version n |

## Reading the system a project has

`system.ts` turns a snapshot of the rendered page and the project's stylesheets into a
`SystemReading`. It needs no browser of its own: it works from the computed styles the snapshot
already holds.

- **Colour.** Every fill, text colour and border is resolved against what is behind it, colours
  nobody could tell apart are folded together, and each one gets a role: background, surface, ink,
  quieter text, text on fills, accent, other strong colours, lines.
- **Type, spacing, shape.** The sizes in use and how much text each carries, the families, the
  spacing values and the share that sit on a 4 or 8px grid, the corner radii and shadows.
- **Components.** Buttons, fields and cards, grouped by how they look, so five slightly different
  buttons show up as five variants of one thing.
- **Source.** How many colour, size and spacing values in the stylesheets are written in place and
  how many read a custom property.

The engine caches one reading per snapshot and puts it on `ProjectState.system`. The control room
shows it in the System view; agents get it from `read_design_system`.

## Writing shared values

`systemize.ts` is the step from reading to writing. Given the stylesheets, it replaces each colour
literal, each `font-size` length and each padding, margin or gap length with `var(--name)` and
declares the names on `:root` in the tokens file. It is lossless: one name per distinct value, and
a colour with an opacity becomes `color-mix(in srgb, var(--name) N%, transparent)`. Values inside
`calc()`, `em` lengths, and `rem` lengths on a page whose root size is not the default are left
alone. The `shared-values` pass offers this as the first change (`foundation: true`, so the
planner never sets it aside), and `direction` depends on it.

A direction then moves the whole palette with `remapColor` (`color.ts`). Each shared colour is
placed on the nearest line between two of the three anchors (background to ink, background to
accent, ink to accent) in OKLab, and rebuilt at the same place between the new anchors, keeping
what was left over. The anchors come from the rendered page (`readSystem`), not from token names.
