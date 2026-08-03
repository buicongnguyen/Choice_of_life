import type { FixedStepDriver } from "./fixed-step-driver";
import { CleanupBag } from "./lifecycle";

export interface VisibilityTarget extends EventTarget {
  readonly visibilityState: "visible" | "hidden";
}

export interface FrameLifecycleAdapter {
  setUserPaused(active: boolean): void;
  setModalOpen(active: boolean): void;
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
  const syncVisibility = (): void => driver.setPauseReason("visibility", visibilityTarget.visibilityState !== "visible");
  const onBlur = (): void => driver.setPauseReason("blur", true);
  const onFocus = (): void => driver.setPauseReason("blur", false);
  lifetime.listen(visibilityTarget, "visibilitychange", syncVisibility);
  lifetime.listen(focusTarget, "blur", onBlur);
  lifetime.listen(focusTarget, "focus", onFocus);
  syncVisibility();
  driver.setPauseReason("blur", !isFocused());
  return {
    setUserPaused(active: boolean): void {
      driver.setPauseReason("user", active);
    },
    setModalOpen(active: boolean): void {
      driver.setPauseReason("modal", active);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      lifetime.dispose();
      driver.setPauseReason("visibility", false);
      driver.setPauseReason("blur", false);
      driver.setPauseReason("user", false);
      driver.setPauseReason("modal", false);
      driver.reset();
    },
  };
}
