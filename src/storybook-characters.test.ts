import { describe, expect, it } from "vitest";
import { avatarLook, personLook } from "./sprites";
import {
  storybookAgeBand,
  storybookAnimationFrameForLook,
  storybookFrameDrawGeometry,
  storybookFrameForLook,
  storybookFrameScale,
  storybookFrameVisibleHeight,
  storybookGroundAnchorForFrame,
  storybookUsesMotionFrame,
  storybookVisualHeight,
  warmStorybookCharacterAtlases,
} from "./storybook-characters";
import type { CuteFacing } from "./cute-characters";
import type {
  Gender,
  HeritageStyle,
  PersonKind,
} from "./types";
import { isSameStagePeerKind } from "./friends";
import { STAGES } from "./stages";

const genders: Gender[] = ["male", "female"];
const heritages: HeritageStyle[] = [
  "western",
  "asian",
  "middleEastern",
  "black",
];
const facings: CuteFacing[] = ["front", "left", "back", "right"];

describe("v5 storybook sprite selection", () => {
  it("keeps male and female atlases separate for every heritage", () => {
    for (const heritage of heritages) {
      const male = storybookFrameForLook(
        avatarLook(6, "male", heritage),
        "front"
      );
      const female = storybookFrameForLook(
        avatarLook(6, "female", heritage),
        "front"
      );

      expect(male.atlasKey).toBe(`${heritage}-male`);
      expect(female.atlasKey).toBe(`${heritage}-female`);
      expect(male.atlasKey).not.toBe(female.atlasKey);
      expect(male.atlasFamily).toBe("expansion");
      expect(female.atlasFamily).toBe("expansion");
    }
  });

  it("maps all twelve life stages into eight coherent age bands", () => {
    const bands = Array.from({ length: 12 }, (_, stage) =>
      storybookAgeBand(avatarLook(stage, "female", "western"))
    );

    expect(bands).toEqual([
      "baby",
      "child",
      "child",
      "child",
      "earlyTeen",
      "teen",
      "youngAdult",
      "adult",
      "adult",
      "middleAge",
      "elder",
      "elder",
    ]);
  });

  it("uses the added age art to make NPC groups more varied", () => {
    expect(
      storybookAgeBand(personLook("sibling", "female", 4, "western"))
    ).toBe("earlyTeen");
    expect(
      storybookAgeBand(personLook("roommate", "female", 6, "asian"))
    ).toBe("youngAdult");
    expect(
      storybookAgeBand(personLook("boss", "female", 7, "middleEastern"))
    ).toBe("middleAge");
    expect(
      storybookAgeBand(personLook("spouse", "male", 9, "black"))
    ).toBe("middleAge");

    const laterSiblingBands = Array.from({ length: 8 }, (_, offset) =>
      storybookAgeBand(
        personLook("sibling", "female", offset + 4, "western")
      )
    );
    expect(laterSiblingBands).toEqual([
      "earlyTeen",
      "teen",
      "youngAdult",
      "adult",
      "adult",
      "middleAge",
      "elder",
      "elder",
    ]);

    expect(
      storybookAgeBand(personLook("mother", "male", 5, "asian"))
    ).toBe("adult");
    expect(
      storybookAgeBand(personLook("mother", "male", 6, "asian"))
    ).toBe("middleAge");
    expect(
      storybookAgeBand(personLook("father", "female", 9, "black"))
    ).toBe("elder");
  });

  it("keeps a selected spouse's complete authored identity", () => {
    const selected = personLook(
      "spouse",
      "male",
      8,
      "black",
      "alternate",
      "male"
    );
    expect(selected.gender).toBe("male");
    expect(selected.heritage).toBe("black");
    expect(selected.appearance).toBe("alternate");

    expect(
      personLook(
        "spouse",
        "male",
        8,
        "asian",
        "classic"
      ).gender
    ).toBe("female");
    expect(
      personLook(
        "spouse",
        "female",
        8,
        "western",
        "classic"
      ).gender
    ).toBe("male");
  });

  it("keeps every school and campus peer in the player's life stage", () => {
    for (let stageIndex = 1; stageIndex <= 6; stageIndex += 1) {
      const peerKinds = STAGES[stageIndex].options
        .map((option) => option.person)
        .filter(
          (kind): kind is PersonKind =>
            !!kind && isSameStagePeerKind(kind)
        );
      for (const kind of peerKinds) {
        for (const gender of genders) {
          for (const heritage of heritages) {
            const peer = personLook(
              kind,
              gender,
              stageIndex,
              heritage
            );
            const player = avatarLook(
              stageIndex,
              gender,
              heritage
            );
            expect(peer.lifeStageIndex).toBe(stageIndex);
            expect(storybookAgeBand(peer)).toBe(
              storybookAgeBand(player)
            );
            expect(
              storybookFrameForLook(peer, "front").atlasKey
            ).toBe(`${heritage}-${peer.gender}`);
          }
        }
      }
    }
  });

  it("warms all 40 classic and alternate sheets when no heritage is filtered", async () => {
    const originalImage = globalThis.Image;
    const requestedSources: string[] = [];

    class ImmediateImage {
      decoding = "";
      naturalWidth = 1024;
      private listeners = new Map<string, EventListenerOrEventListenerObject>();

      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ): void {
        this.listeners.set(type, listener);
      }

      set src(value: string) {
        requestedSources.push(value);
        queueMicrotask(() => {
          const listener = this.listeners.get("load");
          if (typeof listener === "function") listener(new Event("load"));
          else listener?.handleEvent(new Event("load"));
        });
      }
    }

    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: ImmediateImage,
    });
    try {
      await warmStorybookCharacterAtlases();
    } finally {
      Object.defineProperty(globalThis, "Image", {
        configurable: true,
        value: originalImage,
      });
    }

    expect(requestedSources).toHaveLength(40);
    expect(new Set(requestedSources).size).toBe(40);
  });

  it("selects a valid dedicated frame for every stage, gender, heritage, and facing", () => {
    for (let stage = 0; stage < 12; stage += 1) {
      for (const gender of genders) {
        for (const heritage of heritages) {
          for (const facing of facings) {
            const frame = storybookFrameForLook(
              avatarLook(stage, gender, heritage),
              facing
            );
            expect(frame.atlasKey).toBe(`${heritage}-${gender}`);
            expect(frame.row).toBeGreaterThanOrEqual(0);
            expect(frame.row).toBeLessThan(
              frame.atlasFamily === "base" ? 5 : 3
            );
            expect(frame.column).toBeGreaterThanOrEqual(0);
            expect(frame.column).toBeLessThan(4);
          }
        }
      }
    }
  });

  it("keeps every alternate gender and heritage in its own unified atlas", () => {
    for (const gender of genders) {
      for (const heritage of heritages) {
        for (let stage = 0; stage < 12; stage += 1) {
          for (const facing of facings) {
            const frame = storybookFrameForLook(
              avatarLook(stage, gender, heritage, "alternate"),
              facing
            );
            expect(frame.appearance).toBe("alternate");
            expect(frame.atlasFamily).toBe("alternate");
            expect(frame.atlasKey).toBe(`${heritage}-${gender}`);
            expect(frame.row).toBeGreaterThanOrEqual(0);
            expect(frame.row).toBeLessThan(8);
            expect(frame.column).toBeGreaterThanOrEqual(0);
            expect(frame.column).toBeLessThan(4);
          }
        }
      }
    }
  });

  it("uses distinct front, side, and back columns", () => {
    const look = avatarLook(7, "male", "asian");
    const front = storybookFrameForLook(look, "front");
    const left = storybookFrameForLook(look, "left");
    const right = storybookFrameForLook(look, "right");
    const back = storybookFrameForLook(look, "back");

    expect(front.column).toBe(0);
    expect(left.column).toBe(1);
    expect(back.column).toBe(2);
    expect(right.column).toBe(3);
    expect(new Set([front.column, left.column, right.column, back.column]).size)
      .toBe(4);
  });

  it("has a valid ground anchor for all 256 populated base and expansion cells", () => {
    const representativeStages = [0, 1, 4, 5, 6, 7, 9, 10];
    const visitedFrames = new Set<string>();

    for (const stage of representativeStages) {
      for (const gender of genders) {
        for (const heritage of heritages) {
          for (const facing of facings) {
            const frame = storybookFrameForLook(
              avatarLook(stage, gender, heritage),
              facing
            );
            const anchor = storybookGroundAnchorForFrame(frame);
            visitedFrames.add(
              `${frame.atlasFamily}:${frame.atlasKey}:${frame.row}:${frame.column}`
            );

            expect(anchor).not.toBeNull();
            expect(anchor?.[0]).toBeGreaterThanOrEqual(0);
            expect(anchor?.[0]).toBeLessThanOrEqual(256);
            expect(anchor?.[1]).toBeGreaterThanOrEqual(0);
            expect(anchor?.[1]).toBeLessThanOrEqual(256);
          }
        }
      }
    }

    expect(visitedFrames.size).toBe(256);
  });

  it("alternates a neutral and a true motion cell in every direction", () => {
    const motionPhase = Math.PI / 2;
    expect(storybookUsesMotionFrame(0)).toBe(false);
    expect(storybookUsesMotionFrame(motionPhase)).toBe(true);
    expect(storybookUsesMotionFrame(2)).toBe(true);

    for (const stage of [0, 1, 4, 5, 6, 7, 9, 10]) {
      for (const gender of genders) {
        for (const heritage of heritages) {
          for (const facing of facings) {
            const look = avatarLook(stage, gender, heritage);
            const motion = {
              moving: true,
              facing,
              verticalBias: 0,
            } as const;
            const neutral = storybookAnimationFrameForLook(
              look,
              motion,
              0
            );
            const step = storybookAnimationFrameForLook(
              look,
              motion,
              motionPhase
            );

            expect(neutral.atlasFamily).toMatch(
              /^(base|expansion)$/
            );
            expect(step.atlasFamily).toBe(
              neutral.atlasFamily === "base"
                ? "motionBase"
                : "motionExpansion"
            );
            expect(step.column).toBe(neutral.column);
            expect(step.row).toBe(neutral.row);
            expect(step.atlasKey).toBe(neutral.atlasKey);
          }
        }
      }
    }
  });

  it("keeps every directional frame at one visible size within its stage", () => {
    const motionPhase = Math.PI / 2;
    const expectedRenderedHeights = [
      79.565625,
      88.40625,
      97.246875,
      106.0875,
      117.13828125,
      128.1890625,
      137.0296875,
      141.45,
      141.45,
      139.23984375,
      132.609375,
      128.1890625,
    ];

    for (let stage = 0; stage < 12; stage += 1) {
      for (const appearance of ["classic", "alternate"] as const) {
        for (const gender of genders) {
          for (const heritage of heritages) {
            const look = avatarLook(
              stage,
              gender,
              heritage,
              appearance
            );
            for (const facing of facings) {
              for (const phase of [0, motionPhase]) {
                const frame = storybookAnimationFrameForLook(
                  look,
                  { moving: true, facing, verticalBias: 0 },
                  phase
                );
                const visibleHeight =
                  storybookFrameVisibleHeight(frame);
                const scale = storybookFrameScale(frame);
                expect(visibleHeight).not.toBeNull();
                expect(scale).toBeGreaterThanOrEqual(1);
                expect(scale).toBeLessThanOrEqual(1.1);
                expect((visibleHeight ?? 0) * scale).toBeCloseTo(
                  246,
                  6
                );
                expect(
                  (storybookVisualHeight(look) *
                    (visibleHeight ?? 0) *
                    scale) /
                    256
                ).toBeCloseTo(expectedRenderedHeights[stage], 6);
              }
            }
          }
        }
      }
    }
  });

  it("keeps alternate newborn left poses at one effective height", () => {
    for (const heritage of ["asian", "middleEastern"] as const) {
      const look = avatarLook(
        0,
        "male",
        heritage,
        "alternate"
      );
      const neutral = storybookAnimationFrameForLook(
        look,
        { moving: true, facing: "left", verticalBias: 0 },
        0
      );
      const motion = storybookAnimationFrameForLook(
        look,
        { moving: true, facing: "left", verticalBias: 0 },
        Math.PI / 2
      );
      const neutralHeight = storybookFrameVisibleHeight(neutral);
      const motionHeight = storybookFrameVisibleHeight(motion);

      expect(
        (neutralHeight ?? 0) * storybookFrameScale(neutral)
      ).toBeCloseTo(246, 6);
      expect(
        (motionHeight ?? 0) * storybookFrameScale(motion)
      ).toBeCloseTo(246, 6);
    }
  });

  it("keeps a corrected newborn square and pinned to its reviewed ground anchor", () => {
    const look = avatarLook(
      0,
      "female",
      "western",
      "alternate"
    );
    const frame = storybookAnimationFrameForLook(
      look,
      { moving: true, facing: "front", verticalBias: 0 },
      0
    );
    const anchor = storybookGroundAnchorForFrame(frame);
    expect(anchor).not.toBeNull();
    const geometry = storybookFrameDrawGeometry(
      frame,
      storybookVisualHeight(look),
      anchor ?? [0, 0]
    );
    const sourceScale = geometry.width / 256;

    expect(storybookFrameScale(frame)).toBeGreaterThan(1);
    expect(geometry.width).toBe(geometry.height);
    expect(
      geometry.offsetX + (anchor?.[0] ?? 0) * sourceScale
    ).toBeCloseTo(0, 8);
    expect(
      geometry.offsetY + (anchor?.[1] ?? 0) * sourceScale
    ).toBeCloseTo(0, 8);
    expect(
      ((storybookFrameVisibleHeight(frame) ?? 0) *
        geometry.height) /
        256
    ).toBeCloseTo(
      (storybookVisualHeight(look) * 246) / 256,
      6
    );

    const adultLook = avatarLook(7, "male", "black");
    const adultFrame = storybookFrameForLook(
      adultLook,
      "right"
    );
    const adultAnchor =
      storybookGroundAnchorForFrame(adultFrame) ?? [0, 0];
    const adultGeometry = storybookFrameDrawGeometry(
      adultFrame,
      storybookVisualHeight(adultLook),
      adultAnchor
    );
    expect(storybookFrameScale(adultFrame)).toBe(1);
    expect(adultGeometry.width).toBe(
      storybookVisualHeight(adultLook)
    );
    expect(adultGeometry.height).toBe(adultGeometry.width);
  });

  it("uses genuine floor-seated motion art for all 64 character identities", () => {
    const visited = new Set<string>();
    for (const stage of [0, 1, 4, 5, 6, 7, 9, 10]) {
      for (const gender of genders) {
        for (const heritage of heritages) {
          const frame = storybookAnimationFrameForLook(
            avatarLook(stage, gender, heritage),
            {
              moving: false,
              facing: "back",
              verticalBias: 0,
              pose: "sit",
            },
            0
          );
          const anchor = storybookGroundAnchorForFrame(frame);
          visited.add(
            `${frame.atlasFamily}:${frame.atlasKey}:${frame.row}:${frame.column}`
          );

          expect(frame.atlasFamily).toMatch(
            /^motion(Base|Expansion)$/
          );
          expect(frame.column).toBe(4);
          expect(anchor).not.toBeNull();
          expect(storybookFrameScale(frame)).toBe(1);
        }
      }
    }
    expect(visited.size).toBe(64);
  });

  it("shows an idle newborn seated, then switches to directional crawl frames", () => {
    const look = avatarLook(0, "female", "asian");
    const idle = storybookAnimationFrameForLook(
      look,
      { moving: false, facing: "back", verticalBias: 0 },
      0
    );
    const crawlNeutral = storybookAnimationFrameForLook(
      look,
      { moving: true, facing: "left", verticalBias: 0 },
      0
    );
    const crawlStep = storybookAnimationFrameForLook(
      look,
      { moving: true, facing: "left", verticalBias: 0 },
      Math.PI / 2
    );

    expect(idle.atlasFamily).toBe("motionBase");
    expect(idle.column).toBe(4);
    expect(crawlNeutral.atlasFamily).toBe("base");
    expect(crawlNeutral.column).toBe(1);
    expect(crawlStep.atlasFamily).toBe("motionBase");
    expect(crawlStep.column).toBe(1);
  });

  it("has valid anchors for all 320 generated motion and seated cells", () => {
    const motionPhase = Math.PI / 2;
    const visited = new Set<string>();
    for (const stage of [0, 1, 4, 5, 6, 7, 9, 10]) {
      for (const gender of genders) {
        for (const heritage of heritages) {
          const look = avatarLook(stage, gender, heritage);
          for (const facing of facings) {
            const frame = storybookAnimationFrameForLook(
              look,
              { moving: true, facing, verticalBias: 0 },
              motionPhase
            );
            const anchor = storybookGroundAnchorForFrame(frame);
            visited.add(
              `${frame.atlasFamily}:${frame.atlasKey}:${frame.row}:${frame.column}`
            );
            expect(anchor).not.toBeNull();
            expect(anchor?.[0]).toBeGreaterThanOrEqual(0);
            expect(anchor?.[0]).toBeLessThanOrEqual(256);
            expect(anchor?.[1]).toBeGreaterThanOrEqual(0);
            expect(anchor?.[1]).toBeLessThanOrEqual(256);
          }
          const seated = storybookAnimationFrameForLook(
            look,
            {
              moving: false,
              facing: "front",
              verticalBias: 0,
              pose: "sit",
            },
            0
          );
          visited.add(
            `${seated.atlasFamily}:${seated.atlasKey}:${seated.row}:${seated.column}`
          );
          expect(storybookGroundAnchorForFrame(seated)).not.toBeNull();
          expect(storybookFrameScale(seated)).toBe(1);
        }
      }
    }
    expect(visited.size).toBe(320);
  });

  it("has valid anchors for all 576 alternate neutral, motion, and seated cells", () => {
    const motionPhase = Math.PI / 2;
    const visited = new Set<string>();
    for (const stage of [0, 1, 4, 5, 6, 7, 9, 10]) {
      for (const gender of genders) {
        for (const heritage of heritages) {
          const look = avatarLook(
            stage,
            gender,
            heritage,
            "alternate"
          );
          for (const facing of facings) {
            const neutral = storybookAnimationFrameForLook(
              look,
              { moving: true, facing, verticalBias: 0 },
              0
            );
            const motion = storybookAnimationFrameForLook(
              look,
              { moving: true, facing, verticalBias: 0 },
              motionPhase
            );
            expect(neutral.atlasFamily).toBe("alternate");
            expect(neutral.column).toBeLessThan(4);
            expect(motion.atlasFamily).toBe("alternate");
            expect(motion.column).toBe(neutral.column + 4);
            for (const frame of [neutral, motion]) {
              visited.add(
                `${frame.atlasKey}:${frame.row}:${frame.column}`
              );
              expect(storybookGroundAnchorForFrame(frame)).not.toBeNull();
            }
          }
          const seated = storybookAnimationFrameForLook(
            look,
            {
              moving: false,
              facing: "back",
              verticalBias: 0,
              pose: "sit",
            },
            0
          );
          expect(seated.atlasFamily).toBe("alternate");
          expect(seated.column).toBe(8);
          expect(storybookFrameScale(seated)).toBe(1);
          visited.add(
            `${seated.atlasKey}:${seated.row}:${seated.column}`
          );
          expect(storybookGroundAnchorForFrame(seated)).not.toBeNull();
        }
      }
    }
    expect(visited.size).toBe(576);
  });
});
