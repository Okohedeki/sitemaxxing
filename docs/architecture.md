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

1. **Intake.** `init_project` loads `sitemaxxing.config.ts`, makes sure the repo has a commit,
   opens the SQLite database under `.sitemaxxing/`, takes a Playwright snapshot of the dev URL
   (rendered DOM, computed styles, boxes) and scores it. Version 1 is the HEAD at that moment.
2. **Generate.** `audit_page` runs every pass's `detect` against the snapshot. Passes that apply
   get their variants listed and **every (pass, variant) patch is precomputed** as a unified diff
   under `.sitemaxxing/patches/`. Passes that do not apply are shown as skipped with the reason.
3. **Rank.** v1 keeps the fixed coarse-to-fine order. The Mog score is reported, not used to rank.
4. **Stage.** `preview_pass` applies the patch to the working tree. Vite hot-reloads, the hub
   broadcasts `pass.previewed` with the selectors to outline, and the overlay highlights them.
   Approved patches stay applied so "With changes" is the real code; "Current" reverses them.
5. **Commit.** `commit_version` reverses everything, re-applies the approved passes one at a time
   capturing a labelled frame for each (the timelapse), formats touched files, makes one git
   commit, screenshots every viewport, scores the result and records the version.
6. **Learn.** Every preview, pick, approve, reject (with reason chip) and commit writes a row to
   `decisions` with `shown_alongside` and `dwell_ms`.

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
