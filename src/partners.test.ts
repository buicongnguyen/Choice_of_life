import { describe, expect, it } from "vitest";
import {
  PARTNERS,
  marriageCandidateById,
  marriageCandidatesForPlayer,
  spouseGenderForPlayer,
} from "./partners";
import type { Gender } from "./types";

const playerGenders: Gender[] = ["male", "female"];

describe("wedding interlude candidates", () => {
  it("maps men to women and women to men", () => {
    expect(spouseGenderForPlayer("male")).toBe("female");
    expect(spouseGenderForPlayer("female")).toBe("male");

    for (const playerGender of playerGenders) {
      const targetGender =
        spouseGenderForPlayer(playerGender);
      const candidates =
        marriageCandidatesForPlayer(playerGender);

      expect(candidates).toHaveLength(8);
      expect(
        candidates.every(
          (partner) => partner.gender === targetGender
        )
      ).toBe(true);
      expect(
        candidates.some(
          (partner) => partner.gender === playerGender
        )
      ).toBe(false);
    }
  });

  it("offers a varied, stable pool in authored order", () => {
    expect(
      marriageCandidatesForPlayer("male").map(
        (partner) => partner.id
      )
    ).toEqual([
      "maya",
      "nina",
      "elena",
      "aria",
      "hana",
      "zuri",
      "sofia",
      "noor",
    ]);
    expect(
      marriageCandidatesForPlayer("female").map(
        (partner) => partner.id
      )
    ).toEqual([
      "leo",
      "ravi",
      "sam",
      "jude",
      "kenji",
      "malik",
      "mateo",
      "omar",
    ]);

    for (const playerGender of playerGenders) {
      const candidates =
        marriageCandidatesForPlayer(playerGender);
      expect(
        new Set(candidates.map((partner) => partner.id))
          .size
      ).toBe(candidates.length);
      expect(
        new Set(
          candidates.map(
            (partner) =>
              `${partner.heritage}:${partner.appearance}`
          )
        ).size
      ).toBe(candidates.length);
    }
  });

  it("resolves only canonical opposite-gender choices", () => {
    expect(
      marriageCandidateById("male", "maya")?.name
    ).toBe("Maya");
    expect(
      marriageCandidateById("female", "leo")?.name
    ).toBe("Leo");
    expect(
      marriageCandidateById("male", "leo")
    ).toBeNull();
    expect(
      marriageCandidateById("female", "maya")
    ).toBeNull();
    expect(
      marriageCandidateById("male", "unknown")
    ).toBeNull();
  });

  it("keeps every identity and relationship choice distinct and ungated", () => {
    expect(PARTNERS).toHaveLength(16);
    expect(
      new Set(PARTNERS.map((partner) => partner.id)).size
    ).toBe(PARTNERS.length);
    expect(
      new Set(PARTNERS.map((partner) => partner.name)).size
    ).toBe(PARTNERS.length);
    expect(
      PARTNERS.every(
        (partner) => partner.requires === undefined
      )
    ).toBe(true);
  });
});
