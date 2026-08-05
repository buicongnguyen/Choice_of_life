// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createRunnerLaboratoryEntryState } from "../core/runner/contract";
import type {
  RunnerLaboratoryCommitResult,
  RunnerLaboratoryShellPort,
} from "../core/shell-contracts";
import type { RunStateV1 } from "../core/run-state";
import { createBrowserRunnerSession } from "./browser-runner-session";

const ENTRY = createRunnerLaboratoryEntryState("0000000000000001", {
  startingProfileId: "steady-mix-v1",
  difficulty: "normal",
  controlMode: "manual",
  identity: { gender: "female" },
  appearance: {
    heritageStyleId: "asian",
    hairStyleId: "short-soft",
    hairColorId: "black",
    clothingPaletteId: "sunrise",
  },
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    textScale: 100,
    screenReaderAnnouncements: true,
  },
});

class FakeRunnerShell implements RunnerLaboratoryShellPort {
  state: RunStateV1 = ENTRY;

  currentRunState(): RunStateV1 {
    return this.state;
  }

  enterRunnerLaboratory() {
    return { kind: "ready" as const, state: this.state };
  }

  restartRunnerLaboratory() {
    return { kind: "invalid" as const, notice: { tone: "warning" as const, message: "not complete" } };
  }

  saveRunnerLaboratoryState(state: RunStateV1): RunnerLaboratoryCommitResult {
    this.state = state;
    return { kind: "saved", state };
  }
}

describe("browser runner session adapter", () => {
  it("uses the owning window for its sole animation-frame loop and cancels it on disposal", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      callbacks.delete(handle);
    });
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const session = createBrowserRunnerSession(new FakeRunnerShell(), document);

    expect(request).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(1);
    session.dispose();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
    expect(hasFocus).toHaveBeenCalled();

    request.mockRestore();
    cancel.mockRestore();
    hasFocus.mockRestore();
  });

  it("rejects a detached document without browser capabilities", () => {
    const detached = document.implementation.createHTMLDocument("detached");
    expect(detached.defaultView).toBeNull();
    expect(() => createBrowserRunnerSession(new FakeRunnerShell(), detached))
      .toThrow(/document with a window/);
  });
});
