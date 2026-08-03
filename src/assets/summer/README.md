# Summer character atlases

These original ImageGen assets provide visibly warm-weather adult characters
without modifying or replacing the existing storybook and occupation files.
All source sheets remain versioned under `source/` so the runtime atlases can
be rebuilt from a clean checkout.

## Runtime contract

- Heritages: Western, Asian, Middle Eastern, and Black / African diaspora.
- Genders: male and female in physically separate source and runtime files.
- One `2048 × 256` transparent PNG per heritage/gender identity.
- Cell size: `256 × 256`, with a five-pixel safety inset.
- Runtime columns:
  1. front neutral;
  2. screen-left neutral;
  3. faceless back neutral;
  4. screen-right neutral;
  5. front walking step;
  6. screen-left walking step;
  7. faceless back walking step;
  8. screen-right walking step.
- `summer-anchors.json` records the reviewed foot/root position for all 64
  cells. Motion roots are aligned to their corresponding neutral direction.

The standalone runtime API lives in `src/summer-characters.ts`. It does not
select a season or override a career uniform; gameplay decides when this
optional body is appropriate and can safely keep the normal avatar when an
atlas has not decoded.

## Authoring contract

Each `source/summer-{heritage}-{gender}-source.png` is one coherent adult
identity on a flat vivid-magenta screen:

- exactly two rows and four columns, with transparent visual gaps between
  figures;
- top row: front, true screen-left profile, faceless back, true screen-right
  profile;
- bottom row: a clearly different walking step in those same four directions;
- the same face, hair, skin tone, clothing colors, footwear, body proportions,
  and identity in every cell;
- short sleeves and a visibly short lower garment suitable for warm weather;
- full bodies with both feet present and no cropping;
- warm outlined storybook/chibi rendering consistent with the game;
- no text, labels, grid lines, logos, flags, watermark, floor, or cast shadow.

Male and female sheets are generated separately. A back view must never expose
a face, and left/right views must not be duplicated or mislabeled.

## Build and validation

From the repository root:

```text
python scripts/build-summer-character-atlases.py
```

The builder:

- preflights the exact eight-source set;
- removes connected and enclosed chroma and canonicalizes transparent RGB;
- detects the authored two-by-four grid from transparent gaps;
- normalizes each figure into a grounded `256 × 256` cell;
- matches every walking root and visible height to its neutral partner;
- rejects empty, undersized, floating, translucent, opaque-background, or
  magenta-contaminated cells;
- validates exact atlas dimensions, safety insets, transparent corners,
  opacity, all 64 anchors, and motion/neutral height ratios;
- stages the complete output set and publishes the anchor manifest last.

Generated runtime files are named
`summer-atlas-{heritage}-{gender}.png`.
