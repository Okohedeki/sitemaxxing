# Security policy

Sitemaxxing is local-first: it runs on your machine, reads and edits the repository you point it
at, and talks to an LLM only if you configure a key. It never phones home.

## What to keep in mind

- The hub listens on `localhost:3333` and the control room on `localhost:4747`. They are bound to
  the loopback interface and are meant for development machines only.
- The overlay script is injected into dev servers only. A test asserts that production builds
  contain no overlay code.
- API keys are read from environment variables and never written to disk. LLM outputs are cached
  under `.sitemaxxing/cache/` in the target repo; that folder is gitignored by `init`.
- Sitemaxxing never commits without an explicit Commit action and refuses to run when the working
  tree has uncommitted user edits.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository, or open an issue with the title
"Security" and no details, and a maintainer will reach out. Please do not post exploit details
publicly before a fix is available. We aim to respond within a week.
