# Choice of Life 2.0 — evaluation and redesign

Status: implemented on branch `redesign-3d` (2026-09-26). The last 2D build is
tagged `legacy-2d-final` (and `v1.0.0` for the original release).

## 1. Evaluation of the 2D build (1.x)

I played the live flow from the title through the middle-school stage and read
the stage, story and presentation code. The problems are structural, not polish.

### Art

| Finding | Evidence |
|---|---|
| No single art direction. | Detailed painted character sprites (ImageGen atlases, 197 MB of PNG sources) stand on flat CSS/canvas rectangles: a nursery with a road, trees and a pink band behind it; school buildings drawn as outlined boxes. |
| The game is a web page with a small game inside it. | The runner is a panel inside a form. Setup, save banners, "What this life remembers" ledgers and friend cards stack under it and push the play area off screen on a 720p display. |
| Nothing moves with weight. | Sprites slide; there is no camera, no lighting, no depth, no particles, no transitions between ages. |
| Colour is muted. | Beige page, pastel panels, grey-blue floors. It never looks warm or vivid. |

### Story

| Finding | Evidence |
|---|---|
| There is no protagonist and no question. | The player is "you" with no name, no family, no want. Nothing asks "what will happen?" |
| Nobody stays. | "Each school stage keeps its own unique, same-age friend": Leo, Chloe, Mei and Mateo each replace the last. A life story without recurring people has no stakes. |
| Choices are lifestyle quizzes, not dilemmas. | "Stay for a warm cuddle / Explore a gentle game / Choose a steady routine"; "Study hard: Money +7" for a child. Every option is pleasant, so none matters. |
| Callbacks are vague. | "Your old notes help the two of you recognize a familiar pattern." The player cannot connect it to anything they did. |
| No loss, conflict or humour. | The tone is uniformly soft. There is no rival, no storm, no goodbye. |
| System language leaks into the fiction. | "Encounters & consequences", "The deterministic starting state is saved", "Open runner laboratory (practice)". |

### Play

| Finding | Evidence |
|---|---|
| Three chapters in, the player has barely steered. | Childhood stages auto-advance ("The story moves automatically"). The encounter chapter is a list of buttons. |
| Twelve stages use four different interaction models. | Newborn runner, encounter form, auto-story childhood, adult form; each has its own view (650–2,400 lines). |
| The engineering is mostly scaffolding. | ~69k lines of TypeScript, of which the runner evaluation, oracle, replay and fixture-lock systems are larger than the game. Every push ran a 14-minute gate that still failed on its own exceptions. |

**Verdict:** refinement cannot reach the bar. The redesign keeps the product
constraints the owner set (three scores, lanes, trade-off choices, callbacks,
no game over, a written ending) and rebuilds everything else.

## 2. Product pillars for 2.0

1. **One life, one promise.** A named protagonist, a recurring cast, and a
   single dramatic question carried from the first chapter to the last scene.
2. **A living toy world.** Full-screen, vivid, warm 3D dioramas with a Mario
   Kart 8 quality bar: chunky bevelled forms, glossy colour, readable
   silhouettes, soft shadows, particles and animation in everything.
3. **Steer, then choose.** Every chapter is played: a three-lane runner with a
   jump, chapter-specific movement, companions that change play, and cinematic
   pauses for choices that are real trade-offs with named consequences.
4. **Remembered.** Every major choice is echoed later by name, and the ending
   is assembled from the people and decisions of this life.

## 3. Story — "The Marigold Promise"

**Hook (prologue, age 70).** Golden hour on the cliffs of Marigold Bay. An old
person climbs toward a lighthouse holding a rusted key. *"Fifty-nine years ago,
two kids buried a tin under this lighthouse and promised to open it together."*
The game then flashes back to the day you were born. The whole life is the road
back up that path, and the question is: **who will be standing at the lighthouse
with you, and what did you make of the life in between?**

### Cast

| Person | Role | Arc |
|---|---|---|
| **You** (default name Kai) | Named, pronouns and look chosen by the player. | Grows from baby to elder on screen, mid-run. |
| **Nana Pearl** | Retired lighthouse keeper, your grandmother. | Gives you your first spark; holds a secret about the light; dies in your teens and leaves a sealed letter in the tin. |
| **Mom (Rosa)** | Night-shift nurse. | Exhausted and loving; has a stroke in your forties. |
| **Dad (Theo)** | Runs a small boat-repair shed. | A storm wrecks it in your childhood; asks whether you'll take over; one last sail. |
| **Juno Park** | Your best friend from age 6; the tin partner. | Moves away at 13; struggles in the city; marries far away; the promise is hers too. Whether she makes it to the lighthouse depends on you. |
| **Biscuit** | A stray pup (if you take him in). | Runs beside you and fetches pickups; grows old; says goodbye when you're twenty. |
| **Dex Moreau** | Charming classmate who loves shortcuts. | Offers stolen exam answers, then a get-rich startup; loses everything in the storm years; maybe forgiven. |
| **Ms. Okafor** | Teacher, later director. | Your mentor if you earn it; offers the big promotion. |
| **Sam Rivera** | Met at a rainy bus stop. | Optional partner; a family is optional too. |
| **Lina** | A kid on the seawall with a broken kite, fifty years after Juno. | You become the grown-up who stops. |

### Chapters

Each chapter is one continuous run (about 2 minutes) through a single place,
with 3–5 story encounters and a keystone choice. The protagonist visibly ages
during the run.

| # | Chapter | Age | Place and light | Movement | Key beats |
|---|---|---|---|---|---|
| — | Prologue | 70 | Cliff path, golden hour | Walk | The promise; flash back. |
| 1 | **First Light** | 0→5 | Cottage on Gull Lane, warm morning | Crawl → toddle | Mom home from a night shift; your first word; **Nana's gift** (your spark). |
| 2 | **The Tin** | 6→11 | Marigold Bay harbour and town, bright noon | Run (+Biscuit) | Juno and the broken kite; the storm wrecks Dad's shed; a pup in the rain; **what goes in the tin** (your dream). |
| 3 | **Crosscurrents** | 12→17 | Coast road and boardwalk, golden afternoon | Bicycle | Juno moves away; Dex's stolen answers; **Nana's last summer** vs the finals; the light goes dark. |
| 4 | **Leaving Harbour** | 18→24 | Station, train, Brightwater city, morning | Run | **The fork** (university, shipyard, Dad's shop or the road); Juno broke in the city; Sam at the bus stop; Biscuit's last summer. |
| 5 | **The Climb** | 25→39 | Brightwater downtown, vivid noon | Rush-hour run (+Sam) | Okafor's offer; Dex's startup; Sam's question; Juno's wedding; **what you give your forties**. |
| 6 | **The Storm** | 40→54 | Storm over city and bay | Run against wind gusts | Restructuring; Mom's stroke; Dex soaked and broke; the doctor's chair; **save the light**. |
| 7 | **Golden Hour** | 55→69 | Summer lantern festival, sunset | Gentle walk | Lina's kite; the last shift; Dad's last sail; **the letter to Juno**. |
| — | **The Promise** | 70 | The lighthouse at dusk | Walk | Who is there; open the tin; Nana's letter; the Book of Life. |

### Consequences that pay off by name

- **Your spark (ch. 1) and dream (ch. 2)** mark matching later options with ★
  and shape your career. The ending compares what your eleven-year-old self put
  in the tin with the life you lived, without judging either.
- **Juno bond** accumulates from the kite, the bus stop, the letters, the
  couch, the wedding and the storm. At the lighthouse she is waiting for you
  ("You're late"), arrives breathless on the evening ferry, or sends her
  granddaughter with a letter.
- **Biscuit** changes play: he fetches nearby pickups until his goodbye.
- **Sam** as a partner absorbs one hazard every 20 seconds in chapters 5–7.
- **Juno's letters** become collectible golden envelopes if you promised to write.
- **Dex**: taking the answers makes him trust you with his startup; warning
  him earns an apology in the storm; forgiving him puts him at the festival.
- **The lighthouse** is saved by your campaign, bought by you, rescued by Juno
  if your bond is strong, or left dark behind a fence. The final scene shows it.
- **Nana's last summer**: staying with her unlocks the story of the storm of
  '71, which she repeats in her letter and you can pass on to Lina.

### Ending

The finale scene is assembled from flags: the lighthouse state, who stands at
the top (Juno, Sam, your child, Lina, Dex), what comes out of the tin, and
Nana's letter. The **Book of Life** then shows a life title (for example
*Keeper of the Light*, *The One Who Came Home*, *The Wanderer*), the three
final scores separately, one line per chapter, the people who mattered, and the
keepsakes found (3 hidden per chapter).

## 4. Play design

- **Camera:** a side-on 3D diorama. The protagonist runs left to right at the
  left third of the screen; time flows right to left, as in the original concept.
- **Lanes:** three depth lanes (near, middle, far). Up/Down or W/S or swipe to
  change lane; Space, tap or swipe up to jump (hop on the bike).
- **Pickups:** heart (Health), star (Happiness), green coin (Money); every seven of
  a kind make a point, and every 20 in a row lift your lowest score. **Keepsakes**
  (3 per chapter) float over low hazards (jump for them) and lift your lowest
  score. **Letters** appear if you promised to write, until Juno moves in.
- **Hazards:** themed per chapter and tagged with the score they cost (puddles
  and colds → Health, bills and broken things → Money, rain clouds and
  deadlines → Happiness). Low hazards can be jumped (and cost 1); tall ones
  must be dodged (and cost 2). Every generated row leaves at least one safe
  lane, and the walk-up to every person is clear.
- **Encounters:** the person appears ahead; the world slows, hazards clear,
  the camera dollies into a two-shot, letterbox bars slide in, and the choice
  cards show immediate effects plus a one-line hint. Time never runs out.
- **Life's weather:** Health drifts down from chapter 5 on; the teen years, the
  climb and the storm also weigh on Happiness; work adds Money in chapters 5-7.
- **No game over:** a score reaching 0 triggers a one-time recovery scene
  (a named person steps in) and resets it to 30.
- **Assist:** Relaxed / Standard / Brisk pace; reduced motion; large text.
- **Balance** (game/src/game/balance.probe.ts, 40 lives): a skilled runner ends
  around Health 69, Happiness 79, Money 61; a casual one (missing a fifth of the
  hazards) around 42/57/36; nobody pins at 0 or 100.

## 5. Art direction

- **Bar:** Mario Kart 8 style stylised quality, used as a quality bar only (no
  copied designs). Chunky toy forms, soft bevels on every edge, glossy saturated
  PBR, big readable silhouettes, dense dressing.
- **Palette:** coral `#ff6b4a`, marigold `#ffb627`, sea teal `#12a5b8`, deep
  ocean `#0b6e8a`, leaf `#5cc639`, berry `#e8416f`, sky `#6ec8ff`, cream
  `#fff1d6`. Shadows lean blue-violet, light leans warm. Beige is an accent, not
  a base.
- **Characters:** chibi proportions (head ≈ 40% of height), glossy eyes with
  highlights, blush, simple brows and mouth. One parametric generator builds
  every person from named joints (`Hips`, `Torso`, `Head`, `ArmL`, `ArmR`,
  `LegL`, `LegR`) so the runtime can animate run, crawl, pedal, jump, wave and
  stumble procedurally. Recolourable materials are named `Skin`, `Hair`,
  `Top`, `Bottom`, `Shoes`, `Accent`.
- **World:** modular kits per place (cottage, harbour town, coast road, city,
  festival, lighthouse cliff) built in Blender by committed Python generators.
  Each place has a near dressing row, a mid backdrop, and far silhouettes
  (sea, hills, skyline, the lighthouse on its cliff as a constant landmark).
- **Light:** one warm key sun with soft shadows, a hemisphere fill, fog tinted
  to each chapter's sky, and per-chapter time of day. The storm chapter is dark
  teal with warm windows; vivid colour stays in the lights.
- **Effects:** pickup bursts, dust puffs, rain, wind leaves, lantern glow,
  confetti, the aging sparkle, the lighthouse beam.

## 6. Technology

- **Runtime:** Vite + TypeScript + Three.js. All GLBs are generated by Blender
  4.5 scripts in `art/` and committed to `public/models/`.
- **Logic** (`src/game/`) has no DOM or Three.js imports and is unit-tested:
  life state and effects, story data and conditions, the course generator (safe
  lane guarantee), runner collisions, recovery, ending assembly and saves.
- **Presentation** (`src/render/`, `src/ui/`, `src/audio/`): scene, chapter
  environments, character rigs, camera director, effects, HUD, dialogue,
  choice cards, title, pause and the Book of Life; procedural music and sound.
- **QA:** `?qa=1` exposes `window.__COL__` for an autopilot. A Playwright
  script plays the whole life on several routes and captures each chapter.
- **Deploy:** push to `main` runs typecheck, tests and build, then publishes
  to GitHub Pages.

## 7. Version 2.1 — evaluation and changes (2026-09-26)

Requested by the owner: a slower, easier run; three lanes that read clearly;
positive items that are unmistakable.

| Area | Finding | Change |
|---|---|---|
| Pace | Runs were 5.4–9.6 m/s; lanes came at the player too fast to read. | All chapter speeds halved (2.7–4.8 m/s). Chapters shortened by about 40% so each still lasts about 2.5 minutes, and the cleared walk-up to each person shortened to match. |
| Lanes | Only the coast road showed lanes, and its paint didn't match them (one yellow bike line, dashes on one side). Elsewhere lanes were invisible. | Every ground has two dashed dividers and edge lines at the true lane borders. The coast road is repainted as three equal lanes. A soft strip in a colour suited to each place shows the lane you're in. Wide hazards are scaled to fit inside one lane. |
| Good vs bad | Pickups were small and plain against busy floors. | Pickups are 30% larger, glow in their score's colour, sit on a matching coloured ring on the ground, and pulse. Hazards sit on a faint red patch. |
| Onboarding | Nothing told a new player what anything meant. | One-time tips: lanes, the first hazard, pickups, someone waiting, keepsakes, wind. People waiting ahead carry a "! Name" bubble. |
| Scores | Scores changed the ending but almost never the choices. | Seven options now need a score (e.g. the campaign needs Health 25; flying to Juno's wedding needs Money 12). Every scene always keeps at least one open option (tested at 0 and 100). |
| Low points | A player who was struggling saw nothing different. | "Someone Notices" (chapters 4 and 5): if a chapter starts with Happiness under 42, the person closest to you (Sam, Juno, Mom or Dad) asks how you really are. |
| Family | Choosing a family (Mika) had no scene of its own. | "Mika's Crossroads" (chapter 6): Mika wants the road you didn't take; what you say comes back at the lighthouse. |
| Grief | Mom and Dad's deaths ignored whether you'd been there. | The chapter 7 outro now reflects whether you moved home or lived nearby. |
| Feedback | Summaries showed numbers only. | Chapter summaries add "How you're doing" lines for very low or high scores. The pause menu has "Your life so far": the people (with hearts) and recent memories. |

Balance at the new pace (balance.probe.ts, 40 lives each, seven pickups per
point): skilled runner Health 63, Happiness 76, Money 54; casual 47/62/36;
idle 25/37/30. Nobody pins at 0 or 100, and eleven different life titles appear.

## 8. Version 2.2 — interface redesign (2026-09-30)

Requested by the owner: a well-designed interface on the title, settings and every in-game screen,
especially on phones, using Blender for AAA-quality art. (The game has no shop; Money means financial
security, so a shop was not invented.)

**Approach.** Blender renders the art (a 3D toy logo and 22 icons on bevelled coin badges, plus renders of
the real pickup models), while buttons, text and panels stay live HTML/CSS. Images of buttons would blur on
high-density phones, could not reflow for Larger Text or narrow screens, and would be invisible to screen
readers.

| Screen | Problem found (phone) | Change |
|---|---|---|
| Title | CSS text logo; keyboard hints on touch phones; tagline hard to read over the lighthouse | Blender logo; full-width stacked buttons with icons; tagline on a frosted panel; touch-aware hint line; landscape two-column layout |
| Create | "Begin" hidden below a long scroll; keyboard popped up on phones; 30–38 px swatches and chips | Bottom sheet with sticky Back/Begin bar; no auto-focus on touch; 44 px swatches and chips; radio semantics; camera frames the character above the sheet |
| HUD | Chapter label and companion chip overlapped the scores; emoji and text-glyph icons | Scores, chapter pill and companion chips in one tidy column; rendered icons; 56 px pause button |
| Touch controls | ▲▼⤒ glyphs; tips covered the buttons | Rendered 68 px lane/jump buttons; tips sit above them |
| Conversations | Tips and "Oof" toasts showed through; scores peeked under the cinema bars; landscape prompt cut off | HUD messages cleared in story mode; scores shown small beside the title; landscape choices in a scrolling card row |
| Settings / pause | Bottom buttons fell off a landscape phone; small toggles | Bottom sheet (portrait) or two-column sheet (landscape); whole-row switches with icons; close button |
| Journal, summary, letter, book | Plain text chips | Icon chips, sheet layout with fixed action bar, letter bounded to the screen |

Every screen is checked by `game/tests/ui-audit.mjs` at 390×844, 360×640, 844×390 and 1280×720 for
off-screen or overflowing elements and touch targets under 40 px.

**Review fixes shipped with 2.2.**

- *Logic:*
  - Chapter 4's first keepsake and first letter always landed on the same spot. Collectibles now reserve their places in turn.
  - Obstacles no longer land on top of pickups.
  - Saves remember which course layout their position belongs to. A save from an older layout resumes before the next unplayed scene instead of skipping it, and a chapter can't end while a scene is still pending.
  - "Someone Notices" now fires when a chapter starts with Happiness under 55, or 10 lower than the previous chapter's start. It fired for 6 of 80 skilled, 24 of 80 casual and 75 of 80 idle chances in the probe. In chapter 5 it now comes after Sam's question, so a partner can be the one who notices.
  - Score locks were raised to where they actually matter. For example, doing both at Nana's bedside needs Health 58, and a year on the road needs Money 38.
  - First-time tips are no longer used up invisibly during the prologue, and the prologue and finale lights don't change scores.
  - Summary and journal lines only say what is true for this life.
- *UI:*
  - The creation camera uses the same breakpoint as the layout.
  - Portrait and landscape styles no longer overlap on 640×360 and 568×320 phones.
  - The title fits landscape screens as short as 300 px.
  - Toasts sit below the measured HUD.
  - Radio groups work with the arrow keys and are a single Tab stop.
  - Keyboard focus is visible on the selected swatch.
  - Closing a dialog returns focus to the control that opened it.
  - Message dialogs stay inside the safe area.
  - Low-quality mode drops the live background blur.
