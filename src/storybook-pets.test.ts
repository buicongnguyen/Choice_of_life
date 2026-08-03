import { afterEach, describe, expect, it, vi } from "vitest";

const originalImage = globalThis.Image;

afterEach(() => {
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: originalImage,
  });
  vi.resetModules();
});

function dispatch(
  listeners: Map<string, EventListenerOrEventListenerObject>,
  type: string
): void {
  const listener = listeners.get(type);
  const event = new Event(type);
  if (typeof listener === "function") listener(event);
  else listener?.handleEvent(event);
}

function drawableContext() {
  return {
    beginPath: vi.fn(),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    restore: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
  };
}

describe("storybook pet atlases", () => {
  it("maps every direction and animation state to the 4×4 contract", async () => {
    const { storybookPetFrame } = await import("./storybook-pets");
    const directions = [
      ["front", 0],
      ["left", 1],
      ["back", 2],
      ["right", 3],
    ] as const;

    for (const [facing, column] of directions) {
      expect(storybookPetFrame({ facing })).toEqual({
        column,
        row: 0,
      });
      expect(
        storybookPetFrame({ facing, moving: true, phase: 0 })
      ).toEqual({ column, row: 1 });
      expect(
        storybookPetFrame({
          facing,
          moving: true,
          phase: Math.PI,
        })
      ).toEqual({ column, row: 2 });
      expect(
        storybookPetFrame({
          facing,
          moving: true,
          phase: Math.PI,
          sitting: true,
        })
      ).toEqual({ column, row: 3 });
    }

    expect(
      storybookPetFrame({ moving: true, phase: -Math.PI / 2 })
    ).toEqual({ column: 0, row: 2 });
  });

  it("decodes one image per URL and draws the exact source cell and foot anchor", async () => {
    const requested: string[] = [];
    let decodeCount = 0;

    class ImmediateImage {
      decoding = "";
      naturalWidth = 1024;
      naturalHeight = 1024;
      private listeners = new Map<
        string,
        EventListenerOrEventListenerObject
      >();

      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ): void {
        this.listeners.set(type, listener);
      }

      decode(): Promise<void> {
        decodeCount += 1;
        return Promise.resolve();
      }

      set src(value: string) {
        requested.push(value);
        queueMicrotask(() => dispatch(this.listeners, "load"));
      }
    }

    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: ImmediateImage,
    });
    const {
      drawStorybookPet,
      storybookPetAtlasUrl,
      warmStorybookPetAtlases,
    } = await import("./storybook-pets");

    const loadingContext = drawableContext();
    expect(
      drawStorybookPet(
        loadingContext as unknown as CanvasRenderingContext2D,
        140,
        210,
        "dog"
      )
    ).toBe(false);
    expect(requested).toEqual([storybookPetAtlasUrl("dog")]);

    expect(await warmStorybookPetAtlases("dog")).toBe(true);
    expect(await warmStorybookPetAtlases("dog")).toBe(true);
    expect(requested).toHaveLength(1);
    expect(decodeCount).toBe(1);

    const ctx = drawableContext();
    expect(
      drawStorybookPet(
        ctx as unknown as CanvasRenderingContext2D,
        140,
        210,
        "dog",
        {
          facing: "left",
          focused: true,
          moving: true,
          phase: Math.PI,
        }
      )
    ).toBe(true);

    const size = 76 * 1.08;
    expect(ctx.translate).toHaveBeenCalledWith(140, 210);
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([
      256,
      512,
      256,
      256,
      -(128 / 256) * size,
      -(236 / 256) * size,
      size,
      size,
    ]);
    expect(ctx.ellipse).toHaveBeenCalledTimes(2);
    expect(requested).toHaveLength(1);
  });

  it("caches render failures and retries them only through explicit warming", async () => {
    const requested: string[] = [];
    let attempt = 0;

    class RetryImage {
      decoding = "";
      naturalWidth = 0;
      naturalHeight = 0;
      private listeners = new Map<
        string,
        EventListenerOrEventListenerObject
      >();

      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ): void {
        this.listeners.set(type, listener);
      }

      decode(): Promise<void> {
        return Promise.resolve();
      }

      set src(value: string) {
        requested.push(value);
        attempt += 1;
        if (attempt === 1) {
          queueMicrotask(() => dispatch(this.listeners, "error"));
          return;
        }
        this.naturalWidth = 1024;
        this.naturalHeight = 1024;
        queueMicrotask(() => dispatch(this.listeners, "load"));
      }
    }

    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: RetryImage,
    });
    const {
      drawStorybookPet,
      warmStorybookPetAtlases,
    } = await import("./storybook-pets");
    const ctx = drawableContext();

    expect(await warmStorybookPetAtlases("cat")).toBe(false);
    expect(requested).toHaveLength(1);
    expect(
      drawStorybookPet(
        ctx as unknown as CanvasRenderingContext2D,
        90,
        130,
        "cat"
      )
    ).toBe(false);
    expect(
      drawStorybookPet(
        ctx as unknown as CanvasRenderingContext2D,
        90,
        130,
        "cat"
      )
    ).toBe(false);
    expect(requested).toHaveLength(1);

    expect(await warmStorybookPetAtlases("cat")).toBe(true);
    expect(requested).toHaveLength(2);
    expect(
      drawStorybookPet(
        ctx as unknown as CanvasRenderingContext2D,
        90,
        130,
        "cat",
        { facing: "back", sitting: true, shadow: false }
      )
    ).toBe(true);
    expect(ctx.drawImage.mock.calls[0].slice(1, 5)).toEqual([
      512,
      768,
      256,
      256,
    ]);
    expect(ctx.ellipse).not.toHaveBeenCalled();
  });
});
