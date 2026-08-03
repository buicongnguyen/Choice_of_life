import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const CELL_SIZE = 256;
const GRID_SIZE = 4;
const GROUND_ANCHOR = [128, 236];
const MIN_VISIBLE_PIXELS = 5_000;
const MIN_FILE_BYTES = 100_000;
const MAX_FILE_BYTES = 1_000_000;
const petDirectory = fileURLToPath(
  new URL("./assets/pets/", import.meta.url)
);
const expectedAtlases = [
  "pet-atlas-cat.png",
  "pet-atlas-dog.png",
];
const expectedRows = ["idle", "walkA", "walkB", "sit"];
const expectedColumns = ["front", "left", "back", "right"];
const anchors = JSON.parse(
  readFileSync(`${petDirectory}/pet-anchors.json`, "utf8")
);
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (
    leftDistance <= upDistance &&
    leftDistance <= upperLeftDistance
  ) {
    return left;
  }
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodeRgbaPng(path) {
  const png = readFileSync(path);
  if (!png.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error(`${path} is not a PNG file`);
  }

  let offset = pngSignature.length;
  let header;
  const imageDataChunks = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) {
      throw new Error(`${path} contains a truncated ${type} chunk`);
    }
    if (type === "IHDR") {
      header = {
        width: png.readUInt32BE(dataStart),
        height: png.readUInt32BE(dataStart + 4),
        bitDepth: png[dataStart + 8],
        colorType: png[dataStart + 9],
        compression: png[dataStart + 10],
        filter: png[dataStart + 11],
        interlace: png[dataStart + 12],
      };
    } else if (type === "IDAT") {
      imageDataChunks.push(png.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!header) throw new Error(`${path} has no IHDR chunk`);
  if (
    header.bitDepth !== 8 ||
    header.colorType !== 6 ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    header.interlace !== 0
  ) {
    throw new Error(
      `${path} must be an 8-bit, non-interlaced RGBA PNG; got ${JSON.stringify(header)}`
    );
  }

  const bytesPerPixel = 4;
  const rowBytes = header.width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(imageDataChunks));
  const expectedLength = (rowBytes + 1) * header.height;
  if (filtered.length !== expectedLength) {
    throw new Error(
      `${path} inflated to ${filtered.length} bytes; expected ${expectedLength}`
    );
  }

  const rgba = Buffer.alloc(rowBytes * header.height);
  let sourceOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filterType = filtered[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = filtered[sourceOffset];
      sourceOffset += 1;
      const destination = y * rowBytes + x;
      const left =
        x >= bytesPerPixel ? rgba[destination - bytesPerPixel] : 0;
      const up = y > 0 ? rgba[destination - rowBytes] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? rgba[destination - rowBytes - bytesPerPixel]
          : 0;
      let predictor;
      switch (filterType) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = up;
          break;
        case 3:
          predictor = Math.floor((left + up) / 2);
          break;
        case 4:
          predictor = paeth(left, up, upperLeft);
          break;
        default:
          throw new Error(`${path} uses unsupported PNG filter ${filterType}`);
      }
      rgba[destination] = (encoded + predictor) & 0xff;
    }
  }

  return { ...header, rgba };
}

function alphaAt(image, x, y) {
  return image.rgba[(y * image.width + x) * 4 + 3];
}

function inspectCell(image, row, column) {
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  let visiblePixels = 0;
  let minX = CELL_SIZE;
  let minY = CELL_SIZE;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      if (alphaAt(image, startX + x, startY + y) <= 8) continue;
      visiblePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    visiblePixels,
    bounds:
      maxX < 0
        ? undefined
        : {
            minX,
            minY,
            maxX: maxX + 1,
            maxY: maxY + 1,
          },
  };
}

function visibleMagentaPixels(image) {
  let count = 0;
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    const red = image.rgba[offset];
    const green = image.rgba[offset + 1];
    const blue = image.rgba[offset + 2];
    const alpha = image.rgba[offset + 3];
    const magentaDominant =
      red >= 200 &&
      blue >= 150 &&
      green <= 80 &&
      red - green >= 120 &&
      blue - green >= 90;
    if (alpha > 8 && magentaDominant) count += 1;
  }
  return count;
}

describe("v5 pet atlas assets", () => {
  it("checks in exactly the dog and cat runtime atlases", () => {
    const actualAtlases = readdirSync(petDirectory)
      .filter((name) => /^pet-atlas-.*\.png$/.test(name))
      .sort();
    expect(actualAtlases).toEqual(expectedAtlases);
  });

  it("records the runtime grid, directions, and canonical anchors", () => {
    expect(anchors.version).toBe(1);
    expect(anchors.cellSize).toBe(CELL_SIZE);
    expect(anchors.anchorSpace).toBe("source-cell-pixels");
    expect(anchors.rows).toEqual(expectedRows);
    expect(anchors.columns).toEqual(expectedColumns);
    expect(Object.keys(anchors.atlases).sort()).toEqual(["cat", "dog"]);

    for (const kind of ["cat", "dog"]) {
      expect(anchors.atlases[kind]).toHaveLength(GRID_SIZE);
      for (const row of anchors.atlases[kind]) {
        expect(row).toHaveLength(GRID_SIZE);
        for (const anchor of row) {
          expect(anchor).toEqual(GROUND_ANCHOR);
        }
      }
    }
  });

  for (const filename of expectedAtlases) {
    it(`${filename} is a clean, grounded 4 x 4 RGBA atlas`, () => {
      const path = `${petDirectory}/${filename}`;
      const fileBytes = statSync(path).size;
      expect(fileBytes).toBeGreaterThanOrEqual(MIN_FILE_BYTES);
      expect(fileBytes).toBeLessThanOrEqual(MAX_FILE_BYTES);

      const image = decodeRgbaPng(path);
      expect([image.width, image.height]).toEqual([
        GRID_SIZE * CELL_SIZE,
        GRID_SIZE * CELL_SIZE,
      ]);
      expect(visibleMagentaPixels(image)).toBe(0);

      let populatedCells = 0;
      for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
          const { visiblePixels, bounds } = inspectCell(
            image,
            row,
            column
          );
          expect(bounds, `${filename} r${row}c${column}`).toBeDefined();
          expect(
            visiblePixels,
            `${filename} r${row}c${column} visible pixels`
          ).toBeGreaterThanOrEqual(MIN_VISIBLE_PIXELS);
          populatedCells += 1;

          expect(bounds.minX).toBeGreaterThanOrEqual(5);
          expect(bounds.minY).toBeGreaterThanOrEqual(5);
          expect(bounds.maxX).toBeLessThanOrEqual(CELL_SIZE - 5);
          expect(bounds.maxY).toBeLessThanOrEqual(CELL_SIZE - 5);
          expect(bounds.maxY).toBe(GROUND_ANCHOR[1]);
          expect(bounds.maxY - bounds.minY).toBeGreaterThanOrEqual(188);
          expect(bounds.maxY - bounds.minY).toBeLessThanOrEqual(192);
          expect(
            Math.abs((bounds.minX + bounds.maxX) / 2 - GROUND_ANCHOR[0])
          ).toBeLessThanOrEqual(1);

          const startX = column * CELL_SIZE;
          const startY = row * CELL_SIZE;
          const cornerAlpha = [
            alphaAt(image, startX, startY),
            alphaAt(image, startX + CELL_SIZE - 1, startY),
            alphaAt(image, startX, startY + CELL_SIZE - 1),
            alphaAt(
              image,
              startX + CELL_SIZE - 1,
              startY + CELL_SIZE - 1
            ),
          ];
          expect(cornerAlpha).toEqual([0, 0, 0, 0]);
        }
      }
      expect(populatedCells).toBe(GRID_SIZE * GRID_SIZE);
    });
  }
});
