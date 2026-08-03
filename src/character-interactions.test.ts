import { describe, expect, it } from "vitest";
import {
  PERSON_REACTION_SECONDS,
  interactionExpressionsAt,
  npcRoleStyle,
} from "./character-interactions";
import type { PersonKind } from "./types";

const ORDINARY_PEOPLE: PersonKind[] = [
  "mother",
  "father",
  "grandma",
  "grandpa",
  "babySibling",
  "sibling",
  "playmate",
  "studyFriend",
  "bestFriend",
  "crush",
  "roommate",
  "coworker",
  "boss",
  "gymBuddy",
  "spouse",
  "baby",
  "child",
  "grandkid",
  "oldFriend",
];

describe("interaction expression timing", () => {
  it("alternates friendly talking and smiling in a short cosmetic reaction", () => {
    expect(PERSON_REACTION_SECONDS).toBeGreaterThanOrEqual(1);
    expect(PERSON_REACTION_SECONDS).toBeLessThanOrEqual(1.5);
    expect(interactionExpressionsAt(0, "bestFriend")).toEqual({
      player: "smile",
      npc: "talk",
    });
    expect(interactionExpressionsAt(0.4, "bestFriend")).toEqual({
      player: "talk",
      npc: "smile",
    });
    expect(interactionExpressionsAt(1.2, "bestFriend")).toEqual({
      player: "smile",
      npc: "smile",
    });
  });

  it("uses wary and stern reactions for risky interactions", () => {
    expect(interactionExpressionsAt(0, "smokerFriend")).toEqual({
      player: "wary",
      npc: "talk",
    });
    expect(interactionExpressionsAt(0.4, "gangster")).toEqual({
      player: "talk",
      npc: "stern",
    });
    expect(
      interactionExpressionsAt(0, "bestFriend", false)
    ).toEqual({
      player: "wary",
      npc: "talk",
    });
  });

  it("clamps a negative elapsed time to the first beat", () => {
    expect(interactionExpressionsAt(-10, "mother")).toEqual(
      interactionExpressionsAt(0, "mother")
    );
  });
});
describe("NPC role readability", () => {
  it("keeps ordinary people visually neutral", () => {
    for (const kind of ORDINARY_PEOPLE) {
      expect(npcRoleStyle(kind)).toEqual({
        cue: "none",
        disposition: "friendly",
      });
    }
  });

  it("gives each existing risky social role a distinct universal cue", () => {
    expect(npcRoleStyle("smokerFriend")).toEqual({
      cue: "smokePressure",
      disposition: "risky",
    });
    expect(npcRoleStyle("gangster")).toEqual({
      cue: "riskyCrowd",
      disposition: "hostile",
    });
    expect(npcRoleStyle("playboy")).toEqual({
      cue: "flashyCharmer",
      disposition: "risky",
    });
    expect(
      new Set(
        ["smokerFriend", "gangster", "playboy"].map(
          (kind) => npcRoleStyle(kind as PersonKind).cue
        )
      ).size
    ).toBe(3);
  });
});
