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

describe("summer character atlas routing", () => {
  it("keeps all heritages, genders, directions, and motion cells distinct", async () => {
    const {
      SUMMER_GENDERS,
      SUMMER_HERITAGES,
      summerCharacterAtlasUrl,
      summerCharacterFrame,
      summerCharacterGroundAnchor,
    } = await import("./summer-characters");
    const directions = [
      ["front", 0],
      ["left", 1],
      ["back", 2],
      ["right", 3],
    ] as const;
    const urls = new Set<string>();
    const frames = new Set<string>();

    for (const heritage of SUMMER_HERITAGES) {
      for (const gender of SUMMER_GENDERS) {
        urls.add(summerCharacterAtlasUrl(heritage, gender));
        for (const [facing, column] of directions) {
          const neutral = summerCharacterFrame(
            heritage,
            gender,
            { facing }
          );
          const motion = summerCharacterFrame(
            heritage,
            gender,
            { facing, moving: true, phase: 2 }
          );
          expect(neutral).toEqual({
            atlasKey: `${heritage}-${gender}`,
            column,
          });
          expect(motion).toEqual({
            atlasKey: `${heritage}-${gender}`,
            column: column + 4,
          });
          for (const frame of [neutral, motion]) {
            frames.add(`${frame.atlasKey}:${frame.column}`);
            const anchor = summerCharacterGroundAnchor(frame);
            expect(anchor).not.toBeNull();
            expect(anchor?.[0]).toBeGreaterThan(0);
            expect(anchor?.[0]).toBeLessThan(256);
            expect(anchor?.[1]).toBe(251);
          }
        }
      }
    }

    expect(urls.size).toBe(8);
    expect(frames.size).toBe(64);
    expect(
      summerCharacterFrame("asian", "female", {
        facing: "right",
        moving: true,
        phase: Number.NaN,
      }).column
    ).toBe(3);
  });

  it("ships a complete manifest matching the runtime contract", async () => {
    const manifestModule = await import(
      "./assets/summer/summer-anchors.json"
    );
    const manifest = manifestModule.default;
    expect(manifest).toMatchObject({
      version: 1,
      cellSize: 256,
      anchorSpace: "source-cell-pixels",
      heritages: [
        "western",
        "asian",
        "middleEastern",
        "black",
      ],
      genders: ["male", "female"],
      rows: ["neutral", "motion"],
      sourceColumns: [
        "front",
        "screenLeft",
        "back",
        "screenRight",
      ],
      columns: [
        "frontNeutral",
        "screenLeftNeutral",
        "backNeutral",
        "screenRightNeutral",
        "frontMotion",
        "screenLeftMotion",
        "backMotion",
        "screenRightMotion",
      ],
    });
    const entries = Object.entries(manifest.atlases);
    expect(entries).toHaveLength(8);
    expect(
      entries.flatMap(([, anchors]) => anchors)
    ).toHaveLength(64);
    for (const [, anchors] of entries) {
      expect(anchors).toHaveLength(8);
      for (const anchor of anchors) {
        expect(anchor).toHaveLength(2);
        expect(anchor[0]).toBeGreaterThan(0);
        expect(anchor[0]).toBeLessThan(256);
        expect(anchor[1]).toBe(251);
      }
    }
  });

  it("loads one exact identity and draws its grounded motion cell", async () => {
    const requested: string[] = [];
    let decodeCount = 0;

    class ImmediateImage {
      decoding = "";
      naturalWidth = 2048;
      naturalHeight = 256;
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
      drawSummerCharacter,
      summerCharacterAtlasUrl,
      warmSummerCharacterAtlases,
    } = await import("./summer-characters");
    const ctx = drawableContext();

    expect(
      drawSummerCharacter(
        ctx as unknown as CanvasRenderingContext2D,
        90,
        150,
        "middleEastern",
        "female"
      )
    ).toBe(false);
    expect(requested).toEqual([
      summerCharacterAtlasUrl("middleEastern", "female"),
    ]);

    expect(
      await warmSummerCharacterAtlases(
        "middleEastern",
        "female"
      )
    ).toBe(true);
    expect(requested).toHaveLength(1);
    expect(decodeCount).toBe(1);

    expect(
      drawSummerCharacter(
        ctx as unknown as CanvasRenderingContext2D,
        90,
        150,
        "middleEastern",
        "female",
        {
          facing: "back",
          moving: true,
          phase: 1,
          size: 128,
        }
      )
    ).toBe(true);
    expect(ctx.translate).toHaveBeenCalledOnce();
    expect(ctx.translate.mock.calls[0][0]).toBe(90);
    expect(ctx.translate.mock.calls[0][1]).toBeCloseTo(
      150 -
        Math.abs(Math.sin(1)) *
          Math.max(0.35, 128 * 0.003)
    );
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(ctx.drawImage.mock.calls[0].slice(1, 5)).toEqual([
      6 * 256,
      0,
      256,
      256,
    ]);
    expect(ctx.ellipse).toHaveBeenCalledOnce();
  });

  it("rejects an atlas with the wrong runtime dimensions", async () => {
    class WrongSizeImage {
      decoding = "";
      naturalWidth = 1024;
      naturalHeight = 256;
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

      set src(_value: string) {
        queueMicrotask(() => dispatch(this.listeners, "load"));
      }
    }

    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: WrongSizeImage,
    });
    const {
      drawSummerCharacter,
      warmSummerCharacterAtlases,
    } = await import("./summer-characters");
    expect(
      await warmSummerCharacterAtlases("black", "male")
    ).toBe(false);
    expect(
      drawSummerCharacter(
        drawableContext() as unknown as CanvasRenderingContext2D,
        80,
        140,
        "black",
        "male"
      )
    ).toBe(false);
  });
});
