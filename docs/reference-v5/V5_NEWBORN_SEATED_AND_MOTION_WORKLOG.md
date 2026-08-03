# V5 newborn seating and character motion worklog

## User-reported problems

1. In the newborn stage, nearby family members changed into an incorrect
   seated image.
2. Moving left, right, up, or down reused one still picture, so the body did
   not visibly walk or crawl.
3. Male and female character art must remain clearly separated.

## Diagnosis

- The game already tracks movement, four canonical facings, and a walk phase.
  The missing body motion was an atlas limitation, not an input or movement
  bug.
- Neutral character atlases contained only one image per age and direction.
  Runtime animation added a small translation and tilt to that same image.
- Generated Storybook characters rejected `pose: "sit"`. Nearby newborn-stage
  family members therefore switched to the older procedural renderer, changing
  their face, outfit, proportions, and visual style.
- A focused stationary NPC was also treated as `moving`, so merely walking
  close to a person could make them bob.

## Reviewed implementation plan

1. Keep the approved neutral character atlases unchanged.
2. Generate gender-separated motion companions for every heritage:
   Western, Asian, Middle Eastern, and Black / African diaspora.
3. Cover all eight runtime age bands:
   baby, child, early teen, teen, young adult, adult, middle age, and elder.
4. Give every identity five new cells:
   front step/crawl, screen-left step/crawl, back step/crawl, screen-right
   step/crawl, and a genuine front-facing floor-seated pose.
5. Normalize each generated cell to the existing `256 × 256` contract and
   preserve stable world-space ground anchors.
6. Alternate the approved neutral frame and new movement frame to make a real
   two-frame walk/crawl cycle.
7. Use the seated newborn cell while the baby is idle, then switch to the
   correct directional crawl cycle as soon as movement starts.
8. Route seated people to generated art instead of changing their identity to
   the procedural fallback.
9. Stop using NPC focus state as movement state.
10. Add an animated visual review page, exhaustive frame/anchor tests, asset
   population tests, and deployment verification.

## Image generation contract

- Mode: ImageGen stylized-concept production asset generation using each
  existing v5 atlas as a strict identity and style reference.
- Layout: `5 × 5` for base ages and `3 × 5` for expansion ages.
- Direction order: front, true screen-left, back with no visible face, true
  screen-right, then front floor-seated.
- Gender: one male-only or female-only sheet at a time; never mixed.
- Continuity: preserve age, skin tone, face, hair, facial hair when applicable,
  outfit, accessories, palette, and the warm outlined storybook-chibi style.
- Motion: limb positions must differ clearly from the neutral frame at small
  game size.
- Seating: newborns sit upright with visible legs; older characters sit
  cross-legged or with naturally folded legs. No chairs and no crouched or
  compressed standing substitutes.
- Cleanup background: flat `#FF00FF`, with no grid, labels, extra figures,
  overlaps, cropping, cast shadows, or copied Sidewalk Iced Tea assets.

A focused ImageGen edit pass used the matching neutral atlases as prop and age
references after visual review. It restored the Western elders' canes, kept
the Black male teen seated frame clean-shaven, and retained the adult's beard.
Only the corrected runtime output is shipped; pre-review sources remain in the
temporary working directory.

## Deliverables

- 16 runtime motion atlases: eight base and eight expansion.
- 320 generated motion/seated frames and 320 ground anchors.
- Motion-aware frame selection, preloading, and identity-preserving fallback.
- Animated `avatar-preview.html?motion` review matrix.
- Updated tests and character-asset documentation.

All source generations were copied to the working directory
`C:\Users\n\AppData\Local\Temp\pixel-life-v5-motion-sources`. They are not
shipped in the web build. Normalized runtime outputs are checked in under
`src/assets/characters/character-motion-*.png`; their deterministic anchor
manifest is `src/assets/characters/character-motion-anchors.json`.

## Validation and release status

Implementation and local validation are complete:

- 57/57 automated tests pass.
- TypeScript check and production build pass.
- `npm audit --omit=dev` reports zero vulnerabilities.
- All 16 PNGs have the exact expected dimensions, RGBA format, populated
  cells, clean chroma removal, and complete manifest coverage.
- All 256 movement cells retain 99.59%–100% of their matching neutral-frame
  visible height. Wide newborn side crawls receive vertical-only normalization
  after fitting horizontally, preventing the smaller-frame pulse without
  crossing the 5 px safety inset.
- Packed-sheet review confirms male/female separation, coherent age rows,
  canonical directions, back views without faces, genuine floor seating,
  age-appropriate facial hair, and visible elder canes where expected.
- Local browser review confirms visible neutral-to-motion body changes,
  stationary seated poses, idle newborn seating, four-direction crawling, and
  no console warnings or errors.

## Published release

- Released: 2026-07-26
- Feature commit:
  `76cdbe58bf32ca33dd34943ab4f9f26763e9c608`
- Successful GitHub Pages run:
  <https://github.com/buicongnguyen/pixel-life-journey-v5/actions/runs/30188068537>
- Live game:
  <https://buicongnguyen.github.io/pixel-life-journey-v5/>
- Live animated newborn review:
  <https://buicongnguyen.github.io/pixel-life-journey-v5/avatar-preview.html?motion&stage=0>
- Live elder prop review:
  <https://buicongnguyen.github.io/pixel-life-journey-v5/avatar-preview.html?motion&stage=11>
- Browser verification: public game and preview loaded successfully with no
  warnings or errors.
- Version 4 was intentionally left unchanged at
  `beaf362db5ef296e8d9c0faa0b209555e0691bc8`.
