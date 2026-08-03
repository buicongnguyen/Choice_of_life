# V5 character appearance variety worklog

Status: complete and verified for the 2026-07-26 v5 release.

## Goal

Give players and NPCs visibly different storybook characters while preserving
the v5 rules that:

- male and female art always stays in separate source and runtime files;
- every identity has front, screen-left, back, and screen-right art;
- walking/crawling changes the body pose instead of sliding one still image;
- newborn and nearby family seating uses genuine sitting art;
- the same character keeps coherent hair, clothing, shoes, bags, and age
  progression when turning or moving.

## Review finding

The procedural fallback already calculated hair and clothing colors, but the
generated storybook renderer selected raster art only by heritage, gender, age,
direction, and pose. This meant those calculated colors never changed the
visible storybook character. Two people of the same heritage, gender, and age
therefore selected the same pixels and looked like clones.

Applying runtime color filters was rejected. Hair silhouettes, backpack straps,
handbags, canes, and shoes overlap the body differently in each direction and
pose, so filters or loose overlays would create mismatched edges. The reviewed
solution is a complete second identity named `alternate`.

## Reviewed implementation plan

1. Preserve the existing art as the `classic` appearance.
2. Generate one coherent `alternate` identity for all four heritages and both
   genders.
3. Generate eight age bands for every identity: baby, child, early teen, teen,
   young adult, adult, middle age, and elder.
4. Generate nine reviewed poses per age: four neutral directions, four
   walking/crawling directions, and floor-seated front.
5. Pack each heritage/gender into one `2304 × 2048` unified runtime atlas with
   `256 × 256` cells.
6. Add an explicit Classic/New style choice for boys and girls during player
   setup.
7. Persist the player's appearance and a per-life identity seed in save and
   rewind snapshots. Old saves normalize to Classic.
8. Assign NPC appearances deterministically so they never change during a
   render. The opening family deliberately includes both looks.
9. Add `avatar-preview.html?variants&stage=N` and
   `avatar-preview.html?motion&variant=alternate&stage=N` review routes.
10. Validate all cells, anchors, gender separation, directions, motion scale,
    seating, save migration, build, tests, and browser rendering.

The plan originally considered a third complete identity. Review reduced this
release to Classic plus Alternate because every additional full identity adds
another 576 reviewed frames and a large decoded runtime image set. The two-look
architecture is extensible: future identities can use the same contract.

## Alternate visual direction

Every row below represents a gender-separated identity aging across the eight
bands. Clothing palettes also cover shoes and a backpack, messenger bag,
satchel, handbag, or tote where age-appropriate.

| Identity | Hair progression | Wardrobe direction |
| --- | --- | --- |
| Western male | side tuft → tousled crop → sporty crop → wavy undercut → quiff → tidy side part → gray-templed side part → swept silver | sky blue, mustard/forest, rust/navy, olive, burgundy; rust backpack, teal messenger, tan satchel |
| Western female | side pony/twin braids → bob → high pony → shoulder waves → low bun → layered gray-streak bob → silver bob | coral, teal, mustard, lavender, plum, sky blue, burgundy, forest; coordinated backpacks and handbags |
| Asian male | side fringe → bowl fade → cropped layers → undercut → side part → gray-templed crop → silver style | jade, saffron, crimson, indigo; contrasting sneakers, backpacks, messenger bags, satchels |
| Asian female | side buns/twin braids → bob → high pony → waves → chignon → layered gray-streak bob → silver bob | coral, jade, gold, lavender, crimson, indigo; coordinated footwear and bags |
| Middle Eastern male | curly tuft → curly crop → tapered curls → curly fade → swept curls → tidy side part → gray-templed curls → silver curls | cream, teal/gold, rust, ochre, indigo, sand, forest; navy backpack, rust messenger, camel/brown satchels |
| Middle Eastern female | curly tuft → low curly ponytails → braided crown → side braid → shoulder waves → braided low bun → gray-streak bob → silver braided bun/bob | cream/coral/teal, rust, indigo, ochre, burgundy, forest; coral/navy backpacks, camel/leather bags, tote |
| Black male | coily puff → rounded afro/fade → high-top fade → twists → swept locs → textured taper → gray-templed coils → silver short afro | turquoise/gold, orange/teal, mustard/royal blue, burgundy, emerald, deep blue; yellow/red backpacks, navy messenger, tan/leather satchels |
| Black female | tiny coily puffs → beaded braids/puffs → braided ponytail → high box-braid ponytail → shoulder locs → braided bun → gray-accent twists → silver braided crown/bun | coral/turquoise/gold, yellow/teal, royal blue, emerald, violet, deep teal, plum; bright backpacks, navy messenger, camel/patterned handbags, tote |

## Runtime atlas contract

- Files: `character-appearance-alternate-{heritage}-{gender}.png`
- Heritage keys: `western`, `asian`, `middleEastern`, `black`
- Gender keys: `male`, `female`
- Size: `2304 × 2048`
- Cell size: `256 × 256`
- Rows: baby, child, early teen, teen, young adult, adult, middle age,
  elder
- Columns: front neutral, screen-left neutral, back neutral, screen-right
  neutral, front motion, screen-left motion, back motion, screen-right motion,
  floor-seated front
- Anchor manifest:
  `src/assets/characters/character-appearance-alternate-anchors.json`
- Builder: `scripts/build-character-appearance-alternate.py`

Generated chroma source sheets remain authoring material outside the repository.
The builder preflights all 32 sources before writing, removes connected and
enclosed chroma, normalizes motion height against neutral art, canonicalizes
side directions, and validates all 576 cells and anchors before publishing. It
backs up existing files, switches the manifest last, and rolls back handled
publication failures; rerunning is safe after an external process interruption.

## Image generation mode

The alternate sources use built-in ImageGen identity-preserving edit mode.
Each original source sheet supplies the exact grid and pose topology. Completed
alternate neutral art becomes the identity reference for its matching motion
sheet. Prompts preserve face, skin tone, heritage, age, and gender while
changing only the planned hairstyle, clothing palette, footwear, and bags.

Authoring output:
`C:\Users\n\AppData\Local\Temp\pixel-life-v5-variant-b-sources`

Repository output:
`src/assets/characters/character-appearance-alternate-*.png`

Prompt summary: preserve the source sheet's character identity, age, heritage,
gender, grid, directional anatomy, and pose topology; introduce the reviewed
hair progression and coordinated clothing, footwear, backpack, and bag palette;
use a flat magenta chroma background with no grid, captions, shadows, or
cropping; keep front, side, back, opposite-side, walking/crawling, and seated
views anatomically consistent, with no face visible from the back.

## Verification checklist

- [x] 32 alternate authoring sheets generated and visually reviewed
- [x] eight unified atlases packed
- [x] 576 alternate cells populated
- [x] all cells respect the five-pixel inset
- [x] no opaque chroma pixels
- [x] all motion heights stay within 0.98–1.05 of neutral
- [x] all 576 ground anchors recompute within the cross-runtime subpixel
      tolerance (`x ≤ 0.75 px`; `y` exact)
- [x] player Classic/New style setup works for boys and girls
- [x] old saves normalize to Classic
- [x] new saves and rewinds retain appearance and NPC identity seed
- [x] recurring NPC appearances derive from stable person identity
- [x] `npm run check`
- [x] `npm test` — 75 tests passed in the final release suite
- [x] `npm run build`
- [x] browser review of setup, variants, newborn crawl directions, animated
      motion, and seated states
- [x] no browser console warnings or errors in the game or preview

The final independent regression review found and resolved two additional
failure-path issues: failed atlas URLs now remain cached during rendering and
retry only at an explicit warm/retry boundary, and biography-author playback
restores its button when character art cannot load. The complete check, test,
and build gate passed again after both fixes.
