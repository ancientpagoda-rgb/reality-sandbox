# Reality Sandbox — Nysa (Minimal demo)

This branch contains a simplified, minimal demo of the Reality Sandbox project. It keeps a single demo entrypoint (reality-lab.html) and a small runtime surface needed to run it. The rest of the repository is left in place on the branch but is documented here as archived candidates to keep the main tree small and easy to work with.

## What's kept in the minimal demo
- reality-lab.html (single demo entrypoint)
- core modules required by that page (runtime, world formation, UI shell)
- package.json, vite.config.js (configured to build only the reality-lab demo)

## How to run the minimal demo

Install dependencies and run the dev server:

```bash
npm ci
npm run dev
# or build
npm run build
npm run preview
```

## Archive / next steps
I have not deleted any files on the main branch. On this simplify/minimal-demo branch I've adjusted the build and scripts to produce a focused demo. If you want, I can move large engine variants, lab pages, and smoke scripts into an archive/ directory inside this branch (so they remain recoverable) — or prepare a separate archive branch.

See ARCHIVE_MANIFEST.md for a recommended list of files to move/ archive, and tell me if you'd like me to proceed with moving them into archive/ in this branch.
