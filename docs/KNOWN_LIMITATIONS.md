# Known limitations

This document describes the implementation-first v1 release state as of
2026-08-05.

## Deferred stabilization

- Exhaustive deterministic simulations and large seed/profile/difficulty
  matrices have not been rerun for this release.
- Cross-browser, small-screen, 200% text, screen-reader, keyboard-only, touch,
  high-contrast, and reduced-motion audits are deferred.
- Long-session performance, memory behavior, balance tuning, and full route
  reachability still require dedicated playtesting.
- Visual edge cases such as grounding, animation scale continuity, clothing
  contrast, and rare overlapping scene elements may remain.

## Save and hosting behavior

- The future save-envelope reader is an opt-in core helper. The current v1 save
  store continues to use its established run-state codec until a later storage
  migration explicitly adopts the envelope.
- Quarantine metadata identifies an unreadable envelope but intentionally does
  not remove, overwrite, or silently repair the original source.
- GitHub Pages serves the game below `/Choice_of_life/`. Unknown deep links are
  redirected to the game root and do not restore the original path.
- A tab already open during a deployment may need a normal reload to receive
  the newest hashed assets and release metadata.

These items are recorded for the planned debugging and verification pass; they
are not claims that a specific defect is present in every browser or route.
