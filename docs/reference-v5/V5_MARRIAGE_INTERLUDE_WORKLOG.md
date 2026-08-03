# V5 marriage interlude worklog

## Goal

Turn the Marriage & Baby checkpoint into a short, clear spouse-selection
stage. A male player chooses from women and a female player chooses from men,
with enough distinct people that the decision feels varied.

## Implementation

- Expanded the partner roster from eight people to sixteen: eight women and
  eight men.
- Assigned every gender pool all eight combinations of the four storybook
  heritage families and two appearance styles. The picker therefore shows
  distinct, existing v5 character art instead of generic emoji faces.
- Added one canonical opposite-gender candidate resolver used by both the UI
  and the final selection path.
- Reworked the checkpoint into a two-step wedding interlude:
  1. Meet eight possible spouses.
  2. Review one person and either confirm or return to the full list.
- Added explicit `Woman` or `Man` labels so the two groups are never visually
  or textually confused.
- Preserved each selected partner's gender, heritage, appearance, name and
  occupation badge in later rooms.
- Rebuilds the Marriage room after the choice so the spouse is present
  immediately rather than waiting until the next life chapter.
- Rejects repeated, same-gender, unknown or out-of-stage partner-selection
  calls, preventing replacement and duplicate wedding bonuses.

## Save compatibility

The save format already records `partnerId`, so no migration is required. New
choices follow the opposite-gender rule. Existing saves continue to resolve
their recorded partner and now also gain stable partner visuals.

## Regression coverage

- Male candidate pool contains eight women only.
- Female candidate pool contains eight men only.
- Candidate ordering, IDs, names and storybook identities are unique.
- Unknown and same-gender IDs cannot resolve as a valid choice.
- Spouse rendering honors the selected gender, heritage and appearance while
  retaining the default opposite-gender behavior where no override is given.

## Verification status

- TypeScript check passes.
- All 24 test files and 241 tests pass.
- The production Vite build passes.
- Browser-tested a male player starting at Marriage: eight women appeared,
  Hana's confirmation step worked, and Hana entered the room immediately.
- Browser-tested a female player starting at Marriage: eight men appeared and
  every card used a male storybook identity.
- Reloaded a saved marriage with Omar and confirmed the picker stayed complete
  while Omar's name and visual identity returned in the room.

The implementation is verified locally and remains uncommitted until the user
asks to publish this batch.
