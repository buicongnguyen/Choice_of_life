# Choice of Life — design summary

The detailed, implementation-ready specification is in [CHOICE_OF_LIFE_PLAN.md](./CHOICE_OF_LIFE_PLAN.md). This document records the reviewed product decisions that should remain stable while implementation details evolve.

## Product promise

Live one complete life through a readable three-lane runner. Time and the environment flow from right to left. Move between lanes to collect opportunities, avoid hazards, and meet people. Important encounters present short decisions whose consequences can return later.

The game should feel thoughtful rather than punishing. There is no instant death, no single globally best career, and no failure route that prevents a player from reaching retirement.

## Fixed design constraints

- The HUD has exactly three permanent numeric scores: Health, Happiness, and Money.
- Money means financial security on a 0–100 scale, not literal currency.
- Stress, grades, credentials, careers, and relationships are conditions or story facts, not extra score bars.
- The character remains at a fixed horizontal anchor and fixed visual scale for each stage.
- The player changes between three lane centers; the first release has no jump mechanic.
- Every generated obstacle pattern has at least one safe route.
- Choices drive about 70% of life outcomes; runner performance drives about 30%.
- NPC encounters create a safe zone, slow the world, disable collisions, and show an untimed HTML choice tray outside the active playfield.
- Major decisions can change scores now, add a life fact, schedule a later encounter, and alter the ending.
- A score reaching zero triggers a recovery or assistance event rather than ending the game.
- Marriage, children, university, and a high-status career are optional routes, not definitions of success.

## Three-score model

All three scores use a comparable 0–100 scale. The recommended new-life baseline is:

```ts
interface CoreScores {
  health: number;
  happiness: number;
  money: number;
}

const startingScores: CoreScores = {
  health: 65,
  happiness: 60,
  money: 35,
};
```

Hidden numeric personality scores should not replace the removed meters. Saved state may contain discrete flags, named relationships, credentials, memories, temporary conditions, and scheduled consequences.

## Core interaction

1. A stage begins with a clear age, place, and immediate objective.
2. The environment scrolls right to left while the player changes lanes.
3. Pickups and hazards produce small, clearly shown score changes.
4. A telegraphed NPC encounter clears the playfield and opens a decision.
5. The selected option shows immediate effects and a fair qualitative future hint.
6. The choice may return as a callback in a later stage.
7. A brief stage recap records the person, decision, and resulting life fact.

## Outcome philosophy

Most choices should be trade-offs rather than morality tests. Studying very hard can improve grades but lower Happiness and add Stress. A demanding medical career can improve Money while introducing emergency shifts that cost Health and Happiness. Supporting a relationship can strengthen a future compromise but cost an immediate promotion. The player should understand the immediate price without seeing every future detail.

The ending shows the three final scores separately and writes a short life title and biography from named people, major choices, and explicit callbacks. It must not collapse the life into one victory number.
