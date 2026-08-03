# V5 Parent Careers and Seasonal Job Outfits

## Goal

Extend the released v5 game with these thirteen explicitly illustrated careers:

1. Teacher
2. Chef
3. Barista
4. Athlete
5. Entrepreneur
6. Engineer
7. Software Engineer
8. Manager
9. Financial Analyst
10. Artist
11. Police Officer
12. Lawyer
13. CEO

Mother and Father receive independent job selectors in Advanced life setup.
Their selected jobs are visual family details only: they do not change the
family fund, yearly parent support, player perks, salary, IQ, or balance.

Every new job wardrobe has:

- physically separate male and female artwork;
- standard and summer workwear;
- front, screen-left, back, and screen-right views;
- a real walking frame for all four directions;
- grounded, healthy adult proportions;
- a modest but visibly feminine adult upper-body silhouette for women and a
  broader, straighter adult upper torso for men.

## Repository audit

The existing catalog has 20 occupations. Ten requested roles already exist:
Teacher, Chef, Barista, Entrepreneur, Software Engineer, Manager, Financial
Analyst, Artist, Lawyer, and CEO. The existing stable id `engineer` already
means Software Engineer and must not be renamed because saved lives and career
history store occupation ids.

Three careers are genuinely new:

- `athlete`
- `generalengineer`
- `police`

The previous occupation-art system has five complete-body uniform families
(medical, trainer, dancer, soldier, and farmer), four directions, and two
walking beats. It supports Asian and Western identities only. Unsupported
heritages deliberately keep their exact normal storybook character rather than
borrowing a different heritage.

The generic summer system is off-duty clothing. A reviewed job uniform currently
wins over it, so summer job outfits require an explicit occupation season rather
than another fallback rule.

Parents previously had no career state. They are room options, independent of
the editable family-tree graph, and appear until the Middle Age chapter.

## Reviewed implementation plan

### Phase 1 — data and compatibility

- Extend `JobUniform` with thirteen exact wardrobe ids.
- Add Athlete, general Engineer, and Police Officer without changing existing
  occupation ids.
- Map related existing roles to the closest exact new wardrobe (for example,
  Junior Developer and Staff Engineer use the Software Engineer wardrobe;
  Accountant uses the Financial Analyst wardrobe).
- Keep save format version 5 and the existing local-storage key.
- Store an optional `parentCareerIds` object with independent `mother` and
  `father` occupation ids in every snapshot. Missing or invalid legacy values
  normalize to `null`.

### Phase 2 — parent setup and runtime

- Add separate Mother job and Father job selects to Advanced life setup.
- Never infer either parent gender from the player:
  Mother is always female and Father is always male.
- Preserve the player's exact heritage. Asian/Western use reviewed job art;
  Middle Eastern/Black safely retain standard storybook art.
- Decorate both authored and automatically injected parent room options with
  the selected profession.
- Preserve the seated standard parent pose when comforting a newborn because
  occupation atlases do not have a seated frame.
- Save, reload, and rewind both parent job ids.
- Expose parent jobs in the debug state for browser verification.

### Phase 3 — scalable artwork

The rejected naive plan was 13 jobs × 2 heritages × 2 genders × 2 seasons =
104 separate runtime files, before retaining the original five jobs. The
first production generation review showed that a seven-row source could
silently omit a requested role. The corrected plan therefore packs the new
wardrobes into three independently lazy-loaded atlases at the proven four/five
row density:

- `service`: Teacher, Chef, Barista, Athlete, Artist
- `technical`: Engineer, Software Engineer, Police, Entrepreneur
- `leadership`: Manager, Financial Analyst, Lawyer, CEO

For each Asian/Western and male/female identity:

- one neutral and one motion source for each pack and season;
- one packed runtime atlas for each pack and season;
- exact per-row/per-frame ground anchors in a manifest.

This produces 48 source sheets but only 24 packed runtime atlases. Each job row
keeps one identity consistent across its four directions and its matching
neutral/motion and standard/summer companions. Role-specific hair and wardrobe
variation also helps the randomly selected adult profession cast read as
different people.

Summer safety:

- short sleeves and lighter fabrics where appropriate;
- shorts or knee-length bottoms for Athlete, Barista, Artist, and casual office
  roles;
- closed shoes and required protection remain for Chef, Engineer, and Police;
- no weapons, flags, logos, text, watermarks, cast shadows, or transparent
  garment colors.

### Phase 4 — engine and preview

- Add `standard | summer` to occupation frame selection and lazy loading.
- Use Summer job art during the Summer quarter for the player, parents, and
  profession NPCs.
- Keep the original five uniforms on their existing standard art until a
  separately reviewed seasonal source exists.
- Expand the adult random profession cast with the thirteen requested roles.
- Reserve player and parent visual identities so a random NPC does not become
  a pixel-identical clone.
- Add filtered occupation preview modes for standard and summer art; verify
  selected parent pairs inside the actual setup and game room.
- Improve the deterministic Canvas fallback so an adult female and adult male
  do not share the same flat torso geometry if an image fails to load.

### Phase 5 — verification and release

- Catalog and parent-career unit tests.
- Exhaustive uniform/season/gender/heritage/direction routing tests.
- Asset tests for dimensions, alpha, chroma-key cleanup, grounding, genuine
  walking differences, and standard/summer differences.
- Legacy-save, reload, rewind, and visual-only economy invariants.
- Browser review at desktop and mobile sizes:
  setup selectors, both parent genders, same-job parent/player combinations,
  newborn seating, job changes, Summer checkpoint, four-way movement, preview
  sheets, console, and failed requests.
- Run TypeScript, all tests, production build, and diff checks.
- Commit intentionally, push `main`, wait for the exact GitHub Pages workflow,
  and smoke-test production URLs with the released commit SHA.

## Image-generation contract

Built-in ImageGen is used in `stylized-concept` mode with existing v5 source
art as a style-only reference. Female sheets are independently authored; no
male body is reused as their silhouette reference.

Every source prompt requires:

- original cozy storybook/chibi adult game character art;
- healthy upright adult proportions, approximately 3.5–4 heads tall;
- one consistent face, hairstyle, body, skin tone, and apparent age across all
  directions and companion sheets for each job row;
- exact row order and exact four-column direction order;
- full bodies with shoes visible and generous cell separation;
- perfectly flat solid `#ff00ff` chroma-key background;
- no grid, labels, text, logos, watermarks, floor, shadows, reflections, or
  background objects.

Female contract:

- unmistakably adult and healthy;
- tasteful visible bust, waist, and hip shaping in front and side views;
- practical professional fit, no cleavage or exaggerated anatomy.

Male contract:

- unmistakably adult and healthy;
- broader shoulders and a straighter, flatter chest;
- no bodybuilder exaggeration.

## Progress

- [x] Repository, architecture, asset, test, and deployment audit
- [x] Independent plan review and revised packed-atlas design
- [x] Data/catalog and parent persistence
- [x] Parent setup and room rendering
- [x] Source generation and deterministic atlas build
- [x] Runtime season routing and preview
- [x] Automated and visual verification
- [ ] Commit, push, GitHub Pages deployment, and production smoke test

## Completed verification

- Accepted authoring art: 48 source PNGs in
  `src/assets/career-outfits/source/`.
- Published runtime art: 24 transparent packed atlases and 832 anchors in
  `src/assets/career-outfits/career-outfit-anchors.json`.
- TypeScript: `npm run check` passed.
- Automated tests: 22 files and 223 tests passed.
- Production build: `npm run build` passed and included all 24 hashed career
  atlas assets without copying authoring sources into `dist/`.
- Browser review passed the Advanced setup selectors, IQ 160 all-job catalog,
  separate male/female and Asian/Western packs, all four directions, genuine
  motion frames, standard/summer differences, selected parent labels/outfits,
  reload persistence, newborn seated fallback, and error-free console.
- Review URLs:
  - `avatar-preview.html?occupations&pack=service&season=summer`
  - `avatar-preview.html?occupations&pack=technical&season=summer`
  - `avatar-preview.html?occupations&pack=leadership&season=summer`
  - `avatar-preview.html?occupations&job=ceo&season=standard`
  - `avatar-preview.html?occupations&job=ceo&season=summer`
