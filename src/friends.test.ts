import { describe, expect, it } from "vitest";
import {
  friendAgeForStage,
  friendGenderForOrdinal,
  friendVisualIdentity,
  friendVisualKey,
  nextFriendVisualIdentity,
  normalizeFriendVisualIdentities,
  peerHeritage,
  peerVisualIdentity,
  SAME_STAGE_PEER_KINDS,
} from "./friends";
import { STAGES } from "./stages";
import type { Gender, PersonKind } from "./types";

describe("school friend identity rules", () => {
  it("keeps displayed school ages inside the player's current stage", () => {
    for (const stageId of [
      "elementary",
      "middle",
      "high",
      "university",
    ]) {
      const stageIndex = STAGES.findIndex(
        (stage) => stage.id === stageId
      );
      const stage = STAGES[stageIndex];
      expect(
        friendAgeForStage(stage.ageStart, stageIndex, -20)
      ).toBe(stage.ageStart);
      expect(
        friendAgeForStage(stage.ageEnd - 1, stageIndex, 20)
      ).toBe(stage.ageEnd - 1);
    }
  });

  it("does not clamp adult friends to a school chapter", () => {
    const careerIndex = STAGES.findIndex(
      (stage) => stage.id === "career"
    );
    expect(friendAgeForStage(25, careerIndex, 4)).toBe(29);
  });

  it("assigns recurring peer roles stable but varied heritages", () => {
    for (const kind of SAME_STAGE_PEER_KINDS) {
      expect(peerHeritage("life-a", kind)).toBe(
        peerHeritage("life-a", kind)
      );
    }
    const heritages = new Set(
      ["life-a", "life-b", "life-c"].flatMap((seed) =>
        SAME_STAGE_PEER_KINDS.map((kind) =>
          peerHeritage(seed, kind)
        )
      )
    );
    expect(heritages.size).toBeGreaterThanOrEqual(3);
  });

  it("keeps all seven university peer roles visually distinct", () => {
    const universityPeers: PersonKind[] = [
      "studyFriend",
      "gymBuddy",
      "roommate",
      "crush",
      "smokerFriend",
      "gangster",
      "playboy",
    ];
    for (const seed of ["life-a", "life-b", "life-c"]) {
      const identities = universityPeers.map((kind) =>
        peerVisualIdentity(seed, kind)
      );
      expect(
        new Set(identities.map(friendVisualKey)).size
      ).toBe(universityPeers.length);
      expect(
        universityPeers.map((kind) =>
          peerVisualIdentity(seed, kind)
        )
      ).toEqual(identities);
    }
  });

  it("allocates a balanced 16-friend roster with no same-gender clones", () => {
    for (const seed of ["life-a", "life-b", "life-c"]) {
      const genderCounts: Record<Gender, number> = {
        male: 0,
        female: 0,
      };
      const keys = new Set<string>();
      for (let ordinal = 0; ordinal < 16; ordinal += 1) {
        const gender = friendGenderForOrdinal(seed, ordinal);
        const identity = friendVisualIdentity(
          seed,
          gender,
          genderCounts[gender]++
        );
        keys.add(`${gender}:${friendVisualKey(identity)}`);
      }
      expect(genderCounts).toEqual({ male: 8, female: 8 });
      expect(keys.size).toBe(16);
    }
  });

  it("migrates missing and colliding looks without changing gender", () => {
    const legacy = Array.from({ length: 8 }, (_, index) => ({
      id: `legacy-${index}`,
      gender: (index % 2 === 0
        ? "female"
        : "male") as Gender,
      heritage: index < 2 ? "western" as const : undefined,
      appearance: index < 2 ? "classic" as const : undefined,
    }));
    const migrated = normalizeFriendVisualIdentities(
      "legacy-life",
      legacy
    );
    expect(migrated.map((friend) => friend.gender)).toEqual(
      legacy.map((friend) => friend.gender)
    );
    for (const gender of ["male", "female"] as const) {
      const genderKeys = migrated
        .filter((friend) => friend.gender === gender)
        .map(friendVisualKey);
      expect(new Set(genderKeys).size).toBe(genderKeys.length);
    }
  });

  it("allocates around preserved non-sequential friend looks", () => {
    const seed = "continued-life";
    const preserved = [
      friendVisualIdentity(seed, "female", 0),
      friendVisualIdentity(seed, "female", 3),
      friendVisualIdentity(seed, "female", 6),
    ];
    const next = nextFriendVisualIdentity(
      seed,
      "female",
      preserved.map(friendVisualKey),
      preserved.length
    );
    expect(
      preserved.map(friendVisualKey)
    ).not.toContain(friendVisualKey(next));
  });

  it("preserves gender when a legacy roster exceeds its eight reviewed looks", () => {
    const legacy = Array.from({ length: 9 }, (_, index) => ({
      id: `legacy-f-${index}`,
      gender: "female" as const,
    }));
    const migrated = normalizeFriendVisualIdentities(
      "legacy-nine",
      legacy
    );
    expect(
      migrated.every((friend) => friend.gender === "female")
    ).toBe(true);
    expect(
      new Set(migrated.slice(0, 8).map(friendVisualKey)).size
    ).toBe(8);
  });
});
