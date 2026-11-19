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
2. **Intake.** `init_project` loads the config, makes sure the repo has a commit, opens SQLite,
   snapshots the dev URL with Playwright and scores it. Version 1 is HEAD at that moment.
3. **Plan.** `audit_page` runs every pass's `detect`, then the planner
   (`packages/core/src/planner.ts`) scores each pass from its findings, what it `serves` against
   the goal, and its `moodBias` against the mood. Proposed passes get a rationale; the rest are
   skipped with a reason. Direction stays first; dependencies come before dependents.
4. **Generate.** Proposed passes ask the reference library (`packages/components/src/library`) for
   a Fit, a Stretch and a Wildcard. Every pick uses a per-pass seed (`rngFor`), and noise sets how far
   the Wildcard reaches and how much palettes and params are perturbed. **Every (pass, variant)
   patch is precomputed** under `.sitemaxxing/patches/`.
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
(`direction → font → font-size`, `declutter → alignment`, `imagery → hero-art`).

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
