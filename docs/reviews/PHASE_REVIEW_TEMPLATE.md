# Phase N review

## Scope

- Commit candidate:
- Plan phase:
- Changed modules:
- User-visible behavior:

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

## Decision

Approved / changes required
