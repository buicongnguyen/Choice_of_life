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
- Active implementation plan: [CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md](./CHOICE_OF_LIFE_IMPLEMENTATION_PLAN_V2.md)
- Stage/content design reference: [CHOICE_OF_LIFE_PLAN.md](./CHOICE_OF_LIFE_PLAN.md)
- Design summary: [DESIGN.md](./DESIGN.md)

## Repository isolation

The initial source tree was exported from tracked commit `3274d0658737f3429b9ee62c15b965ebeba51373` of `pixel-life-journey-v5` into a new folder and a fresh Git history. The source repository, its `.git` directory, generated output, dependencies, logs, and its untracked planning document were not copied or modified.

Choice of Life uses its own package identity, GitHub remote, deployment workflow title, and `choice-of-life-v1-*` browser-storage namespace. It cannot overwrite active v5 saves on `buicongnguyen.github.io`.

Inherited v5 worklogs remain under `docs/reference-v5/` only as historical reference. They are not the active design.

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run release:stamp
npm run verify
npm run dev
```

`npm run verify` runs the type check, full tests, production build, built-release verification, and current bundle budgets. The production build is written to `dist/`. Vite uses a relative asset base so the site works under the GitHub Pages project path.

## Planned implementation sequence

The active v2 plan builds the game through independently reviewed releases:

1. isolated application shell and deterministic three-score domain;
2. three-lane runner laboratory and reachability validator;
3. playable Newborn stage;
4. Mom encounter and idempotent consequences;
5. High School and Education/Training demo slice;
6. First Career and a provisional ending;
7. continuous childhood, adult, later-life, accessibility, art, and release phases.

Each release must pass code review, logic review, automated verification, an SSH push, exact-SHA Pages deployment, and live smoke testing before the next phase starts.

## Publishing

Pushes to `main` run type checking through the build, the full automated test suite, the Vite production build, and GitHub Pages deployment through `.github/workflows/deploy-pages.yml`.

