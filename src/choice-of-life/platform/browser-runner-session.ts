import type { RunnerLaboratoryShellPort } from "../core/shell-contracts";
import {
  createRunnerSession,
  type RunnerSession,
  type RunnerSessionDependencies,
} from "./runner-session";
import type { VisibilityTarget } from "./frame-lifecycle";

/**
 * Owns the browser-only clock, animation-frame, visibility, and focus wiring.
 * The authoritative session itself remains deterministic and DOM-free.
 */
export function createBrowserRunnerSession(
  shell: RunnerLaboratoryShellPort,
  ownerDocument: Document,
): RunnerSession {
  const ownerWindow = ownerDocument.defaultView;
  if (ownerWindow === null) {
    throw new TypeError("runner browser session requires a document with a window");
  }
  if (
    typeof ownerWindow.requestAnimationFrame !== "function" ||
    typeof ownerWindow.cancelAnimationFrame !== "function" ||
    typeof ownerWindow.performance?.now !== "function" ||
    typeof ownerDocument.hasFocus !== "function"
  ) {
    throw new TypeError("runner browser session requires animation-frame, clock, and focus capabilities");
  }

  const dependencies: RunnerSessionDependencies = {
    shell,
    clock: {
      nowMilliseconds: () => ownerWindow.performance.now(),
    },
    animationFrame: {
      requestAnimationFrame(callback): number {
        return ownerWindow.requestAnimationFrame(() => callback());
      },
      cancelAnimationFrame(handle): void {
        ownerWindow.cancelAnimationFrame(handle);
      },
    },
    lifecycle: {
      visibilityTarget: ownerDocument as VisibilityTarget,
      focusTarget: ownerWindow,
      isFocused: () => ownerDocument.hasFocus(),
    },
  };
  return createRunnerSession(dependencies);
}
