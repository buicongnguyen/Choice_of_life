import { describe, expect, it } from "vitest";
import { avatarLook } from "./sprites";
import {
  cuteGeometry,
  drawCuteCharacter,
  type CuteCharacterMotion,
} from "./cute-characters";
import type { Gender, HeritageStyle } from "./types";

const genders: Gender[] = ["male", "female"];
const heritages: HeritageStyle[] = [
  "western",
  "asian",
  "middleEastern",
  "black",
];
const facings: CuteCharacterMotion["facing"][] = [
  "front",
  "left",
  "right",
  "back",
];

interface RecordedCall {
  name: string;
  args: unknown[];
}

function recordingContext(): {
  context: CanvasRenderingContext2D;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const target: Record<PropertyKey, unknown> = {};
  const context = new Proxy(target, {
    get(object, property) {
      if (!(property in object)) {
        object[property] = (...args: unknown[]) => {
          calls.push({ name: String(property), args });
        };
      }
      return object[property];
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

describe("v5 cute character geometry", () => {
  it("keeps every age, gender, and heritage within the chibi silhouette contract", () => {
    for (let stage = 0; stage < 12; stage += 1) {
      for (const gender of genders) {
        for (const heritage of heritages) {
          const look = avatarLook(stage, gender, heritage);
          const geometry = cuteGeometry(look);

          for (const value of Object.values(geometry)) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThan(0);
          }

          expect(geometry.headHeight / geometry.height).toBeGreaterThanOrEqual(
            stage === 0 ? 0.46 : 0.28
          );
          expect(geometry.headHeight / geometry.height).toBeLessThanOrEqual(0.54);
          expect(geometry.silhouetteWidth).toBeGreaterThanOrEqual(
            geometry.headWidth
          );
          expect(geometry.bodyHeight + geometry.legHeight + geometry.headHeight)
            .toBeCloseTo(geometry.height * 0.975, 5);
          expect(look.gender).toBe(gender);
          expect(look.heritage).toBe(heritage);
        }
      }
    }
  });

  it("grows toward adulthood, then softens the elder silhouette", () => {
    const heights = Array.from({ length: 12 }, (_, stage) =>
      cuteGeometry(avatarLook(stage, "male")).height
    );

    expect(heights.slice(0, 8)).toEqual(
      [...heights.slice(0, 8)].sort((a, b) => a - b)
    );
    expect(heights[7]).toBe(heights[8]);
    expect(heights[9]).toBeLessThan(heights[8]);
    expect(heights[10]).toBeLessThan(heights[9]);
    expect(heights[11]).toBeLessThan(heights[10]);

    const adult = cuteGeometry(avatarLook(7, "female"));
    const child = cuteGeometry(avatarLook(3, "female"));
    const elder = cuteGeometry(avatarLook(11, "female"));
    expect(adult.headHeight / adult.height).toBeLessThan(
      child.headHeight / child.height
    );
    expect(elder.headHeight / elder.height).toBeGreaterThan(
      adult.headHeight / adult.height
    );
  });

  it("keeps healthy adult male and female fallback silhouettes distinct", () => {
    for (const heritage of heritages) {
      const male = cuteGeometry(
        avatarLook(7, "male", heritage)
      );
      const female = cuteGeometry(
        avatarLook(7, "female", heritage)
      );

      expect(male.shoulderWidth).toBeGreaterThan(
        female.shoulderWidth
      );
      expect(female.hipWidth / female.torsoWidth).toBeGreaterThan(
        male.hipWidth / male.torsoWidth
      );
      expect(female.hipWidth).toBeGreaterThan(
        female.torsoWidth
      );
    }
  });
});

describe("v5 cute character renderer matrix", () => {
  it("draws all stage, gender, heritage, facing, and motion combinations without invalid coordinates", () => {
    for (let stage = 0; stage < 12; stage += 1) {
      for (const gender of genders) {
        for (const heritage of heritages) {
          for (const facing of facings) {
            for (const moving of [false, true]) {
              const { context, calls } = recordingContext();
              drawCuteCharacter(
                context,
                160,
                220,
                avatarLook(stage, gender, heritage),
                stage * 0.73,
                { moving, facing, verticalBias: 0 }
              );

              expect(calls.length).toBeGreaterThan(15);
              for (const call of calls) {
                for (const argument of call.args) {
                  if (typeof argument === "number") {
                    expect(
                      Number.isFinite(argument),
                      `${call.name} received ${String(argument)}`
                    ).toBe(true);
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  it("covers seated elders and every crawling-baby facing", () => {
    for (const facing of facings) {
      const { context: babyContext, calls: babyCalls } = recordingContext();
      drawCuteCharacter(
        babyContext,
        120,
        180,
        avatarLook(0, "female", "black"),
        1.4,
        { moving: true, facing, verticalBias: 0 }
      );
      expect(babyCalls.length).toBeGreaterThan(15);
    }

    const { context: elderContext, calls: elderCalls } = recordingContext();
    drawCuteCharacter(
      elderContext,
      120,
      180,
      avatarLook(11, "male", "asian"),
      0.6,
      { moving: false, facing: "front", verticalBias: 0, pose: "sit" }
    );
    expect(elderCalls.some((call) => call.name === "ellipse")).toBe(true);
    expect(elderCalls.some((call) => call.name === "lineTo")).toBe(true);
  });
});
