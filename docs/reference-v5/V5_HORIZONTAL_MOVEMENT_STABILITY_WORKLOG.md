# V5 horizontal movement stability

## Reported problem

When the player moved left or right, generated characters could look as if
their whole body swung from side to side instead of walking steadily.

## Diagnosis

- Player world-space X movement was already monotonic and did not contain a
  sinusoidal offset.
- The classic, casual-summer, legacy occupation, and career atlases keep their
  neutral and motion torso roots aligned; horizontal anchor drift was not the
  cause in those families.
- The default `alternate` ("New style") atlas had a separate authoring issue:
  neutral or motion left/right cells were semantically reversed in 37 of its 64
  identity/age rows. Alternating a left-facing neutral pose with a right-facing
  motion pose made the body visibly flip while travelling horizontally.
- Every directional atlas intentionally contains two body poses: neutral and
  one real step. The renderer multiplied the engine walk phase by `1.85`, so it
  hard-switched those two poses about 5.9 times per second at full speed.
- The on-screen joystick used one dead-zone threshold and no facing-axis
  hysteresis. Small diagonal input changes could therefore toggle idle/walk or
  swap independently drawn facing cells.

## Fix

- Use the engine walk phase directly for all storybook, casual-summer, legacy
  occupation, and new career-outfit atlases.
- Reduce the extra runtime bob because the generated step art already carries
  the body movement.
- Use separate joystick movement start/stop thresholds.
- Retain the current facing axis until the other axis clearly dominates.
- Centralize the rules in `src/character-motion.ts` so new character families
  cannot silently reintroduce the faster gait.
- Repair the 37 affected alternate-atlas rows at build time, swapping only the
  real left/right cells whose source-sheet meaning is reversed. Do not mirror
  the artwork.
- Validate alternate neutral/motion side pairs from the head and upper torso,
  then align their reviewed roots and publish the corrected atlases and anchor
  manifest together.

## Verification contract

- Unit tests cover gait frequency, grounded bob, start/stop hysteresis, and
  stable facing under diagonal jitter.
- Existing frame-routing tests still cover every direction and character
  family.
- Asset tests cover effective horizontal root alignment for career and summer
  atlases and semantic left/right pairing for every alternate identity and age.
- The atlas builder rejects missing/extra repair rows, crossed side pairs, and
  excessive rendered head drift.
- The animated motion preview was reviewed for adult and newborn characters:
  left/right profiles remain consistent while the limbs change pose.
