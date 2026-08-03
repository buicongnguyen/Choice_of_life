# Phase 0A review

## Scope

- Commit candidate: uncommitted Phase 0A plan and release-tooling change set
- Plan phase: 0A — plan, tooling, and baselines
- Changed modules: active implementation plan, architecture decisions, status and
  review protocol, Pages workflow, release metadata tooling, bundle gate, and
  public documentation
- User-visible behavior: none; the inherited reference title screen and runtime
  are intentionally unchanged

## Code review

- Dependency boundaries: ADR 0001 defines a strangler boundary; the new runner
  may reuse presentation assets only through a narrow adapter and may not import
  legacy gameplay modules.
- Determinism and lifecycle: ADR 0002 requires a fixed-step simulation, seeded
  pattern derivation, explicit pause states, and reload-safe transactions.
- Save validation and idempotency: the active plan defines a versioned Phase 1
  envelope plus a migration in every phase that changes the schema.
- DOM escaping and accessibility: no runtime DOM changed in this phase; the plan
  requires text-safe rendering and phase-visible keyboard, touch, Assist,
  announcement, contrast, and reduced-motion behavior.
- Performance and cleanup: the budget gate measures the full main-entry import
  graph rather than trusting a filename; Phase 1 must remove preview-only output
  and ratchet the complete entry graph to 180 KiB.
- Critical/high findings: the first independent review rejected missing exact-SHA
  release verification. A post-build verifier now fails on absent, malformed,
  stale, or wrong-version metadata.
- Medium findings fixed: main-entry undercount/zero-match pass; broad build-job
  Pages permissions; conflicting active documentation; circular deployment
  evidence; hard-coded release repository; undocumented canonical commands.
- Accepted low-risk findings: `tsc` runs in both `check` and `build`; workflow
  actions are version-tagged rather than SHA-pinned; focused negative-path tests
  for the release-metadata scripts are deferred to Phase 1 alongside the new test
  architecture. The baseline action-runtime warning is recorded separately.

## Gameplay logic review

- Score-source attribution: only settled outcomes with `causedByChoiceId` count
  toward decision influence; recovery is explicitly excluded.
- Route reachability: append-time reachable-horizon validation, seeded fuzzing,
  boundary tests, and reachable qualified career/retraining outcomes are gates.
- Choice/career non-dominance: the plan requires normalized outcome-distance,
  named balanced fixtures, monotonic score-source tests, and T−1/T/T+1 gates.
- Spawn reachability and warning time: lane reachability is evaluated over the
  rolling course horizon, with per-stage minimum warnings and density limits.
- Consequence transaction safety: pending consequences must settle, merge,
  expire, defer, or be superseded with an auditable terminal reason.
- Recovery-cycle search: bounded restoration cannot exceed the score snapshot
  immediately before the triggering effect; exhaustive low-state search uses a
  precise positive-cycle definition and cooldowns never suppress recovery.
- Age and credential invariants: ages derive from course duration, adult routes
  support retraining, and credentialed work cannot be granted without satisfying
  its route requirements.
- Critical/high findings: the first independent logic review found recovery,
  runner-cap, attribution, callback-overflow, Assist-parity, career-offer, and
  per-phase accessibility ambiguities. All are now normative acceptance criteria
  in the active plan.
- Medium findings fixed: the Phase 1 save envelope owns future optional
  subdocuments; recovery core moved into Phase 3; test-tool ownership is assigned
  to the phase that first needs each harness.
- Accepted low-risk findings: content-specific fixture values are owned by a
  mandatory docs-only fixture-lock commit before each phase's tuning; global
  seeds, metric, goals, horizons, profile tolerance, and doctor comparator are
  already fixed by the active plan.

## UI and accessibility evidence

- 1280×720: not applicable to this documentation/tooling phase; inherited title
  screen baseline previously passed
- 800×360: deferred to the first new shell in Phase 1
- 360×800: deferred to the first new shell in Phase 1
- 320×568: deferred to the first new shell in Phase 1
- 200% text: deferred to the first new shell in Phase 1
- Keyboard: runtime unchanged; Phase 1 owns the first new keyboard path
- Touch: runtime unchanged; Phase 1 owns the first new touch path
- Assist mode: specified and required once runner play begins
- Nonvisual screen-reader completion: Phase 2 and every later playable stage must
  expose semantic state, lane options, effects, scores, choices, and focus
- High contrast: specified per visible phase
- Reduced motion: specified per visible phase
- Focus restoration: specified for every modal/pause transition

## Automated verification

- Focused tests: a synthetic bundle fixture proves re-export, side-effect import,
  and dynamic import traversal; release metadata is checked after production
  build; bundle traversal fails if the HTML entry or an imported asset is absent
- `npm run verify`: passed — 25 test files and 242 tests, strict TypeScript,
  production build, built release verification, and artifact budgets
- Bundle/artifact budget: passed — 101,171,740-byte artifact; 422,891-byte
  complete main-entry JavaScript graph; 35,893-byte CSS; 3,885,796-byte largest
  file
- `git diff --check`: passed

## Deployment

- Commit: pending implementation commit
- Workflow run: pending
- `/release.json`: pending exact-SHA verification
- Live smoke result: pending

Deployment fields may be pending in the implementation commit. They are closed
by one `docs/**`-only evidence commit after production verification. The Pages
workflow ignores that commit, so the recorded implementation SHA remains live;
the evidence commit does not recursively require another closure record.

## Decision

Approved. Independent code/tooling, gameplay-logic, and cross-document plan
re-reviews found no remaining Critical, High, or Medium findings after the
recorded corrections.
