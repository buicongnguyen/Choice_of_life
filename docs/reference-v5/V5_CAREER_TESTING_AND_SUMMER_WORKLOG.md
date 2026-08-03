# V5 career testing and summer wardrobe worklog

## Release scope

This release combines three connected adult-life improvements:

1. Advanced Setup can start at any life chapter with an automatic
   age-appropriate IQ or a selected score from 40–160.
2. Six careers with reviewed occupation art become the player's in-room body
   from Career through Middle Age, including after a job change. Doctor and
   Nurse intentionally share the reviewed medical uniform set.
3. Post-University play gains a stable four-season visual cycle and reviewed
   short-sleeve summer characters.

These changes are released together because they share the Career flow:
starting at University with IQ 160 makes every job testable, selecting a
reviewed job changes the player's work outfit, and progressing through an
adult chapter makes the summer variation easy to inspect.

## Advanced starting IQ

- `Automatic` preserves IQ 60 for a newborn.
- A later-stage automatic start uses the age-appropriate expression of the
  newly rolled lifelong IQ ceiling instead of incorrectly keeping newborn IQ.
- A selected score becomes both current IQ and the lifelong ceiling. This
  prevents an explicit testing score from immediately drifting toward a random
  lower ceiling.
- The selector covers the live IQ range in five-point steps from 40 to 160.
- IQ 150 is the highest career requirement. The setup recommends IQ 160 for a
  University test because normal University effects can lower IQ slightly
  before the Career picker.

## Selected career outfits

Reviewed Doctor, Nurse, Fitness Trainer, Professional Dancer, Army Soldier,
and Farmer art is used for the player during Career, Marriage, and Middle Age.
Doctor and Nurse intentionally share the reviewed medical-scrubs atlas. The
chosen gender, heritage, direction, neutral/walking state, and walk phase are
passed to the exact occupation atlas. Unsupported jobs or heritages keep the
normal age-correct avatar rather than borrowing another identity.

The selected occupation already exists in save and rewind snapshots, so no save
schema migration was required. Resume warms the exact custom body before play.
A profession NPC is rotated away from the active player's complete
uniform/gender/heritage key so two pixel-identical representatives cannot share
one room.

## Stable adult seasons

Career, Marriage, and Middle Age are each divided into four equal,
age-derived quarters:

| Chapter progress | Season |
|---|---|
| 0%, below 25% | Spring |
| 25%–50% (including the exact halfway checkpoint) | Summer |
| More than 50%, below 75% | Autumn |
| 75–100% | Winter |

Age and chapter are already saved and rewound, so this calculation is stable
across reload and time travel without adding mutable seasonal state. It is not
tied to the real calendar, the day/night preference, animation time, or the
upper scenery that rotates every twelve seconds.

Keeping the exact 50% checkpoint in Summer ensures every supported life speed,
including the 4× sandbox pace, visibly reaches the summer wardrobe instead of
jumping directly from Spring to Autumn.

The HUD displays the current adult season. University and the later
Senior/Retirement chapters keep their existing age-specific bodies and do not
use this adult summer set.

## Outfit precedence and job safety

The render order is explicit:

1. A reviewed career uniform wins through Middle Age.
2. An eligible summer-casual body is used during the summer quarter.
3. The normal storybook avatar is the loading/error and policy fallback.

In the Career office, summer casual is limited to Artist, Entrepreneur, Junior
Developer, Software Engineer, and Staff Engineer. Medical, food-service,
trades, military, farming, fitness, dance, education, finance, law, management,
and executive roles retain appropriate workwear. In the off-duty Marriage and
Middle Age home chapters, every unillustrated job can use the summer body.

The occupation policy lists all 20 career IDs explicitly. A regression test
fails when a future career is added without choosing its wardrobe policy.

## Summer ImageGen assets

The built-in ImageGen workflow produced eight project-bound authoring sheets:

- Western male and female;
- Asian male and female;
- Middle Eastern male and female;
- Black / African diaspora male and female.

Each source is a separate `2 × 4` sheet on a flat magenta screen. The top row is
front, true left, faceless back, and true right neutral art. The bottom row uses
the same directions with a visibly different walking pose. Prompts required:

- one consistent adult identity and clothing palette across all eight cells;
- clearly short sleeves plus knee-length shorts or a knee-length skirt with
  visible lower legs;
- modest, practical, culturally respectful warm-weather clothing;
- physically separate male and female generations;
- compact warm storybook/chibi proportions matching the game;
- full bodies, correct profiles, faceless back views, and no text, grid,
  shadow, logo, weapon, or watermark.

The versioned sources live in `src/assets/summer/source/`. Running
`python scripts/build-summer-character-atlases.py` removes chroma, detects the
authored grid, aligns every neutral and walking root, and publishes eight
transparent `2048 × 256` runtime atlases plus `summer-anchors.json`.

Review routes:

- `avatar-preview.html?summer` — all eight identities, neutral and animated;
- `avatar-preview.html?summer&heritage=asian&gender=female` — all eight exact
  frames for one identity.

## Verification

- [x] TypeScript no-emit check
- [x] Starting-IQ boundaries and automatic/custom planning
- [x] Exhaustive 20-career summer policy
- [x] Season boundary and determinism tests
- [x] Career-uniform precedence tests
- [x] Eight source sheets and eight runtime atlases
- [x] All 64 atlas cells grounded, opaque, chroma-free, and directionally
  distinct
- [x] Real neutral-to-walking pixel differences in every direction
- [x] Preview matrix route
- [x] End-to-end browser review in the game
- [x] Full test/build pass (18 files / 166 tests)
- [ ] Commit and push to `main`
- [ ] GitHub Pages workflow and production verification
