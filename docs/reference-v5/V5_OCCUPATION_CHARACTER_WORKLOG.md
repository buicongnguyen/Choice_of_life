# V5 occupation character worklog

## Scope

Add recognizable adult and middle-aged occupation characters for Asian and
Western settings, with male and female assets generated and stored separately.

The visual cast covers:

- doctor — middle-aged, medical coat, scrubs, stethoscope;
- fitness trainer — adult, practical athletic clothing and trainers;
- professional dancer — adult, fitted movement-friendly dancewear;
- army soldier — adult, neutral utility uniform and boots, no weapon or flag;
- farmer — middle-aged, work shirt, overalls, boots, practical hat, no tool.

## Product decision

The occupation figures began as career representatives in the career-choice
and career-move cards. They now also become the player's in-room character
during Career, Marriage, and Middle Age when the selected job has an exact
reviewed atlas. Senior and Retirement return to the normal age-correct avatar.

These atlases are complete characters rather than clothes-only layers, so the
temporary career look does replace the player's established face and hair.
Doctor and Farmer also use deliberately middle-aged representatives. A future
identity-preserving implementation needs modular clothing layers for every
appearance family; this release never substitutes an unrelated job, gender,
or heritage while those layers do not exist.

Four additional careers are added alongside the existing Doctor career:
Professional Dancer, Farmer, Fitness Trainer, and Army Soldier.

## Player career outfit behavior — 2026-07-26

- The selected reviewed occupation appears on the player immediately after
  career selection and after later job changes.
- It persists through Career, Marriage, and Middle Age, inclusive.
- It is derived from the saved occupation, so save/resume and rewind restore
  the correct historical career without a save-schema change.
- Direction, neutral/moving pose, and walk phase use all eight atlas frames.
- Male and female art remain explicitly separate.
- Asian and Western art remain explicitly separate.
- Nurse intentionally shares the reviewed medical-scrubs atlas with Doctor;
  its career label, history, salary, and gameplay remain independently Nurse.
- Careers without exact outfit art retain the normal player avatar rather than
  borrowing a visually different profession.
- Black and Middle Eastern players retain their normal avatar rather than
  borrowing another heritage.
- A profession NPC never receives the same full uniform/gender/heritage atlas
  as the active player, so two pixel-identical people cannot share the room.

## Asset separation

Every runtime filename contains all three independent visual dimensions:

```text
occupation-atlas-<job>-<heritage>-<gender>.png
```

This makes Asian/Western and male/female substitutions explicit and testable.
There is no mixed-gender source or runtime sheet.

## Image generation

Built-in ImageGen was used for eight project-bound source sheets:

- Western male neutral and walking;
- Western female neutral and walking;
- Asian male neutral and walking;
- Asian female neutral and walking.

The normalized prompt set required a polished cute storybook/chibi style with
compact 3.5–4-head adult proportions, large expressive eyes, mature anatomy and
age cues, exact `4 × 5` topology, consistent identities and uniforms between
directions and motion states, a flat removable magenta backdrop, empty hands,
full-body framing, true profiles, faceless back views, and no text or embedded
shadows. The Western male sheet is the explicit visual proportion reference
for the other three identity sets. The eight source sheets are versioned so
the builder works from a fresh clone.

## Runtime and review

- Twenty lazy-loadable transparent atlases avoid one very large decoded image.
- Each atlas has four neutral directions and four real walking poses.
- Source-grid bands are detected from transparent gaps, so uneven ImageGen row
  spacing cannot crop feet or leak one occupation into the next.
- Career cards render the selected player's gender and heritage when an Asian
  or Western occupation atlas exists; other heritages keep the safe emoji UI.
- The `?occupations` preview route reviews the whole cast.
- `?occupations&job=<job>` reviews all eight frames for one occupation.
- Atlas extraction removes components that touch the top edge of a source
  cell, preventing shoes or other fragments from the preceding job row from
  appearing above the next character.

## Verification checklist

- [x] TypeScript check
- [x] Occupation catalog and frame-routing tests
- [x] Twenty-file RGBA atlas integrity tests
- [x] Production build
- [x] Browser review of all five overview rows
- [x] Browser detail review for every occupation
- [x] Career picker review for Asian male/female and Western male/female

## Character integrity fixes — 2026-07-26

### Clothing transparency

The earlier atlas builders treated any pixel broadly similar to the chroma
background as removable. That could erase real pink, purple, green, or burgundy
clothing when those colors appeared inside the character.

The builders now:

- flood-fill only the near-flat background connected to a cell border;
- expand through a tightly bounded two-pixel antialias fringe;
- remove isolated chroma specks only when they are extremely close to the
  sampled background color;
- preserve enclosed garment colors instead of applying a global broad-color
  deletion.

All base, added-stage, alternate-appearance, walking, and occupation atlases
were rebuilt from their intact source sheets. Regression tests measure opaque
silhouette area in the previously damaged character cells and explicitly
protect the burgundy Asian dancer uniforms.

### Left/right walking stability

Neutral alternate sheets and walking source sheets use different source-column
orders. Applying one column swap to both made several walking profiles face the
wrong way, while missing source profiles also produced duplicate side views.

The alternate builder now has independent neutral and motion direction maps,
repairs only the reviewed missing side profiles by mirroring the valid opposite
profile, and calculates each walking frame's anchor from the matching neutral
character's upper-body root. The classic and occupation motion builders use the
same stable-root method. Tests reject duplicate left/right motion and any
manifest anchor that drifts from the calculated torso root.

### Same-age school friends

School and campus peer roles now render at exactly the player's current life
stage for toddler, preschool, elementary school, middle school, high school,
and university. Existing saves with older fixed friend-age values are clamped
at display time, so they also show a same-stage friend.

Peer heritage is selected independently with a stable seed across Western,
Asian, Middle Eastern, and Black character sets. Family roles still inherit the
player's heritage. This allows racially varied classmates without making them
look older or younger than the player.

### Verification

- [x] 105 Vitest checks
- [x] TypeScript no-emit check
- [x] Production build
- [x] Generated-asset whitespace check
- [ ] Commit, push, and GitHub Pages deployment (not requested in this fix pass)

## Interaction reactions and risky-role readability — 2026-07-26

### Social reaction state

Successful person and gift interactions now start a dedicated 1.35-second
render-only reaction. It identifies the selected NPC and alternates the player
and NPC between talking, smiling, wary, and stern beats as appropriate. It is
not inferred from proximity, focus, the global banner, or action cooldowns, so
only the person who was actually activated reacts.

The reaction is never stored in a save or rewind snapshot. It expires
automatically and is cleared on a stage change, new life, rewind, missing
target, or non-playing mode. Reduced-motion users receive one static,
face-adjacent reaction mark instead of the animated cycle.

### Why the cue sits beside the face

The generated storybook characters are flattened raster frames with reliable
foot anchors but no reviewed eye or mouth landmarks. Painting a generic mouth
over those pixels would mismatch skin gradients, glasses, facial hair, ages,
and poses. The safe implementation therefore uses a tiny smile/talking emote
beside the face while preserving every original atlas pixel.

### Risky social roles

Role styling is independent of gender, heritage, age, and body shape:

- smoker friend — subdued grey pressure/smoke wisps and an amber name;
- gangster — dark warning sunglasses, a small red chevron, and a stern cue;
- playboy — a restrained gold chain/spark accent and an amber name.

No weapons, tattoos, skin-tone changes, culture-coded clothing, or body-size
stereotypes are used. Role cue and behavior disposition remain separate, so a
risky social choice does not automatically become a physically chasing enemy.

The `?interactions` preview route shows paired player/NPC reactions across all
four heritages. `?interactions&phase=0` and `phase=0.4` freeze the two main
animation beats for review.

### Verification

- [x] 110 Vitest checks
- [x] TypeScript no-emit check
- [x] Production build
- [x] Browser review of both animation beats across all four heritages
- [ ] Commit, push, and GitHub Pages deployment (not requested in this pass)
