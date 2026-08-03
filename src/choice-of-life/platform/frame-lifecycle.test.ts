import { describe, expect, it, vi } from "vitest";

import type { FixedStepDriver, RuntimePauseReason } from "./fixed-step-driver";
import { attachFrameLifecycle, type VisibilityTarget } from "./frame-lifecycle";

class FakeVisibilityTarget extends EventTarget implements VisibilityTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

describe("frame lifecycle adapter", () => {
  it("wires visibility, blur, user, and modal reasons and removes listeners", () => {
    const active = new Set<RuntimePauseReason>();
    const setPauseReason = vi.fn((reason: RuntimePauseReason, enabled: boolean) => {
      if (enabled) active.add(reason);
      else active.delete(reason);
    });
    const reset = vi.fn();
    const driver: FixedStepDriver = {
      advanceFrame: vi.fn(() => ({ logicalSteps: 0, droppedLogicalSteps: 0 })),
      setPauseReason,
      isPaused: () => active.size > 0,
      reset,
    };
    const visibility = new FakeVisibilityTarget();
    const focus = new EventTarget();
    const adapter = attachFrameLifecycle(driver, visibility, focus);

    visibility.visibilityState = "hidden";
    visibility.dispatchEvent(new Event("visibilitychange"));
    focus.dispatchEvent(new Event("blur"));
    adapter.setUserPaused(true);
    adapter.setModalOpen(true);
    expect(active).toEqual(new Set(["visibility", "blur", "user", "modal"]));
    focus.dispatchEvent(new Event("focus"));
    expect(active.has("blur")).toBe(false);

    adapter.dispose();
    adapter.dispose();
    expect(active.size).toBe(0);
    expect(reset).toHaveBeenCalledTimes(1);
    const calls = setPauseReason.mock.calls.length;
    visibility.visibilityState = "hidden";
    visibility.dispatchEvent(new Event("visibilitychange"));
    focus.dispatchEvent(new Event("blur"));
    expect(setPauseReason).toHaveBeenCalledTimes(calls);
  });

  it("starts paused when attached after focus was already lost", () => {
    const active = new Set<RuntimePauseReason>();
    const driver: FixedStepDriver = {
      advanceFrame: vi.fn(() => ({ logicalSteps: 0, droppedLogicalSteps: 0 })),
      setPauseReason: (reason, enabled) => enabled ? void active.add(reason) : void active.delete(reason),
      isPaused: () => active.size > 0,
      reset: vi.fn(),
    };
    const visibility = new FakeVisibilityTarget();
    const focus = new EventTarget();
    const adapter = attachFrameLifecycle(driver, visibility, focus, () => false);
    expect(active).toContain("blur");
    focus.dispatchEvent(new Event("focus"));
    expect(active).not.toContain("blur");
    adapter.dispose();
  });
});
