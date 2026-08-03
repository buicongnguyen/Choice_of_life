# Pet atlas assets

Version 5 uses two independent, ImageGen-authored pet atlases:

| Runtime asset | Identity | Runtime draw size |
| --- | --- | --- |
| `pet-atlas-dog.png` | Caramel-gold floppy-eared puppy, cream markings, red collar | 76 px |
| `pet-atlas-cat.png` | Slate-blue short-haired kitten, pale markings, coral collar | 72 px |

The dog and cat are separate illustrations rather than recolors of one shared
silhouette. Their species-specific ears, muzzle, paws, tail, seated pose, and
walk poses must remain recognizable when an atlas is regenerated.

## Runtime contract

Each checked-in runtime PNG is an 8-bit RGBA image measuring 1024 × 1024 px.
It is a 4 × 4 grid of 256 px cells with this exact topology:

| Row | Animation | Columns, in order |
| --- | --- | --- |
| 0 | `idle` | `front`, `left`, `back`, `right` |
| 1 | `walkA` | `front`, `left`, `back`, `right` |
| 2 | `walkB` | `front`, `left`, `back`, `right` |
| 3 | `sit` | `front`, `left`, `back`, `right` |

Every cell uses `[128, 236]` as its source-space ground anchor. The pet's
contact point sits on `y = 236`, while the sprite stays at least 5 px inside
every cell edge. The source art contains no cast shadow; the runtime draws the
contact shadow at the ground anchor.

`pet-anchors.json` records the topology and anchor for both species.
`src/pet-atlas-assets.test.mjs` guards the filenames, RGBA dimensions, grid,
anchor manifest, transparent safety inset, cell occupancy, approximately
190 px source height, transparent corners, magenta spill, and file-size
budget.

## Authoring and rebuild workflow

ImageGen produced the dog and cat as separate 4 × 4 storybook sprite sheets on
a flat magenta chroma background. No labels, grid lines, shadows, floor,
gradient, or magenta pet details belong in the authored sheets.

The local authoring-only files are:

- `src/assets/pets/source/pet-atlas-dog-chroma.png`
- `src/assets/pets/source/pet-atlas-cat-chroma.png`
- `src/assets/pets/source/pet-atlas-dog-rgba-full.png`
- `src/assets/pets/source/pet-atlas-cat-rgba-full.png`

The `source/` directory is intentionally ignored by Git. The `*-chroma.png`
files preserve the original ImageGen output; the `*-rgba-full.png` files are
the reviewed transparent intermediates.

To rebuild:

1. Run the ImageGen skill's `remove_chroma_key.py` on each chroma sheet with
   border auto-key sampling, a soft matte, despill, and overwrite enabled.
   Save the outputs with the `*-rgba-full.png` names above. Visually inspect
   all 16 cells and confirm there is no magenta edge halo.
2. From the repository root, run:

   ```powershell
   python scripts/build-pet-atlases.py
   ```

   The builder isolates all cells, keeps the main closed silhouette, removes
   transparent RGB noise, normalizes each pet to a 190 px source height,
   aligns the contact root to `[128, 236]`, and writes the two optimized
   runtime PNGs plus `pet-anchors.json`.
3. Validate the published assets:

   ```powershell
   npm test -- src/pet-atlas-assets.test.mjs
   ```

Only the normalized runtime atlases, anchor manifest, builder, and this
provenance document are release assets.

## Runtime loading and fallback

`src/storybook-pets.ts` loads the dog and cat with module-relative asset URLs,
checks for the expected 1024 × 1024 dimensions, maps direction and animation
to one atlas cell, and draws from the shared ground anchor. Loading is
non-blocking, and `warmStorybookPetAtlases()` can decode both assets ahead of
gameplay.

`drawStorybookPet()` returns `false` while an image is unavailable or if it
fails validation. `src/sprites.ts` then draws the existing procedural dog or
cat, so a slow or failed asset request cannot make a pet disappear.

## Visual review

Start the app and open:

```text
/avatar-preview.html?pets
```

The preview shows both species separately across all four directions, both
walk beats, and the true seated row, plus an animated sample at gameplay
scale. Review the preview after every atlas rebuild in addition to running the
asset test.
