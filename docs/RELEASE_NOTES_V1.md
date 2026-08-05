# Choice of Life v1 release notes

Release target: GitHub Pages at <https://buicongnguyen.github.io/Choice_of_life/>.

## Highlights

- A new side-scrolling life game centered on Health, Happiness, and Money.
- Playable life chapters progress from the newborn room through education,
  careers, relationships, later life, and a personal biography ending.
- Three-lane movement combines pickups, hazards, recovery opportunities, and
  untimed story choices whose effects return in later chapters.
- Character presentation includes age-appropriate silhouettes, varied
  appearances, career outfits, seasonal clothing, caregivers, friends, and
  pets while keeping characters grounded in the scene.
- Keyboard, touch, reduced-motion, contrast, text-size, and assist settings are
  available from the game shell.
- Deployment publishes a `release.json` manifest so a hosted build can identify
  its repository, package version, and exact commit.

## Save safety and deployment

- The existing `choice-of-life-v1-active-run` save format remains supported.
- A typed future-envelope reader now provides sequential payload migrations.
  Unsupported or malformed envelopes produce quarantine metadata and retain the
  original source; the helper performs no storage deletion or overwrite.
- GitHub Pages paths are centralized around `/Choice_of_life/`, with a safe
  not-found redirect back to the game root.

## Verification status

The owner explicitly selected an implementation-first release on 2026-08-05.
Production build/deployment remains the runnable checkpoint, while exhaustive
simulation, browser-matrix, accessibility, balance, and deep debugging work is
deferred to a later stabilization pass. See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).
