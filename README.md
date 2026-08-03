# Choice of Life

Choice of Life is a planned side-scrolling life runner about navigating time, opportunities, hazards, relationships, and long-term consequences.

The player stays near the left side of a three-lane scene while rooms and life events move from right to left. Helpful objects can be collected, harmful objects avoided, and important people met. NPC encounters briefly slow the world and present two or three decisions. Every life is summarized by exactly three visible scores:

- Health
- Happiness
- Money (financial security)

## Current release

This first public release is a planning scaffold and technical reference build. It preserves the reusable character, rendering, movement, testing, and deployment foundation inherited from Pixel Life Journey v5 while the new runner is built in phases. The inherited game is deliberately labeled as a reference build in the title screen; it is not presented as the finished Choice of Life design.

- Live site: https://buicongnguyen.github.io/Choice_of_life/
- Repository: https://github.com/buicongnguyen/Choice_of_life
- Reviewed implementation plan: [CHOICE_OF_LIFE_PLAN.md](./CHOICE_OF_LIFE_PLAN.md)
- Design summary: [DESIGN.md](./DESIGN.md)

## Repository isolation

The initial source tree was exported from tracked commit `3274d0658737f3429b9ee62c15b965ebeba51373` of `pixel-life-journey-v5` into a new folder and a fresh Git history. The source repository, its `.git` directory, generated output, dependencies, logs, and its untracked planning document were not copied or modified.

Choice of Life uses its own package identity, GitHub remote, deployment workflow title, and `choice-of-life-v1-*` browser-storage namespace. It cannot overwrite active v5 saves on `buicongnguyen.github.io`.

Inherited v5 worklogs remain under `docs/reference-v5/` only as historical reference. They are not the active design.

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run check
npm test
npm run build
npm run dev
```

The production build is written to `dist/`. Vite uses a relative asset base so the site works under the GitHub Pages project path.

## Planned first playable slice

The first implementation milestone will prove the complete loop with four non-adjacent life stages:

1. Newborn: nursery runner, safe items and hazards, meeting Mom, first decision.
2. High School: exam preparation with meaningful score trade-offs.
3. Education or Training: university, vocational, and immediate-work routes.
4. First Career: qualified job offers and delayed career pressure, including a high-income/high-stress doctor route.

This vertical slice must demonstrate deterministic safe spawning, fixed-size lane movement, an accessible choice tray that never covers the character, save/resume, and a consequence that returns in a later stage before the remaining stages are produced.

## Publishing

Pushes to `main` run type checking through the build, the full automated test suite, the Vite production build, and GitHub Pages deployment through `.github/workflows/deploy-pages.yml`.
