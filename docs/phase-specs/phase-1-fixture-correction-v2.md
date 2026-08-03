# Phase 1 maximal-fixture correction v2

Status: preregistered correction before the Phase 1 implementation commit

Supersedes only the contradictory maximal-fixture values identified below. The
original Phase 1 contract, schema, registry, corpus requirements, limits, and
exit gates remain authoritative.

## Reason for a versioned correction

The required independent logic review found that the immutable v1 maximal
fixture listed recent effects out of application order and recorded the
cooldown recovery snapshot after a later choice effect. Accepting those values
would make a saved history unreachable from the normative effect and recovery
rules. The original locked bytes remain unchanged for auditability; this v2
artifact applies a deterministic patch instead of editing them in place.

This correction is based on the design invariant that a persisted event history
must be replayable. It is not a post-hoc balance adjustment and changes no
scores, tuning thresholds, choices, or player-facing content.

## Corrected authority

The machine-readable authority is
[`run-state-v1-maximal.fixture-correction-v2.json`](../save/run-state-v1-maximal.fixture-correction-v2.json).
Its operations apply in listed order to a parsed copy of the v1 maximal fixture.
The resulting object is the authoritative maximal fixture for implementation,
codec acceptance, canonical-hash vectors, and the branch corpus.

The untouched v1 fixture remains a historical preregistration record and must
be rejected by the corrected semantic validator. Production catalog rejection
and all structural assertions continue to apply to the corrected result.

## Clarified invariants

- `effectLedger.recent` is retained in nondecreasing application-tick order.
- For consecutive retained effects on the same score, the earlier `after`
  value equals the later `before` value.
- A recovery's `preTriggerScores` is the exact score snapshot immediately
  before its triggering atomic runner effect.
- Every non-depleted recovery target equals that pre-trigger score. During
  cooldown, later effects may make current scores differ from the target.
- An unresolved or cooldown recovery retains enough authoritative trigger and
  restoration history to validate these rules.

The required fixture-corpus pointer grammar, branches, valid/invalid state
pairs, transaction combinations, hash sensitivity, and semantic invariant IDs
are otherwise unchanged. The corpus base fixture is the corrected v2 result.

## Review protocol

This correction must be committed and pushed as docs-only before the related
implementation changes. The Phase 1 review records this correction lock commit,
manifest SHA-256, artifact hashes, independent logic approval, and the reason
the original bytes remain preserved.
