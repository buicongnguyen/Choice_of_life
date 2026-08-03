# Pixel Life Journey v5 — reviewed execution plan

## Provenance boundary

- V5 starts from the exact published v4 commit
  `fa8ad7775e61ad2b49639a9fa816bf53cf93606a`.
- The source was exported into a fresh repository without v4 Git metadata,
  dependencies, build output, editor state or Claude state.
- Concurrent uncommitted v4 changes in `src/sprites.ts` and
  `CHARACTER-ANATOMY-REVIEW.md` remain owned by v4 and are intentionally absent.
- Sidewalk Iced Tea v3 is a visual reference only. V5 copies none of its PNGs,
  costumes, poses or implementation.

## Initial draft

1. Copy v4 into a new v5 folder.
2. Make characters cute in a style similar to the reference game.
3. Test the game.
4. Commit, publish and deploy v5.

## Plan-review findings

The initial draft was too broad to release safely. Independent review identified
five required corrections:

1. Freeze a reproducible source commit instead of copying a newly dirty worktree.
2. Isolate v5 saves, sound settings and playtest exports from v4 because every
   GitHub Pages project under `buicongnguyen.github.io` shares one localStorage
   origin.
3. Build an original character system; a copied sprite atlas cannot safely
   cover twelve life stages, four facings, poses, heritages and NPC kinds.
4. Require a representative prototype art gate before completing the renderer.
5. Add renderer, responsive and gameplay checks because the inherited tests cover
   rules and content, not visual output.

Compatible biographies, the one-time guide flag and the day/night preference stay
shared intentionally. Active lives, sound and local funnel data are versioned.

## Corrected phase plan

Every phase has a gate. A failed gate is fixed before the next phase begins.

### Phase 0 — Freeze the boundary

- Record source SHA and dirty-file boundary.
- Create a fresh-history v5 workspace from the published commit only.
- Confirm v4 remains unchanged.

Gate: the v5 tree contains no v4 `.git`, `node_modules`, `dist`, `.claude` or
uncommitted follow-up work.

### Phase 1 — V5 identity and persistence

- Update package, HTML, runtime title, README, design docs and live links.
- Rename v4 rule modules to v5.
- Change active save, funnel, sound and export namespaces to v5.
- Keep the relative Vite base and add tests to the Pages workflow.

Gate: no unintended v4 branding remains, and clean install, typecheck, tests and
build all pass.

### Phase 2 — Original visual target and prototype

- Create an original reference sheet using transferable appeal principles:
  compact bodies, large heads, rounded silhouettes, short limbs, friendly mouths,
  warm outlines, clear hairstyles and pose asymmetry.
- Prototype baby, child, adult man, adult woman and elder.
- Cover front, profile, back, idle, walk and seated/crawl cases.

Gate: the prototype reads as cute at real gameplay size and at preview zoom,
without copying distinctive assets or introducing clipping.

### Phase 3 — Complete character renderer

- Roll the approved geometry through all twelve life stages.
- Preserve both genders and four heritage selections. Retain outfit and NPC-role
  metadata so dedicated raster variants can be added without changing game
  state.
- Complete front/left/right/back, walk, sit, crawl, hair, skirt, cane, shadow and
  label alignment.
- Keep the existing public rendering API and foot anchor stable.

Gate: the complete preview matrix renders without exceptions, clipping, detached
parts or unreadable silhouettes.

### Phase 4 — Game regression and responsive QA

- Verify title/setup, movement, interactions, chapter transitions, partners,
  careers, homes, vehicles, biographies, family tree, time travel, touch controls,
  keyboard controls and save/reload.
- Check portrait, mobile portrait and mobile landscape at DPR 1 and 2.
- Check labels, focus rings, depth sorting, door/station overlap and performance.

Gate: automated renderer checks, typecheck, tests, build, browser smoke paths and
console inspection all pass.

### Phase 5 — Review and fixes

- Review the implementation against the visual rubric and the full diff.
- Fix every high/medium finding and any regression.
- Audit bundles, generated files, secrets, storage names and remaining v4 strings.

Gate: `npm ci`, `npm run check`, `npm test`, `npm run build` and
`git diff --check` pass from a clean dependency state.

### Phase 6 — Publish

- Create public repository `buicongnguyen/pixel-life-journey-v5`.
- Enable GitHub Pages with `build_type: workflow`.
- Push only the reviewed release to `main`.
- Wait for build and deploy jobs at the exact pushed SHA.

Gate: GitHub Pages reports workflow mode and HTTPS, the live HTML/assets return
200, the game starts without console errors, and v4 remains live and unchanged.

## Character acceptance rubric

- Adult head-to-height ratio targets roughly 0.30–0.33 (about 3.0–3.3 heads).
- Children and babies are progressively rounder without becoming caricatures.
- The face reads at 1×: two clear eyes, small nose, visible friendly mouth and
  restrained blush.
- Limbs are short and soft; joints never read as mechanical balls or bands.
- Front, profile and back silhouettes belong to the same character.
- Movement holds the correct directional silhouette and adds restrained body
  bounce/lean. A four-beat limb cycle requires a later animation-sheet pass.
- Heritage changes palette, hair texture and clothing—not facial worth or
  exaggerated anatomy.
- No runtime sprite or source asset is copied from the reference repository.

## Release acceptance

- Fresh local v5 repository on `main`, with only intended files tracked.
- `origin` points only to `buicongnguyen/pixel-life-journey-v5`.
- All automated and visual gates pass.
- Pages deploy SHA equals local `HEAD`.
- Live game and character preview load under the v5 project path.
- V4 HEAD and working-tree status match the recorded boundary.

## Post-release art correction

The first published v5 build passed its code gates but failed the visual gate:
the attractive generated sheet lived only in documentation while the live game
still called the procedural Canvas renderer. A single mixed cast sheet also
could not safely become a life-cycle atlas because it would change gender and
heritage while the player aged.

The reviewed correction therefore adds these gated phases:

1. Generate eight coherent atlas families: Western, Asian, Middle Eastern and
   Black/African diaspora, with male and female kept in separate files.
2. Give every family five age identities (baby, child, teen, adult, elder) and
   four dedicated directions (front, left side, back, right side).
3. Remove chroma by border-connected flood fill, find real inter-cell gaps,
   normalize every frame to a fixed transparent 256 px cell, mirror the rare
   duplicated profile into a true opposite view, and record reviewed foot
   anchors for asymmetric props.
4. Make the raster renderer primary for idle and movement. Await the selected
   gender pair before starting/resuming; retain the Canvas renderer for loading
   failure and for seated poses that have no generated source row.
5. Verify all 12 stages × 2 genders × 4 heritages × 4 facings, all eight PNG
   dimensions and 160 populated cells, plus setup previews, NPC rendering,
   movement, responsive layouts, production build and live GitHub Pages assets.
6. Commit and push only after an independent diff review and live-browser check.

Correction gate: no male/female atlas crossover, no front/back/profile
substitution, no clipped hair/shoes/accessories, no chroma holes or fringe, and
no art-style pop while walking.
