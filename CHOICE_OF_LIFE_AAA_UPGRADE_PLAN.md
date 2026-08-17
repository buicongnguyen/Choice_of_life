# Choice of Life — Premium/AAA-Quality Upgrade Plan

Status: proposed post-v1 roadmap  
Repository: `buicongnguyen/Choice_of_life`  
Production: `https://buicongnguyen.github.io/Choice_of_life/`  
Builds on: [CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md](./CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md)  
Content reference: [CHOICE_OF_LIFE_PLAN.md](./CHOICE_OF_LIFE_PLAN.md)  
Reference method: `C:\Users\n\source\repos\3D_game_action\fable_implementation_plan.md`

## 0. Correction log

The first draft of this roadmap contained internal contradictions and baseline
claims that the repository does not support. They are corrected in place below;
this log records what changed and why, so the reasoning is not lost.

| ID | Where | Problem | Correction |
|---|---|---|---|
| L1 | §7.1 | "collision position follows the visible interpolated position" contradicts §12 ("simulation and saved results may not [vary by frame rate]") and §18 ("stage time, choices, and life duration do not change accidentally by FPS"). Reading collisions off an interpolated visual position makes outcomes frame-rate dependent and breaks replay, evaluation, and save-hash reproducibility. | Dependency inverted: collision resolves against fixed-step simulation state only; the rendered position interpolates toward it. |
| L2 | §4.1, §4.2, §23 | The Golden Stage was specified as **High School**, described as if it already exists. No High School stage exists: the childhood chain ends at `middle-school-v1`, then education routes. | Golden Stage restated as an authoring target with an explicit build step in Phase 2, not a polish target. |
| L3 | §3 | Baseline inventory was factually wrong, and it is the premise for "refinement, not a second architectural rewrite". | Inventory corrected against the tree: 10 stage ids, no High School, Relationships/Home and Midlife are one chapter-discriminated stage, tests and budget are currently red. |
| L4 | §14, §19 | Every later gate depends on a green verification baseline, but Phase 0 had no deliverable for restoring one and P0 did not list "verification is red". | Phase 0 gains a "green baseline" deliverable and gate; P0 gains the corresponding entry. |
| L5 | §6.6, §13, §14 | §13's ≤20 MiB artifact target and Phase 1's "compact runtime atlases" collide with the shipped budget profile, which fails the build on **any** PNG in `dist/`. Phase 1's gate was unsatisfiable as written. | Amending the budget profile (allow PNG under a per-file and total cap) is now an explicit Phase 1 deliverable. |
| L6 | §13 | "save accepts at most 64" entities contradicts the enforced contract `maxResolvedEntityIds: 40` in `core/runner/contract.ts`. | Budget restated to 40 to match the contract; raising it is called out as a contract change requiring a save migration. |
| L7 | §13 | "Decoded current-stage images <32 MiB" had no per-asset cap and is likely already exceeded by a single atlas. | Phase 0 must measure decoded size per atlas; Phase 1 must set a per-atlas cap. |
| L8 | §24 | "Nine post-v1 phases" — §14 defines ten (Phase 0–9). | Corrected to ten. |
| L9 | §14 | Phase 1's gate "production budget does not regress" is unmeasurable while the budget fails. | Rewritten against a recorded Phase 0 numeric baseline with a ratchet. |

## 1. Purpose

This plan describes how to elevate the existing, complete Choice of Life v1 into
a highly polished, premium-quality browser and mobile game. It adapts the best
production ideas from the Fable implementation plan—clear product pillars,
vertical-slice discipline, measurable gates, data-driven systems, finite review
loops, visual and gameplay rubrics, performance budgets, honest handoff, and
scope control—to Choice of Life's very different 2D narrative-runner design.

This is not a plan to imitate a large 3D console production or to add content
without limit. For this project, “AAA-quality” means:

- the game has a confident, recognizable visual and audio identity;
- movement, input, feedback, and scene transitions feel intentional;
- every life choice is readable, fair, and remembered by the story;
- characters, rooms, props, UI, and effects look like one authored game;
- the full life works reliably on desktop and mobile;
- accessibility, loading, saving, and deployment feel production-ready;
- quality is demonstrated by repeatable evidence rather than by the label
  “AAA.”

The realistic product target is a polished commercial-quality stylized indie/AA
game with selected AAA production standards. Photorealism, cinematic 3D,
massive content volume, online multiplayer, and an open world are out of scope.

## 2. Product north star

The player fantasy is:

> Guide one small, distinctive person through an entire life. Move through the
> flow of time, notice opportunities and danger, meet people who matter, make
> understandable trade-offs, and discover how those moments echo years later.

The decisive gameplay question is:

> Is it fun, readable, and emotionally meaningful to steer through one minute
> of life, make one difficult choice, and later recognize its consequence?

If that answer is not convincingly yes in the Golden Stage and Golden Thread,
improve them before adding more scenes, characters, jobs, outfits, or endings.

### Product pillars

1. **A whole life, not a high score.** Health, Happiness, and Money remain
   separate. The ending describes a life; it does not rank the player with one
   victory number.
2. **Simple control, meaningful attention.** Three lanes, clear telegraphing,
   responsive movement, and small runner effects make moment-to-moment play
   approachable without making it automatic.
3. **Choices with visible echoes.** Important decisions change later dialogue,
   relationships, opportunities, environments, callbacks, and the biography.
4. **People remain people.** Recurring characters have stable identity,
   appearance, age progression, relationship history, and a recognizable role
   in the player's life.
5. **One warm storybook world.** The reviewed v5 character style, grounded 2D
   rooms, props, UI, animation, and audio share a coherent visual language.
6. **Kind, fair, and replayable.** Trade-offs replace morality traps. Recovery
   replaces instant failure. Different lives remain valid and interesting.

### Instruction precedence

When goals conflict, use this order:

1. protect save data, repository integrity, licenses, and deployability;
2. preserve the three-score identity and the full-life product promise;
3. preserve readable, fair, accessible play;
4. improve the Golden Stage and Golden Thread;
5. improve cohesion, performance, and polish;
6. add optional content only after earlier gates pass.

## 3. Current foundation and upgrade opportunity

Choice of Life v1 already provides valuable production foundations:

- **ten** implemented life-stage ids, verified against the tree:
  `newborn-v1`; `toddler-v1`, `early-childhood-v1`, `elementary-school-v1`,
  `middle-school-v1`; `first-career-v1`; `relationships-home-midlife-v1`;
  `later-career-v1`, `retirement-v1`, `legacy-v1` — plus education route
  selection, which is a choice screen rather than a runner stage;
- a deterministic three-score domain and save/load system;
- a three-lane runner, keyboard/touch controls, difficulty, and Assist support;
- atomic choices, facts, relationships, callbacks, biographies, and endings;
- distinct education, career, relationship, home, midlife, and retirement routes;
- the reviewed Pixel Life Journey v5 storybook characters, direction/motion
  sheets, career uniforms, occupation art, seasonal outfits, and pets;
- a separate presentation layer and production GitHub Pages deployment;
- release identity, a bundle-budget script, and an automated test suite.

Three corrections to the previous draft of this section, because they change what
this roadmap is allowed to assume (see §0):

1. **There is no High School stage.** The childhood chain is Toddler → Early
   Childhood → Elementary → Middle School, and then education route selection.
   §9's matrix therefore lists twelve *target* stages, of which High School is
   unbuilt and Relationships/Home and Midlife are today a single
   chapter-discriminated stage (`relationships-home-midlife-v1`), not two.
2. **The test suite is red.** 11 tests fail across 6 files on `main`. A test
   suite that does not pass is not a foundation to build on.
3. **The bundle budget fails.** `npm run budget` fails three separate limits.
   Neither the budget nor the test suite is executed by any CI workflow, so both
   have been failing into production unnoticed.

The next release should still emphasize refinement and authorship over a second
architectural rewrite — the domain, save, runner, and presentation boundaries are
sound. But that judgment applies to the *architecture*, not to the release
process, which is currently unverified. The highest-value opportunities are:

1. make player movement, lane changes, object motion, collisions, and feedback
   feel consistently satisfying;
2. replace uneven scene presentation with a unified storybook world while
   keeping characters visually grounded;
3. give every stage a memorable visual theme, signature interaction, named
   person, major choice, and later echo;
4. strengthen character continuity, unique NPC appearances, age matching, job
   clothing, seasonal clothing, pets, and emotional expressions;
5. make consequences easier to understand without revealing every future result;
6. add a restrained, cohesive audio identity and subtle ambient motion;
7. finish mobile, accessibility, performance, save, and release hardening;
8. reduce production payload by shipping only the art needed by the current
   stage and nearby transitions.

## 4. Scope: prove quality before expanding it

### 4.1 Golden Stage

Use **High School** as the Golden Stage — but note that **High School does not
exist yet** (§0 L2). It is an authoring target, not a polish target. Phase 2
must build the stage (content module, catalog entry, chain wiring from
`middle-school-v1` into education route selection) before any "runner feel" work
on it can be reviewed.

It is still the right choice of benchmark, because once built it exercises:

- a recognizable school environment and same-age friends;
- benefit forks, hazards, quiet story moments, and readable lane choices;
- movement on desktop, touch, and Assist;
- a named NPC encounter and a three-option decision;
- grades, stress as a condition, family context, and future education access;
- a stage recap and transition into Education or Training.

Target length: 90–150 seconds of active play plus one untimed encounter.

The Golden Stage is complete only when a first-time player can understand it
without explanation, movement feels stable, every important object reads before
contact, the choice tray never covers the player or controls, and the stage has
no obvious placeholder-quality presentation.

### 4.2 Golden Thread

Use a short, developer-selectable **Newborn → High School → First Career** thread
to prove long-term consequence quality without requiring a full-life playtest on
every iteration.

It must demonstrate:

1. a caregiver moment in Newborn records a fact or memory;
2. a High School choice refers to the player's context and creates a clear
   education/career consequence;
3. First Career visibly acknowledges both earlier moments through a person,
   offer, dialogue, prop, or biography line;
4. reloads at each boundary preserve identical results;
5. the complete thread takes no more than 6–8 minutes in review mode.

This thread is a development and playtest route, not a replacement for the
normal continuous life.

### 4.3 Scope exclusions for this upgrade

Do not add the following until the complete-life Premium Release Candidate has
passed:

- multiplayer, accounts, cloud saves, leaderboards, or social features;
- additional permanent numeric meters;
- open-world movement, jumping, combat, crafting, or inventory systems;
- 3D rooms or perspective backgrounds that make characters appear to float;
- a generic ECS, full physics engine, or framework migration;
- procedural story text that cannot be deterministically reproduced;
- dozens of new careers before existing careers are visually and mechanically
  distinct;
- monetization, ads, purchases, or external analytics.

## 5. Target experience loops

### Moment-to-moment loop

1. Read the next lane pattern from silhouette, color, icon, and motion.
2. Move one lane with an immediate response and a short, stable transition.
3. Collect an opportunity, avoid a hazard, or intentionally accept a trade-off.
4. Receive a small visual/audio response and an honest score delta.
5. Notice a person, environmental story beat, or callback.

### Stage loop

1. Establish age, place, goal, and the stage's visual motif in under five seconds.
2. Teach or remind one signature interaction in a safe opening pattern.
3. Alternate benefit forks, risk/reward choices, quiet windows, and story beats.
4. Clear the playfield before an important person or choice.
5. Present two or three rational options outside the active playfield.
6. Show immediate effects and a qualitative future hint.
7. Finish with a short recap, relationship/fact change, and next-life transition.

### Complete-life loop

1. Start with a distinct family context, appearance, difficulty, and optional
   advanced settings.
2. Build a recognizable network of caregivers, friends, partners, colleagues,
   community members, and pets.
3. Let education, jobs, relationships, caregiving, and retirement respond to
   earlier choices without creating dead ends.
4. End with three separate score results, named people, remembered decisions,
   a life title, and a concise biography.
5. Offer a clear New Life action and a compact “what changed this life” recap to
   motivate replay.

## 6. World, art, and character direction

### 6.1 Visual identity

The visual target is **warm illustrated storybook life in motion**:

- compact chibi/storybook characters with large expressive heads and readable
  silhouettes;
- soft cream, warm wood, muted teal, coral, gold, and stage-specific accent
  colors;
- clean dark outlines and opaque clothing colors that remain distinct from the
  scene behind them;
- flat or gently layered 2D rooms with no misleading floor perspective;
- restrained texture and decoration so objects remain readable at mobile size;
- rounded, game-like panels, icons, score chips, and controls derived from the
  same shapes and palette as the world.

Backgrounds may use two or three parallax layers, but walkable lanes must remain
visually flat. The character's foot or seated anchor always touches the declared
ground line. Furniture and foreground props must not cross that line unless they
are intentionally occluding the character and have tested z-order rules.

### 6.2 Stage visual grammar

Every stage receives a small art bible entry containing:

- primary and secondary palette;
- ground line and three lane centers for each supported aspect ratio;
- player scale and foot/seated anchor;
- background, middle-ground, playfield, and foreground depth rules;
- one hero landmark and three to five reusable decorative prop families;
- beneficial, harmful, neutral, mandatory-NPC, and optional-NPC silhouettes;
- time-of-day or seasonal variant where it supports the story;
- ambient motions that pause with the simulation;
- audio motif and permitted effect density.

### 6.3 Character continuity

Use the reviewed v5 runtime atlases as the canonical base. Do not regenerate art
that is already correct. Improve or generate only a missing pose, stage, outfit,
expression, or supported identity, then pass it through the existing atlas and
anchor pipeline.

Each persistent person receives a `CharacterIdentity` record with:

- stable ID, display name, gender presentation, heritage, and age cohort;
- stable face, hair style/color, skin tone, and distinguishing accessory;
- stage-appropriate body, scale, and outfit pack;
- career, seasonal, formal, and casual outfit references where applicable;
- relationship role and first/last appearance;
- allowed front/back/left/right idle and walk frames;
- optional smile, talk, concern, and celebration expression variants.

Rules:

- male and female atlases and metadata must never be silently interchanged;
- school friends use the player's current age stage, even when their heritage,
  hair, clothing, or accessories differ;
- adult and middle-age occupations use correct uniforms and may use summer
  variants in warm scenes;
- parents may use their chosen career clothing, but remain visually recognizable
  when outfits change;
- spouses and recurring friends keep a unique appearance across every return;
- gangsters or threatening characters use distinct pose, palette, expression,
  accessories, and context without relying on race, gender, or disability as a
  danger signal;
- body diversity is healthy and respectful; gameplay outcomes never depend on
  heritage, skin tone, or gender presentation.

### 6.4 Animation standards

Every playable life-stage character requires:

- front, back, left, and right idle poses;
- left/right walk cycles with at least two distinct contact poses;
- stage-correct seated/crawling motion for Newborn;
- stable canvas bounds, scale, head/body ratio, and ground anchor across frames;
- no horizontal mirroring when it reverses clothing, hair, bag, or uniform detail;
- interaction expression or face overlay for smile/talk;
- reduced-motion fallback using pose changes without bobbing or large camera motion.

Lane movement changes world position, not sprite scale or rotation. Do not use
side-to-side tilt as a substitute for walking. Any anticipation or squash effect
must be subtle, short, and preserve the foot anchor.

### 6.5 Props, pickups, and pets

Reuse existing v5 objects and drawing code when their style, license, and scale
fit. Create a compact stage prop atlas for missing objects. Every interactive
object needs:

- a unique silhouette at 48 CSS pixels or smaller;
- an icon/category cue independent of color;
- opaque fill and tested contrast against its stage background;
- a soft contact shadow or ground cue where appropriate;
- deterministic animation that stops on pause/focus loss;
- an authoring-space anchor and a forgiving gameplay hit box;
- a pickup/hazard response that does not hide the next lane decision.

Cats and dogs use the reviewed v5 pet atlases, stable identity, grounding, and
stage-appropriate scale. They are story companions rather than repeated reward
objects.

### 6.6 Asset production and provenance

Maintain a typed runtime asset manifest containing source, generated output,
license/provenance, atlas coordinates, anchor, supported poses, decoded size,
and the stages that preload it. The production build ships compact runtime
atlases only. Large source sheets and local preview matrices remain outside the
Pages bundle.

An asset is ready only when:

- provenance and allowed use are recorded;
- transparent edges and chroma remnants are clean;
- clothing is opaque and distinct from common backgrounds;
- all required direction frames are present;
- frame bounds, scale, and anchor pass the stage matrix;
- the image works at desktop, narrow landscape, and portrait mobile size;
- production loading has a deliberate fallback and no broken-image flash.

## 7. Runner feel and interaction standards

### 7.1 Movement

- one input moves exactly one adjacent lane;
- movement begins within one rendered frame after accepted input;
- normal lane transition target: 180–240 ms;
- at most one adjacent input is buffered while moving;
- **collision resolves against fixed-step simulation state only; the rendered
  position interpolates toward the simulated position, never the reverse.** The
  visual must not be able to change an outcome. If a contact looks unfair because
  the sprite lags the simulation, shorten the interpolation or widen the
  telegraph — do not move the hit test onto the interpolated position, which
  would make results frame-rate dependent and break replay, the evaluation
  harness, and save-hash reproducibility (§0 L1, §12, §18);
- feet, seated anchor, scale, and head/body ratio remain stable;
- repeated left/right input never creates swinging, oscillation, or cumulative
  transform drift;
- keyboard, touch buttons, swipe, and Assist feed the same semantic input API;
- touch controls use generous hit targets and stay clear of score/choice UI.

### 7.2 Difficulty

Difficulty changes scroll speed, warning distance, density, and pattern
complexity—not life duration, score fairness, choice availability, or ending
quality.

| Mode | Intent | Motion target | Safety support |
|---|---|---|---|
| Story/Easy | Enjoy the life story | Slowest objects, longest warnings | More quiet windows, Assist suggested |
| Normal | Intended first play | Moderate speed and mixed patterns | Standard warning and recovery |
| Challenge | Test runner skill | Fastest supported speed and denser forks | Never creates unavoidable contacts |

Advanced setup may expose IQ or starting-stage tools for testing and sandbox
play, but production story balance must not require artificially high IQ. Such
options are labeled clearly so the player understands whether they are story or
developer-style controls.

### 7.3 Readability and fairness

Each generated horizon must contain a reachable route from every legal incoming
lane and in-flight transition. On Normal, warnings allow perception time plus
all required lane transitions and input slack. Mandatory people cannot be lost
through a single missed lane; they return at a safe checkpoint.

Use four pattern families:

- mutually exclusive benefits;
- risk/reward trade-offs;
- avoid-only hazards;
- quiet narrative or callback windows.

Empty-lane avoidance must not be the dominant strategy. Quiet windows are used
for pacing, scenery, people, and anticipation rather than filler.

### 7.4 Feedback

Layer feedback in this order:

1. readable anticipation before contact;
2. small character or object response at contact;
3. score chip/icon and actual post-clamp delta;
4. short, distinct audio cue;
5. optional particles or screen accent below the UI;
6. story-log or callback record for important events.

Avoid large screen shake, flashing, or particles that obscure the next object.
Reduced-motion mode removes shake, bob, and nonessential parallax while keeping
equivalent state feedback.

## 8. Choice, consequence, and narrative quality

### 8.1 Choice tray contract

Every important encounter:

- clears or freezes interactive objects before opening;
- places the choice tray below or above the playfield without covering the
  player, controls, NPC face, or score changes;
- is untimed by default;
- offers two or three concise options with different rational goals;
- shows immediate cost/benefit and a qualitative future hint;
- works with touch, keyboard, Assist, 200% text, and a nonvisual screen reader;
- resolves once, saves atomically, and resumes into an empty safe corridor.

Example presentation:

> **Final exams are close. How will you prepare?**
>
> Study intensely — likely better grades; less rest and happiness.  
> Make a balanced plan — steady preparation; protect health.  
> Work extra shifts — improve financial security; risk lower grades.

### 8.2 Consequence contract

Every major option must create at least two of the following, and at least one
must be visible after the current stage:

- a typed fact or condition;
- a relationship change;
- a changed route, offer, prop, outfit, or environment;
- a scheduled named-person callback;
- a later score effect with causal attribution;
- a biography or ending acknowledgment.

Callbacks should feel authored, not like generic score notifications. Prefer a
returning person, changed room, visible object, job offer, family photo, pet,
uniform, or line of dialogue. A consequence that cannot appear must expire or be
superseded with a recorded, player-visible acknowledgment.

### 8.3 Trade-off and fairness rules

- No major option is best for Health, Happiness, and Money in every relevant
  context.
- A demanding career may pay more but add pressure, schedule cost, health risk,
  or relationship trade-offs.
- Studying hard may improve qualifications while costing rest or happiness.
- Caregiving, community, single life, partnership, parenthood, retraining, and
  retirement timing are viable lives rather than better/worse moral ranks.
- Recovery prevents dead ends but cannot produce a score exploit.
- Traits such as heritage, appearance, gender, and body type do not modify score
  outcomes or opportunity quality.

### 8.4 Recurring-person standard

Every normal complete life should contain:

- one or more caregivers;
- at least two same-age childhood/school peers;
- at least one mentor, teacher, trainer, or supportive adult;
- at least two distinct qualified adult/career people;
- several compatible spouse candidates when the marriage route is entered;
- continued non-romantic friendship/community routes;
- later-life returns from at least three earlier named people, when logically
  reachable.

The story log records who the player met, what changed, and when they returned.

## 9. Stage authorship matrix

Each stage must have a signature play pattern and emotional beat. This table is
the minimum authored target, not a requirement to add many objects.

| Stage | Place and visual signature | Runner focus | Human/choice beat | Required later echo |
|---|---|---|---|---|
| Newborn | Warm nursery, low ground line, caregiver silhouettes | Seated/crawling movement; comfort vs hazard cues | Trust, comfort, or curiosity with a caregiver | Caregiver line, keepsake, or confidence memory |
| Toddler | Playroom/home with large safe props | Simple one-lane reads and first risk/reward fork | Ask for help, explore, or share | Parent response or early-friend behavior |
| Early Childhood | Home, park, preschool | Curiosity objects and social opportunities | Kindness, independence, or persistence | Stable friend introduction and later callback |
| Elementary | Bright classroom/playground | Learn mixed icon cues and quiet windows | Study, play, help, or create | Grade tendency, hobby prop, or teacher return |
| Middle School | Bus, club rooms, neighborhood | Faster social/interest forks | Belonging, boundaries, or skill-building | Same-age friend/mentor and High School option |
| High School | Golden Stage: school corridor, library, sports/arts areas | Full readable pattern mix | Exam preparation and future direction | Education access, friend callback, family response |
| Education/Training | Campus, workshop, workplace training | Route-specific opportunities and costs | Professional, practical, direct-work, or repair route | Credential, debt/security context, mentor |
| First Career | Distinct workplace with job uniform and tools | Work/rest/community forks | Income, purpose, pressure, and retraining | Promotion, health/relationship effect, visible outfit |
| Relationships/Home | Home/neighborhood/community gathering | Time and attention trade-offs | Several spouse candidates or single/community route | Stable household, recurring partner/friends, home prop |
| Midlife | Family/work/community locations | Competing responsibilities rather than speed alone | Caregiving, promotion, health, and support | Parent/child/colleague return and later-career options |
| Later Career | Mature workplace, seasonal variant | Experience, mentoring, and pacing choices | Continue, change role, reduce hours, or serve community | Retirement timing, protégé, financial condition |
| Retirement/Legacy | Home, park, community, memory wall | Gentle reflection patterns with low punishment | Rest, family, craft, travel, or community legacy | Final people montage, three-score result, biography |

## 10. UI, mobile, and accessibility standard

### 10.1 Game-like shell

The title, setup, preferences, gallery, stage transitions, recaps, and ending
must use the same illustrated palette, rounded forms, icons, spacing, and motion
language as gameplay. Avoid large plain webpage forms. Setup should feel like
choosing a storybook character and life context.

### 10.2 Responsive layout

Required review viewports:

- 1280×720 desktop;
- 800×360 narrow landscape;
- 360×800 portrait mobile;
- 320×568 small mobile;
- one DPR 2 device or emulation at each mobile orientation.

At every viewport:

- the player, next decision horizon, scores, and controls remain visible;
- the choice tray uses available space without covering play;
- touch targets are at least 44×44 CSS pixels with safe spacing;
- safe-area insets are respected;
- orientation changes preserve the stage and do not duplicate inputs;
- character scale is based on the stage, not accidentally on viewport width;
- no horizontal page scrolling is possible;
- 200% text remains usable.

### 10.3 Input and accessibility

The whole life—not only menus—must be completable with:

- keyboard;
- touch buttons and swipe;
- automatic or semantic Assist;
- a nonvisual screen-reader route for runner decisions;
- reduced motion;
- high contrast and non-color state cues.

Focus returns to the correct heading/control after every transition. Important
sounds have visual or text equivalents. Interaction is never dependent only on
hover, fine timing, color, stereo position, or animation.

## 11. Audio and ambient presentation

Use a small, original or properly licensed audio palette rather than many
inconsistent sounds.

Required families:

- one short melodic identity for Choice of Life;
- stage-family ambience: home, school, work, community, later life;
- subtle stage music layers that do not compete with reading;
- distinct cues for lane request, opportunity, hazard, person, choice confirm,
  score change, callback, stage recap, recovery, and ending;
- optional character vocal expressions using nonverbal syllables rather than
  full voice acting;
- audio settings for master, music, effects, and mute.

Audio pauses or softens with page visibility and respects browser autoplay
rules. Important cues are short, pooled, and rate-limited so repeated contacts
do not become noisy.

## 12. Technical execution rules

- Keep deterministic simulation/domain state independent from DOM, canvas,
  sprite images, audio, and browser storage.
- Use one fixed-step simulation order and a seeded PRNG. Do not add unseeded
  gameplay randomness.
- Store tunable stage, pattern, score, choice, NPC, art, and audio data in typed
  catalogs rather than scattered constants.
- Preserve the existing save envelope and add migrations for schema changes.
- Every mounted stage/view owns and disposes animation frames, timers, event
  listeners, observers, media queries, and audio handles.
- Do not load all character and career atlases at boot. Preload the current
  stage, its persistent cast, and the next transition only.
- Pool repeated particles, score popups, ambient props, and audio voices.
- Avoid image decoding, DOM construction, large allocations, layout reads, and
  array-wide searches in hot movement/render loops.
- Render interpolation may vary by frame rate; simulation and saved results may not.
- Maintain an in-game developer overlay for seed, stage, pattern, lane tween,
  active objects, sprite ID/anchor, FPS/frame time, pending consequences, and
  current release SHA. It is disabled by default in production.
- Keep GitHub Pages path handling, relative assets, `release.json`, and v5 save
  isolation intact.

### Data catalogs to formalize

1. `StagePresentationCatalog` — palette, layers, ground/lane geometry, music,
   ambient motion, preload groups, and camera/layout rules.
2. `CharacterIdentityCatalog` — stable appearance, age/outfit progression,
   relationship roles, expressions, and atlas capabilities.
3. `InteractiveObjectCatalog` — score category, silhouette, icon, animation,
   hit box, warning, feedback, and stage eligibility.
4. `EncounterCatalog` — people, prompts, options, immediate effects, hints,
   prerequisites, and safe-corridor behavior.
5. `ConsequenceCatalog` — causal choice, trigger, callback, fallback,
   supersession acknowledgment, and biography mapping.
6. `AudioCueCatalog` — cue family, file, gain, priority, rate limit, visual
   equivalent, and preload group.

## 13. Quality and performance budgets

These are release targets. If current measurements exceed one, record the
baseline and ratchet toward the target; never hide the regression.

| Area | Target |
|---|---|
| First visible game shell | ≤1.5 s on review desktop after warm cache; ≤3 s on representative mid-range mobile/Fast 4G profile |
| Critical compressed HTML/JS/CSS | ≤350 KiB |
| Initial stage image transfer | ≤2.5 MiB |
| Total deployed artifact | ≤20 MiB; source art and preview matrices excluded. Current: **98 MiB** — see Phase 1 |
| Decoded current-stage images | <32 MiB total **and ≤8 MiB per atlas**; per-atlas decoded size measured in Phase 0 |
| Active interactive entities | ≤24 live (matches `maxLiveInteractiveEntities`); save accepts at most **40** (matches `maxResolvedEntityIds` in `core/runner/contract.ts`). Raising either is a contract change and requires a save migration |
| Save payload | <100 KiB |
| Input acceptance | within one presented frame when the input is legal |
| Update + render | p95 <12 ms on recorded DPR 2 review hardware |
| Long frame | p99 <25 ms in a representative busy stage |
| Layout shift | no visible playfield/control shift after stage start |
| Runtime health | no unexpected console errors, missing assets, duplicate audio, or unhandled promise rejection |

Measure production builds. Record browser/version, OS, CPU/GPU, viewport, DPR,
release SHA, seed, stage, active object count, warm-up, and sample duration.
Averages alone do not establish smoothness; include p95 or worse-frame evidence.

## 14. Implementation roadmap

The phases below are sequential quality gates. Keep the game runnable after each
integration. Prefer narrow end-to-end improvements over disconnected systems.

### Phase 0 — Premium baseline and production map

Deliver:

- baseline captures for title/setup, Newborn, High School, First Career,
  Relationships/Home, and ending at desktop and mobile sizes;
- a scorecard against the gameplay, narrative, visual, animation, UI, audio,
  accessibility, and technical rubrics in this plan;
- current bundle/network/frame-time/save measurements;
- stage/character/object/audio asset inventory with provenance and actual runtime use;
- a complete cast-continuity report for recurring NPCs;
- a prioritized defect list labeled P0, P1, P2, or future;
- Golden Stage and Golden Thread debug selectors that cannot affect normal saves;
- **a green verification baseline**: `npm test` and `npm run budget` either pass,
  or every remaining failure is triaged in writing with an owner, a cause, and an
  explicitly approved exception. Without this, no later gate in §15 or §21 can be
  evaluated (§0 L4);
- **CI that actually runs that verification.** Today `deploy-pages.yml` runs only
  `npm ci`, `release:stamp`, and `npm run build`, then deploys; no workflow runs
  the test suite or the budget. Every failure above reached production silently.

Gate:

- every planned premium feature maps to a current system or an explicit new
  contract;
- the highest-risk three defects are reproduced and have observable completion
  criteria;
- unrelated v1 behavior and the v5 reference repository remain unchanged;
- the verification baseline is green, or its exceptions are recorded and approved;
- a push to `main` cannot deploy while tests or the budget fail.

### Phase 1 — Asset/runtime foundation and stage grammar

Deliver:

- typed stage-presentation, character-identity, object, and preload catalogs;
- compact per-stage runtime atlases and provenance manifest;
- stable stage ground/lane/anchor calculation across supported viewports;
- reliable delayed image loading and deliberate placeholder behavior;
- production exclusion of source sheets and art-review-only pages;
- developer overlay for sprite, anchor, scale, asset, and release diagnostics;
- **an amended bundle-budget profile.** The shipped `PHASE_1_BUDGET_PROFILE` in
  `scripts/bundle-budget.mjs` fails the build on *any* PNG in `dist/`, which
  contradicts §6.6 and this phase's own "compact runtime atlases" deliverable.
  Replace the blanket ban with a per-file cap and a total-PNG cap, so shipping
  runtime atlases is legal and shipping source sheets is not (§0 L5);
- **per-stage preload groups**, so the boot path stops warming every heritage and
  both genders. `warmStorybookCharacterAtlases()` called without a heritage warms
  4 heritages × 5 families × 2 genders.

Gate:

- every currently visible character/object resolves through the catalog;
- no missing, incorrectly gendered, floating, transparent-clothing, or
  frame-scale-drift defect remains in the Golden Stage;
- production budget is measured against the Phase 0 baseline and every limit has
  moved toward its §13 target or stayed equal; none moved away (§0 L9). "Does not
  regress" is meaningless while the budget fails outright, so the baseline
  numbers, not a pass/fail, are the reference.

### Phase 2 — Golden Stage runner feel

Deliver:

- finalized semantic input, lane tween, buffering, collision interpolation, and
  difficulty speeds;
- High School signature background, same-age cast, prop set, pattern set, and
  subtle ambient motion;
- anticipation, contact, score, audio, and recovery feedback;
- touch-control redesign in the v5-friendly storybook style;
- reduced-motion and high-contrast equivalents.

Gate:

- no wobble, swinging, size change, foot drift, double move, or stuck input in
  repeated left/right/up/down review traces;
- all High School patterns are readable and reachable on all difficulties;
- new players can state what to collect, avoid, and where to move after the safe
  opening pattern;
- Golden Stage gameplay, animation, UI, and visual rubric scores are at least 4/5.

### Phase 3 — Golden Stage choice and Golden Thread consequences

Deliver:

- polished High School exam/direction encounter with three rational options;
- storybook choice tray and full keyboard/touch/Assist/screen-reader behavior;
- caregiver memory and High School decision callbacks in First Career;
- persistent named characters with stable appearance through the thread;
- clear immediate effects, qualitative future hints, and recap language;
- reload-safe deterministic thread selector for review.

Gate:

- each effect applies exactly once across reload at every transaction state;
- every option has a rational goal and a distinct later acknowledgment;
- a player can identify at least one earlier cause when viewing First Career;
- the Golden Thread completes in 6–8 review minutes with no missing cast or art.

### Phase 4 — Complete character and world cohesion

Deliver:

- stage art-bible entries for all twelve stages;
- persistent character identity and age/outfit progression for caregivers,
  friends, mentors, spouse candidates, colleagues, children, and pets;
- approved standard/summer job uniforms for all implemented careers;
- front/back/left/right pose coverage plus stage-correct motion;
- grounded backgrounds enhanced with only a few authored props and ambient
  details, preserving the clearer previous-background composition where better;
- interaction smiles/talk/concern/celebration states;
- coherent title/setup/gallery/recap/ending presentation.

Gate:

- no recurring person changes identity unexpectedly;
- school peers are stage/age matched;
- job and seasonal outfits display in their intended contexts;
- all twelve stages pass grounding, scale, opacity, silhouette, and z-order review;
- reused and generated assets are documented and production-ready.

### Phase 5 — Complete stage gameplay authorship

Deliver:

- signature patterns, quiet windows, human beats, and recaps for every stage;
- difficulty-specific pacing without changing life length or route access;
- stage-aware opportunities and hazards instead of generic reskins;
- clear NPC telegraphing, safe corridors, and optional/mandatory labels;
- recovery scenes appropriate to age and context;
- representative callbacks distributed across the whole life.

Gate:

- no stage is only a recolored version of another;
- each stage contains a benefit fork, risk/reward pattern, quiet narrative
  window, named-person beat, major choice, and recap;
- no uninterrupted runner segment exceeds 75 seconds;
- every normal complete life reaches an ending without a forced “correct” route.

### Phase 6 — Careers, relationships, and later-life depth

Deliver:

- visually distinct workplaces and clothing for Teacher, Chef, Barista,
  Athlete, Entrepreneur, Engineer, Software Engineer, Manager, Financial
  Analyst, Artist, Police, Lawyer, CEO, Doctor, Nurse, Farmer, Dancer, Gym
  Trainer, Army, and supported additional roles;
- qualified career offers, retraining, career change/interruption, seasonal
  clothing, and meaningful pressure/purpose/security trade-offs;
- a short spouse-choice stage with several distinct compatible candidates when
  marriage is chosen, plus equally authored single/friends/community routes;
- parent jobs reflected in setup, recurring appearance, dialogue, and selected
  background props;
- later-career mentoring, part-time, and retirement-timing consequences;
- richer ending montage using people, outfits, pets, keepsakes, and locations.

Gate:

- no career strictly dominates every other career for all three scores and life
  contexts;
- every marriage candidate is visually unique and the valid partner pool follows
  the game's declared relationship rules without gender/atlas confusion;
- all adult routes reach Later Career, Retirement, and a meaningful ending;
- the ending distinguishes money from health, happiness, relationships, and legacy.

### Phase 7 — Audio, UI, accessibility, and mobile completion

Deliver:

- cohesive theme, ambience, cue library, mixing, pooling, and mute controls;
- final game-like shell and transitions;
- landscape/portrait control placement and safe-area support;
- final keyboard, touch, swipe, Assist, nonvisual, contrast, reduced-motion, and
  200% text paths;
- visual equivalents for important audio and semantic equivalents for canvas events;
- one-handed Story mode option if it can reuse semantic Assist safely.

Gate:

- a complete life works at every required viewport and input path;
- no player/control/choice overlap, horizontal page scroll, orientation reset,
  or inaccessible focus transition;
- zero known serious or critical accessibility finding;
- audio improves state clarity and never blocks reading or browser startup.

### Phase 8 — Balance, pacing, personalization, and replay

Deliver:

- tuned runner/choice influence around the established 30/70 intent;
- useful Easy/Normal/Challenge differences and optional test-oriented IQ/start
  stage controls clearly separated from the default story;
- curated family contexts and parent jobs without deterministic social judgments;
- reliable route repair for education, career, relationships, and retirement;
- compact “because you chose…” recap and New Life comparison;
- local-only playtest counters for choice selection, missed object categories,
  recovery frequency, stage duration, callback visibility, and restarts.

Gate:

- no obvious score farming, recovery loop, dead route, or dominant option;
- a normal playthrough stays within the agreed duration target;
- at least six major choices in a complete life receive visible callbacks;
- two different seeds/contexts produce recognizably different but valid lives;
- telemetry remains local/debug-only unless the user separately approves an
  explicit privacy-respecting external system.

### Phase 9 — Premium Release Candidate

Deliver:

- production performance and payload optimization;
- save migration, corrupt-save quarantine, refresh, focus-loss, pause, and
  orientation-change hardening;
- final visual, gameplay, logic, accessibility, and content review;
- exact release notes, controls, asset provenance, known limitations, and rollback steps;
- versioned tag and exact-SHA GitHub Pages deployment after approval.

Gate:

- the complete life is playable from title to ending without an unexpected
  console/network error;
- every rubric category is at least 4/5 in representative captures;
- all P0/P1 defects are closed and accepted P2 issues are documented;
- performance, asset, save, and deployment budgets pass or have an honest,
  approved exception with measured impact;
- production `/release.json` identifies the exact deployed commit;
- one human playtester completes the Golden Stage and one complete life and
  reports where movement, meaning, or consequence is unclear.

## 15. Finite implementation and review loop

The project previously found exhaustive matrices too slow for implementation.
This roadmap therefore separates fast development checks from milestone
evidence. Do not run 120,000-run simulations during ordinary art, UI, or content
work.

### Fast gate after a meaningful integration

Target duration: under ten minutes.

1. inspect the exact diff and preserve unrelated work;
2. run type checking plus focused tests for changed systems;
3. produce one production build when runtime code/assets changed;
4. manually exercise the changed route once at one desktop and one mobile size;
5. inspect console/network output;
6. fix P0/P1 regressions before continuing.

### Milestone gate at the end of a phase

1. run the normal repository verification appropriate to the changed scope;
2. review required viewports and representative input/accessibility paths;
3. capture the required scenes and performance sample;
4. run a small fixed seed set plus targeted boundary cases;
5. perform one code review and one game-logic review;
6. score the rubrics and list the three highest-impact deficiencies;
7. perform up to two focused correction passes;
8. if a gate still fails, document the evidence and blocker instead of weakening
   the gate or beginning dependent expansion.

Large seed populations or broad browser matrices are reserved for a specific
fairness/determinism risk or the final Release Candidate, and must be explicitly
time-boxed. Screenshots do not replace gameplay checks, and test volume does not
replace implementation.

## 16. Quality rubrics

Score each category from 1 to 5 using named captures and observable evidence.

### Gameplay rubric

1. **Direction and readability** — the next decision and safe routes are clear.
2. **Movement feel** — input is immediate, stable, consistent, and satisfying.
3. **Pattern quality** — opportunities, hazards, trade-offs, and quiet windows
   create decisions rather than noise.
4. **Choice quality** — options are concise, rational, understandable, and non-dominant.
5. **Consequence quality** — important decisions visibly alter later life.
6. **Pacing** — action, reading, quiet moments, and transitions support each other.
7. **Replay value** — different lives feel distinct without requiring grinding.

### Presentation rubric

1. **Visual cohesion** — characters, rooms, props, UI, effects, and typography
   feel authored together.
2. **Composition and grounding** — lanes and characters never appear to float;
   foreground/background do not hide decisions.
3. **Character continuity** — identity, gender presentation, age, scale, outfit,
   and recurring-person recognition remain stable.
4. **Animation and feedback** — motion communicates direction and emotion without
   wobble, drift, clutter, or discomfort.
5. **Mobile/UI quality** — the game remains legible and game-like at small sizes.
6. **Audio identity** — music, ambience, and cues are coherent and informative.
7. **Technical presentation** — stable frame pacing, correct loading, no missing
   art, broken layering, transparent clothing, or placeholder flash.

A milestone visual/gameplay gate passes when every applicable category is at
least 4/5, there are no P0/P1 defects, and self-scores cite evidence.

### Required capture set

- title/setup with one advanced-options state;
- Newborn normal play and caregiver encounter;
- High School dense pattern and choice tray;
- First Career workplace and earlier-choice callback;
- spouse candidate selection or single/community route;
- midlife scene with several recurring people;
- later-life/pet scene;
- final three-score result and biography;
- portrait mobile gameplay and narrow-landscape gameplay;
- reduced-motion/high-contrast equivalent of one busy stage.

## 17. Code review checklist

For each phase, review only relevant risks:

- dependency boundaries and deterministic domain isolation;
- fixed-step behavior and seeded content;
- correct lifecycle disposal and no duplicate input/audio loops;
- save validation, migration, and idempotent transactions;
- DOM text safety and semantic accessibility;
- asset provenance, fallback, preload scope, and production inclusion;
- no hot-loop layout reads, image decoding, large allocations, or linear catalog search;
- mobile resize/orientation stability;
- no unrelated legacy/v5 code changes;
- configuration and content data are typed and have clear ownership.

## 18. Game-logic review checklist

- exactly three permanent numeric scores remain;
- runner contacts are smaller than major choice/consequence influence;
- every pattern has a reachable route with adequate warning;
- stage time, choices, and life duration do not change accidentally by FPS;
- pause, choice, focus loss, and hidden page stop gameplay effects;
- each object and consequence resolves once;
- recovery cannot improve the player relative to the pre-trigger state;
- no education, career, relationship, or retirement dead end exists;
- prerequisites and age progression are plausible and monotonic;
- persistent characters retain stable identity and stage-correct age;
- major options are rational trade-offs with later acknowledgment;
- difficulty does not remove story access or create unavoidable contacts;
- ending text is consistent with scores, facts, people, and choices.

## 19. Priority backlog

### P0 — blocks premium work

- missing/invisible player or required NPC;
- wrong atlas identity or gender presentation;
- save corruption, duplicated effect, blocked route, or unrecoverable stage;
- unavoidable pattern or input failure;
- player/choice/control overlap that prevents play;
- missing production asset, uncaught error, or broken Pages path;
- **a red verification baseline, or a deploy path that can ship without running
  it.** A failing test suite or budget blocks every gate downstream, so it is P0
  by definition rather than a process nicety (§0 L4).

### P1 — required for Premium Release Candidate

- wobble, scale/anchor drift, floating, transparent clothing, or broken direction;
- generic/unreadable objects or backgrounds that interfere with lanes;
- recurring-person identity discontinuity;
- major choice with no later visible echo;
- flat/repetitive stage presentation or missing job/season outfit;
- serious mobile, accessibility, audio, or performance defect;
- title/setup/ending that feels disconnected from the game world.

### P2 — polish after the core is convincing

- additional ambient animations and decorative prop variants;
- more expression poses and small character idles;
- additional music arrangements and seasonal room variants;
- more biographies, callbacks, optional NPCs, and rare life events;
- expanded gallery and developer art-review tools.

### Future

- cloud sync, localization beyond the first supported language set, external
  analytics, multiplayer/social features, and large new route packs require
  separate product plans and authorization.

## 20. Risk register

| Risk | Warning sign | Mitigation |
|---|---|---|
| “AAA” becomes endless scope | New jobs/art added while core movement is weak | Golden Stage gate and strict P0/P1/P2 order |
| Art generation breaks continuity | Faces, gender, scale, or anchors change between poses | Canonical identity manifest, v5 reuse first, automated anchor matrix, human visual review |
| Background improvement harms grounding | Character appears to walk on furniture or fly | Flat playfield grammar, fixed ground line, limited parallax and z-order rules |
| Full life feels repetitive | Stages differ only by speed/color | Signature pattern, human beat, visual motif, and callback per stage |
| Choices feel cosmetic | Recap shows deltas but later life does not change | Consequence contract and Golden Thread gate |
| Build becomes too large | Source atlases or all careers load at boot | Per-stage atlases, preload groups, artifact budget |
| Mobile fixes damage desktop | Viewport-specific transforms alter game state | One semantic layout model and required viewport matrix |
| Testing delays implementation | Broad simulations run after every edit | Fast gate, milestone sampling, final targeted matrix only |
| Balance encodes social judgment | Family context or identity implies fixed success | Identity-neutral mechanics, route access review, respectful content review |
| Release differs from reviewed build | Pages cache or workflow deploys another SHA | `release.json`, exact-SHA smoke, rollback record |

## 21. Release and deployment discipline

At the end of an approved implementation phase:

1. inspect `git status -sb` and the exact diff;
2. verify that generated assets, source assets, and provenance are intentional;
3. run the phase's fast or milestone gate;
4. commit one coherent phase with a clear message;
5. push through the repository's SSH remote;
6. wait for the GitHub Pages workflow for that exact commit;
7. confirm `/release.json`, HTML, hashed assets, primary flow, and console health;
8. record accepted limitations and the rollback commit/tag.

Do not force-push, overwrite unrelated work, change the v5 repository, or claim a
deployment succeeded before the exact live release identity is confirmed.

## 22. Premium Release Candidate definition

The upgrade is ready for release only when:

- all twelve stages in §9's matrix are playable in one continuous life. Two of
  them do not exist today: High School is unbuilt, and Relationships/Home and
  Midlife are one chapter-discriminated stage that must be split (§0 L2, L3);
- the Golden Stage and Golden Thread pass every applicable gate;
- the three-score model remains the only permanent numeric outcome model;
- each stage has a distinct place, interaction identity, named-person beat,
  major choice, and recap;
- at least six important choices in a normal complete life receive visible callbacks;
- characters remain grounded, fixed-scale, age appropriate, visually distinct,
  and consistent across directions/outfits;
- jobs, parent jobs, spouse candidates, seasonal clothing, and pets render in
  their intended contexts;
- no major option, career, relationship state, or ending is globally “correct”;
- keyboard, touch, swipe, Assist, nonvisual, reduced-motion, high-contrast, and
  200% text paths work where declared;
- required viewports have no player/control/choice overlap;
- saves survive reload, schema migration, pause, focus loss, and stage transition;
- production budgets pass and there are no unexpected runtime/network errors;
- all P0/P1 defects are closed;
- source/provenance, controls, known limitations, performance evidence, release
  identity, and rollback instructions are documented;
- a human playtester can explain what they did, who mattered, and how at least
  one earlier decision changed a later scene.

## 23. First execution order

When this roadmap is authorized for implementation, begin in this order:

1. establish Phase 0 captures and score the current game honestly;
2. **restore a green verification baseline and gate the deploy on it** — this
   precedes defect work, because otherwise no later fix can be shown to hold;
3. fix only the three highest-impact P0/P1 findings needed for the Golden Stage;
4. formalize stage/character/object catalogs only as far as High School requires;
5. **author the High School stage**, then complete its runner feel before
   expanding art coverage (§0 L2 — it does not exist yet);
5. complete its choice and the Golden Thread callback;
6. review the result with a human playtester;
7. propagate the proven grammar to the remaining stages in life order;
8. finish audio, accessibility, mobile, balance, and Release Candidate work;
9. commit, push, and deploy only at coherent approved phase boundaries.

The first human playtest question is:

> During High School, where did moving stop feeling like a deliberate choice,
> and after First Career, could you tell which earlier decision changed your life?

## 24. Reference-plan ideas retained and adapted

| Reference-plan strength | Choice of Life adaptation |
|---|---|
| One decisive gameplay question | One minute of readable runner play, one meaningful choice, one recognizable later echo |
| Vertical slice before full expansion | Golden High School Stage plus Newborn→High School→First Career Golden Thread |
| Phase deliverables and hard gates | Ten post-v1 phases (0–9) with observable exit criteria |
| Simulation independent from rendering | Preserve deterministic core/presentation boundary and fixed-step runner |
| Tunables in typed data | Stage, character, object, encounter, consequence, and audio catalogs |
| Asset manifest and license control | Reuse reviewed v5 assets first; compact stage atlases with provenance |
| Controller/readability focus | Unified keyboard/touch/swipe/Assist semantics and mobile-safe UI |
| Visual and gameplay rubrics | Choice-specific movement, consequence, character, grounding, UI, and audio scores |
| Production performance evidence | Stage transfer, decoded-image, frame-time, save, and Pages budgets |
| Finite correction loop | Fast implementation gate, milestone review, at most two focused correction passes |
| Scope exclusions | No 3D/open-world/multiplayer/new meters before Premium RC |
| Honest completion handoff | Exact deployed SHA, known limitations, evidence, rollback, and one human test question |

This roadmap should be amended only when implementation evidence or human
playtesting exposes a real problem. New content volume, subjective enthusiasm,
or the desire to use every available asset is not sufficient reason to weaken a
quality gate.
