# Sitemaxxing

Give your website a glow-up that is yours. Sitemaxxing starts with your **story**: what the site
is, who it is for, the one thing a visitor should do, and how it should feel. From that it plans
which changes matter for this page and this goal, and draws each one from a library of curated
reference directions, type pairings and sections. It proposes three takes for each change: a
**Fit**, a **Stretch** and a **Wildcard**. A **noise** setting decides how far those wander, and
**Randomize** re-rolls them. Every change previews live on your real dev server with an outline and
a label, and copy types in letter by letter. You approve, reject or pick. **Commit** squashes the
approved changes into one git commit and a new version. Every decision, with its seed, is logged,
so later versions can learn your taste.

Two sites with different stories should not come out looking alike. There is no universal points
table: the plan, the order and the picks all follow the brief.

![Sitemaxxing timelapse: a sloppy landing page turning into a considered one, one pass at a time](docs/demo.gif)

Local-first, no account, no telemetry, MIT. Bring your own model (or none: every pass except the
copy rewrite works offline).

## Quick start

```sh
pnpm i
npx playwright install chromium
pnpm dev
```

`pnpm dev` builds the packages, copies both sample sites into `.playground/` (each with its own
git history, so commits never touch this repo), and starts everything:

| Port | What |
|---|---|
| 4747 | Control room |
| 3333 | Hub: MCP at `/mcp`, WebSocket at `/live`, overlay at `/overlay.js` |
| 5173 | Fieldnote, a sloppy SaaS landing page |
| 5174 | Isvik Expeditions, a sloppy travel landing page |

Open http://localhost:4747. The welcome screen asks for one thing: a page URL. Paste any public
page (or open a sample, or a project folder), and the guide takes it from there, one decision at a
time:

1. **Paste a page.** Sitemaxxing opens it in a headless browser, reads the brand, navigation, first
   screen, sections, facts, a quote and the footer, plus the computed colours, fonts and corner
   radius, and writes them as a small Vite + React project with its own git history. That commit is
   **v1**. The copy is the page's own and images still load from the original site; nothing on the
   live site changes. Pages that show a bot check to automated visitors cannot be read, and
   Sitemaxxing says so rather than trying to get past it. Pasting the same page again reopens it.
2. **Story.** A first draft is read from the page (its description, a likely goal from its call to
   action). Put it in your own words and say who it is for.
3. **Pick a direction.** Three takes on the story, each previewed on the page as you hover.
4. **Refine.** One change at a time, already showing on the page: **Keep it** (Enter), **Skip it**
   (S) or **Show me others** (D). Skipping asks why, and the answer leans the next options.
5. **Save.** Commit the kept changes as the next version.

**Show every change** switches to the full queue (hover rows, approve and reject in any order);
**Guide me** switches back.

Rebuilt pages live in `.playground/sites/` under `pnpm dev` and in `~/.sitemaxxing/sites/` under
`sitemaxxing dev`. Each is an ordinary project: open it in an editor, run `npm run dev`, or push it.

### On your own Vite + React site

```sh
npm i -D sitemaxxing
npx sitemaxxing init --dev-url http://localhost:5173   # writes sitemaxxing.config.ts, adds the Vite plugin
npm run dev                                             # your dev server, with the overlay injected
npx sitemaxxing dev                                     # hub + control room
```

Non-Vite sites add one line in development only:
`<script src="http://localhost:3333/overlay.js"></script>`.

### With Claude Code

```sh
claude mcp add sitemaxxing --transport http http://localhost:3333/mcp
```

Start from a page with `recreate_url`, or from a repo with `init_project`. Then: `set_brief` → `audit_page` → `preview_pass` → `decide_pass` (or `reroll_pass`) → `commit_version`. Agents that edit code
directly can call `report_pass` to highlight what they changed in the overlay.

### CLI

```
sitemaxxing init [path] --dev-url <url>     register a project
sitemaxxing dev [path]                      MCP + WebSocket hub + control room
sitemaxxing audit [path] [--json] [--brief b.json] [--seed n]   plan from a brief (CI-friendly)
sitemaxxing commit [path]                   same as the Commit button
sitemaxxing export [path] --timelapse out.mp4   one frame per pass, labelled
```

## How it decides

1. **Story.** The control room opens on a short form: story, audience, goal (sign-ups, sales,
   bookings, leads, credibility, awareness), feeling words, what to keep, what to avoid, and noise
   from Safe to Wild. The words are read into six mood axes: calm–bold, cool–warm,
   playful–serious, contemporary–classic, airy–dense and light–dark.
2. **Plan.** Every pass checks the page and reports findings. The planner weighs what each pass
   improves (clarity, action, trust, character, mood, polish) against the goal and the mood.
   Passes that matter are proposed, with one line on why. The rest are set aside with a reason:
   motion passes drop out for a calm sign-up page, while proof and a closing call to action come in
   for bookings.
3. **Pick.** Each pass with variants asks the reference library for three takes. The **Fit** is
   the closest reference to the brief. The **Stretch** is still on-brief but deliberately different
   from the Fit. The **Wildcard** reaches further as noise rises. Palettes are generated in OKLCH
   from the reference and perturbed by seeded noise, so even the same reference rarely produces the
   same colours twice. Every palette is checked for WCAG AA contrast.
4. **Randomize.** Re-roll one pass (the dice on its row, or D) or every open pass at once.
   Approved and committed passes stay. The same seed always reproduces the same proposals.
   Say why you rejected something (too busy, too plain, off-brand, too trendy) and the next roll
   of that pass leans the other way: calmer and sparser, bolder, closer to the brief, or more
   classic. The rest of the page leans the same way a little.
5. **Check.** The Mog score is re-measured on the real page after each change. Its targets bend
   to the brief, so a bold or dark story is not marked down for being colourful. It is a check,
   never a ranking.

## What is in the library

| Area | References |
|---|---|
| Directions | 12 palettes (Lab, Editorial, Signal, Glacier, Terracotta, Ink and gold, Risograph, Field, Clinic, Newsprint, Midnight lab, Pastel studio), each perturbed per seed |
| Type pairings | 12 open-licensed pairings, from grotesk + mono to soft serif, book serif and wide display |
| Hero layout | Split, picture first, editorial stack, poster, offset overlap, index columns, picture band; proportions vary with noise |
| Hero art | Morphing shapes, dot globe, field wave, contour lines, orbits; density and speed vary with noise |
| Navigation | Preview tiles, fullscreen reveal (circle, curtain, split), side drawer |
| Proof | Metric strip, pull quote, fact ticker, lead figure |
| Features | Numbered rows, bento grid, spec sheet, step path |
| Closing call to action | Closing band, sticky next step, split close, inline ask |
| Motion | Hero reveals (line rise, word stagger, blur in), preloaders (counter, curtain, stack), arrow buttons |

Refining passes include hero layout (it leaves a composition alone when it already suits the story), declutter, spacing (scaled to the brief's density), copy, alignment, font,
font size (scaled to its energy), imagery, navigation, button feedback and the hero reveal. Section
passes only appear when your copy file has the content they need: `facts`, `quote`, `features` or
`cta`. Nothing is invented.

Every pass and component is a plugin and cites rule cards from design writing and research
(`packages/rules/cards`, CC BY 4.0).

## Architecture

```
Intake → Generate → Rank → Stage (live) → Commit → Learn ─┐
                     ▲                                     │
                     └─────────────────────────────────────┘
```

```
control room (4747) ──┐
overlay.js in site ───┼── hub (3333): MCP + WebSocket ── Engine ── patches ── your working tree
Claude Code (MCP) ────┘                                   │            └── git commit per version
                                                          └── SQLite: passes, variants, versions,
                                                              decisions, scores
```

- `apps/control-room`: the dark studio UI. `apps/sample-*`: the two sloppy sample sites.
- `packages/core`: types, plugin API, patch queue, versions, decision log, LLM adapters, DB.
- `packages/passes`, `packages/components`, `packages/rules`: the built-in passes, the original
  component sources they write into your repo, and the rule cards.
- `packages/mog-score`: the transparent heuristic. `packages/overlay`, `packages/vite-plugin`:
  the dev-only overlay. `packages/mcp-server`: the hub. `packages/cli`: `sitemaxxing`.

More in [docs/architecture.md](docs/architecture.md), [docs/writing-a-pass.md](docs/writing-a-pass.md)
and [docs/mog-score.md](docs/mog-score.md). The plan this was built from is in [docs/PLAN.md](docs/PLAN.md).

## Bring your own model

Only the Copy pass uses an LLM, with a strict template (one claim, no slop words, numbers only
from the page). Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, or point `llm.provider: 'local'` at
an OpenAI-compatible endpoint such as Ollama with `SITEMAXXING_LOCAL_LLM`. Without a key the pass
makes a rule-based rewrite and says so. Outputs are cached by input hash under
`.sitemaxxing/cache/`.

## Contributing

Adding a pass, a component or a rule card is the point. See [CONTRIBUTING.md](CONTRIBUTING.md).
Everything in this repo is original work: no code or designs from paid component libraries.

## Roadmap

| Phase | Scope |
|---|---|
| 1 (this release) | story-first planning, reference library with fit / stretch / wildcard picks, seeded noise and Randomize, repo mode, overlay, control room, brief-aware Mog score, patch queue, commits and versions, MCP server, decision log, plugin API |
| 2 | taste engine: walls of 12 options per section, 60-second calibration, a personal Bradley–Terry offset learned from the logged picks and seeds, taste card |
| 3 | any-URL mode: capture, rebuild as code, visual match %, hand off to repo mode |
| 4 | opt-in crowd baseline, saturation index, lifecycle stages, trend clock in ranking |
| 5 | public ledger of named trend calls, shareable taste cards |

## License

MIT for all code. Rule cards in `packages/rules/cards` are CC BY 4.0. Fonts are self-hosted
under the SIL Open Font License via Fontsource.
