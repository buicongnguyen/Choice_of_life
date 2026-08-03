# V5 character stage expansion worklog

Last updated: 2026-07-26

## Goal

Extend Pixel Life Journey v5 with more visually distinct life stages while
preserving the cute, original storybook-chibi direction established by the
gender-separated v5 character atlases.

The new art must keep male and female characters on separate sheets and provide
four unambiguous views for every added stage:

1. front;
2. screen-left profile;
3. back with no face visible;
4. screen-right profile.

## Reviewed gap

The prior v5 baseline had five art rows: baby, child, teen, adult, and elder.
This made middle school reuse the child art, university reuse the adult art,
and midlife reuse the same general adult art. The game therefore did not show
enough visual change through adolescence and middle age.

## Approved expansion

Add three focused rows without regenerating the stable base atlases:

- `earlyTeen`: age 12–14, used for middle school;
- `youngAdult`: age 18–22, used for university;
- `middleAge`: age 40–55, used for midlife.

Each heritage and gender gets its own 3 × 4 expansion sheet. This produces
eight sheets and 96 new directional frames:

- Western male and female;
- Asian male and female;
- Middle Eastern male and female;
- Black / African diaspora male and female.

## Generation method

The new raster art is generated with the built-in ImageGen workflow. Every
sheet uses its matching checked-in v5 base atlas as the identity and style
reference. The prompts require:

- one coherent identity and one explicit gender per sheet;
- the three age rows listed above;
- front, true screen-left, face-free back, and true screen-right columns;
- full bodies, consistent baselines, no clipping or overlap;
- original warm storybook-chibi illustration with rounded proportions,
  expressive faces, warm outlines, and textured shading;
- a flat chroma background, no labels, logos, watermarks, or copied
  characters.

Generated chroma sources are temporary working material and are not intended
for the deployed bundle. The normalized transparent runtime atlases are stored
under `src/assets/characters/`.

## Current progress

- The existing deployed v5 baseline is clean at commit
  `088ed23b6edef150cfd46d3cb682f0ea843a63a2`.
- The expansion contract and prompts have been reviewed.
- All eight gender-separated source sheets are generated and visually reviewed.
- All 96 cells are normalized into transparent `1024 × 768` runtime atlases.
- Post-resize chroma fringes are removed and 96 ground anchors are generated.
- Runtime selection, four-sheet heritage preloading, NPC aging, preview cases,
  tests, and documentation are integrated.
- An independent 96-frame visual review found no missing cells, wrong
  directions, face-visible back views, clipping, or release-blocking artifacts.
- Local tests, typecheck, production build, and browser QA pass with no console
  warnings or errors.
- All independent code, visual, and asset-pipeline findings are fixed and the
  reviewers approve release.
- The implementation is committed and pushed, GitHub Pages is verified, and
  the v4 repository and deployment remain unchanged.

## Implementation plan

1. Finish and visually review all eight source sheets.
2. Normalize each source into a transparent `1024 × 768` runtime atlas with
   `256 × 256` cells.
3. Repair any duplicated direction or residual chroma pixels.
4. Generate deterministic ground anchors for all 96 frames.
5. Extend runtime selection from five to eight age bands.
6. Map middle school, university, and midlife to the new expansion rows.
7. Preload the selected heritage's base and expansion male/female sheets.
8. Expand the character preview so the new ages are easy to inspect.
9. Add asset, mapping, gender-separation, direction, and anchor tests.
10. Run a clean install, full tests, typecheck, production build, and browser
    review.
11. Commit and push `main`, wait for GitHub Pages, and verify the live v5 URLs.
12. Confirm the v4 repository and deployment remain unchanged.

## Release targets

- Repository: <https://github.com/buicongnguyen/pixel-life-journey-v5>
- Game: <https://buicongnguyen.github.io/pixel-life-journey-v5/>
- Character matrix:
  <https://buicongnguyen.github.io/pixel-life-journey-v5/avatar-preview.html?matrix>

## Release verification

- Implementation commit:
  `baf1cd5a9b640d6ca23ba8ec0d1733087bd7101c`
- Successful implementation workflow:
  <https://github.com/buicongnguyen/pixel-life-journey-v5/actions/runs/30185180958>
- The live game, matrix page, preview JavaScript, and all new raster assets
  returned HTTP 200. The live preview bundle contained the middle-school,
  university, and midlife cases.
- In-app browser review showed the deployed matrix and game with no console
  warnings or errors.
- V4 remained clean locally and remotely at
  `beaf362db5ef296e8d9c0faa0b209555e0691bc8`; its Pages site continued to
  return HTTP 200.

This document is a documentation-only follow-up to the verified implementation
release. Its automatic Pages rebuild publishes the same tested runtime assets.
