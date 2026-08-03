# ADR 0001: isolate the runner from the inherited game

Status: accepted

## Context

The inherited engine combines state, rendering, movement, UI, saves, economy, careers, relationships, and story in one large module. Its four-stat and unlimited-money model conflicts with Choice of Life.

## Decision

Replace the main entry point with a new `src/choice-of-life/` application. New domain and simulation modules must not import the legacy engine, UI, stats, stages, events, story, rules, economy, or training modules.

Only `presentation/character-adapter.ts` may import selected inherited art/rendering modules. The avatar preview stays a local art-review tool and is excluded from the production build.

## Consequences

- The new game can enforce exactly three scores and a deterministic save schema.
- Legacy behavior remains available for reference without constraining the new architecture.
- Useful art requires a small explicit adapter or compact runtime atlas.
- An automated import-boundary test is required.
