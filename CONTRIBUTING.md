# Contributing to Sitemaxxing

Thanks for helping. The three most useful contributions are a new **pass**, a new **component**
variant, or a new **rule card**. All three are plugins against the API in `packages/core`.

## Setup

```sh
pnpm i
npx playwright install chromium
pnpm build
pnpm dev
```

`pnpm dev` starts both sample sites, the hub and the control room (ports are listed in the README).

## Adding a pass

1. Create `packages/passes/src/<id>.ts` and export `definePass({...})`. Read
   `docs/writing-a-pass.md` for the contract: `detect` decides whether the pass applies and
   returns findings, `propose` returns **one patch that changes one thing**, `highlight` lists the
   selectors to outline, and `ruleCards` cites the cards that justify it.
2. Register it in `packages/passes/src/index.ts` and declare what it `serves` (clarity, action,
   trust, character, mood, polish) and, if it suits some moods more than others, a `moodBias`.
   The planner decides from the brief whether it is proposed; there is no fixed points value.
3. Add a unit test next to it that runs `detect` and `propose` against a small fixture.
4. Third-party passes live in their own package named `sitemaxxing-pass-<name>` and are listed in
   the target's `sitemaxxing.config.ts` under `passes`.

## Adding a reference to the library

The library (`packages/components/src/library`) holds the reference directions, type pairings
and components that passes pick from. A well-made new reference is the most direct way to make
Sitemaxxing less samey.

- **A direction:** add an entry to `directions.ts` with OKLCH paper, ink and accent, and a `mood`.
- **A type pairing:** add an entry to `fonts.ts` with open-licensed Fontsource imports.
- **A component or section:** add the source (as template strings) and CSS to `sections.ts` or a
  new file, then register it in `registry.ts` with its slot, `mood`, `goals`, `requires` (content
  keys) and a thumbnail. Style it with the direction tokens.

Place it honestly on the mood axes; the selection test checks that different briefs reach
different references. Everything must be original: no code or designs from paid libraries.

## Adding a rule card

Rule cards live in `packages/rules/cards/<id>.json` under CC BY 4.0 and follow the schema in
`packages/rules/src/schema.ts`. Write the principle, detect and fix fields in your own words and
cite the source (title, author, url). Never paste text from the source.

## Checks before a PR

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm check:licenses
```

Add a changeset for user-facing changes: `pnpm changeset`.

## Code style

TypeScript, ESM, Prettier defaults from `.prettierrc`. Keep passes deterministic where possible;
only the Copy pass should need an LLM, and it must degrade to rule-based output offline.
