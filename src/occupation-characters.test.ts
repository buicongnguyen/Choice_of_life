import { afterEach, describe, expect, it, vi } from "vitest";
import { OCCUPATIONS } from "./occupations";

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
    clearRect: vi.fn(),
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

describe("occupation character atlas routing", () => {
  it("keeps every job, heritage, gender, direction, and motion cell distinct", async () => {
    const {
      OCCUPATION_HERITAGES,
      OCCUPATION_UNIFORMS,
      occupationCharacterAtlasUrl,
      occupationCharacterFrame,
    } = await import("./occupation-characters");
    const ages = {
      doctor: "middleAge",
      trainer: "adult",
      dancer: "adult",
      soldier: "adult",
      farmer: "middleAge",
    } as const;
    const directions = [
      ["front", 0],
      ["left", 1],
      ["back", 2],
      ["right", 3],
    ] as const;
    const urls = new Set<string>();

    for (const uniform of OCCUPATION_UNIFORMS) {
      for (const heritage of OCCUPATION_HERITAGES) {
        for (const gender of ["male", "female"] as const) {
          urls.add(
            occupationCharacterAtlasUrl(
              uniform,
              heritage,
              gender
            )
          );
          for (const [facing, column] of directions) {
            expect(
              occupationCharacterFrame(
                uniform,
                heritage,
                gender,
                { facing }
              )
            ).toEqual({
              atlasKey: `${uniform}-${heritage}-${gender}`,
              ageBand: ages[uniform],
              column,
            });
            expect(
              occupationCharacterFrame(
                uniform,
                heritage,
                gender,
                { facing, moving: true, phase: 2 }
              )
            ).toEqual({
              atlasKey: `${uniform}-${heritage}-${gender}`,
              ageBand: ages[uniform],
              column: column + 4,
            });
          }
        }
      }
    }

    expect(urls.size).toBe(20);
    expect(
      occupationCharacterFrame(
        "doctor",
        "black",
        "female"
      )
    ).toBeNull();
    expect(
      occupationCharacterFrame(
        "farmer",
        "middleEastern",
        "male"
      )
    ).toBeNull();
  });

  it("loads one exact gendered atlas and draws its grounded source cell", async () => {
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
      drawOccupationCharacter,
      occupationCharacterAtlasUrl,
      warmOccupationCharacterAtlases,
    } = await import("./occupation-characters");
    const ctx = drawableContext();

    expect(
      drawOccupationCharacter(
        ctx as unknown as CanvasRenderingContext2D,
        90,
        150,
        "doctor",
        "asian",
        "female"
      )
    ).toBe(false);
    expect(requested).toEqual([
      occupationCharacterAtlasUrl(
        "doctor",
        "asian",
        "female"
      ),
    ]);

    expect(
      await warmOccupationCharacterAtlases(
        "asian",
        "female",
        "doctor"
      )
    ).toBe(true);
    expect(requested).toHaveLength(1);
    expect(decodeCount).toBe(1);

    expect(
      drawOccupationCharacter(
        ctx as unknown as CanvasRenderingContext2D,
        90,
        150,
        "doctor",
        "asian",
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

  it("adds all reviewed visual careers without encoding gender in the job", async () => {
    const visualJobs = OCCUPATIONS.filter(
      (occupation) => occupation.uniform
    );
    expect(
      visualJobs.map((occupation) => occupation.id).sort()
    ).toEqual([
      "accountant",
      "analyst",
      "artist",
      "athlete",
      "barista",
      "ceo",
      "chef",
      "dancer",
      "doctor",
      "engineer",
      "entrepreneur",
      "farmer",
      "generalengineer",
      "jrdev",
      "lawyer",
      "manager",
      "nurse",
      "police",
      "soldier",
      "staffeng",
      "teacher",
      "trades",
      "trainer",
    ]);
    expect(
      visualJobs.map((occupation) => occupation.uniform).sort()
    ).toEqual([
      "analyst",
      "analyst",
      "artist",
      "athlete",
      "barista",
      "ceo",
      "chef",
      "dancer",
      "doctor",
      "doctor",
      "entrepreneur",
      "farmer",
      "generalengineer",
      "generalengineer",
      "lawyer",
      "manager",
      "police",
      "softwareengineer",
      "softwareengineer",
      "softwareengineer",
      "soldier",
      "teacher",
      "trainer",
    ]);
    expect(
      visualJobs.every(
        (occupation) =>
          !occupation.id.includes("male") &&
          !occupation.id.includes("female")
      )
    ).toBe(true);
  });
});
