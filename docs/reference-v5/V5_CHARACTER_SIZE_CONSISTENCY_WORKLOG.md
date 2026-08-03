# V5 character size consistency worklog

## Goal

Keep a character at one stable visual size while neutral and motion frames
alternate, preserve the reviewed ground contact, keep every life stage inside
its intended size range, and prevent a career or summer outfit from changing
the player's stature.

## Audit

- Measured all 1,152 cells in the 40 classic, expansion, motion, and alternate
  storybook atlases.
- Checked all 416 career neutral/motion pairs, 80 occupation pairs, and 32
  summer pairs.
- All non-newborn storybook directional cells and every career, occupation,
  and summer cell have a 246 px alpha-visible height inside their 256 px cell.
- Twenty-three newborn crawl/profile cells are shorter because their wider
  poses were fitted into square source cells. The shortest is 228 px, requiring
  a maximum 1.079x correction.
- Career and summer player bodies previously used a fixed 142 px destination
  square. The normal stage renderer uses 147.2 px at career/marriage and
  144.9 px at middle age, so changing clothes could visibly shrink the player.
- Uniformed NPCs and working parents used the same obsolete fixed size.
- A separate upper-silhouette review found that the standard Western female
  leadership motion source used larger heads and shorter bodies than its
  matching neutral identities.

## Implementation

- `scripts/build-character-frame-metrics.py` now builds a deterministic
  alpha-visible-height manifest for every storybook cell. It rejects atlas
  dimensions, row sets, or newborn frames that would need more than the
  renderer's reviewed 10% safety correction.
- `character-frame-metrics.json` is consumed by the storybook renderer.
- Directional frames below the common 246 px target receive one uniform X/Y
  scale. Heads and bodies are never stretched independently. Seated poses keep
  their authored scale.
- The corrected frame is drawn around its reviewed ground anchor, so feet or
  crawling contact remain fixed. Shadow size, walk bob, collision footprint,
  and gameplay coordinates remain stage-sized.
- Player career and summer outfits use the current life-stage destination
  size. Profession NPCs and parent uniforms use the age band declared by their
  generated job art. Nameplates use the same resolved body size.
- The Western female manager, analyst, lawyer, and CEO motion source was
  regenerated against its neutral identity sheet, with female identities,
  hairstyles, uniforms, accessories, four directions, and walking poses
  preserved while matching neutral head-to-body proportions. The deterministic
  career builder repacks that reviewed source into the runtime atlas.

## Regression coverage

- Recomputes every manifest value from the checked-in PNG alpha channel.
- Asserts the exact family row/column schema and the 1.00x-1.10x correction
  range.
- Verifies every stage, appearance, gender, heritage, facing, and neutral or
  motion phase reaches one effective 246 px source stature.
- Verifies maximum-correction and normal frame draw geometry remains square and
  pins the source ground anchor to the world root.
- Verifies all classic and alternate seated cells remain unscaled.
- Checks neutral and motion upper silhouettes against reviewed age ranges and
  pair tolerances without treating hair or arm pose as exact anatomy.
- Enforces exact 246 px source height for every career, occupation, and summer
  frame.
- Covers stage destination sizes from newborn through retirement.

## Image-generation prompt

Built-in ImageGen edit mode was used. The current motion sheet was the edit
target and the neutral sheet was the authoritative identity/proportion
reference. The final refinement requested smaller motion head/hair/face scale,
natural torso and leg length, preserved female presentation and career outfits,
the unchanged 4 x 4 direction contract, clear mid-step poses, and a flat
`#ff00ff` chroma background with no grids, labels, shadows, or extra objects.

## Verification status

- `npm run check` passes.
- All 23 test files and 236 tests pass.
- The production Vite build passes.
- Two alternating newborn animation phases were visually reviewed with stable
  stature and ground contact.
- The refined CEO neutral/motion matrix and a resumed middle-age game were
  visually reviewed with no browser console errors.
- Western female leadership neutral-to-motion upper-silhouette ratios now
  measure 0.94-0.98 across all four jobs.

This worklog is intentionally complete before any optional commit or
deployment.
