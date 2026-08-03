# V5 storybook character atlases

These are original ImageGen assets made for Pixel Life Journey v5. No sprite,
costume, pose, or source image from Sidewalk Iced Tea is included.

## Runtime contract

- One neutral base file, one neutral stage-expansion file, and matching motion
  companion files per heritage and gender; male and female are never mixed.
- Base canvas size: `1024 × 1280`.
- Expansion canvas size: `1024 × 768`.
- Motion-base canvas size: `1280 × 1280`.
- Motion-expansion canvas size: `1280 × 768`.
- Cell size: `256 × 256`.
- Base rows: baby, child, teen, adult, elder.
- Expansion rows: early teen, young adult, middle age.
- Neutral columns: front, screen-left profile, back, screen-right profile.
- Motion columns: front step/crawl, screen-left step/crawl, back step/crawl,
  screen-right step/crawl, front floor-seated.
- Packed sprites retain a five-pixel safety inset. The renderer uses
  `character-anchors.json` to map each reviewed body/foot contact point to the
  world shadow, so bags, hair and canes do not make a character jump when it
  turns. Motion cells use `character-motion-anchors.json`; the four movement
  roots are aligned to the corresponding neutral frame, and seated roots are
  centered on the same world ground line.
- `character-frame-metrics.json` records the alpha-visible height of every
  packed frame. The renderer applies a small, uniform whole-frame correction
  only where a width-limited newborn crawl/profile source is shorter than the
  common directional target. The correction is capped at 10%, preserves the
  original head-to-body ratio, and does not alter the shadow, ground anchor, or
  gameplay footprint. All non-newborn directional frames remain at their
  authored size.
- The optional `alternate` appearance uses one unified `2304 × 2048` atlas per
  heritage and gender. Its eight rows are baby through elder; its nine columns
  are four neutral directions, four motion directions, and floor-seated front.
  `character-appearance-alternate-anchors.json` records all 576 roots. Classic
  and alternate are complete identities, not runtime color filters. The
  alternate builder also applies an explicit, exhaustive per-row side-direction
  repair map for source sheets whose neutral or motion profiles arrived
  reversed; it validates that corresponding neutral/motion head and upper-body
  patches match better than crossed left/right pairs.

The source generations used a strict five-row/four-column turnaround prompt:
one coherent identity aging through all five rows, with an orthographic front,
true profile, back-with-no-face, and opposite-profile view; full bodies,
direction-consistent hair/outfits/accessories, warm outlined storybook-chibi
rendering, an isolated flat chroma background, and no labels, grid, shadows,
watermarks, or copied characters.

Motion companions use the same identity references and a strict five-column
contract: a strongly different mid-step/crawl beat in all four canonical
directions plus a genuine floor-seated front pose. Newborns sit upright with
their legs visible; older ages sit cross-legged or with naturally folded legs.
The prompts explicitly forbid chairs, compressed standing poses, gender
ambiguity, duplicate directions, visible faces in back views, grids, labels,
cast shadows, and copied characters. Runtime animation alternates the reviewed
neutral frame with the generated motion frame, producing a real two-frame body
cycle instead of translating one still image. Shared motion rules keep that
cycle at the engine walk frequency, apply only a small grounded vertical bob,
and add movement/facing hysteresis so joystick jitter cannot make the body
rapidly swing between directions.

`scripts/build-character-atlases.py` packs the base sheets.
`scripts/build-character-stage-expansions.py` performs the same normalization
for the three-row expansion, including clearing enclosed chroma islands and
writing `character-stage-expansion-anchors.json`. The generated chroma sources
are working material and are intentionally not shipped.

`scripts/build-character-motion-atlases.py` packs both motion families, clears
the flat chroma key and unmistakable detached shadow fragments, normalizes
scale against the matching neutral age/direction, writes all 320 motion/seated
anchors, and validates every populated cell. Motion source generations remain
working material and are also intentionally not shipped.

`scripts/build-character-frame-metrics.py` measures every published classic
and alternate frame, validates the atlas dimensions and directional height
contract, then atomically writes the runtime metrics manifest. Run it whenever
an atlas is rebuilt so neutral and motion frames stay the same visible size at
every life stage.

`scripts/build-character-appearance-alternate.py` preflights the complete set
of 32 gender-separated alternate authoring sheets, normalizes neutral and
motion art, canonicalizes side directions, combines the eight age bands,
repairs the known row-level side semantics, validates every cell, anchor,
neutral/motion side pairing, and rendered head alignment before publishing,
backs up replaced files, and switches the manifest last. Handled publication
failures restore the previous set. The alternate chroma sources also remain
working material and are not shipped.
