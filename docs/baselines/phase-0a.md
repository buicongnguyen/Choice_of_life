# Phase 0A baseline

Recorded from the independent Choice of Life scaffold before the runner cutover.

## Repository and quality

- Baseline commit: `bf2a3b19b28d28d73c5bb795a0df3e9f7401fdb1`
- TypeScript: strict mode, no emit
- Test files: 24
- Tests: 241 passing
- GitHub Pages workflow: passing
- Live title and hashed assets: passing
- Browser console errors during title-screen smoke test: none

## Size

- Tracked source payload: approximately 200 MiB
- Pages artifact: approximately 101 MB
- PNG payload in production build: approximately 100 MB
- Root JavaScript chunk: approximately 258 KB minified
- Complete main-entry JavaScript graph: approximately 423 KB minified
- CSS: approximately 36 KB
- Production inputs: game and avatar preview

The Phase 0A budget script uses a small ceiling above the complete entry graph,
not only the root filename. It parses `dist/index.html` and follows relative
static and dynamic JavaScript imports, failing if the entry is missing. Phase 1
removes the avatar preview from production and ratchets the complete main-entry
ceiling to 180 KB as required by the active implementation plan.

## Known non-blocking baseline findings

- GitHub Actions currently reports that some pinned upstream action versions target the deprecated Node 20 action runtime and are being forced onto Node 24.
- `npm ci` reports one low-severity development-dependency advisory.

Neither finding changed the successful application tests or Pages deployment. They remain release-hardening work unless a current phase touches the affected dependency or workflow action.
