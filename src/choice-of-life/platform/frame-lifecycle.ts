import type {
  FixedStepDriver,
  RuntimePauseReason,
} from "./fixed-step-driver";
import { CleanupBag } from "./lifecycle";

export interface VisibilityTarget extends EventTarget {
  readonly visibilityState: "visible" | "hidden";
}

export type RuntimeInterruptionReason = Extract<
  RuntimePauseReason,
  "visibility" | "focus-interruption"
>;

export interface FrameLifecycleAdapter {
  setUserPaused(active: boolean): void;
  setModalOpen(active: boolean): boolean;
  setSemanticPaused(active: boolean): void;
  resumeInterruption(reason: RuntimeInterruptionReason): boolean;
  activePauseReasons(): readonly RuntimePauseReason[];
  dispose(): void;
}

export function attachFrameLifecycle(
  driver: FixedStepDriver,
  visibilityTarget: VisibilityTarget,
  focusTarget: EventTarget,
  isFocused: () => boolean = () => true,
): FrameLifecycleAdapter {
  const lifetime = new CleanupBag();
  let disposed = false;
  let focusAvailable = isFocused();
  let focusInterruptionAddedDuringCurrentLoss = false;

  const addFocusInterruptionForCurrentLoss = (): void => {
    if (driver.activePauseReasons().includes("focus-interruption")) return;
    driver.setPauseReason("focus-interruption", true);
    focusInterruptionAddedDuringCurrentLoss = true;
  };
  const syncVisibility = (): void => {
    if (visibilityTarget.visibilityState !== "visible") {
      driver.setPauseReason("visibility", true);
      if (focusInterruptionAddedDuringCurrentLoss) {
        driver.setPauseReason("focus-interruption", false);
        focusInterruptionAddedDuringCurrentLoss = false;
      }
    }
  };
  const onBlur = (): void => {
    focusAvailable = false;
    if (visibilityTarget.visibilityState === "visible") {
      addFocusInterruptionForCurrentLoss();
    }
  };
  const onFocus = (): void => {
    focusAvailable = true;
    focusInterruptionAddedDuringCurrentLoss = false;
  };
  lifetime.listen(visibilityTarget, "visibilitychange", syncVisibility);
  lifetime.listen(focusTarget, "blur", onBlur);
  lifetime.listen(focusTarget, "focus", onFocus);
  syncVisibility();
  if (
    visibilityTarget.visibilityState === "visible" &&
    !focusAvailable
  ) {
    addFocusInterruptionForCurrentLoss();
  }
  return {
    setUserPaused(active: boolean): void {
      if (disposed) return;
      driver.setPauseReason("user", active);
    },
    setModalOpen(active: boolean): boolean {
      if (typeof active !== "boolean") {
        throw new TypeError("Runtime modal state must be a boolean");
      }
      if (disposed) return false;
      try {
        driver.setPauseReason("modal", active);
        return driver.activePauseReasons().includes("modal") === active;
      } catch {
        return false;
      }
    },
    setSemanticPaused(active: boolean): void {
      if (disposed) return;
      driver.setPauseReason("semantic", active);
    },
    resumeInterruption(reason: RuntimeInterruptionReason): boolean {
      if (
        disposed ||
        visibilityTarget.visibilityState !== "visible" ||
        !focusAvailable ||
        !isFocused()
      ) {
        return false;
      }
      const active = driver.activePauseReasons();
      if (!active.includes(reason)) return false;
      driver.setPauseReason(reason, false);
      if (reason === "focus-interruption") {
        focusInterruptionAddedDuringCurrentLoss = false;
      }
      return true;
    },
    activePauseReasons(): readonly RuntimePauseReason[] {
      return driver.activePauseReasons();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      lifetime.dispose();
      for (const reason of [
        "visibility",
        "focus-interruption",
        "user",
        "modal",
        "semantic",
      ] as const) {
        driver.setPauseReason(reason, false);
      }
      driver.reset();
    },
  };
}
