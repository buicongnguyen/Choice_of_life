import { describe, expect, it } from "vitest";
import {
  ATLAS_WALK_BOB_RATIO,
  ATLAS_WALK_PHASE_SCALE,
  MOVE_START_MAGNITUDE,
  MOVE_STOP_MAGNITUDE,
  atlasUsesMotionFrame,
  atlasWalkBob,
  movementIsActive,
  stableFacingForVector,
} from "./character-motion";

describe("generated character gait stability", () => {
  it("uses the engine walk phase without the former rapid multiplier", () => {
    expect(ATLAS_WALK_PHASE_SCALE).toBe(1);
    expect(atlasUsesMotionFrame(0)).toBe(false);
    expect(atlasUsesMotionFrame(Math.PI / 2)).toBe(true);
    expect(atlasUsesMotionFrame(Math.PI * 1.5)).toBe(false);
    expect(atlasUsesMotionFrame(Number.NaN)).toBe(false);
  });

  it("keeps the supporting foot nearly grounded while the pose changes", () => {
    expect(ATLAS_WALK_BOB_RATIO).toBe(0.003);
    expect(atlasWalkBob(0, 142)).toBe(0);
    expect(atlasWalkBob(Math.PI / 2, 142)).toBeCloseTo(0.426);
    expect(atlasWalkBob(Math.PI / 2, 256)).toBeLessThan(0.8);
  });
});

describe("movement input hysteresis", () => {
  it("uses separate start and stop thresholds", () => {
    expect(MOVE_STOP_MAGNITUDE).toBeLessThan(
      MOVE_START_MAGNITUDE
    );
    expect(movementIsActive(0.12, false)).toBe(false);
    expect(movementIsActive(0.12, true)).toBe(true);
    expect(movementIsActive(0.06, true)).toBe(false);
    expect(movementIsActive(Number.NaN, true)).toBe(false);
  });

  it("does not swap facing axes for small diagonal joystick jitter", () => {
    expect(stableFacingForVector("right", 0.7, 0.64)).toBe(
      "right"
    );
    expect(stableFacingForVector("front", 0.64, 0.7)).toBe(
      "front"
    );
    expect(stableFacingForVector("left", 0.1, 0.04)).toBe(
      "left"
    );
  });

  it("changes direction when the new axis clearly dominates", () => {
    expect(stableFacingForVector("front", -0.9, 0.2)).toBe(
      "left"
    );
    expect(stableFacingForVector("left", 0.2, -0.9)).toBe(
      "back"
    );
    expect(stableFacingForVector("back", 0.9, 0.1)).toBe(
      "right"
    );
    expect(stableFacingForVector("right", -0.95, 0)).toBe(
      "left"
    );
  });
});
