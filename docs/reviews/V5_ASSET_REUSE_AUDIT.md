# V5 asset reuse audit

Reviewed against `C:\Users\n\source\repos\pixel-life-journey-v5` on 2026-08-09.

## Inventory result

- All runtime character, motion, stage-expansion, alternate-appearance, career, occupation, summer, and pet PNG atlases are byte-for-byte identical to V5.
- All nine copied Python atlas builders are source-identical to V5.
- JSON manifests are semantically identical; README differences are line endings only.
- Four V5 pet files absent from this repository are intentionally ignored authoring intermediates under `src/assets/pets/source/`, not runtime assets.

No image regeneration was needed. Rebuilding the PNGs would only reproduce the existing reviewed assets.

## Runtime usage review

| Asset family | Choice of Life usage after review | Difference from V5 |
| --- | --- | --- |
| Storybook base, alternate, motion, and stage expansion | Newborn, toddler encounters, childhood, education, runner, unsupported job/heritage fallback, and senior life | Reused directly |
| Career outfit atlases | 13 illustrated careers, Asian and Western, standard and summer | Reused directly; delayed loading now upgrades the temporary storybook fallback |
| Occupation atlases | Doctor, Nurse, Farmer, Dancer, Gym Trainer, and Army | Nurse intentionally shares V5's Doctor clinical atlas |
| Summer casual atlases | Jobless young-adult, adult, and middle-age summer models | Previously copied but unused; now selected |
| Pet atlases | Childhood and later-life cat/dog companions | Reused directly |
| V5 room and item drawing code | Newborn and runner moving-room stages | Reused and extended with nursery-specific item drawings |
| Narrative-stage scenery | Encounter, childhood, education, career, adult, and later-life interludes | Intentionally uses Choice of Life layouts rather than duplicating V5's room loop |

## Fixed review findings

1. Production property mangling renamed TypeScript access to imported JSON manifest properties while Vite's JSON keys stayed quoted. This made atlas lookups such as `MANIFEST.atlases["western-female"]` fail only after production minification.
2. A successfully drawn temporary storybook fallback was treated as the final asset. Career and occupation loading events were therefore ignored, so many existing V5 uniforms never appeared.
3. Nurse had no occupation-atlas mapping even though V5 represents nursing with its clinical Doctor sheet.
4. The gallery mixed Black and Middle Eastern bodies into a job-uniform comparison even though the reviewed V5 job atlases are authored for Asian and Western bodies. Those identities remain available in storybook characters and NPCs; the uniform comparison now uses supported bodies so it shows the promised outfit.
5. Summer-casual atlases were bundled in source but never selected at runtime.

## Production review result

- 58 of 58 gallery characters reached an atlas-ready state.
- 4 of 4 gallery pets reached an atlas-ready state.
- Front, left, right, back, and walking previews completed without pending asset fallbacks.
- Production title, gallery, and new-life setup navigation completed without console errors.
