# Phase 0 — Premium baseline and production map

Recorded: 2026-08-17, against `main` at `5385712` plus the Phase 0 fixes below.
Deliverable for [CHOICE_OF_LIFE_AAA_UPGRADE_PLAN.md](./CHOICE_OF_LIFE_AAA_UPGRADE_PLAN.md) §14 Phase 0.

This is the honest starting picture: what was measured, what was fixed, and what
is still broken. Nothing here is rounded in the project's favour.

## 1. Verification baseline

The single most important finding is not a gameplay bug.

**No CI workflow ran the test suite, the bundle budget, or the boundary check.**
`deploy-pages.yml` ran `npm ci`, `release:stamp`, `npm run build`, then uploaded
to Pages. `validate-locks.yml` was `workflow_dispatch`-only. Every failure below
had been shipping to production unnoticed.

| Gate | Before | After Phase 0 |
|---|---|---|
| `npm run check` (tsc) | pass | pass |
| `npm run check:core` | pass | pass |
| `npm run boundaries` | **fail** (3 errors) | pass |
| `npm test` | **fail** — 11 tests, 6 files | **fail** — 2 tests, 2 files (both triaged below) |
| `npm run budget` | **fail** — 3 limits | **fail** — same 3 limits, now baselined and ratcheted |
| `npm run release:verify` | pass | pass |
| CI runs any of the above | **no** | yes — `verify` → `build` → `deploy` |

Two of the eleven failing tests had **never passed since the commit that
introduced them** (`b4f3943`). `scripts/deploy-pages-workflow.test.mjs` asserted
a four-job distributed pipeline with sharded runner evaluation, Playwright
installs, and plan-digest transport; that pipeline was never built. The same is
true of the `validate-locks.yml` assertions in `scripts/fixture-lock.test.mjs`.
Contract tests were written for a CI design that was specified and then skipped.

## 2. Production payload

Measured from `npm run build` on this machine, Node 26. Recorded in
[`scripts/bundle-baseline.json`](./scripts/bundle-baseline.json).

| Measurement | Now | §13 target | Status |
|---|---|---|---|
| `totalBytes` | 102,347,339 | 20,000,000 | **5.1× over** |
| `pngBytes` (94 files) | 99,960,248 | profile bans PNG outright | **over** |
| `mainEntryJsBytes` | 570,175 | 500,000 | 14% over |
| `cssBytes` | 187,472 | 200,000 | under |
| `criticalGzipBytes` | 212,039 | 350,000 | under |
| `criticalBrotliBytes` | 172,916 | 350,000 | under |

The compressed critical path is already inside target. **The payload problem is
entirely art**: the build emits every character, career-outfit, occupation,
summer and pet atlas for all four art sets and both genders. The eight
`character-appearance-alternate-*.png` sheets alone are 3.4–3.9 MB each.

`npm run budget:ratchet` now blocks any build that grows past the numbers above
while Phase 1 brings them down. The failing `npm run budget` is retained, not
deleted, so the real target stays visible.

## 3. Runtime measurements

Dev server, desktop 1280×720, one new life created as **Art set A (East Asian) /
Female**, measured from `performance.getEntriesByType('resource')`:

- **14.1 MB transferred**, 140 requests, of which **8.9 MB is PNG** across 31 files.
- The game downloads art sets the player did not choose:
  `character-atlas-western-male` (1.10 MB), `character-atlas-western-female`
  (1.03 MB), `character-stage-expansion-western-male` (489 KB) and
  `-western-female` (460 KB) all load during an Asian/Female run — roughly 3 MB
  of pure waste before the first stage starts.
- Cause: `warmStorybookAtlasFamilies` in `src/storybook-characters.ts:718` warms
  every heritage when called without one, and always warms **both** genders even
  when a heritage is given. `warmStorybookCharacterAtlases()` requests five atlas
  families, so one unqualified call is 4 × 5 × 2 = 40 sheets.
- No console errors, no failed requests, no unhandled rejections observed.

## 4. Defect list

### P0 — fixed in Phase 0

1. **CI could deploy a red build.** `deploy-pages.yml` rebuilt as
   `verify` → `build` → `deploy`; nothing reaches Pages without `check`,
   `check:core`, `boundaries` and `npm test` passing first.
2. **Protected-trait boundary check failing.**
   `src/choice-of-life/presentation/stage-player-avatar.ts` read `gender`,
   `heritage` and `appearance` outside the allowlist, and `src/summer-characters.ts`
   was an unapproved production dependency. Both verified as **cosmetic-only**
   (the avatar file returns an `HTMLElement` and touches no score, choice, or
   opportunity path; `summer-characters` is a draw-only adapter like its already
   approved siblings) and added to the allowlists with that reasoning recorded.
   This was an allowlist gap from recent art commits, **not** a fairness violation.
3. **Fixture-history validation never ran.** `validate-locks.yml` was
   `workflow_dispatch`-only; it now runs on push and pull request with the base
   SHAs the validators need, and `fetch-depth: 0`.

### P1 — fixed in Phase 0

4. **Arrow keys hijacked browser and system shortcuts — in two separate views.**
   Both window-level `keydown` handlers called `preventDefault()` *before*
   checking whether the input was accepted, with no modifier or modal guard.
   - `runner-view.ts:2207` — `Alt+ArrowLeft` (browser Back) was swallowed; arrows
     were consumed while paused, before the run started, and while the key-binding
     dialog was open, where the window handler and the dialog's own remap capture
     both fired on one press.
   - `newborn-view.ts:510` — worse, because it also binds `W`/`A`/`S`/`D`/`P`
     unguarded: **`Ctrl+P` (print), `Ctrl/Cmd+S` (save), `Ctrl/Cmd+A` (select
     all), `Ctrl+D` (bookmark) and `Alt+ArrowLeft` (back) were all swallowed**
     during the newborn stage, and movement acted behind the open choice tray
     and recap panels.

   Both now ignore modifier combinations, yield while a panel or dialog is open,
   and consume the key only when the move is actually accepted. Verified live in
   the browser before the newborn copy was found — the runner fix alone did not
   stop `Alt+ArrowLeft` being prevented in the nursery, which is how the second
   handler surfaced.

   **Regression coverage gap:** the runner path is covered by
   `runner-view.test.ts`, but `newborn-view.ts` has no test file at all. A
   focused keyboard-guard test for the newborn view is an open follow-up.
5. **Accessibility contract tests were reading the wrong CSS rules.** The
   `rule()` helper in `accessibility-style.test.ts` matched on substring, so
   `.col-field select` resolved to `.col-shell[data-screen="setup"] .col-field select`
   and `.col-button--primary` resolved to the screen-scoped override. The 44px
   touch-target lock and the 3:1 contrast lock were not testing the shipped
   styles. Helper anchored to rule starts.
6. **Primary button border below the 3:1 non-text minimum.** Surfaced
   immediately by fix 5: `#8d225f` on the `#ff5fb1` gradient stop measured
   **2.98:1**, failing WCAG 1.4.11 for the control's own boundary. Changed to
   `#7a1a52` (3.59:1). Text contrast was already fine at 6.3:1. The contrast test
   now checks every rule that styles `.col-button--primary`, not just the base one.
7. **Deploy-gating tests flaked under load.**
   `property-mangle-policy.test.mjs` and `runner-session.test.ts` pass alone in
   ~2s but exceeded Vitest's 5s default under parallel load. Harmless while
   nothing ran them; deploy-blocking now that CI does. Global `testTimeout`
   raised to 30s.

### P1 — open

8. **Eager loading of unselected art sets.** See §3. Fix is Phase 1 per-stage
   preload groups; `warmStorybookAtlasFamilies` must take heritage **and**
   gender, and callers must stop invoking `warmStorybookCharacterAtlases()`
   with no argument.
9. **98 MB production artifact.** See §2. Phase 1 compact per-stage atlases.

### P2 — open

10. **Conditional listener leak in `character-system.ts:760`.**
    `hydrateCharacterAtlas` registers four window listeners per character element
    and removes them only once the atlas draws complete. Verified in the browser
    that they *do* unregister on the happy path (228 listeners on gallery open,
    back to 0 once atlases loaded). But there is no teardown handle, so a
    character element removed before its atlas resolves — or one whose atlas
    fails permanently — keeps four listeners and its detached DOM subtree alive,
    and every subsequent atlas-ready event redraws it.
11. **Left/right movement is cosmetic.** `applyHorizontalPosition`
    (`runner-view.ts:1195`) only sets a CSS variable between 32% and 40% and a
    data attribute. It feeds nothing into the simulation, collision, or lane
    controller. The four-way pad implies gameplay that does not exist.

## 4b. Additional defects from the subsystem audit

A parallel multi-agent audit read the runner core, course generator, score/effect
model, stage runtimes, persistence, platform glue, presentation, and the
inherited v5 modules. 23 candidates were raised; each was then attacked by an
independent skeptic instructed to refute it. **5 were refuted and dropped. 17
survived**, most with the verifier tightening or correcting the original claim.
The framing below is the verifier's, not the finder's.

### Fixed here

- **Accessibility settings were rejected on every save.** The audit's strongest
  finding, verified end to end. `cloneSettings` in `presentation/model.ts:164`
  was `return { ...settings }` — a spread, not a projection. Callers pass the
  wider `PlayerPreferences` (assignable to `VisualSettings`, so the compiler is
  satisfied), so `schemaVersion`, `assistMode` and `audioCuesEnabled` rode along.
  `browser-shell.copyValidSettings:104` rejects any object that is not
  **exactly** the four accessibility keys — `keys.length !== expectedKeys.length`
  → `null` → `saveSettings` returns `kind: "invalid"`, republishes the previous
  settings, and shows *"Those settings were invalid and were not applied."*
  High contrast, reduced motion, text scale and announcement changes therefore
  never persisted to a run. `cloneSettings` now projects the four keys
  explicitly. This is also the deeper cause behind the startup-precedence issue
  recorded below.

- **Summer atlas ready-event was never delivered.**
  `character-system.ts:765` listened for `plj:summer-character-atlas-ready`;
  `summer-characters.ts:205` dispatches `plj:summer-atlas-ready`. Independently
  confirmed by diffing every dispatched against every listened event name — the
  listened name appears nowhere as a dispatch. A character waiting on the summer
  sheet only repainted if some *other* atlas happened to finish afterwards.
  Fixed.

- **The player's avatar became a different person every chapter.** P0 under §19
  ("wrong atlas identity") and §6.3 ("stable face, hair style/color, skin tone").
  `app.playerCharacterForStage()` supplies only `hairStyleId`, `hairColorId` and
  `clothingPaletteId`, so `createCharacterModel` derived `skinToneId`,
  `faceStyleId` and `detailId` from the seed — and the seed was
  `choice-of-life-player-${lifeStage}`. Every chapter screen re-rolled all three.
  Measured before the fix: skin tone `golden` at toddler, `porcelain-warm` at
  child. Now seeded from the chosen identity via `playerIdentitySeed`, which
  excludes the life stage. Covered by `stage-player-avatar.test.ts`, verified to
  fail against the old seed.

- **The caregiver bond had no mechanical effect.** `educationSupportLevel`
  compared closeness against 70 and 35 while the only caregiver deltas in the
  catalog are +6 and +4, so every playthrough resolved to `"none"` and two of
  three support tiers were dead code — while the UI showed a "6/100" readout
  implying it mattered. The thresholds now live beside the catalog that makes
  them reachable (`CAREGIVER_SUPPORT_THRESHOLDS`) and map onto the encounter's
  three real options: ask for comfort (+6) → strong, play together (+4) → some,
  follow the routine (0) → none. `caregiver-support.test.ts` fails if the
  thresholds and catalog ever drift apart again.

  This is a balance decision as much as a fix. Retune it in Phase 8 if the
  intended curve differs.

  **Self-review correction.** The first version of this fix mapped `strong` to 6,
  which activated `SUPPORT_FUNDING_BONUS.strong` (+30) from a single newborn
  choice and made the three options a strict education-access ladder — 65 / 50 /
  37 effective funding from a 35-money start. That was worse than the bug in two
  ways: it ranked "ask for comfort" above "play together", which §8.3 treats as
  equally valid rather than better or worse, and it gave the money-minded
  "follow the routine" option (+2 money) the *worst* effective funding by 28
  points, inverting the incentive it exists to express. `strong` is now 12 —
  above what one encounter can yield — so both engaged options earn `some` and
  the choice is a genuine trade-off: caregiver engagement buys education support,
  the routine buys immediate health and money. `strong` awaits the additional
  caregiver encounters Phase 5/6 will add, and is documented as such rather than
  silently dead. Three assertions in `caregiver-support.test.ts` now guard this
  class of mistake — engaged-option parity, no dominant option, and a bounded
  effective-money spread — and all three were confirmed to fail against the 6/4
  mapping.

- **3 MB of unused art on every page load.** `storybook-characters.ts` warmed the
  Western base and expansion pair at import time, inherited from v5 where the
  title screen displayed that default pair. The Choice of Life title screen
  renders no characters at all — measured: 0 canvases, 0 character elements — so
  four sheets totalling ~3 MB were fetched and decoded for art never shown, and
  hardcoded to `western` regardless of the player's art set. Removed.

  Verified after the change: title loads **0 KB** of character atlases; entering
  the newborn stage fetches exactly three sheets, all `asian-female`, matching the
  chosen set; all three characters reach `data-atlas-source="storybook"` with
  `atlas-ready`, so the on-demand path resolves with no placeholder left behind.

- **The childhood scene rebuilt three characters on every tick.** `renderScene`
  was the only render helper in `childhood-view.ts` without a key guard — its
  siblings `renderChoice`, `renderSummary` and `renderRoster` all had one. Each
  tick it discarded and re-created the player, friend and companion subtrees:
  three canvases, three `drawImage` calls, nine fresh atlas listeners, and a
  walk-cycle restart, so the characters visibly stuttered and never animated.
  Now key-guarded on stage, friend identity and companion.

- **`element.hidden` did nothing on two views.** A class rule that sets
  `display` has the same specificity as the user-agent `[hidden]` rule and comes
  from the author sheet, so it wins. `.col-childhood-play-controls` and
  `.col-later-life-footer` both set `display: flex` with no `[hidden]` override,
  so the childhood Pause/Advance controls stayed on screen behind the choice
  tray, summary and completion panels — the plan's P0 "player/choice/control
  overlap" — and the later-life ending showed a duplicate "Return to title".
  The runner and newborn views already had `.col-<view> [hidden]` catch-alls;
  childhood and later-life simply never got theirs. Both added, and
  `hidden-contract.test.ts` now fails if a view root loses its catch-all.

  This single root cause explains two separate audit findings.

- **Every encounter choice dropped keyboard focus to `<body>`.** Rebuilding the
  tray destroys the button the player just activated, and nothing took focus, so
  the focus ring vanished and a screen reader's position collapsed to the top of
  the document while the live region announced new content. Focus now moves to
  the rebuilt heading, but only when the tray actually held it, so a player
  reading elsewhere is never yanked back. `encounter-focus.test.ts` covers both
  directions and was confirmed to fail against the old code.

### Confirmed, not yet fixed

| Area | Defect | Verifier's note |
|---|---|---|
| `persistence/save-store.ts` | One `localStorage` slot for the active run with no cross-context reconciliation; a second tab overwrites the first tab's life | "no cross-context reconciliation at all" |
| `app.ts:262` | Stored accessibility preferences overwritten by shell defaults | Verifier: severity *understated*; two distinct manifestations, not startup-only. Attempted fix reverted — see below |
| `presentation/childhood-view.ts:449` | Childhood scene rebuilds every character element on each 260 ms tick, leaking listeners and detached canvases | 9 listeners per tick, not the 12 originally claimed |
| `core/encounters/catalog.ts:84` | `educationSupportLevel` can only ever return `"none"` in the shipped app — caregiver closeness maxes at 6 against higher thresholds, so two of three support tiers are dead and the caregiver bond is mechanically inert | Confirmed exactly |
| `core/encounters/engine.ts:703` | A scheduled callback whose due tick lands past the chapter cap is silently voided — no expiry, no log entry, no completion gate | Directly contradicts plan §8.2 |
| `core/career/runtime.ts:212` | Career entry status computed from the definition rather than the matched qualification path, so open-entry hires get the senior role title | Real for `farmer` and `athlete`; the `artist`/`dancer` examples are unreachable |
| `platform/later-life-session.ts:26` | Adult→later-life handoff uses a 48-month adult cycle while the adult runtime uses 24 | Reframed as an unwired cross-chapter handoff |
| `core/runner/simulation.ts:1080` | Semantic Assist can deadlock on a decodable save whose pending decision marker coincides with a non-idle lane tween | Arithmetic confirmed exact |
| `platform/runner-input.ts:174` | Lane keys can be remapped to `A`/`D`, which the runner view reserves | Reframed: a key *conflict*, not a dead binding, now that the `preventDefault` is guarded |
| `presentation/encounter-view.ts:233` | Encounter tray rebuild drops keyboard focus to `<body>` after every choice | Confirmed with corrections to the repro |
| `presentation/childhood-view.ts:612` | Play controls stay visible during choice, summary and complete phases | Controls sit *above* the tray, not beneath |
| `presentation/later-life-view.ts:735` | Ending screen cannot hide its footer, so the biography shows two "Return to title" buttons | Cosmetic plus a duplicate-control accessibility issue |
| `core/childhood/content.ts:463` | Middle-school callbacks scheduled for a stage no runtime resolves | Confirmed |
| `core/later-life/biography.ts:94` | Prior-chapter age boundaries contradict the childhood stage definitions | Display-only |
| `presentation/v5-room-backdrop.ts:51` | Canvas height passed as `drawRoom`'s sky-band `floorY` | Cosmetic, contained by a clamp — not a structural inversion |
| `presentation/character-gallery.ts:462` | Gallery walk animation never redraws the atlas canvas | Wider than reported: the first Walk render is already wrong |
| `presentation/newborn-view.ts:637` | Status live region rewritten with a changing percentage several times a second | Rate corrected: 1% ≈ every 24 ticks, not 10×/second |

### Attempted and reverted

The accessibility-preference defect (`app.ts:262`) has a clear cause —
`browser-shell.ts:362` reports `DEFAULT_SETTINGS` whenever there is no saved run,
and `app.ts` spreads those *over* the stored preferences. Gating the spread on
`snapshot.savedRun === null` fixes the player-facing behaviour but breaks two
existing accessibility contract tests that require shell-reported settings to
win. Rewriting those tests would mean guessing at their intent, so the change was
reverted and the cause recorded in a comment at the call site. **The fix belongs
in the shell**: it should report persisted player preferences rather than
defaults when it has no run. Owner decision needed.

## 4c. Repository landmine

**Adding any new file under `docs/` fails two `fixture-lock` tests.** This report
was originally written to `docs/PHASE_0_BASELINE.md` and broke *"requires
refreshed Phase 2 suite and runner evidence in the Phase 3 docs-only lock
commit"* and *"rejects Phase 3 split creation commits and non-doc files in its
creation commit"*. Confirmed by moving the file out and back. It now lives at the
repository root alongside the other planning documents.

This matters more now that CI runs the suite: a routine documentation commit can
turn the build red for reasons that have nothing to do with the change. Worth a
follow-up to scope the lock validation to `docs/balance/` and `docs/phase-specs/`
rather than all of `docs/`.

## 5. Accepted exceptions

Per the Phase 0 gate, the two remaining `npm test` failures are triaged rather
than hidden. **Both currently block the new deploy gate.** They need a decision.

**Confirmed against real CI.** The gate was exercised on two pushed commits:
`verify` failed, `build` and `deploy` never started, and production stayed at
`5385712`. The gate behaves as designed. One defect in the gate itself surfaced
only once CI ran the suite: the verify job had no browser installed, so
`runner-browser-matrix.test.ts` failed with *"Executable doesn't exist"* despite
passing on a developer machine. A chromium install step was added ahead of
`npm test`, after which CI reproduced the local result exactly — 915 passing,
the two exceptions below failing.

**E1 is the single blocker for the whole pipeline.** The `Check Choice of Life
fixture history` workflow fails on the same missing evidence as
`fixture-lock.test.mjs`, so both workflows turn green on one artifact, not two
independent fixes.

### E1 — `fixture-lock.test.mjs`: missing suite evidence

`Fixture lock validation failed: active suite evidence unavailable for
runner-laboratory-content-lock-v1`.

`docs/balance/evaluation-results/` and `docs/balance/runner-evaluation-results/`
do not exist and were never committed, while
`docs/balance/locks/runner-laboratory-content-lock-v1.json` is `status: locked`
and therefore demands evidence.

Regenerating it is deliberately gated: `npm run runner:generate` refuses with
*"generate mode requires `--manual-review-wrapper` from a temporary external
artifact"*. That guard is correct — evaluation evidence is meant to be produced
under human review, not by an unattended process. **Owner: repository maintainer.**
Until the evidence is generated and committed, either this test stays red or the
lock's `status` must change.

### E2 — `runner-laboratory-evaluator-cli.test.ts`: 180 KB entry limit

`expected 570175 to be less than or equal to 180000`.

There are three different budgets for the same number, and they disagree:

| Source | Limit on main entry JS |
|---|---|
| `runner-laboratory-evaluator-cli.test.ts:75` | 180,000 uncompressed |
| `scripts/bundle-budget.mjs` `LOCKED_LIMITS` | 500,000 uncompressed |
| Plan §13 | 350 KiB **compressed** (currently 212 KB gzip — passing) |

The 180 KB assertion is stricter than the project's own budget profile and looks
like a stale number from an earlier phase. It should not be relaxed unilaterally —
that is how budgets rot — so it is recorded here for a decision. The ratchet
prevents further growth in the meantime.

## 6. Not yet delivered from Phase 0

Honest gaps against the §14 Phase 0 deliverable list:

- baseline screen captures at desktop and mobile sizes;
- rubric scorecard against §16;
- frame-time and save-size measurements;
- full asset inventory with provenance and actual runtime use;
- cast-continuity report for recurring NPCs;
- Golden Stage and Golden Thread debug selectors.

The Golden Thread selector is additionally blocked by §0 L2: the High School
stage it runs through does not exist yet.
