# Career outfit atlas contract

This directory is reserved for generated adult career wardrobes. Source images
belong in `source/`; no placeholder runtime art is checked in.

## Fixed matrix

- Packs and row order:
  - `service`: `teacher`, `chef`, `barista`, `athlete`, `artist`
  - `technical`: `generalengineer`, `softwareengineer`, `police`,
    `entrepreneur`
  - `leadership`: `manager`, `analyst`, `lawyer`, `ceo`
- Heritages: `western`, `asian`
- Genders: `male`, `female`, always authored and routed separately
- Seasons: `standard`, `summer`
- Pose sources: `neutral`, `motion`
- Source columns: front, true screen-left, faceless back, true screen-right

Every source is named:

```text
career-outfit-{pack}-{season}-{heritage}-{gender}-{pose}-source.png
```

It contains one row per job in its pack and exactly four columns. The complete
contract is 48 source PNGs. A neutral and motion source must depict the same
adult identities, body proportions, outfit colors, hair, and footwear.

## Runtime output

Run from the repository root:

```text
python scripts/build-career-outfit-atlases.py
```

The builder writes 24 files named:

```text
career-outfit-atlas-{pack}-{season}-{heritage}-{gender}.png
```

Each atlas is `2048 × (pack rows × 256)` RGBA. Every row has:

1. front neutral
2. screen-left neutral
3. back neutral
4. screen-right neutral
5. front motion
6. screen-left motion
7. back motion
8. screen-right motion

`career-outfit-anchors.json` records the fixed packs, uniform-to-pack/row
mapping, adult age band, dedicated-summer availability, runtime filenames, and
eight ground anchors for every atlas row.

## Authoring and review

- Use a flat chroma screen with clear gaps between every row and column.
- Draw healthy adults at consistent compact storybook/chibi proportions.
- Keep male and female bodies physically separate. Women should have a
  tasteful, visibly adult upper-body/waist/hip silhouette; men should have a
  visibly different shoulder/chest silhouette. Do not sexualize either body.
- Summer clothing must look warm-weather appropriate while preserving required
  safety wear for chefs, engineers, athletes, and police.
- Do not include text, logos, flags, weapons, floors, embedded shadows, grid
  lines, watermarks, or vivid-magenta garments.
- Keep both feet, hair, and all clothing inside every cell. Back views must not
  show a face, and motion frames must be real steps rather than shifted copies.

The builder removes connected and enclosed chroma, normalizes every figure into
a five-pixel safety inset, grounds feet at source-cell Y 251, aligns motion
torso roots to neutral roots, and rejects undersized, floating, translucent,
key-contaminated, duplicate-motion, direction-duplicate, or unstable frames.
It builds and validates the complete set in staging, atomically replaces each
runtime file, and publishes the manifest last.
