# Phase N review

## Scope

- Commit candidate:
- Plan phase:
- Changed modules:
- User-visible behavior:

## Preregistered lock evidence

- Lock commit SHA:
- Lock manifest SHA-256:
- Phase contract SHA-256:
- Global registry SHA-256:
- Global registry schema SHA-256:
- Content-lock schema SHA-256:
- Phase content-lock SHA-256 (when applicable):
- Save schema SHA-256 (when applicable):
- Save fixture SHA-256 (when applicable):
- Save fixture-corpus manifest SHA-256 (when applicable):
- Verification pinned the recorded bytes:
- Implementation/content effects occurred after the lock commit:

## Code review

- Dependency boundaries:
- Determinism and lifecycle:
- Save validation and idempotency:
- DOM escaping and accessibility:
- Performance and cleanup:
- Critical/high findings:
- Medium findings fixed:
- Accepted low-risk findings:

## Gameplay logic review

- Score-source attribution:
- Route reachability:
- Choice/career non-dominance:
- Spawn reachability and warning time:
- Consequence transaction safety:
- Recovery-cycle search:
- Age and credential invariants:
- Critical/high findings:
- Medium findings fixed:
- Accepted low-risk findings:

## UI and accessibility evidence

- 1280×720:
- 800×360:
- 360×800:
- 320×568:
- 200% text:
- Keyboard:
- Touch:
- Assist mode:
- Nonvisual screen-reader completion:
- High contrast:
- Reduced motion:
- Focus restoration:

## Automated verification

- Focused tests:
- `npm run verify`:
- Bundle/artifact budget:
- `git diff --check`:

## Deployment

- Commit:
- Workflow run:
- `/release.json`:
- Live smoke result:

Deployment fields may be pending in the implementation commit. They are closed
by one `docs/**`-only evidence commit after production verification. The Pages
workflow ignores that commit, leaving the recorded implementation SHA live; the
evidence commit does not recursively require another closure record.

For Phase 1, the evidence commit may change only `docs/reviews/phase-1.md` and
`docs/IMPLEMENTATION_STATUS.md`; it may not mutate `docs/balance/**`,
`docs/save/**`, or `docs/phase-specs/**`. Later phases must list their exact
evidence-only allowlist in the preregistered phase contract.

## Decision

Approved / changes required
