# ADR 0002: deterministic simulation and validated snapshots

Status: accepted

## Context

Runner fairness, reproducible tests, and exact refresh behavior cannot be guaranteed when gameplay depends on wall-clock time, rendering frame rate, or mutable global randomness.

## Decision

Use a fixed logical step. Generate each pattern from `(runSeed, stageId, patternIndex)`. New gameplay logic may not call `Math.random()` or wall-clock APIs.

Persist a bounded, strictly validated snapshot containing lane tween, stage time/distance, pattern index, active/resolved entities, score ledger, recovery state, facts, consequences, and encounter transaction state.

Resolved encounter effects and facts are written atomically before presentation. Presentation reads the immutable resolution and never reapplies it.

## Consequences

- Equal snapshots and inputs produce equal state hashes.
- Reload tests can verify the exact next spawn sequence and result.
- Save codecs must reject corrupt, oversized, unknown, and future data.
- UI, storage, clock, audio, and canvas remain outside the functional simulation core.
