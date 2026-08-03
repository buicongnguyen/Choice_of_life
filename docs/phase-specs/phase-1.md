# Phase 1 implementation contract

Status: preregistered before implementation

Parent authority: [`CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md`](../../CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md)

Fixture authority: [`fixture-registry-v1.json`](../balance/fixture-registry-v1.json)
Lock manifest: [`phase-1-lock-manifest.json`](./phase-1-lock-manifest.json)

This contract makes the Phase 1 exit gate falsifiable. It may be corrected during
the docs-only lock review, but after that lock commit, balance-dependent code must
not precede or silently rewrite it. A later change needs a written design reason
and independent logic review; an observed failing result is not by itself a valid
reason.

## 1. Production cutover and ownership

Phase 1 replaces the production entry with the isolated `src/choice-of-life/`
application. It does not incrementally modify or import the v5 engine.

Required layers:

```text
src/main.ts                         composition entry only
src/choice-of-life/app.ts           composition root and lifecycle
src/choice-of-life/core/**          pure domain and simulation
src/choice-of-life/persistence/**   injected storage port and save store
src/choice-of-life/platform/**      browser adapters
src/choice-of-life/presentation/**  semantic DOM shell
src/choice-of-life/style.css        new shell styles
```

The production dependency closure rooted at `src/main.ts` may contain only the
new tree and its CSS. Phase 1 imports no inherited art. The future
`presentation/character-adapter.ts` exception remains absent until a reviewed
compact runtime asset is introduced.

The boundary graph starts at the sole production HTML input, which must contain
exactly one module script resolving to `src/main.ts`. It resolves direct imports,
side-effect imports, re-exports, dynamic imports, aliases,
`new URL(..., import.meta.url)`, `import.meta.glob`, HTML script/link/image
references, and CSS `@import`/`url()` references. It must reject every production
path to legacy gameplay, preview code, or assets. The only copied public files
are `favicon.svg` and generated `release.json`. A post-build manifest/dist
inventory proves every emitted file belongs to the allowlist. The production
build emits no `avatar-preview.html` or PNG file.

Layer rules:

- `core` imports only `core` and uses no DOM, canvas, storage, audio, timer,
  animation-frame, wall-clock, randomness, UUID, random-byte, or crypto API.
- `persistence` depends only on its injected port and core codec types and has
  the same no-DOM, no-storage-global, no-time, no-random, no-crypto, and no-timer
  restrictions as core.
- `presentation` receives view data and actions; it does not read storage,
  time, random, or browser-global APIs and does not mutate domain state directly.
- `platform` implements browser ports and is composed only by `app.ts`.
- a second strict TypeScript project compiles domain/simulation and persistence
  with `ES2022` only, no DOM library, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noUnusedLocals`, and `noUnusedParameters`.

The boundary checker has synthetic fixtures proving it catches every listed
escape form, public-directory smuggling, and an unexpected emitted artifact,
rather than only scanning filenames or direct imports.

## 2. Three-score model and attribution

`CoreScores` has exactly these serialized keys, in this canonical order:

```ts
type ScoreId = "health" | "happiness" | "money";
type CoreScores = Readonly<{
  health: number;
  happiness: number;
  money: number;
}>;
```

Every score is an integer from 0 through 100. Coordinates, distance, age, and
ticks are structural numbers, never scores. The player-facing labels are
**Health**, **Happiness**, and **Financial security**. The permanent HUD and
setup preview render exactly three score indicators. The active production UI
must not expose legacy Fun, IQ, Weight, mental, muscle, or bank meters.

An effect request contains a deterministic effect ID, score ID, integer requested
delta, typed category, source, and nullable originating choice ID. Applying it:

- is immutable;
- rejects non-integer or non-finite values;
- clamps only to `0..100`;
- records before, after, and the actual post-clamp delta;
- reclassifies an unattributed callback or settlement as `system`;
- keeps recovery outside runner/decision attribution; and
- stores bounded recent entries plus bounded aggregate source totals.

Tests cover clamping, attribution, immutability, exact score keys, actual deltas,
and monotonic helpful/harmful effects.

## 3. Deterministic entropy and logical time

The core exposes stateless, named entropy channels. A pattern key is the tuple
`(runSeed, stageId, patternIndex)`. An output additionally includes a named
channel. There is no mutable `next()` sequence, so adding an unrelated draw
cannot shift later content.

- Run seeds are exactly 16 lowercase hexadecimal characters. Fixture integer
  `i` encodes as `i.toString(16).padStart(16, "0")`.
- Pattern indexes and logical ticks are bounded non-negative safe integers.
- The algorithm is versioned, integer-only, and documented with known-answer
  vectors for raw 32-bit output, bounded integer selection, weighted selection,
  and channel-order independence.
- Entity instance IDs derive from stable saved coordinates such as run seed,
  stage, pattern index, slot, and content ID. They never use random UUIDs.

Logical simulation advances by an exact `20,000` microseconds per tick. The
planned 220 ms lane tween therefore equals exactly 11 ticks. Domain state stores
ticks and fixed-point integer distances, never accumulated floating-point time.
Browser frame timestamps and fractional accumulators remain outside saved state.
A frame processes at most five logical steps, drops excess backlog, and resets
its accumulator whenever any pause reason starts or ends. Visibility, blur,
user pause, and modal pause are independent reasons.

Tests compare identical logical input at 50, 60, and 120 Hz, long-frame behavior,
pause/reset behavior, independent instances, and replay across a codec round
trip.

## 4. Stable save envelope

The current envelope has `schemaVersion: 1` and a separate
`contentVersion: "phase-1-v1"`. Unknown or future content versions are rejected
even when the schema version is supported; a content change that invalidates
old catalog references requires a registered migration or quarantine. Inactive
feature records are explicit `null`, not omitted or `unknown`. Persisted types
may not use `any`, `unknown`, opaque JSON payloads, or index-signature escape
hatches. The current codec defines and validates concrete discriminated
structures for:

- deterministic run ID, seed, difficulty, control mode, identity, cosmetic
  appearance, and visual accessibility preferences;
- the exact three scores and bounded effect ledger;
- current stage, age, active ticks, world distance, and settlement state;
- current/source/target lane, tween ticks, one-step input buffer, and motion
  phase;
- spawn cursor, deterministic active entity instances, compact resolved entity
  state, and pattern index;
- recovery/invulnerability transaction;
- encounter and presentation transaction;
- pending, resolved, presented, and terminal consequence transactions with
  immutable resolution records, supersession reasons, and acknowledgments;
- typed facts, memories, credentials, relationships, and conditions.

Every stage ID, content ID, effect category, consequence kind, condition kind,
encounter kind, fact kind, and other catalog discriminator is checked through a
versioned immutable catalog. Dynamic instance IDs use separate grammar and
uniqueness checks.

Limits are normative:

- encoded UTF-8 save size: at most 99,999 bytes;
- active entities: exactly 64 accepted, 65 rejected;
- recent effect entries: at most 128;
- pending consequences: at most 64;
- resolved/presented consequences awaiting completion: at most 64;
- terminal consequence summaries: at most 128;
- resolved IDs retained for the open pattern: at most 64, with older patterns
  represented by a compact cursor;
- identifiers: at most 64 ASCII identifier characters;
- stored player-visible strings: at most 256 Unicode scalar values; and
- every array and integer range has an explicit bound.

The decoder rejects input before parsing when its UTF-8 length is excessive. It
then validates plain-object root, exact keys, schema, one-step migrations, the
current structural codec, and semantic/cross-reference invariants. Rejection
coverage includes malformed JSON, wrong root, unsupported old or future schema,
duplicate IDs, invalid lanes, impossible phase combinations, unknown
discriminants/catalog IDs, non-finite values, excessive strings/arrays, and
oversized input.

Phase 1 includes a real synthetic v0 fixture and a v0-to-v1 migration. The store
fully migrates, validates the current schema and catalog, encodes, and checks the
byte limit before any write. `setItem` is the migration commit point. On failure,
the original v0 value remains, the validated state continues in memory, and the
UI reports saving unavailable. Tests cover successful and failed reloads,
chained registry behavior, migration determinism, idempotence at the current
version, encode/decode round trips, and rejection when a migration step is
missing.

The normative structural contract is
[`run-state-v1.schema.json`](../save/run-state-v1.schema.json), exercised by
[`run-state-v1-maximal.fixture.json`](../save/run-state-v1-maximal.fixture.json)
and the branch requirements in
[`run-state-v1-fixture-corpus.json`](../save/run-state-v1-fixture-corpus.json).
The implementation must be structurally equivalent to those exact root keys,
discriminants, bounds, null states, and cross-field invariants.
The maximal fixture's `runner-contract-*` and other representative IDs belong to
an explicit test-only immutable catalog; the production Phase 1 catalog remains
the shell catalog. Decoding that fixture with the production catalog must reject
its unknown IDs, while decoding it with the contract-fixture catalog must pass.

## 5. Canonical state hash

The gameplay hash uses `canonical-json-v1` and `fnv1a64-v1`:

- object keys are recursively sorted by Unicode code unit;
- array order is preserved;
- strings use JSON escaping;
- only finite integers are accepted;
- `undefined`, sparse arrays, functions, and unsupported values are rejected;
- UTF-8 bytes feed unsigned 64-bit FNV-1a and produce 16 lowercase hexadecimal
  characters.

`stateHashV1` starts from the entire validated persisted envelope and removes
only this exact, versioned cosmetic exclusion allowlist:

- `/appearance/hairStyleId`
- `/appearance/hairColorId`
- `/appearance/clothingPaletteId`
- `/appearance/heritageStyleId`
- `/accessibility/highContrast`
- `/accessibility/reducedMotion`
- `/accessibility/textScale`
- `/accessibility/screenReaderAnnouncements`

Identity, control mode, run mode, difficulty, deterministic run ID, seed, and
every consequence-affecting transaction field remain included. Content logic is
forbidden from reading excluded cosmetic paths. Known-answer vectors,
property-order invariance, and codec/migration stability are mandatory. A
locked fixture corpus covers every nullable and discriminated branch. Each
sensitivity mutant must still decode as valid before hashing; immutable constants
and discriminants use rejection/known-answer tests. For every mutable primitive
leaf, at least one valid alternative must change the hash unless the path is in
the exact cosmetic exclusion allowlist; every excluded mutation must not. The
test fails if a schema branch or eligible leaf is skipped. Equal seed, snapshot,
ordered inputs, and logical steps in separate instances must produce equal
hashes.

This hash is reproducibility evidence, not a security primitive.

## 6. Persistence, quarantine, and compatibility

Persistence uses an injected synchronous `StoragePort`; core never accesses a
browser global. The only keys this application may access are:

- `choice-of-life-v1-active-run`
- `choice-of-life-v1-quarantine`

Storage-call-log tests prove the application calls only those two keys and never
calls `clear` or enumeration. Sentinels prove it never reads, writes, or removes
the copied v5 keys:

- `choice-of-life-v1-active-life`
- `choice-of-life-v1-biographies`
- `choice-of-life-v1-local-funnel`
- `choice-of-life-v1-sound`
- `choice-of-life-v1-guide-seen`
- `choice-of-life-v1-theme`

For an invalid active save, the store first writes one bounded quarantine record
containing reason code, readable schema metadata when available, original UTF-8
length, deterministic digest, and at most a 16 KiB raw excerpt. Only after that
write succeeds may it remove the active value. If active removal fails, the
matching quarantine digest prevents repeat parsing during later loads. If
quarantine storage fails with quota or `SecurityError`, the application starts
without the save, reports that saving is unavailable, leaves active data intact,
and suppresses a repeated load loop for the mounted session.

All storage reads, writes, and removals catch failures. The game remains usable
in memory and shows a non-blocking accessible notice.

## 7. Interactive shell and lifecycle

An injected `SeedPort` supplies a seed before initial run persistence. Production
uses Web Crypto only inside `platform`; tests inject known seeds. Run ID is
derived deterministically from seed, canonical setup, and content version and is
included in the state hash, so ID creation cannot disturb simulation entropy.

The shell implements real state-backed flows for:

- title with New life, Continue when a valid save exists, and Settings;
- setup with starting context, difficulty, control mode, and appearance;
- three-score context preview and explicit non-moral framing;
- creation of a deterministic run and an initial save;
- resume producing the same state hash;
- settings for contrast, reduced motion, and text size; and
- corrupt/future-save and storage-unavailable notices.

The shell uses semantic elements, fieldsets, labels, and text content. It has a
logical focus order, visible focus, focus restoration, 44 px minimum targets,
normal document scrolling, 320 px reflow, and no zoom-disabling viewport rule.
It passes keyboard, touch, screen-reader naming, and 200% text checks at
1280×720, 800×360, 360×800, and 320×568.

`mountChoiceOfLife()` returns an idempotent `dispose()`. Mount → dispose →
remount must leave exactly one response to each input and no orphan listener,
timer, animation frame, media-query subscription, or callback. HMR invokes the
same disposal path.

## 8. Ratcheted build and save budgets

The checked-in active profile is explicitly `phase-1`; verification fails if the
Phase 0A profile remains selected.

- complete main-entry minified JavaScript graph: at most 180,000 bytes;
- all built CSS: at most 30,000 bytes;
- critical HTML/JavaScript/CSS gzip transfer: at most 350,000 bytes;
- the same critical set's Brotli transfer: at most 350,000 bytes and reported;
- complete deployed artifact: at most 20,000,000 bytes;
- encoded valid save: below 100 KB as the 99,999-byte codec limit;
- 64 active entities accepted and 65 rejected;
- no preview HTML or PNG emitted in Phase 1.

The JavaScript graph is every transitive static and dynamic chunk reachable from
the sole production entry. The critical set is `index.html` plus its
manifest-derived initial static-import, modulepreload, and CSS closure—never a
manual allowlist. Each critical file is compressed independently; concatenated
compression is invalid evidence. Gzip uses Node zlib level 9 with `mtime: 0`;
Brotli uses text mode, quality 11, and 22-bit window. Artifact size sums every
recursively emitted file byte. Verification also adds malformed, missing, and
wrong-value negative tests deferred for the release and budget scripts in Phase
0A.

## 9. Fixture-lock protocol

The committed global registry locks seeds 0–9,999, score distance, rational goal
weights, narrative goals, starting profiles, policies, horizons, attribution,
saturation, influence, and parity thresholds. Its implementation validator must
reject unknown/missing properties, duplicate IDs, invalid references, invalid
rational weights, incorrect seed expansion/hash, invalid profile values,
protected-trait mechanics, and an unlocked status. Numeric goal numerators must
sum exactly to their denominator. Narrative qualifying evidence uses the explicit
`any` quantifier. Every suite is dormant until a content lock references it; once
active, unavailable, skipped, empty, or zero-assertion execution is a hard
failure. Tests resolve every suite assertion, threshold JSON pointer, policy,
goal, horizon, profile, and seed-set reference.

Phase 1 owns a semantic content-lock validator in addition to JSON Schema. It
recomputes the pinned registry/schema hashes; resolves suite, assertion, horizon,
policy, goal, metric, context, stage, pattern, choice, option, evidence, comparator,
callback, career-offer, content/phase version, and superseded-lock references with
correct domains; requires each selected suite's complete
assertion closure; enforces unique/subset mappings and the horizon variant's exact
parameter set (`content.contentVersion` supplies its `contentVersion` parameter);
requires at least one context and phase-applicable nonempty content;
and fails any selected suite with zero contexts or assertions. Negative tests
cover a valid-looking wrong hash and every missing/wrong-domain reference class.
Every committed content-lock instance is byte-immutable. A change creates a new
`lockId`, names the prior lock in `supersedesLockId`, and gives a reviewed design
reason; editing a locked file in place is rejected.

Content-specific effects are not introduced by this registry. Each later phase
must first add a separate docs-only content lock naming its contexts, policies,
horizon, expected directional outcomes, comparators, thresholds, registry
SHA-256, schema SHA-256, exact horizon parameters, and commit-before-tuning
assertion. Content locks conform to
[`content-lock-v1.schema.json`](../balance/content-lock-v1.schema.json).

## 10. Completion and deployment evidence

Before Phase 1 is complete:

1. Commit and push this registry/spec as a docs-only lock before implementation.
2. Independently review architecture, code, tests, gameplay logic, inclusivity,
   and preregistration integrity; fix every Critical/High and applicable Medium.
3. Run strict type checks, boundary checks, all tests, build, release checks,
   budgets, save limits, and `git diff --check`.
4. Commit the implementation and pre-deploy review, then push `main` by SSH.
5. Verify GitHub Pages deployed that exact implementation SHA and that a
   cache-busted `/release.json` reports it.
6. Smoke the live flows at all four viewports, keyboard, touch, 200% text,
   nonvisual naming/focus, console, network, resume hash, and corrupt-save path.
7. Confirm deployed assets omit preview and legacy bundles.
8. Commit final evidence changing only `docs/reviews/phase-1.md` and
   `docs/IMPLEMENTATION_STATUS.md`, push it, prove that push triggered no Pages
   deployment, and confirm the implementation SHA remains live. That evidence
   commit must not change `docs/balance/**` or `docs/phase-specs/**`.

The Phase 1 review records the lock commit SHA, lock-manifest SHA-256, plus raw SHA-256 for the registry,
its schema, the run-state schema/fixture/corpus, the content-lock schema, and this phase
contract. Implementation verification pins those bytes; after the lock commit,
any mutation requires a superseding version and reviewed design reason.

## Appendix A. Normative callable surface

The implementation may split files differently inside the approved layers, but
these behaviors and result unions are stable:

```ts
type RunSeed = string; // codec enforces /^[0-9a-f]{16}$/
type Lane = 0 | 1 | 2;
type LogicalTick = number; // bounded non-negative safe integer

interface PatternKey {
  readonly runSeed: RunSeed;
  readonly stageId: StageId;
  readonly patternIndex: number;
}

interface PatternEntropy {
  uint32(channel: PatternChannel): number;
  integer(channel: PatternChannel, min: number, maxExclusive: number): number;
  weightedIndex(channel: PatternChannel, integerWeights: readonly number[]): number;
}

interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SeedPort {
  nextSeed(): RunSeed;
}

type DecodeResult =
  | { readonly kind: "ready"; readonly state: RunStateV1; readonly migratedFrom: 0 | null }
  | { readonly kind: "invalid"; readonly code: DecodeErrorCode; readonly schemaVersion: number | null; readonly contentVersion: string | null };

type LoadResult =
  | { readonly kind: "empty" }
  | { readonly kind: "ready"; readonly state: RunStateV1; readonly migrated: boolean }
  | { readonly kind: "quarantined"; readonly code: DecodeErrorCode }
  | { readonly kind: "unavailable"; readonly operation: "read" | "write" | "remove"; readonly state: RunStateV1 | null };

interface ChoiceOfLifeApp {
  dispose(): void; // idempotent
}

createPatternEntropy(key: PatternKey): PatternEntropy;
stepStageClock(clock: StageClock): StageClock;
encodeRunState(state: RunStateV1): string;
decodeRunState(text: string, catalogs: CatalogRegistry): DecodeResult;
stateHashV1(state: RunStateV1): string;
createSaveStore(storage: StoragePort, catalogs: CatalogRegistry): SaveStore;
mountChoiceOfLife(root: HTMLElement, dependencies: BrowserDependencies): ChoiceOfLifeApp;
```

## Appendix B. Required cross-field invariants

| Area | Required invariant |
|---|---|
| Motion | `runner === null` outside an active playable stage; idle motion has equal source/current/target lane and zero tween ticks; moving motion changes exactly one adjacent lane and has `0 < elapsedTicks < totalTicks`. Only user pause persists; focus/visibility live only in the page-lifecycle adapter, and modal pause is derived from the active transaction. |
| Stage | `setup × shell`, `active × (active or settling)`, and `completed × complete` are the only run/stage status pairs. Active/settling stages have positive duration and a runner; settling requires a pending settlement and `encounter === null && recovery === null`; complete requires applied settlement and no runner/encounter/recovery. Pending settlement has null completion tick; applied/cancelled has a completion tick not before its start. |
| Spawn | Instance IDs are unique; every instance pattern is not beyond the spawn cursor; resolved IDs cannot also be active; the next spawn is after current fixed-point distance/time. |
| Recovery | Active recovery requires the triggering atomic effect to leave at least one score at zero. For each depleted score, target is exactly `max(1, min(recoveryTarget, preTriggerScore))`; non-depleted scores are unchanged. The transaction records exact pre-trigger/target scores, and its invulnerability tick equals the runner's. Always `started <= resolve <= invulnerable <= cooldown`. Offered/accepted has `current < resolve`; cooldown has `resolve <= current < cooldown` (invulnerability may already have ended). |
| Encounter | Only one encounter exists. It excludes offered/accepted recovery; a cooldown recovery may coexist only when `resolveTick <= simulationTick`. Presenting has no selection/resolution reference; option-selected/resolving has a valid selected option and no resolution reference; resolved references exactly one matching resolved/presented consequence transaction. That consequence is the sole authoritative immutable resolution, its selected option matches, and every owned effect uses the same transaction ID. Presentation reads it and never reapplies it. |
| Consequence | Status is exactly pending/resolved/presented/complete/expired/superseded. Allowed transitions are `pending → resolved → presented → complete`, `pending → expired`, or `pending → superseded`; no backward or repeated transition exists. The nullable choice cause is preserved unchanged through every transition; null denotes a system-caused transaction and never counts as decision attribution. `resolved` requires null `presentedTick`; `presented` requires `resolution.resolvedTick <= presentedTick`; `complete` retains resolution and has `presentedTick <= terminalTick`; `expired` has no resolution or replacement and requires a visible acknowledgment; `superseded` has no resolution and requires an existing replacement, reason, and visible acknowledgment. Pending, resolved/presented, and terminal transaction IDs are mutually disjoint. Every scheduled/replacement reference exists, replacement creation is not later than supersession, and the graph is acyclic. |
| Ledger | Every recent effect satisfies `after = clamp(before + requestedDelta)` and `actualDelta = after - before`. Lifetime positive/negative totals reconcile the starting profile scores to current scores after clamping in application order. |
| Attribution | A `choice` effect requires a valid choice cause; callback/settlement without one becomes `system`; runner/system/recovery require a null cause. |
| Content | Every catalog reference exists in the registry named by the exact supported `contentVersion`; unknown or future content never decodes against current catalogs. |
