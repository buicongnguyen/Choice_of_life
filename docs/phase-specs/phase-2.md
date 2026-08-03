# Phase 2 contract — Runner laboratory

Status: preregistration candidate. It must be independently approved and
committed before runner content effects, balance constants, or production tuning.

Normative parent: [`CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md`](../../CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md), especially sections 6, 10, 12 Phase 2, 13, and 14.

## 1. Immutable contract and machine evidence

Phase 2 uses two complementary locks:

- [`runner-laboratory-content-lock-v1.json`](../balance/locks/runner-laboratory-content-lock-v1.json)
  activates the immutable global registry's Assist-parity suite.
- [`runner-laboratory-fixture-v1.json`](../balance/runner-fixtures/runner-laboratory-fixture-v1.json)
  locks runner-specific timing, geometry, generation, reachability, replay,
  collision, lifecycle, modality, fairness, and budget assertions that registry
  v1 does not model.

The closed runner-fixture schema, both fixtures, and this contract are pinned by
`phase-2-lock-manifest.json`. The four files and manifest are created together in
one docs-only commit and are byte-immutable afterward. The preregistration gate
permits missing results only for that genuinely new commit. Strict verification
requires both source-digest-bound result records and recomputes the runner result
from production code; a stored `passed: true` is never sufficient by itself.

The machine fixture is authoritative for exact values. This prose explains the
same contract. Any discrepancy is a lock error, not permission to choose the
easier rule after observing results.

## 2. Fixed identity and isolated lifecycle

- Runtime save content version remains `phase-1-v1`; Phase 2 fills fields already
  present in the frozen `RunStateV1` envelope and introduces no content migration.
- `phase-1-v1` is the save-compatibility line, not permission to reinterpret its
  catalog. Phase 2 may add manifest-locked catalog IDs while preserving every
  prior ID and meaning, so every valid Phase 1 save remains valid. Removing or
  reinterpreting an ID requires a new content version and migration/quarantine.
- Stage ID is `runner-lab-v1`.
- The laboratory is a clearly labelled standalone practice run, not a life stage.
- It begins from the selected profile only to exercise clamping and parity.
- Entry retains the setup run ID/seed, difficulty, persisted control mode,
  identity, appearance, accessibility, starting profile, and that profile's
  exact starting scores. It reinitializes every gameplay collection/transaction:
  the effect ledger is empty with zero totals; story, consequences, and active
  entities are empty; recovery and encounter are null; invulnerability is 0.
  The run/stage are `active:active`, stage age is 0 months, duration is 3,000,
  settlement is null, and simulation/active ticks and world distance are 0.
- Runner entry is lane 1 with the full idle motion record (`currentLane`,
  `sourceLane`, and `targetLane` all 1, `elapsedTicks: 0`, `totalTicks: 11`), a
  null buffer, both pattern cursors 0, and `userPaused: true`. The first spawn
  cursor is tick 208 on Story and tick 218 on Normal/Challenge, with distance
  equal to world speed times that tick.
- The Start acknowledgement is an implicit sentinel: at tick 0, absence of the
  stable pattern-0/slot-63 start-marker ID means Start is pending. Start inserts
  that ID into the resolved ledger and clears user pause in a zero-tick atomic
  transition. A pending pattern-0 entity is never placed in `activeEntities`,
  because it would violate the frozen cursor invariant.
- It never carries practice scores, effects, entities, settlement, or completion
  memory into Newborn. Phase 3 starts a new actual-life run from setup.
- Completion produces `runStatus: "completed"`, a `complete` stage with an
  `applied` settlement, `runner: null`, and exactly one nonempty lab completion
  memory whose `memoryId` is `memory-runner-laboratory-complete-v1`, plus exactly
  one typed completion fact `fact-runner-laboratory-complete-v1` with value
  `value-runner-laboratory-practice-v1`, in every control mode. The fact makes
  the frozen narrative-set comparator nonempty; a separate runner assertion
  proves exact completion-memory identity.
- The completion screen offers practice recap, practice again, and return to
  title. It never describes the practice score as the player's life outcome.

## 3. Pacing and deterministic pattern composition

One active laboratory lasts exactly 3,000 logical ticks (60 seconds at 20 ms per
tick). Introduction, dialogs, time spent waiting in a Semantic prompt,
visibility/focus interruption, modal time, and user pause never consume active
ticks. A submitted Semantic choice atomically executes exactly one normal active
tick as specified in section 7.

Throughout an active or pending laboratory snapshot,
`simulationTick === stage.activeTicks` and
`stage.worldDistanceMilli === stage.activeTicks × difficultyWorldSpeedMilli`.
Zero-tick Start and settlement transitions preserve those equalities.

There are ten decision-opportunity windows. Their anchor ticks are 300, 550,
800, 1,050, 1,300, 1,550, 1,800, 2,050, 2,300, and 2,550. Slot contact offsets
are measured from each anchor: most slots first overlap at offset 0, while the
delayed risk/reward hazard first overlaps at offset 18. The latest possible
contact is therefore tick 2,568, leaving 432 active ticks for the recap interval.
Every generated course has this exact category multiset:

| Category | Pattern ID | Count | Share |
|---|---|---:|---:|
| Mutually exclusive benefit fork | `runner-lab-benefit-fork-v1` | 4 | 40% |
| Risk/reward | `runner-lab-risk-reward-v1` | 3 | 30% |
| Avoid-only | `runner-lab-avoid-only-v1` | 2 | 20% |
| Quiet/narrative | `runner-lab-quiet-window-v1` | 1 | 10% |

The generator performs one stable seeded permutation of that multiset. Seed,
stage ID, pattern index, and named entropy channel are its only random inputs.
Lane rotations are derived without rejection sampling or reroll-until-valid.
Difficulty may select only fixture-declared legal variants; it never changes
duration, window count, category mix, or story opportunity count.

For every unpaused transition from `t` to `t + 1`, the reducer uses one fixed
order: process one lane intent and movement; increment simulation tick, active
tick, and world distance; advance entities that existed before the transition;
resolve canonical collisions/effects and terminalize or pass entities; then
append any pattern whose tick and distance cursor are both reached at the new
post-transition/new-state boundary. Trigger evaluation never occurs at the old
boundary or before that transition's input/motion/collision work. A newly
appended entity does not advance on its spawn tick. Its center X is exactly
`215000 + speed × (leadTicks + contactOffsetTicks)` milli. The append records the
greatest appended pattern index, installs the following tick/distance cursor,
canonicalizes active entities, and creates a durable checkpoint before the next
tick can accept input. The decision marker is pending in that checkpoint;
Semantic pauses there.

## 4. Motion, buffering, and input identity

Lanes are `0` top, `1` middle, and `2` bottom, with fixed centers at 0, 1,000,
and 2,000 lane-milli. A valid request moves exactly one adjacent lane. The tween
lasts exactly 11 ticks (220 ms).

A moving save has `elapsedTicks` 1–10. On the completion tick it becomes idle at
the target while retaining any legal one-step buffer. The next logical tick
consumes that buffer into a new adjacent motion at `elapsedTicks: 1`. No tick both
completes the old tween and advances the buffered tween. At most one request is
buffered relative to the current target; later requests are ignored until it
begins. Invalid boundary requests are ignored.

For every moving save at elapsed 1–10, persisted `currentLane` remains exactly
`sourceLane`; only the completion transition changes it to `targetLane`. The
runner-lab semantic validator rejects the broader target-lane moving form that
the generic Phase 1 envelope accepts. This restriction is what makes the locked
incoming closure exactly 107 states rather than 207.

For normal motion rendering and collision, player lane-milli is exactly:

```text
round(((sourceLane × (11 − elapsedTicks)) +
       (targetLane × elapsedTicks)) × 1000 / 11)
```

Idle position is `currentLane × 1000`. Player width, height, scale, foot anchor,
and collision hull do not depend on lane, frame, viewport, gender, heritage-style
art set, hair, clothing palette, contrast, or motion preference.

Keyboard, native buttons, and a qualified swipe all emit the same `up` or `down`
domain intent at the same logical boundary. Tests compare their resulting state
and canonical hash. Key repeat never emits an intent.

## 5. Exact incoming closure, warning, and reachability

Append-time proof starts from exactly 107 incoming motion states:

- seven idle states: three lanes with a null buffer plus the four legal
  one-tick handoff states (lane 0/down, lane 1/up, lane 1/down, lane 2/up); and
- 100 moving states: four directed adjacent tweens × elapsed values 1–10 ×
  every target-legal buffer (`null` plus one direction at edge targets, or
  `null` plus two directions at the middle target).

Every logical step branches over no request, up, and down, then runs the same
movement and collision transition used by production. Required movement time
includes the current tween's exact remaining ticks, any committed buffer, and 11
ticks for each further adjacent tween. The perception/input base is 38 ticks,
with idle-distance floors of 38, 50, and 60 ticks for zero-, one-, and two-lane
corrections. The worst legal committed motion needs 43 movement ticks, so lead
times include a guard tick: 92 ticks on Story and 82 ticks on both Normal and
Challenge. Challenge may increase optional density or
variant complexity but cannot reduce the Phase 2 safety lead.

Before appending, the pure solver explores the current tail plus candidate across
at least three patterns. Every one of the 107 incoming states must have a trace
to a non-required-hazard outcome through the next safe boundary. Tests include
an impossible single pattern and a locally safe pattern whose three-pattern
continuation is unavoidable; both must be rejected.

An offset contact tick means the first closed horizontal overlap and the
earliest full contact only for a lane-aligned player. With the locked hulls, an
uncontacted entity first becomes safely passed at
`anchor + contactOffset + floor(70000 / worldSpeed) + 1`; a quiet window's safe
boundary is its anchor. Including the delayed `+18` slot, the latest safe-boundary
offset is 45 ticks on Story, 42 on Normal, and 39 on Challenge. Contacted entities
terminalize immediately. Uncontacted entities pass at that first safe tick, and
terminal IDs are recorded in canonical order at the end of the terminal tick.

The full gate expands seeds 0–9,999 separately for Story, Normal, and Challenge
and all three idle incoming lanes: 90,000 course entries. It requires zero failed
appends, zero unavoidable required-hazard contacts, exact 4/3/2/1 composition,
all warning calculations at or above the locked requirement, and byte-identical
generation on a second pass. Fuzz evidence supplements and never replaces the
append-time invariant.

## 6. Entity, collision, contact order, and invulnerability

Entities use fixed-point coordinates and stable IDs derived from run seed, stage,
pattern index, slot, and content ID. Active entities and simultaneous contacts
are canonicalized by `patternIndex`, then `slotIndex`, then `instanceId`. The
codec rejects a runner-lab save whose active order is noncanonical.

A locked nonpersisted unit witness feeds all six input permutations of three
pre-qualified contact candidates through the production canonical contact-
resolution primitive. It uses seed zero's Challenge course, pattern 8
`runner-lab-risk-reward-v1` rotation 2, valid included slots 1–3, and the exact
stable IDs in the fixture; slot 0 is already terminal. This fixture-only seam
checks coordinate identity, then explicitly bypasses X, lane, and contact-timing
qualification before canonical resolution. It is never a valid persisted run
state: the slots occupy different lanes and slot 1 has a delayed contact offset.
The harness locks slot 0's preexisting resolved ID, the three newly resolved
IDs, and the complete four-ID final ledger. Every permutation must
produce the same canonical coordinate order, suppression behavior, effect
order, scores, resolved ledger, and SHA-256 of the closed batch-result
projection. It does not claim a `stateHashV1` for a deliberately nonpersisted
state. Generated-course evidence does not substitute for this witness because
ordinary templates need not naturally overlap.

`patternIndex` is the greatest appended course index and becomes 11 only for the
terminal sentinel. `resolvedThroughPatternIndex` advances only to the greatest
consecutive pattern whose decision marker and every included slot are terminal.
Resolved entity IDs are lexicographically sorted after every mutation, never
compacted during the laboratory, and capped at exactly 40: the implicit Start,
up to 28 pattern entities, ten decision markers, and the finish sentinel.

The forgiving lane collision half-width and horizontal hull are fixed in the
machine fixture and narrower than the visual placeholder. A pending entity
becomes `contacted` or `passed` exactly once. Its effect ID uses the same stable
16-hex suffix as its entity ID, changing only `entity-` to `effect-`.

Hazard contact at tick `T` owns ordinary hit invulnerability on the half-open
interval `[T, T + 25)`. When recovery is null, the codec accepts future
invulnerability only when the retained most-recent negative runner effect has
that tick, its linked contacted/resolved entity suffix exists, its category is a
locked hazard category, and `invulnerableUntilTick === T + 25`. At tick `T + 25`
a new hazard may apply. Overlapping hazards during the interval resolve without
an effect; benefits remain collectible. Phase 2 never invokes recovery.

That recovery-null acceptance is scoped only to an active `runner-lab-v1` state
whose hazard/entity/effect proof matches this lock. Every other stage and content
version retains Phase 1's rule that future invulnerability requires its owning
recovery transaction; Phase 2 does not globally relax the codec.

That persisted hit/invulnerability transition applies only to Manual and
Semantic Assist, the modes with authoritative contact effects. Automatic
Assist's oracle contacts are nonauthoritative: entities may be rendered and
resolved as passed, but they create no contact effect and never set future saved
invulnerability. Its only score mutation is the terminal settlement in section
7.

The effect table is fixed before implementation:

| Entity content ID | Effect category ID | Kind | Score | Delta |
|---|---|---|---|---:|
| `runner-lab-health-token-v1` | `runner-benefit-v1` | benefit | Health | +1 |
| `runner-lab-happiness-token-v1` | `runner-benefit-v1` | benefit | Happiness | +1 |
| `runner-lab-money-token-v1` | `runner-benefit-v1` | benefit | Money | +1 |
| `runner-lab-clutter-hazard-v1` | `runner-hazard-v1` | hazard | Health | −1 |
| `runner-lab-pressure-hazard-v1` | `runner-hazard-v1` | hazard | Happiness | −1 |

Manual and Semantic contacts use source `runner`, no choice cause, and no
transaction. The fixture proves the maximum negative contacts per score cannot
deplete the lowest valid starting profile. No more than 24 live interactive
entities may exist.

## 7. Manual, Semantic Assist, and Automatic Assist

Control mode is fixed at run creation and cannot change mid-laboratory. Every
machine map uses the persisted `RunStateV1` discriminants directly:
`manual`, `semantic-assist`, and `automatic-assist`; the shorter display labels
Semantic and Automatic are never alternate saved values.

Manual mode advances in real time and accepts keyboard, button, and swipe
intents. Semantic Assist pauses for each decision window and presents an untimed
native fieldset describing every visually available lane, benefit, hazard, and
urgency—never information beyond the visual warning horizon.
The 1,080 Semantic lane cases also render this exact fieldset/legend projection
from the same pattern-warning data as the visual playfield; a separate hidden or
more informative nonvisual data source is forbidden.

Every Semantic prompt begins only at a proven safe boundary with motion idle and
the input buffer null. Raw keyboard, button, and swipe lane intents are disabled
in Semantic mode; only the current untimed lane options can submit a target.
Submission is enabled only while Semantic Assist is the sole pause reason. If a
visibility, focus, user, or modal pause remains, submission is a no-op and leaves
the marker unresolved so no logical tick can bypass that independent pause.
`chooseLane(target)` never teleports. It resolves the decision marker, executes
exactly one ordinary logical step with the first adjacent request (or no request
for stay), then queues a second same-direction request only when a two-lane
target requires it. Those operations and the save are one atomic commit. Every
choice therefore returns at `tick + 1`: a two-lane choice is moving at elapsed 1
with its single buffer filled, a one-lane choice is moving at elapsed 1 with a
null buffer, and stay remains idle with a null buffer. There is no save boundary
inside that compilation, and no chosen target is stored outside `RunStateV1`.
The resulting motion/buffer derives the chosen target after reload. A stable
decision-opportunity marker entity is spawned for every decision window. Submitting any
target, including stay, resolves that marker into `resolvedEntityIds` before the
Assist pause clears. The marker therefore persists acknowledgment without a save
schema change: reload before submission reoffers the same decision, while reload
after submission cannot re-prompt or apply it again.

Semantic Assist given the neutral manual targets must have exactly the same
scoring-entity contacts, entity/effect IDs, actual deltas, and nonempty completion
fact/memory as Manual. Decision markers are excluded from the scoring-contact
projection but validated independently for once-only acknowledgment.

Automatic Assist uses the neutral manual policy only as an offline deterministic
oracle. At each window's spawn checkpoint, its decision marker remains pending.
On the next ordinary logical tick, Automatic recomputes the neutral target from
the saved course/state, resolves the marker, executes the first adjacent request,
and queues a same-direction second request when required. Thus a reload never
finds a resolved marker whose two-lane target existed only outside the save.
The oracle's immutable `stageEntryStateHash` is computed from a reconstructed
Manual entry: clone the same entry fields, replace the control mode with
`manual`, rederive `runId` with `deriveRunIdV1`, then apply `stateHashV1`. It is
never the live Automatic entry hash, because control mode participates in both
the run ID and state hash.

Contact-by-contact events never mutate its scores or ledger. At stage end
tick 3,000 first resolves the pattern-11/slot-63 finish sentinel, advances both
pattern cursors to 11, and installs the terminal tick-3,001/distance-
`worldSpeed × 3001` cursor. That logical transition stops in a durably saved
`active:settling` snapshot with a pending settlement, `startedTick: 3000`, and
the runner still present. Its active entity list is empty; the finish ID is in
the sorted resolved ledger and is never an active entity. Manual and Semantic
pending settlements reserve no effect IDs. Automatic precomputes and reserves
exactly the Health/Happiness/Money-ordered IDs for its nonzero oracle deltas,
while the ledger still owns none of them. The completion memory and fact are
absent. The reducer never hides this reload boundary by applying the settlement
inside the same logical step.

`applyLabSettlement(pending)` is a separate, zero-tick, atomic, idempotent
transition, invoked after the pending checkpoint and again safely after reload.
Every mode applies exactly one deterministic stage settlement. Manual and
Semantic settlements own zero effects. Automatic applies the oracle's aggregate
per-score actual deltas exactly once through the same settlement lifecycle,
using one effect per nonzero score delta in Health, Happiness, Money order.
Because an uncoupled settlement is normalized to `system` by the Phase 1 ledger
contract, Automatic's effects use the dedicated
`runner-lab-automatic-settlement-effect-v1` category, are system-owned and
transaction-linked to the stage settlement, and are never credited as runner or
choice influence. The applied settlement retains the pending effect-ID list and
owns exactly those effects. The applied snapshot retains tick 3,000, records
`completedTick: 3000`, atomically adds the exact singleton completion memory and
typed fact, sets the stage/run complete, and sets `runner: null`. Reload
immediately before or after settlement cannot omit or duplicate it. Completion
fact and memory are identical and every final score is within three points of
neutral Manual; the implementation target is exact equality.

Pending and applied snapshots preserve the entry schema/content versions, run
and setup identity, seed, starting profile, difficulty, control mode, identity,
appearance, and accessibility. Stage ID remains `runner-lab-v1`, age remains
zero months, duration remains 3,000 ticks, recovery and encounter remain null,
all consequence collections remain empty, and credentials, relationships, and
conditions remain empty. Pending story fact/memory collections are empty;
applied story state contains only the exact singleton fact and memory above.
No terminalization step may mutate an unlisted field.

## 8. Replay and save equivalence

The state can be encoded and decoded at every tick. Replay witnesses cover all
moving elapsed values 1–10; idle-before-motion, empty/full-buffer, tween
completion, and buffered-handoff boundaries; implicit Start before/after
acknowledgment; every Semantic and Automatic decision marker before/after its
atomic commit; before/after every entity contact and every safe pass;
invulnerability start, last protected tick, and end; every independent pause
reason and the zero-catch-up resume; the durable pending settlement; and the
applied final completion. Boundary requirements are per occurrence in every
expanded course, not one representative snapshot per label.

From each witness, original and round-tripped states receive identical future
commands. Their hashes remain identical at every tick, and their deterministic
spawn-ID sequences match for all remaining IDs capped at 50. A late witness with
fewer than 50 remaining IDs compares the entire remaining sequence; completion
does not invent synthetic future spawns. Canonical future emission includes an
unresolved implicit Start when applicable, every included pattern slot, every
decision marker, and the finish sentinel in stable course/slot order.

The saved resolved-ID ledger and effect ledger make every contact idempotent.
The completion fact, memory, and settlement are also once-only. A noncanonical active
entity order, bad effect/entity suffix, orphan invulnerability interval, or
partially applied automatic settlement is rejected.

## 9. Pause, interruption, and stable UI lifecycle

Runtime pause reasons are visibility, focus interruption, user, modal, and
Semantic Assist. They form an independent set: clearing one never clears another.
All stop ticks, spawning, motion, collision, and effects. Every reason transition
resets the frame accumulator; the first resumed frame produces zero catch-up
steps. User pause is persisted in `runner.userPaused`; other reasons are runtime
state, while the decision marker makes Semantic pause derivable.

Returning visibility or focus does not resume automatically. It presents an
explicit resume panel; only Resume clears the corresponding interruption. A
valid Semantic choice clears only the Semantic pause after every independent
pause reason is already clear. Escape closes the top modal first and otherwise
pauses. A blur observed while the document is hidden does not add a second focus
interruption, so one hidden-page event never creates two unexplained Resume
steps.

The application mounts one long-lived runner view. A 20 ms tick may update visual
properties, but it does not replace the main tree, focused controls, live region,
or semantic decision nodes. The live region updates only at warnings, contacts,
pause changes, actionable errors, and completion. The non-live lane/motion
description updates at movement start and completion, not every tick; accessible
progress updates at most once per second or at a meaningful boundary. Dispose
cancels the sole animation-frame loop and removes every keyboard, pointer, focus,
visibility, media, and dialog listener.

## 10. Accessible input and presentation

The laboratory opens paused with orientation text and a native Start button.
Semantic structure includes one labelled runner section, a `<dl>` for mode/lane/
motion/pause, a labelled `<progress>`, exactly three visible score outputs, one
persistent atomic polite status region, visible Pause/Resume, and a focused recap
heading at completion. The decorative playfield is `aria-hidden`; no moving
entity becomes an accessibility-tree node.

Manual controls provide labelled 44 CSS px minimum up/down buttons. Swipe is
limited to the dedicated play surface, tracks one primary pointer, requires at
least 24 CSS px vertical travel with vertical magnitude greater than horizontal,
maps decreasing screen Y to up, maps increasing Y to down, cancels on
`pointercancel`/multitouch, suppresses a synthesized click after acceptance, and
emits at most one intent per pointer sequence. The surface alone uses
`touch-action: pan-x`, captures the accepted primary pointer, and releases it on
completion/cancellation. No handler suppresses document scrolling outside that
surface. The surrounding page remains scrollable at 200% text.

Keyboard always retains Arrow Up/Down. Two remappable supplemental bindings
default to W/S and live only in a bounded in-memory presentation record for the
current mounted session, never local/session storage, `RunStateV1`, or its hash.
Reload intentionally restores W/S; a future persistence key requires a separately
preregistered storage-contract change. Duplicate bindings, Tab, Escape, Enter,
Space, modifier chords, and browser/system-reserved keys are rejected. Reset
restores W/S. Instructions and `aria-keyshortcuts` update immediately.
Bindings keep DOM event codes separate from accessible tokens: the W/S defaults
use `KeyW`/`KeyS` for event matching and printable `W`/`S` for labels and
`aria-keyshortcuts`.
Gameplay keys are ignored in inputs, selects, editable content, or an open
dialog; default browser behavior is prevented only for an accepted intent.

The browser gate locks ten focus transitions: entry to Start; Start to the
persistent runner/Pause control; Semantic prompt to its heading or first option;
Semantic submit to persistent runner heading/status; user pause to its Resume;
visibility return to visibility Resume; focus return to focus Resume; modal open
to its first enabled control with inert background and forward/backward Tab
containment; modal close to the exact invoker; and completion to the recap
heading.

Announcements are batched once per warning or result group, never per tick or
entity. They state lane, actual post-clamp delta/resulting score, and suppressed
hazards. Disabling optional announcements leaves essential visible/focus-readable
status; actionable errors remain alerts. Optional audio cues carry no information
that is unavailable in text plus icon/shape, and visible warnings remain complete
with audio muted.

High contrast uses redundant label, icon/shape, outline/pattern, and color plus a
`forced-colors` treatment. Text contrast is at least 4.5:1; controls, focus, lane
boundaries, and meaningful graphics are at least 3:1.

Effective reduced motion is the saved preference OR OS preference. It disables
parallax, continuous world translation, shake, pulse, particles, and spatial
tween animation. An `aria-hidden` lane schematic may snap without animation.
Non-live text exposes source lane, target lane, idle/moving state, and urgency at
movement boundaries rather than streaming every interpolated tick. Simulation,
collision, timing, contacts, effects, completion fact/memory, and canonical
state hashes remain identical to normal motion. Media listeners are disposed.

The laboratory must complete at 1280×720, 800×360, 360×800, and 320×568 through
keyboard, buttons, swipe, Semantic Assist/nonvisual semantics, and Automatic
Assist, at 100% and 200% text, standard/high/forced contrast, and normal/reduced
motion, with no horizontal overflow, accidental clipping, player/control
overlap, obscured focus, or targets below 44 CSS px. Intentional vertical
document scrolling remains available at 200% text. Mobile layouts honor safe-area
insets and keep both lane controls in one reachable cluster that can be placed on
the left or right. Settings/dialog close restores focus; interruption resumes to
the relevant control or decision heading.

Four dedicated machine assertions make this contract non-vacuous:

- `runner-semantic-choice-and-reload-identity-v1` covers 1,084 cases: four
  profiles × three difficulties × ten pattern/rotation cases × all nine
  source-lane/target-lane pairs, plus visibility/focus-interruption/user/modal
  pause guards. Within Semantic Assist, each of the 1,080 lane cases requires
  normal, reload-before-submit, and reload-after-commit branches to match on the
  full hash, marker state, tick, motion/buffer, all remaining IDs, contacts,
  effects, completion fact, and completion memory. A separate cross-mode
  comparison against equivalent Manual adjacent requests uses only the
  mode-agnostic gameplay projection: tick, motion/buffer, future scoring IDs,
  scoring contacts, effects/deltas, scores, completion fact, and completion
  memory. It excludes control mode, run ID, full hash, Assist pauses, and
  decision-marker lifecycle because those are intentionally mode-specific.
- `runner-automatic-no-input-completion-v1` covers all 120,000 entries and
  requires exactly one native Start activation, then completion with zero
  lane/choice inputs, one settlement, exactly one completion fact/memory, and no
  required interactive control after Start.
- `runner-reduced-motion-domain-identity-v1` covers 240,000 paired entries:
  120,000 with saved reduced motion and 120,000 with OS reduced motion. Both
  have zero hash/contact/effect/fact/memory mismatches against normal motion.
- `runner-accessibility-browser-matrix-v1` covers exactly 139 cells: 40
  completion/reflow cells (five paths × four viewports × two text scales), 72
  presentation cells (four viewports × two scales × three contrast modes ×
  three motion-source states), eight mobile safe-area/one-hand cells (two mobile
  viewports × two scales × left/right reach), the ten focus witnesses above,
  and nine warning/result/announcement cases. The five completion paths are
  Manual keyboard, Manual buttons, Manual swipe, Semantic Assist, and Automatic
  Assist. Every assertion result reports `failureCount: 0` and exact locked
  group counts, not only a boolean.

Automated DOM and accessibility-tree checks are labelled as such, never claimed
to be a real screen-reader test. Phase review additionally records one actual
nonvisual Semantic completion, keyboard inspection, and forced-colors inspection.
The closed manual session accepts NVDA only on Windows with Chrome, Edge, or
Firefox, or VoiceOver on macOS with Chrome, Edge, Firefox, or Safari; browser,
platform, assistive-technology versions, reviewer ID, UTC time, and the hashed
session attestation are all required.

## 11. Fairness and non-vacuous population

Assist evaluation covers 10,000 seeds × four profiles × three difficulties ×
the one laboratory context. Existing content-lock evidence has three policy
cells, so its required run count is 360,000. Semantic scoring outcomes are exact;
Automatic score distance is at most three per score; all modes contain the same
nonempty singleton completion fact and memory. The frozen narrative assertion
compares the nonempty fact set; `runner-completion-memory-parity-v1` separately
compares the exact memory over 120,000 paired entries.

Appearance invariance uses the fixture's locked witness seeds across every
profile and difficulty and exactly two genders (`female`, `male`), four heritage
styles (`asian`, `western`, `black`, `middle-eastern`), four hair styles
(`short-soft`, `wavy-bob`, `curly-crown`, `tied-back`), four hair colors
(`black`, `dark-brown`, `warm-brown`, `silver`), and four clothing palettes
(`sunrise`, `meadow`, `ocean`, `berry`): 512 identities per cell. Because gender
participates in the canonical hash while cosmetic fields are projected out, the
comparator is an explicit gameplay projection: pattern IDs/rotations and optional
groups, collision geometry, command trace, contacts, effect IDs/deltas, completion
fact/memory, settlement, and final scores. All 18,432 comparisons report zero
projection mismatches.

The runner result additionally proves zero pause drift over the pause-reason
power set, one-contact multiplicity, exact input modality parity, maximum live
entities, non-depletion, pattern composition, warning/reachability, replay, and
once-only Automatic settlement. Every assertion has a fixed ID and population
in the machine fixture; missing, skipped, partial, stale-source, empty, or
`passed: false` evidence, nonzero failure count, or wrong group count fails.

## 12. Verification, review, and deployment

Phase 2 adds `runner:validate`; `npm run verify` invokes it and strict content/
runner evidence validation before build and budgets. The evaluator recomputes the
canonical result and byte-compares it with the committed runner result. Focused
tests retain deliberately failing reachability, replay, contact-order,
invulnerability, modality, pause, accessibility, and settlement witnesses.
The evaluated-source digest includes `index.html`, every production source and
script, relevant configuration/lockfiles, and the locked balance/spec/save
documents, while excluding generated evidence output itself.

Phase 1 budgets are held: main-entry JavaScript ≤180,000 bytes; CSS ≤30,000;
critical gzip and Brotli ≤350,000 bytes each; artifact ≤20,000,000 bytes; save
below 100 KB; and at most 24 live entities.

Before implementation commit, independent code, gameplay-logic, and
accessibility reviews must have no remaining Critical/High or applicable Medium.
The implementation commit is pushed and deployed; the exact SHA is verified by
workflow, `/release.json`, hashed assets, console/network inspection, the five
input paths, pause/reload, and saved replay.

The non-recursive closure commit may change only `docs/reviews/phase-2.md` and
`docs/IMPLEMENTATION_STATUS.md`. It must not deploy; the verified implementation
SHA remains live.
