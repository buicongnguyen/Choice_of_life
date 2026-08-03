import { describe, expect, it } from "vitest";
import {
  PROFESSION_NPC_STAGE_IDS,
  PROFESSION_ROLES,
  professionLifeOptions,
  professionNpcsForStage,
  sameProfessionVisual,
  stageHasProfessionNpcs,
} from "./profession-npcs";

describe("adult profession NPC cast", () => {
  it("includes the exact thirteen requested roles and preserves the legacy cast", () => {
    const requested = [
      ["teacher", "teacher"],
      ["chef", "chef"],
      ["barista", "barista"],
      ["athlete", "athlete"],
      ["entrepreneur", "entrepreneur"],
      ["generalengineer", "generalengineer"],
      ["softwareengineer", "softwareengineer"],
      ["manager", "manager"],
      ["analyst", "analyst"],
      ["artist", "artist"],
      ["police", "police"],
      ["lawyer", "lawyer"],
      ["ceo", "ceo"],
    ];
    const legacy = [
      ["doctor", "doctor"],
      ["nurse", "doctor"],
      ["trainer", "trainer"],
      ["dancer", "dancer"],
      ["soldier", "soldier"],
      ["farmer", "farmer"],
    ];
    const catalog = PROFESSION_ROLES.map((role) => [
      role.id,
      role.uniform,
    ]);

    expect(catalog).toEqual([...legacy, ...requested]);
    expect(
      PROFESSION_ROLES.slice(legacy.length).map(
        (role) => role.label
      )
    ).toEqual([
      "Teacher",
      "Chef",
      "Barista",
      "Athlete",
      "Entrepreneur",
      "Engineer",
      "Software Engineer",
      "Manager",
      "Financial Analyst",
      "Artist",
      "Police Officer",
      "Lawyer",
      "CEO",
    ]);
    expect(new Set(catalog.map(([id]) => id)).size).toBe(
      catalog.length
    );
  });

  it("appears only after university", () => {
    for (const stageId of [
      "newborn",
      "elementary",
      "high",
      "university",
    ]) {
      expect(stageHasProfessionNpcs(stageId)).toBe(false);
      expect(professionNpcsForStage("life-a", stageId)).toEqual([]);
    }
    for (const stageId of PROFESSION_NPC_STAGE_IDS) {
      expect(stageHasProfessionNpcs(stageId)).toBe(true);
      expect(professionNpcsForStage("life-a", stageId)).toHaveLength(3);
    }
  });

  it("keeps a chapter cast stable, distinct, and gender separated", () => {
    for (const stageId of PROFESSION_NPC_STAGE_IDS) {
      const first = professionNpcsForStage("life-a", stageId);
      expect(professionNpcsForStage("life-a", stageId)).toEqual(first);
      expect(new Set(first.map((npc) => npc.id)).size).toBe(3);
      expect(new Set(first.map((npc) => npc.gender))).toEqual(
        new Set(["male", "female"])
      );
      expect(new Set(first.map((npc) => npc.heritage))).toEqual(
        new Set(["western", "asian"])
      );
      expect(
        new Set(
          first.map(
            (npc) =>
              `${npc.uniform}:${npc.gender}:${npc.heritage}`
          )
        ).size
      ).toBe(first.length);
    }
  });

  it("never renders doctor and nurse as the same medical character", () => {
    for (const stageId of PROFESSION_NPC_STAGE_IDS) {
      for (let seed = 0; seed < 50; seed += 1) {
        const cast = professionNpcsForStage(
          `medical-${seed}`,
          stageId
        );
        const keys = cast.map(
          (npc) =>
            `${npc.uniform}:${npc.gender}:${npc.heritage}`
        );
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("never reuses the active player's complete career character", () => {
    const reserved = {
      uniform: "doctor",
      gender: "female",
      heritage: "asian",
    } as const;
    for (const stageId of PROFESSION_NPC_STAGE_IDS) {
      for (let seed = 0; seed < 50; seed += 1) {
        const cast = professionNpcsForStage(
          `player-${seed}`,
          stageId,
          3,
          reserved
        );
        expect(
          cast.some((npc) =>
            sameProfessionVisual(npc, reserved)
          )
        ).toBe(false);
      }
    }
  });

  it("reserves player and parent visuals supplied as a readonly array", () => {
    const reserved = [
      {
        uniform: "softwareengineer",
        gender: "female",
        heritage: "asian",
      },
      {
        uniform: "lawyer",
        gender: "female",
        heritage: "western",
      },
      {
        uniform: "chef",
        gender: "male",
        heritage: "western",
      },
    ] as const;

    for (const stageId of PROFESSION_NPC_STAGE_IDS) {
      for (let seed = 0; seed < 50; seed += 1) {
        const cast = professionNpcsForStage(
          `family-${seed}`,
          stageId,
          3,
          reserved
        );
        expect(cast).toHaveLength(3);
        expect(
          cast.some((npc) =>
            reserved.some((visual) =>
              sameProfessionVisual(npc, visual)
            )
          )
        ).toBe(false);
        expect(
          new Set(
            cast.map(
              (npc) =>
                `${npc.uniform}:${npc.gender}:${npc.heritage}`
            )
          ).size
        ).toBe(cast.length);
      }
    }
  });

  it("accepts a readonly set and skips a role when every exact body is reserved", () => {
    const reserved = new Set([
      {
        uniform: "doctor",
        gender: "male",
        heritage: "western",
      },
      {
        uniform: "doctor",
        gender: "male",
        heritage: "asian",
      },
      {
        uniform: "doctor",
        gender: "female",
        heritage: "western",
      },
      {
        uniform: "doctor",
        gender: "female",
        heritage: "asian",
      },
    ] as const);

    for (const stageId of PROFESSION_NPC_STAGE_IDS) {
      for (let seed = 0; seed < 50; seed += 1) {
        const cast = professionNpcsForStage(
          `blocked-medical-${seed}`,
          stageId,
          3,
          reserved
        );
        expect(cast).toHaveLength(3);
        expect(
          cast.some((npc) => npc.uniform === "doctor")
        ).toBe(false);
      }
    }
  });

  it("varies the cast across lives and chapters", () => {
    const casts = new Set(
      ["life-a", "life-b", "life-c", "life-d"].flatMap((seed) =>
        PROFESSION_NPC_STAGE_IDS.map((stageId) =>
          professionNpcsForStage(seed, stageId)
            .map((npc) => npc.id)
            .join(",")
        )
      )
    );
    expect(casts.size).toBeGreaterThan(5);
  });

  it("can surface every legacy and requested profession", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      for (const stageId of PROFESSION_NPC_STAGE_IDS) {
        for (const npc of professionNpcsForStage(
          `coverage-${seed}`,
          stageId
        )) {
          seen.add(npc.id);
        }
      }
    }
    expect(seen).toEqual(
      new Set(PROFESSION_ROLES.map((role) => role.id))
    );
  });

  it("builds unique interactable station options with matching fallback gender", () => {
    const reserved = [
      {
        uniform: "dancer",
        gender: "male",
        heritage: "western",
      },
      {
        uniform: "teacher",
        gender: "female",
        heritage: "asian",
      },
    ] as const;
    const options = professionLifeOptions(
      "life-a",
      "career",
      3,
      reserved
    );
    expect(new Set(options.map((option) => option.id)).size).toBe(3);
    for (const option of options) {
      expect(option.professionNpc).toBeDefined();
      expect(option.person).toBe(
        option.professionNpc?.gender === "female"
          ? "coworker"
          : "gymBuddy"
      );
      expect(["western", "asian"]).toContain(
        option.professionNpc?.heritage
      );
      expect(
        reserved.some(
          (visual) =>
            option.professionNpc &&
            sameProfessionVisual(option.professionNpc, visual)
        )
      ).toBe(false);
    }
  });
});
