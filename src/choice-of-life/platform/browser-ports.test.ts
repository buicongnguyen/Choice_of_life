import { describe, expect, it } from "vitest";

import { createBrowserSeedPort, createBrowserStoragePort } from "./browser-ports";

describe("browser ports", () => {
  it("encodes exactly eight injected random bytes as a lowercase seed", () => {
    const seed = createBrowserSeedPort(() => ({
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        const bytes = array as Uint8Array;
        bytes.set([0, 1, 2, 10, 15, 16, 254, 255]);
        return array;
      },
    }));
    expect(seed.nextSeed()).toBe("0001020a0f10feff");
  });

  it("defers storage acquisition so denied localStorage is caught by the save store", () => {
    const port = createBrowserStoragePort(() => {
      throw new Error("denied");
    });
    expect(() => port.getItem("key")).toThrow("denied");
  });
});
