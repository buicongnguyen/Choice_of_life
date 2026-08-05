# Choice of Life — implementation plan v2

Status: active implementation plan

Supersedes: [CHOICE_OF_LIFE_PLAN.md](./CHOICE_OF_LIFE_PLAN.md) for execution order and acceptance gates

Retains: the original plan as the detailed stage/content bible unless this document explicitly changes a rule

Repository: `buicongnguyen/Choice_of_life`

Production: `https://buicongnguyen.github.io/Choice_of_life/`

## 1. Evaluation of the original plan

The original plan established a strong product direction: a complete-life, right-to-left runner with three visible scores, grounded character art, short choices, recurring people, and delayed consequences. It also protected the v5 reference repository correctly.

It was not yet safe to execute as written. The review found these blocking problems:

1. The inherited `engine.ts`, `sprites.ts`, state, UI, and economy are too coupled to convert incrementally without carrying the incompatible v5 rules into the new game.
2. Hundreds of runner pickups at ±2–9 could mathematically overwhelm twelve major choices at ±5–15, contradicting the intended 30% runner / 70% choice influence.
3. Pattern-local “one safe lane” validation does not prove that a player can reach that lane from the current lane while a 220 ms transition is in progress.
4. The proposed save state omitted enough mid-run data that refresh could change spawns, duplicate contacts, move the player, or lose an encounter result.
5. Marking a consequence “fired” before presenting it could lose its effects after a crash; marking it afterward could duplicate them.
6. Zero-score recovery could become a positive-value exploit or a repeated punishment loop.
7. A 24–30 minute life with long uninterrupted runner segments risks repetition and discourages replay.
8. Fixed chapter ages make professional education, career interruptions, relationships, and early or late retirement implausible.
9. Accessibility covered the choice tray but not the canvas runner itself.
10. The original phases were too large for meaningful review, especially the complete-life phase.
11. The production artifact is about 101 MB because the avatar preview and every large source atlas are included in the Pages build.
12. The deployment had no file inside the site that proved which commit was live.

This version turns those observations into architecture rules, measurable logic tests, smaller phases, and a mandatory review/deployment gate after every phase.

## 2. Non-negotiable product rules

- The only permanent numeric life scores are Health, Happiness, and Money.
- All three scores are finite values clamped to 0–100.
- Money represents financial security, not literal cash.
- Grades, age, stress, credentials, career, relationships, and memories are facts or conditions, not hidden score bars.
- The player occupies one of three lanes and remains at a fixed horizontal anchor and fixed stage-specific scale.
- Newborn movement uses seated/crawling art; later movement uses age-appropriate walking/running art.
- Stage progress advances by active simulation time, not by rendering frame rate or difficulty speed.
- Dialog, pause, focus loss, and hidden-page states stop progress, spawning, movement simulation, collisions, and score changes.
- Important encounters cannot be lost accidentally. A missed mandatory NPC is re-offered at a safe checkpoint; optional NPCs are labeled optional.
- Every major option must be rational for at least one declared player goal or context. No option may strictly dominate another across immediate and expected future effects.
- Every major choice changes later dialog, an offer, a relationship, a callback, or the ending. At least 6–8 choices in a typical life receive scene-level callbacks.
- Early childhood memories influence later scenes but never lock a career, identity, relationship, or ending by themselves.
- University, practical training, direct work, marriage, children, single life, community life, career interruption, and retirement timing remain viable.
- A score reaching zero starts an atomic recovery event; it never ends the life.
- The game is completable through keyboard, touch, and Assist mode.

## 3. Strangler cutover architecture

The new game replaces the main entry point without rewriting the legacy engine in place.

The runner must not import:

- `engine.ts`
- `ui.ts`
- `stats.ts`
- `stages.ts`
- `events.ts`
- `story.ts`
- `life-rules.ts`
- legacy economy, training, investment, or free-room movement modules

Reusable art is accessed through one narrow adapter. Domain code cannot import canvas, DOM, `localStorage`, legacy types, or art modules.

```text
src/choice-of-life/
  app.ts
  config.ts
  core/
    facts.ts
    score-model.ts
    effect-ledger.ts
    run-state.ts
    run-state-codec.ts
    stage-clock.ts
  runner/
    lane-controller.ts
    entity-model.ts
    pattern-catalog.ts
    pattern-validator.ts
    spawn-director.ts
    collision-system.ts
    simulation.ts
  encounters/
    encounter-model.ts
    encounter-transaction.ts
    consequence-scheduler.ts
  stages/
    stage-model.ts
    stage-validator.ts
    catalog.ts
    newborn.ts
  persistence/
    save-store.ts
  input/
    input-controller.ts
  presentation/
    runner-ui.ts
    canvas-surface.ts
    runner-renderer.ts
    scene-renderer.ts
    character-adapter.ts
    audio.ts
```

Dependency direction:

```text
core ← stages ← runner ← encounters
  ↑                          ↑
persistence             presentation
        \                 /
                  app
```

Only `presentation/character-adapter.ts` may import selected inherited character modules. The avatar preview remains a local reference tool and is removed from the production Rollup inputs.

Every app instance has a `dispose()` contract that cancels RAF and removes resize, keyboard, pointer, media-query, focus, and visibility listeners.

## 4. Deterministic simulation and save contract

The simulation uses a fixed logical step. Rendering can interpolate, but gameplay output cannot depend on monitor refresh rate.

New gameplay code may not use `Math.random()`, `Date.now()`, or wall-clock time. Pattern content is generated from:

```text
hash(runSeed, stageId, patternIndex)
```

This makes any pattern independently reproducible and prevents random-number drift after reload.

The active-run schema includes:

- schema version and run ID;
- run seed and selected difficulty;
- player appearance and accessibility settings;
- current stage ID, current age, stage active time, and world distance;
- current, source, and target lane plus tween progress;
- simulation tick and input buffer;
- pattern index and next spawn distance/time;
- bounded active-entity snapshots;
- resolved-entity IDs or compact resolution ledger;
- invulnerability and recovery cooldown;
- three scores and source-attribution ledger;
- typed facts, memories, credentials, relationships, and conditions;
- queued and resolved consequence transactions;
- current encounter transaction and presentation phase.

Phase 1 defines the stable envelope and every future subdocument type, including entity, stage, recovery, encounter, and consequence records. Subdocuments may be absent only when their feature is inactive. Every later schema change ships with a migration and codec tests in the phase that introduces it; migration is not deferred to Phase 11.

Save key: `choice-of-life-v1-active-run`.

The codec rejects wrong versions, non-finite values, unknown IDs, invalid lanes, duplicate IDs, impossible phases, oversized arrays, excessive string lengths, and future schemas. Corrupt or future saves are quarantined and start a new run without affecting the old v5 save key.

Checkpoint after:

- completed lane transition;
- spawn resolution;
- pickup or hazard contact;
- recovery resolution;
- encounter transaction change;
- stage transition;
- a throttled interval while safely running.

Equal seed, snapshot, ordered inputs, and logical steps must produce the same state hash.

## 5. Score influence and saturation controls

The effect ledger records every applied delta with a source:

```ts
type EffectSource =
  | "runner"
  | "choice"
  | "callback"
  | "settlement"
  | "recovery"
  | "system";
```

The UI shows the actual post-clamp delta, not a nominal amount erased by 0/100 clamping.

Balance targets across matched-seed simulations:

- median runner share of absolute applied score delta: 25–35%;
- choice effects plus callbacks and settlements carrying a valid `causedByChoiceId`: at least 65%;
- best-versus-worst decision policy changes normalized final-score distance at least twice as much as best-versus-worst runner skill;
- each score spends less than 10% of active time at 0 or 100 in the published balanced-policy fixtures;
- fewer than 5% of choices have an intended delta erased by clamping.

All expected-outcome and non-dominance comparisons use one locked protocol:

- seed set `0..9,999`, paired by seed, named starting profile, and difficulty;
- normalized score distance
  `(|ΔHealth| + |ΔHappiness| + |ΔMoney|) / 300`;
- four numeric goals with fixed weights: Health-first `60/20/20`,
  Happiness-first `20/60/20`, Security-first `20/20/60`, and Balanced
  `1/3, 1/3, 1/3`;
- the finite narrative-goal set `{learning, care, community, autonomy}`; a
  narrative goal counts only when an option creates a unique typed fact, route,
  named callback, or ending acknowledgment aligned with that goal;
- a comparison horizon from the option through the furthest implemented stage
  settlement and every callback scheduled inside that slice; the complete-game
  horizon ends after the final biography and ending;
- categorical facts are checked for route/callback coverage and never converted
  into retroactively chosen score weights.

An option is justified only if it is non-dominated over that fixed horizon and
is best for at least one locked numeric goal/context, or uniquely advances one
of the four locked narrative goals. Inventing a new goal after tuning cannot make
an otherwise dominated option pass.

Controls:

- track independent gross-positive and gross-negative runner accumulators per score and stage; never use a net cap;
- apply monotonic soft diminishing returns keyed by typed effect category, not cosmetic item ID; helpful contacts always apply a non-negative amount and hazards always apply a non-positive amount;
- settle salary, tuition, major bills, and savings mainly through decisions and stage settlement;
- use lane objects as opportunities, habits, and budget symbols rather than literal repeated paychecks;
- require every callback or settlement counted as decision influence to carry its originating choice ID; otherwise classify it as `system`;
- exclude recovery from both the runner and decision attribution numerator and denominator.

Cap tests are monotonic: removing a hazard from an identical trace cannot worsen any score; adding a helpful pickup cannot worsen any score; reordering contacts of equal typed value cannot create immunity or a better result through budget consumption.

Recommended starting context is selected from named family profiles, rather than implying every baby begins financially insecure. Equal score totals are not assumed to mean equal advantage. Matched-policy simulations compare route access and normalized final-score distance across profiles. Every profile must retain the same minimum ending/repair-route coverage, and paired Balanced-policy median distance between profiles must remain at or below `0.08`. Default scores remain close to Health 65, Happiness 60, Money 35 but the setup explains the context.

Balance evidence is preregistered, not selected after tuning. Phase 1 creates
`docs/balance/fixture-registry-v1.json` with the global seeds, metrics, fixed goal
set, starting profiles, and canonical policy IDs. The phase that introduces new
content adds its named contexts, policies, horizons, thresholds, and expected
directional results in a docs-only fixture-lock commit before balance constants
or content effects are tuned. Tests read that registry. The phase review links
the lock commit and file hash. Changing a locked fixture requires an independent
logic review and a written design reason; observing a failing result is not a
valid reason. Phase 10 aggregates the locked fixtures and may not invent a new
passing population or tolerance.

## 6. Runner pacing and fair movement

Target first-release length: 16–22 minutes on Normal. The old 24–30 minute target must be earned by playtest evidence before it can replace this range.

Per-stage target: approximately 55–85 seconds of active time, excluding dialogs and pause.

No uninterrupted runner segment exceeds 75 seconds. Each stage places:

- a readable introduction;
- a minor story beat or callback by 25–35%;
- a major choice by 60–75%;
- a recap or consequence near the end.

Pattern mix target:

- 40% mutually exclusive benefit forks;
- 30% risk/reward patterns;
- 20% avoid-only patterns;
- 10% quiet or narrative patterns.

Measure the mix twice: weighted static catalog composition must stay within ±10
percentage points of the target, and generated complete-life runs over the locked
seed set must have each category median within ±10 points and p5–p95 within ±15
points. Before the complete catalog exists, apply the same measurements to the
currently playable slice and label the scope. Every stage still contains at least
one benefit fork, one risk/reward pattern, and one quiet or narrative window.
This prevents staying in an empty lane from becoming the optimal strategy without
demanding impossible exact percentages from a short stage.

Movement rules:

- one input requests exactly one adjacent lane;
- lane tween is approximately 220 ms;
- new lane input is locked until the tween completes, with at most one adjacent buffered move;
- the collision position is the visible interpolated lane position;
- character height, width, foot anchor, and scale never depend on lane or frame.

Minimum warning time on Normal:

```text
600 ms perception margin
+ requiredMoves × 220 ms
+ 150 ms input slack
```

Use at least about 1.0 second for a one-lane correction and 1.2 seconds for a two-lane correction. Story mode adds more warning time.

The validator treats reachability as an invariant whenever a pattern is appended. It evaluates every incoming lane and in-flight transition over the generated horizon required to stop or change lanes safely. A rolling three-pattern graph is the minimum local window, while 100,000 seeded sequences provide fuzz evidence rather than replacing the invariant. Checking each pattern independently is insufficient.

Stage active time is independent of scroll speed. Difficulty changes warning distance, object speed, density, and pattern complexity—not life duration or story opportunities.

## 7. Collision, recovery, and encounter safety

Each entity resolves at most once. A forgiving inner hit box follows the visibly interpolated player position.

Recovery is an atomic, non-reentrant transaction:

1. detect one or more depleted scores;
2. freeze runner progress and collisions;
3. choose one deterministic combined recovery when multiple scores reach zero;
4. apply recovery once using the bounded restoration rule below;
5. record any non-score recovery condition without charging another score;
6. record resolution and a per-stage cooldown;
7. resume into an empty safe corridor.

Record `preTriggerScores` immediately before the atomic effect that caused
depletion. For each depleted score, restore exactly
`max(1, min(recoveryTarget, preTriggerScore))`; leave every non-depleted score
unchanged. Phase 3 freezes `recoveryTarget` before tuning. Thus recovery can keep
the life playable but can never improve any score relative to the triggering
effect's pre-state. It does not rewind progress, respawn resolved entities, award
bonus items, or reduce future rewards. Temporary protection, a safe corridor,
and lower hazard density provide breathing room without positive score value.

A positive recovery cycle means a hazard/recovery sequence that returns to the
same or earlier stage progress and resolved-entity state with every score at
least as high as at the sequence start and one score higher, without a new major
choice or settlement. Breadth-first tests cover all low-score vectors through the
frozen target and representative states above it; no such cycle or re-entrant
transaction may exist. A recovery cooldown suppresses bonus/support spawns only—
it never suppresses required recovery if a score reaches zero again.

An encounter begins only after active objects are removed or frozen. When it ends, the game resumes into a completely empty corridor; invulnerability is a backup rather than the only protection.

Mandatory NPCs are re-offered at a checkpoint if the player misses their lane. Optional NPCs can pass and record that choice explicitly.

## 8. Idempotent choices and consequences

A consequence is not a free-form fired flag. It is a typed transaction:

```ts
type ConsequenceStatus =
  | "pending"
  | "resolved"
  | "presented"
  | "complete"
  | "expired"
  | "superseded";
```

Resolution atomically writes:

- selected option;
- actual applied score effects;
- typed facts and relationship changes;
- scheduled future consequences;
- immutable result text inputs;
- transaction status.

Presentation renders from the resolved record and cannot reapply effects. Reload before, during, or after presentation must reach the same state.

Typed mutually exclusive facts replace string combinations, for example:

```ts
type SchoolGrade = "basic" | "good" | "excellent";
type EducationRoute = "professional" | "practical" | "directWork";
type HomeRoute = "partnered" | "singleFriends" | "community";
```

The consequence graph is acyclic, every target exists, prerequisites have a deterministic fallback, and simultaneous callbacks use stable priority. When an encounter slot is full, content defines one explicit terminal path: defer to the next legal checkpoint, merge through a declared merge rule, expire with a visible recap/ending effect, or supersede with a recorded reason. Superseding a consequence caused by a major choice must also preserve a player-visible acknowledgment in a substitute scene, later recap, story log, or ending. Every pending consequence must reach a terminal status; no callback or promised acknowledgment is silently dropped.

## 9. Age, education, career, and relationship logic

Age is stored independently from chapter identity.

- practical training, university, professional study, foundation years, direct work, caregiving, retraining, and career interruption advance different amounts of time;
- a doctor is not offered before the required professional credential and training duration;
- medicine can begin with trainee/resident status before a fully qualified role;
- relationships can begin before the Relationships and Home chapter;
- that chapter focuses on commitment and home choices, not first eligibility;
- earlier retirement, later retirement, part-time work, and interrupted careers are supported;
- age never decreases and no route is forced only because a threshold was reached.

Route validation covers grades `{basic, good, excellent}` × Money `{0, 50, 100}` × support `{none, some, strong}`, every numeric route threshold at `T−1`, `T`, and `T+1`, and reachable combinations of credentials, age, route, and interruption state. Every valid state reaches at least two next routes and an ending. Each education path exposes 2–3 qualified career offers plus a retraining option. No uncredentialed professional career appears. Route-duration and credential tables are data validated in the same phase that introduces them.

For the same exam-preparation choice, worst-to-best runner play can shift at most one grade band and can never remove every repair route.

## 10. Accessibility as a whole-game requirement

Accessibility is implemented with each phase, then audited near release.

Required modes and behaviors:

- keyboard-only lane and dialog control;
- touch buttons and swipe;
- remappable controls;
- semantic Assist lane choices use the same pattern and effect rules as manual play;
- automatic Assist replaces contact-by-contact runner scoring with a documented neutral stage settlement; for matched seed, context, and story choices it preserves all narrative facts and finishes within ±3 per score of the canonical neutral manual policy;
- untimed semantic HTML choices;
- predictable focus trap and focus restoration;
- batched `aria-live` announcements rather than one announcement per pickup;
- a nonvisual screen-reader path that exposes the current stage/lane, upcoming
  lane options or hazards with urgency, decision windows, actual immediate
  effects, score changes, encounter choices, and every focus transition;
- high contrast and icon/shape redundancy;
- reduced-motion mode with static or very slow scene movement;
- 200% text support and 320 px reflow;
- safe-area insets and one-hand controls;
- visible/audio warning equivalents;
- pause on focus loss and hidden page.

The Phase 2 laboratory and every later playable stage must be completable
nonvisually with a screen reader through semantic Assist, without relying on the
canvas or color. Every user-visible phase—not only the final audit—must be
completable with keyboard, touch, screen reader, and its current Assist path. A
full life must ultimately pass all four paths.

## 11. Art and performance budgets

Initial audited baseline:

- tracked source: about 200 MiB;
- Pages artifact: about 101 MB;
- production PNG assets: about 100 MB;
- main bundle: about 258 KB minified JavaScript and 36 KB CSS;
- large avatar preview is currently a production entry.

Phase 1 budgets:

- complete main-entry minified JavaScript graph: at most 180 KB;
- CSS: at most 30 KB;
- critical compressed HTML/JS/CSS transfer: at most 350 KB;
- Newborn player and caregiver image transfer: at most 2.5 MiB;
- deployed artifact: at most 20 MiB;
- no more than 24 live interactive entities;
- save accepts at most 64 active entities and remains below 100 KB;
- decoded stage images below 32 MiB;
- update plus render p95 below 12 ms at DPR 2 using the recorded review hardware, browser/version, warm-up duration, representative scene/entity fixture, sample count, and percentile method.

The production build excludes `avatar-preview.html`. Compact per-stage runtime atlases are generated from reviewed source art. The full atlas matrix remains available locally for art review but is not shipped to every player.

Budgets are ratcheted downward or held after each phase. A phase cannot silently increase them.

Phase-specific tooling owns each measurement: Phase 1 ratchets entry/artifact/save
budgets and adds reproducible gzip/Brotli critical-static-transfer measurement;
Phase 2 adds simulation and reachability commands; Phase 3 adds browser/layout,
Newborn network transfer, decoded-image-memory evidence, and reproducible render
timing; Phase 4 adds encounter-reload E2E; Phase 10 reruns and audits every prior
budget plus the final automated accessibility suite rather than introducing a
measurement after its first required gate.

Phase 2 also keeps a non-normative phase-timing diagnostic. Correctness and
committed evidence always cover 10,000 seeds × four starting profiles × three
difficulties (120,000 base entries), all locked reduced-motion pairs and
appearance witnesses, and the browser matrix; timing may never reduce that
release population. The diagnostic runs one four-seed warm-up and three
24-seed, two-OS-worker samples of the base gameplay domain only. It records
source/input loading, worker wall time, shard reading, fixed global proofs,
aggregation/closure, total time, Node/OS/CPU metadata, evaluated-source SHA-256,
and aggregate population SHA-256. All three sample aggregate hashes must agree.
A conservative linear projection is labelled base-gameplay-only and expressly
does not estimate the auxiliary or end-to-end `runner:validate` cost. Because no
evaluator wall-clock limit was preregistered before Phase 2 results were seen,
the diagnostic has no timing pass/fail threshold. Exact full-population generate
and validate runs remain release gates. Any future operational SLA must be added
by a written plan amendment, with its operator/CI rationale and independent
review, before replacement timing results are observed; it cannot shrink the
domain or be tuned to make an observed failure pass.

Canonical local release evaluation partitions that unchanged population across
up to four available OS workers; an explicit worker count may change only the
shard partition. Aggregate evidence is required to remain byte-identical across
shard counts. The diagnostic above remains locked to two workers so its samples
stay comparable and cannot be substituted for release evidence.

**Phase 2 CI execution amendment (2026-08-04).** Clean runtime measurement found
that four local workers project the base domain alone to approximately 5 hours
25 minutes, before fixed global proofs, browser evidence, ordinary verification,
and the production build. That leaves unsafe margin under GitHub-hosted jobs'
six-hour ceiling. CI therefore evaluates the same immutable population as 16
global stride-partitioned shards: four isolated matrix jobs each run four OS
workers, followed by one fail-closed aggregation job. The jobs exchange only
canonical, source/build/commit-bound shard artifacts. Aggregation requires the
exact 0–15 shard closure, rejects missing, duplicate, extra, malformed, or
source-mismatched artifacts, recomputes every global and browser assertion, and
requires byte-identical recomputation of the same committed canonical evidence
validated by local `runner:validate` before Pages can deploy. The distributed
step replaces only the long runner-population computation: deployment remains
gated on ordinary type and test checks, strict fixture validation, the
production build, release verification, bundle budgets, and identity of the
browser-tested `dist` payload. The plan digest is transported independently as
a preflight-job output and must match the downloaded canonical plan bytes.
This operational amendment neither changes the locked inputs nor weakens any
assertion, population, auxiliary domain, manual review, or browser cell. Local
`npm run verify` remains a complete exact evaluation on one machine.

## 11A. Normative overrides over the original content bible

| Original topic | V2 rule |
|---|---|
| 24–30 minute target | 16–22 minutes unless playtesting justifies longer |
| Pattern-local safe lane | Full reachable-horizon invariant plus seeded fuzzing |
| Runner/choice effect magnitudes | Source-ledger targets and monotonic soft diminishing returns govern |
| `fired` consequence | Idempotent transaction with explicit terminal status |
| Fixed chapter ages | Variable age advancement from route-duration data |
| Three career offers | 2–3 qualified offers plus retraining |
| Recovery above/below prior score | Bounded restoration never exceeds the immediate pre-trigger score; defined cycle search governs |
| Accessibility deferred to polish | Every playable phase passes keyboard, touch, automatic/semantic Assist, and nonvisual screen reader |

When wording conflicts, this table and the rest of v2 take precedence.

## 12. Revised implementation phases

### Phase 0A — Plan, tooling, and baselines

Deliver:

- this reviewed v2 plan;
- architecture decision records;
- implementation status and review template;
- aggregate verification and bundle-budget commands;
- recorded artifact/test baselines;
- a release metadata file generated from `GITHUB_SHA`;
- workflow verification of the release metadata and budgets.

Exit:

- inherited reference build behavior remains unchanged;
- local and CI verification pass;
- the deployed `/release.json` identifies the exact pushed commit.

### Phase 1 — New application shell and deterministic domain core

Deliver:

- isolated `src/choice-of-life/` tree and new main entry;
- import-boundary test;
- three-score reducer and effect ledger;
- pattern-indexed deterministic generator and fixed-step clock;
- stable full-envelope model, validated run-state codec, migration framework, and save store;
- title/setup/settings shell with only three score previews;
- corrupt/future save handling and app disposal;
- fixture registry with locked global metrics, goals, seeds, starting profiles,
  canonical policy IDs, and compressed-transfer/save-budget tooling.

Exit:

- new and resumed runs with the same inputs have identical state hashes;
- only three numeric scores exist in runner state and UI;
- new domain/simulation code has no legacy, DOM, storage, time, or random imports.

### Phase 2 — Runner laboratory

Deliver:

- three-lane tween and one-step input buffer;
- scrolling placeholder layers;
- entity lifecycle, collision, invulnerability, pause, focus, and visibility behavior;
- keyboard, touch, swipe, high-contrast/reduced-motion baseline, and a complete Assist path for the laboratory;
- typed pattern catalog and rolling reachability validator.

Exit:

- the append-time reachable-horizon invariant passes and 10,000 seeded sequences per difficulty are reachable from every incoming lane;
- reload/state replay hashes match at mid-tween and contact boundaries;
- no input changes two lanes at once;
- the laboratory is completable through keyboard, touch, nonvisual screen-reader
  Assist, and automatic Assist.

### Phase 3 — Newborn stage

Deliver:

- typed stage schema and validators;
- grounded nursery layers and subtle ambient motion;
- compact newborn/caregiver runtime art;
- crawl/seated animation, pickups, hazards, stage clock, recap, and settlement;
- one mandatory caregiver safe corridor with a minimal untimed, reload-safe
  three-option crossroads outside the playfield; the Newborn stage cannot settle
  until that transaction is resolved exactly once;
- one typed Newborn choice fact and memory whose IDs, effects, option goals, and
  comparison horizon are frozen in the Phase 3 fixture before tuning;
- source-attribution ledger and atomic deterministic recovery core; Phase 4 adds its story presentation;
- a preregistered Newborn fixture lock covering runner curves, canonical neutral
  manual/Assist policies, recovery target, profile tolerance, and named contexts;
- Newborn transfer, decoded-image-memory, browser-layout, and render-timing
  measurement.

Exit:

- Newborn is playable at 1280×720, 800×360, 360×800, and 320×568;
- character scale and foot anchor remain fixed;
- Newborn is completable with keyboard, touch, automatic/semantic Assist, and a
  nonvisual screen reader;
- every completed `newborn-v1` save contains the resolved caregiver transaction,
  and Phase 4 may generalize or present callbacks from it but may not reinterpret
  an already completed Newborn stage;
- production artifact, critical/Newborn transfer, save, decoded-memory, and render
  budgets pass;
- Newborn attribution, saturation, monotonicity, pattern mix, recovery-cycle, and
  matched-seed Assist-parity fixtures pass.

### Phase 4 — Encounters and consequences

Deliver:

- generalization of the Phase 3 caregiver crossroads into the reusable encounter
  catalog and transaction engine without changing completed Newborn outcomes;
- additional mandatory and optional safe-corridor encounters;
- responsive semantic choice trays outside the playfield;
- reusable atomic encounter transactions;
- typed facts, memories, relationships, scheduled callbacks, and story log;
- recovery presentation integrated with the Phase 3 atomic core;
- refresh tests at every transaction state;
- a preregistered encounter fixture lock defining goal/context IDs, comparison
  horizons, effect directions, and supersession acknowledgments before tuning.

Exit:

- each effect applies exactly once across reloads;
- dialog never overlaps the player or controls;
- collisions and progress remain stopped until an empty corridor resumes;
- every encounter path is completable through keyboard, touch,
  automatic/semantic Assist, and a nonvisual screen reader;
- locked encounter non-dominance, terminal-status, visible-supersession, and
  reload fixtures pass.

### Phase 5 — High School and Education/Training slice

Deliver:

- exam preparation trade-offs and typed grade outcome;
- professional, practical, and direct-work routes;
- foundation-year repair route;
- variable age advancement and route validator;
- clearly labeled demo chapter selector/montage for unfinished ages;
- a preregistered education fixture lock defining grade bands, route-boundary
  contexts, policies, horizons, and repair expectations before tuning.

Exit:

- every route reaches 2–3 viable career qualifications plus retraining;
- no age or credential invariant fails;
- the public build never silently skips unfinished life stages;
- the preregistered playable-slice attribution, grade-band, route-boundary,
  saturation, and non-dominance fixtures pass.

### Phase 6 — First Career and provisional ending

Deliver:

- 2–3 qualified offers plus retraining, with Income, Pressure, and Purpose/Autonomy labels;
- salary/cost settlement and career pressure callbacks;
- doctor trainee/qualified path and emergency-shift decision;
- provisional ending using scores, facts, and named people;
- a preregistered career fixture lock with named steady-qualified comparator,
  contexts, thresholds, and policies before career tuning.

Exit:

- no career or major option strictly dominates another;
- against the steady qualified-career policy at matched age, profile, seed, and
  prior choices, the doctor policy produces median final Money at least 8 points
  higher and median `adverseWellbeing` at least 6 points larger, where
  `adverseWellbeing = max(0, -ΔHealth) + max(0, -ΔHappiness)` over the matched
  career horizon, while remaining non-dominant for every locked goal;
- the ending distinguishes financial security from overall success.

### Phase 7 — Childhood continuity

Deliver Toddler, Early Childhood, Elementary, and Middle School with stable named friend identity, same-stage school friends, callbacks, and continuous age progression.

Exit:

- a continuous Newborn-to-Career life works without demo jumps;
- every childhood major choice changes later content;
- childhood memories influence but never determine adult identity.

### Phase 8 — Adult routes

Deliver Relationships/Home and Midlife with partnered, single/friends, and community routes; optional marriage/children; caregiver aging; career interruption; and support callbacks.

Exit:

- every home route reaches Later Career;
- no relationship status is forced by age;
- caregiver/promotion options remain non-dominant and callback-safe.

### Phase 9 — Later life and full ending

Deliver Later Career, Retirement/Legacy, optional retirement timing, full biography, and ending-title rules.

Exit:

- all 12 stages complete;
- every stage has a major choice;
- at least six major choices in every valid complete route receive scene-level callbacks, with a target of 6–8;
- the ending names important people and decisions without producing one victory score.

### Phase 10 — Art, audio, balance, and accessibility audit

Deliver final grounded backgrounds, compact stage atlases, animation/anchor matrix, pets where appropriate, audio and visual equivalents, difficulty tuning, high contrast, reduced motion, 200% text, and the final Assist/screen-reader audit. These features already exist in functional form for every preceding playable phase. Phase 10 aggregates locked balance fixtures and reruns existing performance/transfer/memory gates; it cannot redefine the evaluated population, goals, comparator, or tolerance to fit observed results.

Exit:

- zero serious or critical accessibility findings;
- full keyboard, touch, automatic/semantic Assist, and nonvisual screen-reader runs pass;
- no transparent clothing gaps, floating characters, frame-scale drift, or budget regression;
- matched-seed balance targets pass.

### Phase 11 — Release hardening

Deliver full deterministic smoke runs, migration/quarantine behavior, Pages-path checks, performance evidence, release notes, known limitations, and a `v1.0.0` tag.

Exit:

- production exact SHA loads without console or network errors;
- every definition-of-done item has linked automated or review evidence;
- v5 source and live deployment remain unchanged.

## 13. Mandatory review gate for every phase

Before each phase commit:

1. inspect `git status -sb` and the exact diff;
2. run focused tests during implementation;
3. perform an independent code review for boundaries, lifecycle cleanup, untrusted-save handling, DOM escaping, performance, and maintainability;
4. perform an independent logic review for determinism, source attribution, route reachability, consequence idempotency, non-dominance, recovery cycles, age/credential invariants, and fairness;
5. review applicable UI at 1280×720, 800×360, 360×800, and 320×568, including 200% text, keyboard, touch, current Assist, nonvisual screen-reader completion, high contrast, reduced motion, and focus restoration where relevant;
6. fix all critical/high and in-scope medium findings;
7. record evidence and accepted low-risk findings in `docs/reviews/phase-N.md`;
8. run `npm run verify` and `git diff --check`;
9. commit one coherent phase;
10. push `main` through the SSH remote;
11. wait for the Pages workflow for the exact SHA;
12. verify `/release.json`, HTML, hashed assets, primary flow, and browser console before starting the next phase.

The implementation commit is the deployable phase SHA. After it passes exact-SHA
production smoke, one `docs/**`-only evidence commit records that implementation
SHA and marks the phase complete. The Pages workflow ignores docs-only pushes, so
the evidence commit cannot replace the verified deployment. If an evidence commit
contains any non-doc path, it is invalid and must itself deploy and pass exact-SHA
smoke before work continues. Evidence commits run `npm run verify` but do not
require a recursive evidence record.

Direct pushes to `main` are intentional for this owner-directed implementation goal. No force-push is allowed.

## 14. Required automated logic evidence

Before v1 completion:

- outcome attribution: named canonical policies and context fixtures over 10,000 matched seeds meet the 25–35% runner share target; outcome distance is normalized L1 distance across final Health, Happiness, and Money, while route/callback coverage is checked separately;
- saturation: every score spends less than 10% of balanced active time at a boundary and fewer than 5% of choices lose effects to clamping;
- non-dominance: every major option passes the locked goals, context distribution,
  seed set, and horizon; none is Pareto-dominant and no post-hoc goal is accepted;
- route reachability: every grade × Money × support fixture plus threshold-boundary and reachable typed-state fixtures reaches two routes and an ending;
- age invariants: age never decreases and credentials precede restricted careers;
- recovery search: no breadth-first hit/recovery sequence over the specified low
  and above-target states creates the defined positive cycle; a recovery
  transaction cannot recursively re-enter before reaching terminal state, while
  a later sequential recovery remains allowed and must apply exactly once;
- determinism: reload at runner, choice, callback, and transition boundaries yields the same next 50 spawn IDs and results;
- spawn reachability: the append-time reachable-horizon invariant passes and fuzz runs show zero unavoidable collisions in 100,000 seeds while satisfying move-count warning time;
- pacing: p95 between meaningful decision-opportunity windows below 8 seconds, p95 between story beats below 60 seconds, no uninterrupted runner segment above 75 seconds;
- accessibility/layout: complete keyboard, touch, automatic/semantic Assist, and
  nonvisual screen-reader lives at required viewports with no player/control/tray overlap.

## 15. Completion definition

The implementation goal is complete only when:

- all 12 stages are reachable and playable;
- exactly three permanent numeric scores exist;
- every stage contains a meaningful major choice;
- every major choice changes future content or the ending;
- at least six major choices in every valid complete route receive scene callbacks, with a target of 6–8;
- deterministic run/save/reload equivalence is proven;
- no impossible spawn sequence occurs in the required simulations;
- education, work, relationship, and retirement routes have no dead ends;
- careers and choices meet non-dominance rules;
- recovery has no exploit or punishment loop;
- characters remain fixed-scale and grounded;
- dialogs never cover the player or controls;
- the whole life is accessible by keyboard, touch, automatic/semantic Assist, and
  a nonvisual screen-reader path;
- production budgets pass;
- the exact deployed SHA passes an error-free live smoke test;
- code and logic review records exist for every completed phase;
- the v5 reference repository remains untouched.

The plan may be revised when implementation, automated evidence, accessibility review, or playtesting exposes a problem. Revisions require a written reason and updated acceptance evidence; content volume alone is not a reason to weaken a gate.
