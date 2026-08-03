# Choice of Life — reviewed game and execution plan

Status: approved design baseline for the new repository

Current milestone: Phase 0, independent planning scaffold

Target repository: `buicongnguyen/Choice_of_life`

Target site: `https://buicongnguyen.github.io/Choice_of_life/`

## 1. Purpose and source boundary

Choice of Life is a new game based on reusable technology and art from Pixel Life Journey v5, but it has a different core scenario and progression model.

The reference repository must remain untouched. The new repository starts from the tracked tree of v5 commit `3274d0658737f3429b9ee62c15b965ebeba51373`, exported without its Git history, dependencies, generated output, logs, caches, or untracked planning file. Choice of Life has a fresh `main` branch, independent SSH remote, independent GitHub Pages deployment, and independent browser-storage keys.

The initial public release is intentionally a renamed reference scaffold plus this plan. It does not claim that the inherited room-based game is already the new runner.

## 2. Reviewed design decisions

The first idea was refined in the following ways before implementation:

1. The player will use three fixed lanes rather than free movement. This keeps collectible and hazard decisions readable on keyboard, touch, and small screens.
2. The character stays around 20% of the screen width. Time is represented by scene layers, objects, and people moving from right to left.
3. A newborn uses an age-appropriate seated, crawling, or assisted movement animation. Later characters walk or run. The gameplay verb is “move,” even when running would look wrong for the age.
4. The three permanent scores are named Health, Happiness, and Money. Money means financial security; all three use a 0–100 scale.
5. Stress, grades, IQ, careers, relationships, and credentials are not additional meters. They are temporary conditions or saved story facts.
6. Baby stages do not scatter literal money coins. Caregiver decisions can change family financial security until the player is old enough to earn or save.
7. Most important choices are trade-offs. The game will not reduce real life to always collecting a green “good” object and avoiding a red “bad” object.
8. Choices create delayed callbacks. A decision can affect scores now, save a fact, schedule an encounter, and change the ending.
9. NPC conversations create a safe zone and use an untimed HTML choice tray outside the playfield. The dialog must not cover the character.
10. Reaching zero in a score triggers a recovery, support, or assistance encounter rather than an instant game over.
11. Backgrounds will use flat, grounded side-view layers. Strong floor perspective and isometric objects are excluded because they make characters appear to fly.
12. Consequence depth will be built before a large catalogue of careers, costumes, or objects.

## 3. Player promise

The player should be able to say:

> I moved through one complete life, made understandable choices under pressure, met people who remembered what I did, and saw Health, Happiness, and Money tell different parts of my story.

The game should feel warm, lively, and replayable rather than punishing. University, marriage, children, a prestigious career, and high income are optional routes. A practical education, single life, career change, low-cost lifestyle, or recovery after a setback must remain viable.

## 4. Core loop

Each life stage repeats the following loop:

1. Introduce the age, scene, and one clear stage goal.
2. Scroll the environment from right to left while the character moves between three lanes.
3. Offer readable pickups, hazards, and occasional trade-off markers.
4. Telegraph an important person before the encounter begins.
5. Clear nearby hazards, slow the scene, and open a two- or three-choice dialog.
6. Apply and show immediate score changes.
7. Save a memory, relationship change, condition, credential, or future consequence when relevant.
8. Resume with brief collision protection.
9. End the stage with a short recap and transition to the next age.

Runner performance should contribute roughly 30% of the life result. Decisions and their consequences should contribute roughly 70%.

## 5. Three-score model

```ts
interface CoreScores {
  health: number;
  happiness: number;
  money: number;
}

const STARTING_SCORES: CoreScores = {
  health: 65,
  happiness: 60,
  money: 35,
};
```

Rules:

- Clamp every score between 0 and 100.
- Use Money as financial security, not a literal bank balance.
- A small pickup changes a score by 2–4 points.
- A strong pickup changes a score by 5–7 points.
- An ordinary hazard costs 3–5 points.
- A serious hazard costs 6–9 points.
- A major choice normally changes scores by a total of 5–15 points.
- A delayed consequence should have weight comparable to the decision that created it.
- Keep the score labels and icons visible in the same order throughout the life.
- Show exact immediate changes on a choice; describe delayed effects only with a fair hint.

Zero-score recovery:

- Health at zero: hospital, rest, or rehabilitation encounter; Money falls and the player continues.
- Happiness at zero: support, rest, or reconnection encounter; rewards are temporarily reduced.
- Money at zero: assistance, debt restructuring, cheaper training, or extra-work choice; the route remains playable.

## 6. Life state without extra meters

```ts
interface LifeState {
  schemaVersion: 1;
  runSeed: string;
  stageId: string;
  stageProgress: number;
  lane: 0 | 1 | 2;
  scores: CoreScores;
  flags: string[];
  memories: MemoryRecord[];
  credentials: string[];
  relationships: RelationshipRecord[];
  conditions: ConditionRecord[];
  scheduledConsequences: ScheduledConsequence[];
  firedConsequences: string[];
  careerId?: string;
  partnerId?: string;
}
```

Examples of non-score state:

- `healthyStart`, `secureBond`, `sharedToy`, `asksForHelp`
- `gradeExcellent`, `gradeGood`, `gradeBasic`
- `medicalDegree`, `tradeCertificate`, `workExperience`
- named relationship records with Mom, a friend, a mentor, or a partner
- temporary conditions such as `stressed`, `injured`, or `supported`
- scheduled callbacks such as “Mom needs help during Midlife”

All save writes use the `choice-of-life-v1-*` namespace. The game must never load a v5 active save into this schema.

## 7. Playfield, movement, and input

### Layout

```text
┌──── HUD: age · stage · Health · Happiness · Money ───────────────────────┐
│ TOP LANE                                                                 │
│ MIDDLE LANE   [player anchored near x = 20%]    ← world, items, time     │
│ BOTTOM LANE                                                              │
├──── responsive choice tray; visible only during encounters ──────────────┤
└───────────────────────────────────────────────────────────────────────────┘
```

Movement rules:

- Use three fixed lane centers.
- Tween a lane change over about 220 ms.
- Use an input cooldown near 170 ms so one key press cannot skip two lanes.
- Never scale a sprite during a lane change.
- Keep a stage-specific bounding box and foot anchor constant across every animation frame.
- Use seated/crawling newborn movement, toddler steps, and walking/running animations for older stages.
- Do not add jumping in the first release.
- Advance scrolling and animation with delta time, not frame count.
- Pause when the page loses focus.

Required controls:

- Arrow Up/Down and `W/S`
- large on-screen Up/Down buttons
- vertical swipe gesture
- `1`, `2`, and `3` for dialog choices
- Escape or a visible button for pause

## 8. Scrolling scene and grounding

Each scene is built from independently scrolling, horizontally repeatable layers:

1. far wall or skyline, moving slowly;
2. middle wall furniture or landscape, moving at medium speed;
3. floor strip and lane markers, moving at world speed;
4. interactive objects and NPCs, using the same floor coordinate system as the player;
5. foreground accents, used sparingly and never obscuring hazards.

Grounding requirements:

- Use a near-flat side view with only mild depth cues.
- Give every interactive sprite a documented foot point.
- Position shadows at the shared floor point, not at the image rectangle center.
- Avoid furniture with strong isometric top surfaces.
- Scale only by life stage, never by lane or horizontal position.
- Validate scene seams at the slowest and fastest supported speed.
- Use gentle ambient motion such as curtains, a mobile, leaves, signs, or clouds; do not animate the whole background as a wobbling image.

## 9. Spawn, collision, and fairness

Spawn a pattern about every 4–7 seconds depending on stage and difficulty.

Every pattern must pass a validator:

- at least one lane is safe;
- Normal difficulty gives at least 0.9 seconds of reaction time;
- no unavoidable hazard appears immediately after a lane change;
- no more than two hazard-heavy patterns occur consecutively;
- a helpful item follows significant damage;
- NPC safe zones contain no ordinary collisions;
- a deterministic saved seed recreates the same sequence after reload.

Visual language must work without color:

- Health pickup: heart symbol and round aura.
- Happiness pickup: smile or star and radiating outline.
- Money pickup: coin symbol and hexagonal outline.
- Hazard: warning symbol, sharp outline, or pulsing stripe.
- Trade-off: split-arrow symbol with an amber outline.
- NPC: name, portrait/sprite, and speech bubble marker.

Collision rules:

- Use forgiving inner hit boxes rather than the transparent image bounds.
- Apply a short invulnerability window after damage.
- Disable collisions during dialogs and for 0.6 seconds after closing one.
- Never spawn an object behind the choice tray or touch controls.
- Log the pattern, lane, object, and result in development mode for balance tests.

## 10. NPC encounter and choice tray

When the player meets Mom or another important person:

1. Stop new spawns and clear a 1.5-second safe corridor.
2. Guide or hold the player in a readable lane.
3. Slow the background to 10–15% of normal speed.
4. Disable collisions.
5. Dock the choice tray below the playfield on desktop and landscape.
6. On narrow portrait screens, compress the playfield and place the tray above or below it.
7. Show two or three large, untimed choices.
8. Display exact immediate score effects and a qualitative future hint.
9. Show a short result sentence after selection.
10. Save immediately, close the tray, grant brief protection, and resume.

Example:

> Counselor: “Your exam is next week. How will you prepare?”

1. Study every evening — Happiness −6, Money −2. Future: best grade chance; may add Stress.
2. Study and keep one free evening — Health +2, Happiness +2. Future: good grade chance.
3. Work extra shifts — Money +9, Happiness −3. Future: work experience; less exam preparation.

The choice tray is semantic HTML, keyboard reachable, screen-reader labeled, and announced through an `aria-live` result region.

## 11. Consequence framework

```ts
interface ChoiceDefinition {
  id: string;
  speakerId?: string;
  prompt: string;
  options: ChoiceOption[];
}

interface ChoiceOption {
  id: string;
  label: string;
  immediate: Partial<CoreScores>;
  addFlags?: string[];
  removeFlags?: string[];
  addCondition?: ConditionRecord;
  schedule?: ScheduledConsequence[];
  futureHint: string;
}

interface ScheduledConsequence {
  id: string;
  targetStageId: string;
  encounterId: string;
  requiresAll?: string[];
  once: true;
}
```

At stage load, the game inserts due consequences at known progress points. A callback is marked fired and saved before its animation begins, so refresh cannot duplicate its reward or penalty.

MVP limits:

- one major and at most one minor callback per stage;
- at most three linked callbacks in one chain;
- every important option has an immediate result and at least one saved narrative fact;
- at least four decisions in a complete life receive explicit later callbacks.

## 12. Stage-by-stage redesign

### Stage 1 — Newborn, age 0–1

- Scene: gently scrolling nursery with a crib, window, mobile, rug, toy shelf, and grounded floor strip.
- Movement: seated scoot or crawl; no adult running animation.
- Helpful objects: milk bottle, soft blanket, rattle, teddy, family photo.
- Hazards: germ cloud, sharp toy, cold draft, loud falling object.
- NPC: Mom or selected primary caregiver appears in the upper lane.
- Signature choice: milk, cuddle, or a new toy when the baby is fussy.
- Trade-off: milk strongly helps Health; cuddle strongly helps Happiness; toy helps Happiness but reduces family Money.
- Callback: Mom refers to the response during Toddler; save `healthyStart`, `secureBond`, or `curiousStart`.

### Stage 2 — Toddler, age 1–3

- Scene: playroom opening gradually into a small park.
- Helpful objects: fruit, blocks, picture cards, safe playground toys.
- Hazards: candy piles, spilled water, power outlet, broken toy, unsupervised street edge.
- NPCs: caregiver and a named playmate of the same life stage.
- Signature choice: share a favorite toy, take turns, or refuse.
- Trade-off: sharing costs immediate Happiness but strengthens trust; refusing feels good now but weakens the future friendship.
- Callback: the playmate helps or ignores the player in Early Childhood.

### Stage 3 — Early Childhood, age 3–7

- Scene: preschool, backyard, and neighborhood segments.
- Helpful objects: storybooks, bicycle helmet, healthy lunch, music notes, friend tokens.
- Hazards: excessive screen time, sugary snacks, traffic, broken playground equipment.
- NPCs: preschool teacher and returning playmate.
- Signature choice: help an upset friend, finish an activity first, or ask the teacher to help both.
- Callback: school readiness, friendship, or help-seeking affects the first Elementary encounter.

### Stage 4 — Elementary School, age 7–11

- Scene: school corridor, classroom, playground, and after-school street.
- Helpful objects: homework pages, books, healthy lunch, sports equipment, chore coins.
- Hazards: forgotten backpack, junk food, late-night screen, playground accident, bully obstacle.
- NPCs: caregiver, teacher, and a named same-age friend.
- Signature choice: homework club, sports club, or chores/odd jobs after school.
- Outcome: save an Excellent, Good, or Developing report-card badge; it is not another score.
- Callback: the selected routine changes Middle School opportunities.

### Stage 5 — Middle School, age 11–14

- Scene: larger school, neighborhood, club spaces, and restrained online/social imagery.
- Helpful objects: sleep, study notes, sports, music, savings.
- Hazards: rumor clouds, cyberbullying alerts, energy drinks, skipped meals, unsafe peer pressure.
- NPC: best friend of the same stage, with a persistent unique appearance and name.
- Signature choice: help the friend study, give answers, or refuse and focus alone.
- Callback: High School starts with a loyal study partner, disciplinary warning, or distant friend.

### Stage 6 — High School, age 14–18

- Scene: school, library, part-time workplace, and city street.
- Helpful objects: books, sleep, healthy food, part-time pay, sports.
- Hazards: party distraction, social-media alerts, cigarettes/vapes, all-night caffeine, unsafe driving.
- NPCs: counselor and returning friend.
- Signature choice: study very hard, study with balance, or work more shifts.
- Outcome: compute grade primarily from the decision and secondarily from runner performance; save Excellent, Good, or Basic.
- Callback: grade, Stress, and work experience change Education/Training offers.

### Stage 7 — Education or Training, age 18–22

- Entry routes: professional university, vocational/practical training, or immediate work. None is a failure route.
- Access repair: a lower grade can reach a professional path through a foundation year that costs Money and Happiness.
- Scene: campus, workshop, or workplace based on the selected route.
- Helpful objects: lecture notes/tools, internships, meals, paychecks, helpful connections.
- Hazards: debt bills, all-nighters, missed deadlines, party distraction, burnout clocks.
- NPC: advisor, mentor, or roommate.
- Signature choice: prepare for finals, take an internship, or support a struggling roommate.
- Callback: credential, experience, and relationships determine three qualified First Career offers.

### Stage 8 — First Career, age 22–30

- Entry: show three qualified offers with Income, Pressure, and Purpose/Autonomy labels.
- Scene: career props over a shared city and commute foundation.
- Helpful objects: paychecks, healthy lunches, rest, teamwork, exercise.
- Hazards: traffic, deadlines, bills, conflict, overtime.
- NPC: boss, coworker, client, patient, or customer suited to the career.
- Signature choice: demanding promotion/overtime, steady role, or flexibility/retraining.
- Doctor example: an emergency shift gives strong Money but costs Health and Happiness; swapping or sharing the shift uses prior relationship choices.
- Callback: career pressure returns in Relationships/Home and Midlife.

### Stage 9 — Relationships and Home, age 30–40

- Routes: committed partnership, marriage, single life with close friends, or community-focused life.
- Scene: neighborhood, home, commute, and social spaces.
- Helpful objects: shared meals, time together, savings, exercise, home care.
- Hazards: arguments, debt, neglect clocks, overtime, unhealthy convenience food.
- NPC: partner/candidate, close friend, landlord, or family member based on the route.
- Signature choice: support the person, work overtime, or negotiate a compromise.
- Callback: relationship trust and financial choices alter Midlife support.

### Stage 10 — Midlife Responsibilities, age 40–55

- Scene: home, workplace, clinic, and family neighborhood.
- Helpful objects: checkups, exercise, family moments, savings, hobbies.
- Hazards: stress eating, warning symptoms, scams, debt, endless overtime.
- NPCs: older Mom/caregiver, child or younger relative, and boss.
- Signature choice: provide direct care, take a major promotion, or arrange shared care and reduced hours.
- Callback: the Newborn caregiver relationship and the player’s support network change the result.

### Stage 11 — Later Career, age 55–70

- Scene: workplace, home, clinic, and park.
- Helpful objects: mentoring, pension contributions, walking, checkups, old-friend moments.
- Hazards: health episodes, isolation, layoff warnings, scams, overwork.
- NPCs: boss, adult relative, apprentice, or old friend.
- Signature choice: retire early, continue full-time, or work part-time and mentor.
- Accessibility of route: low Money still allows dignified part-time work or community support.
- Callback: the decision shapes Retirement resources, relationships, and legacy scenes.

### Stage 12 — Retirement and Legacy, age 70+

- Scene: home, park, travel imagery, community spaces, and sunset.
- Helpful objects: gentle walking, visits, volunteering, gardening, safe savings.
- Hazards: loneliness, scams, medical risks, risky purchases, inactivity.
- NPC: partner, old friend, family, or community member selected from the saved life.
- Signature choice: give resources, pursue a dream, or preserve financial security.
- Ending: show all three final scores separately and generate a title such as “The Generous Builder,” “A Healthy, Quiet Life,” or “Successful but Worn.”
- Biography: mention named people and explicit callbacks rather than only repeated pickups.

## 13. Pacing and difficulty

Target Normal-mode stage durations:

| Stage | Target active time |
|---|---:|
| Newborn | 75 seconds |
| Toddler | 90 seconds |
| Early Childhood | 100 seconds |
| Elementary School | 110 seconds |
| Middle School | 110 seconds |
| High School | 130 seconds |
| Education or Training | 130 seconds |
| First Career | 130 seconds |
| Relationships and Home | 130 seconds |
| Midlife Responsibilities | 125 seconds |
| Later Career | 115 seconds |
| Retirement and Legacy | 110 seconds |

The active total is about 22.5 minutes; dialogs and transitions bring a full life to roughly 24–30 minutes.

Each stage has three sections:

- Introduction, 0–25%: slower, readable patterns and scene teaching.
- Pressure, 25–70%: mixed objects and one minor NPC or callback.
- Crossroads, 70–100%: one major decision, result, and transition.

Difficulty modes:

- Story: slower speed, fewer hazards, longer warnings.
- Normal: default balance and at least 0.9 seconds reaction time.
- Challenge: unlocked after one completed life; faster patterns without unfair layouts.

Speed changes difficulty, not the number of story choices or total meaningful rewards.

## 14. Technical architecture

Do not add the runner directly to the inherited large engine module. Build a new isolated feature area and migrate reusable pieces deliberately.

Proposed modules:

```text
src/choice-of-life/
  app.ts
  config.ts
  state/
    life-state.ts
    save-store.ts
    score-model.ts
  runner/
    lane-controller.ts
    scroll-world.ts
    spawn-director.ts
    spawn-validator.ts
    collision-system.ts
    runner-loop.ts
  encounters/
    choice-model.ts
    choice-tray.ts
    encounter-director.ts
    consequence-scheduler.ts
  stages/
    stage-model.ts
    stage-catalog.ts
    newborn.ts
    high-school.ts
    education.ts
    first-career.ts
  presentation/
    hud.ts
    stage-transition.ts
    story-log.ts
    ending.ts
  accessibility/
    input.ts
    preferences.ts
```

Reuse candidates from v5:

- character atlas loading and direction/frame selection;
- fixed-size character rendering and foot anchors;
- responsive canvas setup;
- sound controls and reduced-motion preferences;
- character, outfit, pet, and background assets that match the new side view;
- test infrastructure and GitHub Pages workflow.

Replace rather than adapt deeply:

- four-stat plus separate-money economy;
- room/station movement loop;
- IQ training-question gate;
- stage activity collector;
- old active-save schema;
- monolithic event and career flow.

## 15. Implementation phases

### Phase 0 — Independent repository and honest scaffold

Deliverables:

- export the exact tracked reference commit into `Choice_of_life`;
- initialize fresh Git history on `main`;
- rename package, page, title screen, preview, console prefix, export name, and workflow title;
- isolate all browser-storage keys;
- move inherited v5 worklogs under `docs/reference-v5/`;
- write this reviewed plan and a concise README/design summary;
- retain the relative Vite base;
- run type check, tests, and production build;
- create the public GitHub repository;
- add only the SSH origin;
- push `main`, enable workflow-based Pages, and verify the exact deployed commit;
- verify the v5 source repository remains unchanged.

Acceptance:

- the live title says Choice of Life and clearly says it is a reference build;
- no active code contains v5 save keys or old repository URLs;
- the new repository has no copied Git history or generated dependencies;
- the new remote is exactly `git@github.com:buicongnguyen/Choice_of_life.git`.

### Phase 1 — Runner foundation and Newborn sandbox

Deliverables:

- new `src/choice-of-life/` entry architecture;
- three-score state and HUD;
- fixed-anchor three-lane movement;
- scrolling nursery layers with grounded objects;
- deterministic spawner and safe-route validator;
- pickups, hazards, damage protection, stage progress, pause, and save/resume;
- keyboard, touch buttons, and swipe input;
- newborn seated/crawl movement with consistent size.

Acceptance:

- the player never changes scale during movement;
- 10,000 seeded pattern simulations contain no blocked route;
- refresh restores the same seed, stage progress, lane, and scores;
- only Health, Happiness, and Money appear as numeric life scores.

### Phase 2 — NPC decisions and consequences

Deliverables:

- Mom encounter and safe corridor;
- responsive, non-overlapping choice tray;
- immediate effects, future hints, flags, memories, conditions, and scheduled callbacks;
- exactly-once consequence persistence;
- story log and result messages;
- zero-score recovery encounters.

Acceptance:

- dialogs never cover the player or touch controls at target viewport sizes;
- no collision can damage the player while reading;
- a saved choice survives reload and its callback fires exactly once;
- keyboard, touch, and screen-reader users can complete the Mom encounter.

### Phase 3 — Four-stage vertical slice

Build Newborn, High School, Education/Training, and First Career before producing every stage.

The slice must prove:

- nursery runner and Mom decision;
- exam preparation and grade status;
- university, vocational, and immediate-work branches;
- three qualified career offers;
- high-income/high-pressure doctor balancing;
- at least one callback across non-adjacent stages;
- a short generated ending using scores and saved facts.

Acceptance:

- all education routes reach viable careers;
- the doctor route pays more but reliably introduces Health/Happiness pressure;
- choices dominate outcomes more than collision luck;
- a complete slice can be played on desktop and phone without blocked UI.

### Phase 4 — Complete life and recurring people

Deliverables:

- remaining eight stages;
- recurring named friends with stable, unique looks;
- caregiver aging and Midlife callback;
- relationship, single-life, family, and community routes;
- later-career and retirement decisions;
- at least four explicit delayed callbacks;
- full ending biography.

Acceptance:

- a Normal life lasts roughly 24–30 minutes;
- each stage has one major decision;
- friends remain stage-appropriate in age and stable in identity;
- low grade, low Money, practical training, and single life all remain viable.

### Phase 5 — Art, audio, accessibility, and balance

Deliverables:

- age-appropriate front/side/back movement sets where visible;
- stage-specific grounded backgrounds with subtle ambient motion;
- consistent sprite sizes, anchors, opacity, and clothing silhouettes;
- high-contrast and reduced-motion modes;
- Story, Normal, and Challenge tuning;
- warnings with visual and audio equivalents;
- balance telemetry that stores no personal data.

Acceptance:

- no transparent clothing gaps or background-colored costume holes;
- all characters remain within documented size ranges for their stage;
- backgrounds never make characters appear to float;
- the full life is completable with keyboard only and touch only;
- color is never the only way to distinguish an object.

### Phase 6 — Release hardening

Deliverables:

- save migration policy for Choice of Life schema changes;
- automated seeded-run and responsive smoke tests;
- performance budget and asset audit;
- production build and Pages-path verification;
- release notes and known-limitations list.

Acceptance:

- no console errors during a full smoke run;
- reload restores stage, seed, scores, choices, and pending consequences;
- direct asset requests work under `/Choice_of_life/`;
- the GitHub Pages deployment corresponds to the exact pushed commit.

## 16. Test strategy

Unit tests:

- score clamping and recovery thresholds;
- lane state and input cooldown;
- deterministic seeded spawning;
- safe-route validator;
- collision hit boxes and invulnerability;
- choice effects and future hints;
- scheduled/fired consequence idempotency;
- save normalization and schema rejection;
- education and career qualification;
- ending title selection.

Integration tests:

- Newborn pickup, hazard, and Mom encounter;
- dialog pause, selection, resume, and save;
- High School choice to Education offers;
- Education credential to Career offers;
- doctor emergency callback;
- zero-score recovery;
- stage transition and full ending.

Automated browser checks:

- desktop landscape;
- phone landscape;
- narrow phone portrait;
- keyboard-only flow;
- touch-only flow;
- reduced motion and high contrast;
- tab hide/show pause;
- refresh during runner and immediately after a choice.

## 17. Accessibility requirements

- minimum 44 CSS-pixel touch targets;
- no timed dialog by default;
- readable text scaling without clipping;
- semantic HTML choices with visible focus;
- `aria-live` result and score announcements that avoid excessive chatter;
- icons and shapes in addition to color;
- visual equivalents for audio warnings;
- reduced scrolling, parallax, shake, and flashing in reduced-motion mode;
- one-hand touch layout;
- Story mode with longer warning distance;
- clear pause control and automatic pause on focus loss.

## 18. Balance and content rules

- No career may dominate all three scores over a complete life.
- Higher income normally introduces education cost, time pressure, health risk, or reduced autonomy.
- Happiness purchases cost Money; saving too aggressively may cost experiences.
- Preventing a health problem early may reduce earnings now but avoid a later penalty.
- A relationship can provide later support only if it received time or care earlier.
- Every severe penalty should offer a visible recovery route.
- Never tie morality or success to race, gender, family structure, disability, income class, or one career.
- NPC diversity changes names, art, context, and lived details—not the worth of outcomes.
- Friends shown together at school use the same age stage, even when their heritage, hairstyle, clothes, or body details differ.

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The copied code remains a renamed v5 game indefinitely | Label the scaffold honestly and require Phase 1 to introduce a separate runner entry architecture. |
| The old four-stat economy leaks into the new design | Build a new three-score state model and reject v5 saves. |
| Fast scrolling becomes unfair | Deterministic patterns, safe-route validation, reaction-time limits, and Story mode. |
| Choices become obvious good/bad buttons | Require meaningful immediate trade-offs and hidden-but-fair delayed consequences. |
| Dialog covers the player | Reserve layout space outside the playfield and test fixed viewport fixtures. |
| Character size changes during lane movement | Fixed stage bounds, shared foot anchors, and visual regression checks. |
| Art appears to float on backgrounds | Flat side view, common floor coordinates, shadow anchors, and no isometric props. |
| Too much content delays a fun build | Prove four non-adjacent stages before adding all careers and costumes. |
| Reload duplicates a consequence | Mark callbacks fired and persist before presentation. |
| GitHub Pages collides with v5 storage | Use only `choice-of-life-v1-*` keys and a separate project path. |

## 20. Commit and deployment discipline

Each phase should end with:

1. inspect the exact changed-file list;
2. run `npm run check`;
3. run `npm test`;
4. run `npm run build`;
5. run `git diff --check`;
6. commit one coherent milestone;
7. push through the SSH remote;
8. wait for the GitHub Pages workflow for that exact SHA;
9. verify the repository, live HTML, hashed assets, title screen, and browser console;
10. recheck that the v5 reference repository and site remain unchanged.

The deployment transport is intentionally split: Git pushes use SSH, while GitHub Actions builds and publishes the Pages artifact using GitHub’s Pages deployment service.

## 21. Definition of a finished first version

Choice of Life v1 is ready when:

- all 12 stages can be played from Newborn to Retirement;
- the player uses a fair three-lane, right-to-left runner loop;
- the HUD has exactly Health, Happiness, and Money;
- every stage contains one meaningful major decision;
- at least four decisions return as visible future callbacks;
- High School changes Education, and Education changes Career;
- a demanding career can pay more while costing Health or Happiness;
- marriage, children, university, and high income remain optional;
- no impossible obstacle pattern occurs in automated seeded tests;
- no choice UI covers the player;
- character scale and floor grounding stay consistent;
- save/resume preserves the deterministic life exactly;
- the ending names important people and recalls important decisions;
- the production site works from the GitHub Pages project path without console errors.

The plan should be revised only when a playtest produces evidence that one of these decisions harms clarity, fairness, accessibility, or replay value. New content should not be added merely because more assets are available.
