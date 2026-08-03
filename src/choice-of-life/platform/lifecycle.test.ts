import { describe, expect, it, vi } from "vitest";

import { CleanupBag } from "./lifecycle";

describe("CleanupBag", () => {
  it("disposes registered work once in reverse registration order", () => {
    const calls: string[] = [];
    const bag = new CleanupBag();
    bag.add(() => calls.push("first"));
    bag.add(() => calls.push("second"));

    bag.dispose();
    bag.dispose();

    expect(calls).toEqual(["second", "first"]);
  });

  it("removes event listeners and immediately cleans work registered after disposal", () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const lateCleanup = vi.fn();
    const bag = new CleanupBag();
    bag.listen(target, "change", listener);

    target.dispatchEvent(new Event("change"));
    bag.dispose();
    target.dispatchEvent(new Event("change"));
    bag.add(lateCleanup);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(lateCleanup).toHaveBeenCalledTimes(1);
  });

  it("continues cleanup after one adapter throws", () => {
    const completed = vi.fn();
    const bag = new CleanupBag();
    bag.add(completed);
    bag.add(() => {
      throw new Error("adapter cleanup failed");
    });

    expect(() => bag.dispose()).not.toThrow();
    expect(completed).toHaveBeenCalledTimes(1);
  });
});
