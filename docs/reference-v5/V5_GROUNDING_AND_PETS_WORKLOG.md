# V5 Background Decision and Pet Worklog

## Final background decision

The generated heritage-specific environment experiment was reviewed in both
portrait and landscape layouts against the previously published v5 game.

It was rejected for this release because:

- the generated rooms were flatter and less colorful than the established
  procedural nursery, playroom, school, campus, office, home, and sunset scenes;
- painted furniture introduced perspective cues without matching collision
  geometry, which could make characters appear to stand on objects or float;
- preserving a safe walk plane required covering too much of each generated
  image, weakening the visual result further.

The final runtime therefore restores the established procedural backgrounds and
their original family-zone bounds. The generated environment images, loader,
grounding adapter, setup option, preview route, and related tests were removed.

## Pet art delivered

V5 now has separate storybook atlases for a dog and a cat. Each animal includes:

- front, left, back, and right directions;
- idle, two walking beats, and a seated pose;
- anchor metadata so the paws remain fixed to the gameplay ground point;
- transparent production PNGs generated from reproducible source tooling.

The source sheets used during atlas construction are ignored; only the compact
runtime atlases, anchors, README, and builder script are committed.

## Runtime integration

- The dog follows the player and chooses its facing from movement; the cat
  stays seated and turns toward the player.
- Dog and cat use independent atlas rows and never share character sprites.
- A pet can settle into a real seated frame rather than a transformed standing
  image.
- Existing saves remain compatible: missing facing data defaults safely.
- The procedural fallback pet renderer remains available if an atlas cannot
  load.

## Review routes

- `avatar-preview.html?pets` shows both species, all four directions, both walk
  beats, seated poses, and an animated gameplay-size sample.
- `avatar-preview.html?motion&variant=alternate&stage=0` reviews the newborn
  player movement set.
- `avatar-preview.html?variants&stage=5` compares classic and alternate male and
  female character atlases without mixing genders.

## Verification

The release is checked with:

```text
npm run check
npm test
npm run build
git diff --check
```

Browser QA passed for the restored procedural backgrounds in gameplay and the
complete directional dog/cat preview.
