# Archive manifest — suggested files / folders to move into archive/

This manifest lists large files, versioned engine modules, lab pages, and smoke-test scripts that are safe to move into an archive/ folder (kept in git history) to make the repository lightweight for day-to-day development.

Suggested archive targets (representative — review before move):

- All files under scripts/ (smoke tests, audits) except `root-renderer-audit.cjs` if you still want to run CI checks.
- The following directories / pages at repo root (keep only `reality-lab.html`):
  - cohesion-lab.html
  - emergence-lab.html
  - world-core-lab.html
  - hex-octree-lab.html
  - planet-renderer-lab.html
  - potree-planet-lab.html
  - openspace-bridge-lab.html
  - reality-lab (if you keep the HTML file, move variants)
  - reality-flight-lab.html
  - reality-engine-*.html (archive all engine snapshot pages)
  - any other lab/engine HTML not required by the demo
- core/ files that are historical variants or heavy engines (examples):
  - core/phase8-engine.js, core/phase9-engine.js, core/phase10-engine.js, core/phase11-engine.js
  - core/reality-v5, core/reality-v6-*/ (if directories are snapshots)
  - core/*-v3*, core/*-v4*, core/*-v5* (large versioned files you don't need in daily work)
  - large presentation files not referenced by reality-lab (e.g., runevale-*, social-models-*, public-reputation-*)
- integrations/ adapter files you don't need during local dev (move if not used by the demo)

How I'll move them (if you confirm):
- Create archive/ and copy listed files there in a single commit (preserves history and file contents in the branch).
- Replace original files with a small placeholder README pointing to archive/ and explaining how to restore.
- Update top-level README to point to archive/ for advanced modules.

Reply "archive" to have me perform the move on this branch, or reply "manifest OK" to keep the manifest and proceed with other non-destructive cleanup.
