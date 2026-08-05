import { describe, expect, it, vi } from "vitest";

import { createFixedStepDriver } from "./fixed-step-driver";
import { attachFrameLifecycle, type VisibilityTarget } from "./frame-lifecycle";

class FakeVisibilityTarget extends EventTarget implements VisibilityTarget {
  visibilityState: "visible" | "hidden" = "visible";

  setVisibility(state: "visible" | "hidden"): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

class FakeFocusTarget extends EventTarget {
  focused = true;

  loseFocus(): void {
    this.focused = false;
    this.dispatchEvent(new Event("blur"));
  }

  gainFocus(): void {
    this.focused = true;
    this.dispatchEvent(new Event("focus"));
  }
}

describe("frame lifecycle adapter", () => {
  it.each([
    "hidden-then-blur",
    "blur-then-hidden",
  ] as const)("coalesces a same-episode %s sequence into one sticky visibility interruption", (order) => {
    const driver = createFixedStepDriver();
    const visibility = new FakeVisibilityTarget();
    const focus = new FakeFocusTarget();
    const adapter = attachFrameLifecycle(
      driver,
      visibility,
      focus,
      () => focus.focused,
    );

    expect(driver.advanceFrame(0).logicalSteps).toBe(0);
    expect(driver.advanceFrame(20).logicalSteps).toBe(1);
    if (order === "hidden-then-blur") {
      visibility.setVisibility("hidden");
      focus.loseFocus();
    } else {
      focus.loseFocus();
      expect(adapter.activePauseReasons()).toEqual(["focus-interruption"]);
      visibility.setVisibility("hidden");
    }
    expect(adapter.activePauseReasons()).toEqual(["visibility"]);
    expect(driver.advanceFrame(1_000).logicalSteps).toBe(0);

    visibility.setVisibility("visible");
    expect(adapter.activePauseReasons()).toEqual(["visibility"]);
    expect(adapter.resumeInterruption("visibility")).toBe(false);
    focus.gainFocus();
    expect(adapter.activePauseReasons()).toEqual(["visibility"]);
    expect(adapter.resumeInterruption("visibility")).toBe(true);
    expect(adapter.activePauseReasons()).toEqual([]);
    expect(driver.advanceFrame(2_000)).toEqual({
      logicalSteps: 0,
      droppedLogicalSteps: 0,
    });
    expect(driver.advanceFrame(2_020)).toEqual({
      logicalSteps: 1,
      droppedLogicalSteps: 0,
    });
    adapter.dispose();
  });

  it("keeps visible-page blur sticky until focus returns and Resume is activated", () => {
    const driver = createFixedStepDriver();
    const visibility = new FakeVisibilityTarget();
    const focus = new FakeFocusTarget();
    const adapter = attachFrameLifecycle(
      driver,
      visibility,
      focus,
      () => focus.focused,
    );

    focus.loseFocus();
    expect(adapter.activePauseReasons()).toEqual(["focus-interruption"]);
    expect(adapter.resumeInterruption("focus-interruption")).toBe(false);
    focus.gainFocus();
    expect(adapter.activePauseReasons()).toEqual(["focus-interruption"]);
    expect(adapter.resumeInterruption("focus-interruption")).toBe(true);
    expect(adapter.activePauseReasons()).toEqual([]);
    adapter.dispose();
  });

  it("composes user, modal, Semantic, and interruption reasons independently", () => {
    const driver = createFixedStepDriver();
    const visibility = new FakeVisibilityTarget();
    const focus = new FakeFocusTarget();
    const adapter = attachFrameLifecycle(
      driver,
      visibility,
      focus,
      () => focus.focused,
    );

    adapter.setSemanticPaused(true);
    expect(adapter.setModalOpen(true)).toBe(true);
    adapter.setUserPaused(true);
    visibility.setVisibility("hidden");
    expect(adapter.activePauseReasons()).toEqual([
      "visibility",
      "user",
      "modal",
      "semantic",
    ]);

    visibility.setVisibility("visible");
    expect(adapter.resumeInterruption("visibility")).toBe(true);
    expect(adapter.activePauseReasons()).toEqual([
      "user",
      "modal",
      "semantic",
    ]);
    expect(adapter.setModalOpen(false)).toBe(true);
    expect(adapter.activePauseReasons()).toEqual(["user", "semantic"]);
    adapter.setUserPaused(false);
    expect(adapter.activePauseReasons()).toEqual(["semantic"]);
    adapter.setSemanticPaused(false);
    expect(adapter.activePauseReasons()).toEqual([]);
    adapter.dispose();
  });

  it("preserves a retained focus interruption across a later visibility interruption", () => {
    const driver = createFixedStepDriver();
    const visibility = new FakeVisibilityTarget();
    const focus = new FakeFocusTarget();
    const adapter = attachFrameLifecycle(
      driver,
      visibility,
      focus,
      () => focus.focused,
    );

    focus.loseFocus();
    focus.gainFocus();
    expect(adapter.activePauseReasons()).toEqual(["focus-interruption"]);

    visibility.setVisibility("hidden");
    focus.loseFocus();
    expect(adapter.activePauseReasons()).toEqual([
      "visibility",
      "focus-interruption",
    ]);

    visibility.setVisibility("visible");
    focus.gainFocus();
    expect(adapter.resumeInterruption("visibility")).toBe(true);
    expect(adapter.activePauseReasons()).toEqual(["focus-interruption"]);
    expect(adapter.resumeInterruption("focus-interruption")).toBe(true);
    expect(adapter.activePauseReasons()).toEqual([]);
    adapter.dispose();
  });

  it("acknowledges idempotent modal transitions only when they are authoritative", () => {
    const driver = createFixedStepDriver();
    const visibility = new FakeVisibilityTarget();
    const focus = new FakeFocusTarget();
    const adapter = attachFrameLifecycle(
      driver,
      visibility,
      focus,
      () => focus.focused,
    );

    expect(adapter.setModalOpen(true)).toBe(true);
    expect(adapter.setModalOpen(true)).toBe(true);
    expect(adapter.activePauseReasons()).toEqual(["modal"]);
    expect(adapter.setModalOpen(false)).toBe(true);
    expect(adapter.setModalOpen(false)).toBe(true);
    expect(adapter.activePauseReasons()).toEqual([]);
    expect(() => adapter.setModalOpen("open" as never)).toThrow(/boolean/);

    adapter.dispose();
    expect(adapter.setModalOpen(true)).toBe(false);
    expect(adapter.activePauseReasons()).toEqual([]);
  });

  it("rejects a modal transition that the driver cannot establish", () => {
    const driver = createFixedStepDriver();
    const originalSetPauseReason = driver.setPauseReason.bind(driver);
    vi.spyOn(driver, "setPauseReason").mockImplementation((reason, active) => {
      if (reason !== "modal") originalSetPauseReason(reason, active);
    });
    const visibility = new FakeVisibilityTarget();
    const focus = new FakeFocusTarget();
    const adapter = attachFrameLifecycle(
      driver,
      visibility,
      focus,
      () => focus.focused,
    );

    expect(adapter.setModalOpen(true)).toBe(false);
    expect(adapter.activePauseReasons()).toEqual([]);
    adapter.dispose();

    const throwingDriver = createFixedStepDriver();
    const originalThrowingSet = throwingDriver.setPauseReason.bind(throwingDriver);
    vi.spyOn(throwingDriver, "setPauseReason").mockImplementation((reason, active) => {
      if (reason === "modal" && active) throw new Error("driver rejected modal");
      originalThrowingSet(reason, active);
    });
    const throwing = attachFrameLifecycle(
      throwingDriver,
      new FakeVisibilityTarget(),
      new FakeFocusTarget(),
    );
    expect(throwing.setModalOpen(true)).toBe(false);
    throwing.dispose();
  });

  it("initializes one interruption reason from the current visibility/focus state", () => {
    const hiddenDriver = createFixedStepDriver();
    const hiddenVisibility = new FakeVisibilityTarget();
    hiddenVisibility.visibilityState = "hidden";
    const hiddenFocus = new FakeFocusTarget();
    hiddenFocus.focused = false;
    const hidden = attachFrameLifecycle(
      hiddenDriver,
      hiddenVisibility,
      hiddenFocus,
      () => hiddenFocus.focused,
    );
    expect(hidden.activePauseReasons()).toEqual(["visibility"]);
    hidden.dispose();

    const blurredDriver = createFixedStepDriver();
    const visible = new FakeVisibilityTarget();
    const blurredFocus = new FakeFocusTarget();
    blurredFocus.focused = false;
    const blurred = attachFrameLifecycle(
      blurredDriver,
      visible,
      blurredFocus,
      () => blurredFocus.focused,
    );
    expect(blurred.activePauseReasons()).toEqual(["focus-interruption"]);
    blurred.dispose();
  });

  it("disposes listeners and every owned reason exactly once", () => {
    const driver = createFixedStepDriver();
    const reset = vi.spyOn(driver, "reset");
    const visibility = new FakeVisibilityTarget();
    const focus = new FakeFocusTarget();
    const adapter = attachFrameLifecycle(
      driver,
      visibility,
      focus,
      () => focus.focused,
    );
    adapter.setUserPaused(true);
    expect(adapter.setModalOpen(true)).toBe(true);
    adapter.setSemanticPaused(true);
    focus.loseFocus();
    expect(adapter.activePauseReasons()).toEqual([
      "focus-interruption",
      "user",
      "modal",
      "semantic",
    ]);

    adapter.dispose();
    adapter.dispose();
    expect(driver.activePauseReasons()).toEqual([]);
    expect(reset).toHaveBeenCalledTimes(1);

    visibility.setVisibility("hidden");
    focus.loseFocus();
    adapter.setUserPaused(true);
    expect(adapter.setModalOpen(true)).toBe(false);
    adapter.setSemanticPaused(true);
    expect(adapter.resumeInterruption("focus-interruption")).toBe(false);
    expect(driver.activePauseReasons()).toEqual([]);
  });
});
