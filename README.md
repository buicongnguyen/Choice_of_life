# Choice of Life

**One life. One promise.** Two kids bury a tin under the lighthouse in Marigold Bay and promise to open it together at seventy. You run the whole life in between: a 3D story runner through seven chapters, from crawling across the nursery floor to climbing the cliff path at seventy. Who is standing at the lighthouse when you get there depends on what you chose.

- Play: https://buicongnguyen.github.io/Choice_of_life/
- Redesign rationale, story bible and art direction: [docs/REDESIGN.md](./docs/REDESIGN.md)
- Art pipeline and asset contract: [art/README.md](./art/README.md)

## How it plays

- **Run** through each chapter on three lanes. ↑/↓ or W/S (or swipe) change lane; Space (or tap) jumps.
- **Collect** small good things: hearts (Health), stars (Happiness), green coins (Money). Every ten make a point. Keepsakes float over the hard places (three per chapter), and Juno's letters find you if you promised to write.
- **Stumble** into puddles, block towers or deadline piles and you lose a little (one point for something you could have jumped, two for something you had to dodge). There is no game over: if a score hits zero, someone who loves you steps in.
- **Choose** when someone important stops you. Every choice is a trade-off with named consequences; many come back chapters later by name.
- **Grow up** on screen: baby, toddler, child, teen on a bike, adult, elder. Biscuit fetches pickups; Sam catches you when you fall.

The ending is assembled from your life: the lighthouse lit or dark, who came, what was in the tin, Nana's letter, and a Book of Life with your title, three scores, every chapter and the people who mattered.

## Development

Node 22+.

```sh
npm ci
npm run dev      # http://localhost:4410
npm test         # story, course safety, runner and asset-contract tests
npm run build    # game/dist
npm run e2e      # plays a whole life in Chromium with the autopilot (dev server on 4412 or GAME_URL)
```

- `game/src/game` — pure logic: life state, story data, course generator (always leaves a free lane), fixed-step runner, ending. No DOM or Three.js.
- `game/src/render` — Three.js: engine, sky moods, sea shader, world streaming, people and procedural animation, pickups, particles, camera director.
- `game/src/ui`, `game/src/audio` — DOM overlay and procedural WebAudio score and effects.
- `art/` — Blender 4.5 generators for every model (`node art/run-blender.mjs [group|name]` rebuilds and packs into `public/models`).

QA: `?qa=1&auto=1&speed=8&policy=warm` plays a life by itself; `?view=cast` and `?view=models&names=a,b` are art review views.

## History

Version 1.x was a 2D runner built from painted sprites; it is preserved at the `v1.0.0` and `legacy-2d-final` tags. Its source still sits in `src/` and `scripts/` but is no longer built or deployed.
