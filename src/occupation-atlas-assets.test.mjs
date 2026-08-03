import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const CELL_SIZE = 256;
const COLUMNS = 8;
const JOBS = ["doctor", "trainer", "dancer", "soldier", "farmer"];
const HERITAGES = ["western", "asian"];
const GENDERS = ["male", "female"];
const MIN_VISIBLE_PIXELS = 6_000;
const directory = fileURLToPath(
  new URL("./assets/occupations/", import.meta.url)
);
const expectedFiles = JOBS.flatMap((job) =>
  HERITAGES.flatMap((heritage) =>
    GENDERS.map(
      (gender) =>
        `occupation-atlas-${job}-${heritage}-${gender}.png`
    )
  )
).sort();
const anchors = JSON.parse(
  readFileSync(`${directory}/occupation-anchors.json`, "utf8")
);
const signature = Buffer.from([
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
  if (!png.subarray(0, signature.length).equals(signature)) {
    throw new Error(`${path} is not a PNG`);
  }
  let offset = signature.length;
  let header;
  const chunks = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (type === "IHDR") {
      header = {
        width: png.readUInt32BE(start),
        height: png.readUInt32BE(start + 4),
        bitDepth: png[start + 8],
        colorType: png[start + 9],
        interlace: png[start + 12],
      };
    } else if (type === "IDAT") {
      chunks.push(png.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  if (!header) throw new Error(`${path} has no IHDR`);
  if (
    header.bitDepth !== 8 ||
    header.colorType !== 6 ||
    header.interlace !== 0
  ) {
    throw new Error(
      `${path} must be an 8-bit non-interlaced RGBA PNG`
    );
  }

  const bytesPerPixel = 4;
  const rowBytes = header.width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(chunks));
  const rgba = Buffer.alloc(rowBytes * header.height);
  let sourceOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = filtered[sourceOffset];
      sourceOffset += 1;
      const destination = y * rowBytes + x;
      const left =
        x >= bytesPerPixel ? rgba[destination - bytesPerPixel] : 0;
      const up = y ? rgba[destination - rowBytes] : 0;
      const upperLeft =
        y && x >= bytesPerPixel
          ? rgba[destination - rowBytes - bytesPerPixel]
          : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) {
        predictor = Math.floor((left + up) / 2);
      } else if (filter === 4) {
        predictor = paeth(left, up, upperLeft);
      } else {
        throw new Error(`${path} uses unsupported PNG filter ${filter}`);
      }
      rgba[destination] = (encoded + predictor) & 0xff;
    }
  }
  return { ...header, rgba };
}

function pixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return image.rgba.subarray(offset, offset + 4);
}

function inspectCell(image, column) {
  const startX = column * CELL_SIZE;
  const visible = new Uint8Array(CELL_SIZE * CELL_SIZE);
  let visiblePixels = 0;
  let visibleMagenta = 0;
  let minX = CELL_SIZE;
  let minY = CELL_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const [red, green, blue, alpha] = pixel(
        image,
        startX + x,
        y
      );
      if (alpha <= 8) continue;
      visiblePixels += 1;
      visible[y * CELL_SIZE + x] = 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (
        red >= 200 &&
        blue >= 150 &&
        green <= 80 &&
        red - green >= 120 &&
        blue - green >= 90
      ) {
        visibleMagenta += 1;
      }
    }
  }
  const visited = new Uint8Array(visible.length);
  let largestComponentArea = 0;
  let largestTopComponentArea = 0;
  let topComponentArea = 0;
  for (let index = 0; index < visible.length; index += 1) {
    if (!visible[index] || visited[index]) continue;
    const pending = [index];
    visited[index] = 1;
    let area = 0;
    let top = CELL_SIZE;
    while (pending.length) {
      const current = pending.pop();
      const x = current % CELL_SIZE;
      const y = Math.floor(current / CELL_SIZE);
      area += 1;
      top = Math.min(top, y);
      const neighbors = [];
      if (x) neighbors.push(current - 1);
      if (x < CELL_SIZE - 1) neighbors.push(current + 1);
      if (y) neighbors.push(current - CELL_SIZE);
      if (y < CELL_SIZE - 1) neighbors.push(current + CELL_SIZE);
      for (const neighbor of neighbors) {
        if (visible[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          pending.push(neighbor);
        }
      }
    }
    if (area > largestComponentArea) {
      largestComponentArea = area;
    }
    if (top <= 8) {
      largestTopComponentArea = Math.max(largestTopComponentArea, area);
      topComponentArea += area;
    }
  }
  return {
    visiblePixels,
    visibleMagenta,
    largestComponentArea,
    largestTopComponentArea,
    topComponentArea,
    bounds: {
      minX,
      minY,
      maxX: maxX + 1,
      maxY: maxY + 1,
    },
  };
}

function differingPixels(image, firstColumn, secondColumn) {
  let difference = 0;
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const first =
        (y * image.width + firstColumn * CELL_SIZE + x) * 4;
      const second =
        (y * image.width + secondColumn * CELL_SIZE + x) * 4;
      if (
        image.rgba[first] !== image.rgba[second] ||
        image.rgba[first + 1] !== image.rgba[second + 1] ||
        image.rgba[first + 2] !== image.rgba[second + 2] ||
        image.rgba[first + 3] !== image.rgba[second + 3]
      ) {
        difference += 1;
      }
    }
  }
  return difference;
}

function upperBodyCentroidX(image, column) {
  const { bounds } = inspectCell(image, column);
  const bodyBottom = Math.min(
    bounds.maxY,
    bounds.minY +
      Math.max(
        1,
        Math.round((bounds.maxY - bounds.minY) * 0.82)
      )
  );
  let totalWeight = 0;
  let weightedX = 0;
  for (let y = bounds.minY; y < bodyBottom; y += 1) {
    for (let x = bounds.minX; x < bounds.maxX; x += 1) {
      const alpha = pixel(
        image,
        column * CELL_SIZE + x,
        y
      )[3];
      if (alpha <= 64) continue;
      totalWeight += alpha;
      weightedX += (x + 0.5) * alpha;
    }
  }
  return weightedX / totalWeight;
}

function burgundyPixels(image, column) {
  let count = 0;
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const [red, green, blue, alpha] = pixel(
        image,
        column * CELL_SIZE + x,
        y
      );
      if (
        alpha > 32 &&
        red >= 55 &&
        red >= green * 1.35 &&
        red >= blue * 1.1 &&
        green < 100 &&
        blue < 120
      ) {
        count += 1;
      }
    }
  }
  return count;
}

describe("occupation character atlas assets", () => {
  it("checks in exactly five jobs for Asian/Western men and women", () => {
    const files = readdirSync(directory)
      .filter((name) => /^occupation-atlas-.*\.png$/.test(name))
      .sort();
    expect(files).toEqual(expectedFiles);
  });

  it("records strict age, direction, gender, and heritage contracts", () => {
    expect(anchors.version).toBe(1);
    expect(anchors.cellSize).toBe(CELL_SIZE);
    expect(anchors.anchorSpace).toBe("source-cell-pixels");
    expect(anchors.jobs).toEqual(JOBS);
    expect(anchors.ageBands).toEqual({
      doctor: "middleAge",
      trainer: "adult",
      dancer: "adult",
      soldier: "adult",
      farmer: "middleAge",
    });
    expect(anchors.columns).toEqual([
      "frontNeutral",
      "screenLeftNeutral",
      "backNeutral",
      "screenRightNeutral",
      "frontMotion",
      "screenLeftMotion",
      "backMotion",
      "screenRightMotion",
    ]);
    expect(Object.keys(anchors.atlases).sort()).toEqual(
      expectedFiles
        .map((name) =>
          name
            .replace("occupation-atlas-", "")
            .replace(".png", "")
        )
        .sort()
    );
  });

  for (const filename of expectedFiles) {
    it(`${filename} is a clean grounded 1 x 8 RGBA atlas`, () => {
      const path = `${directory}/${filename}`;
      expect(statSync(path).size).toBeGreaterThan(80_000);
      expect(statSync(path).size).toBeLessThan(2_000_000);
      const image = decodeRgbaPng(path);
      expect([image.width, image.height]).toEqual([
        CELL_SIZE * COLUMNS,
        CELL_SIZE,
      ]);
      const key = filename
        .replace("occupation-atlas-", "")
        .replace(".png", "");
      expect(anchors.atlases[key]).toHaveLength(COLUMNS);

      for (let column = 0; column < COLUMNS; column += 1) {
        const stats = inspectCell(image, column);
        expect(
          stats.visiblePixels,
          `${filename} c${column} visible pixels`
        ).toBeGreaterThan(MIN_VISIBLE_PIXELS);
        expect(
          stats.visibleMagenta,
          `${filename} c${column} vivid pink pixels`
        ).toBeLessThanOrEqual(10);
        expect(
          stats.topComponentArea <= 16 ||
            stats.largestTopComponentArea >=
              stats.largestComponentArea * 0.2,
          `${filename} c${column} top component is not a stray fragment`
        ).toBe(true);
        expect(stats.bounds.minX).toBeGreaterThanOrEqual(5);
        expect(stats.bounds.minY).toBeGreaterThanOrEqual(5);
        expect(stats.bounds.maxX).toBeLessThanOrEqual(251);
        expect(stats.bounds.maxY).toBeLessThanOrEqual(252);
        expect(
          stats.bounds.maxY - stats.bounds.minY,
          `${filename} c${column} visible height`
        ).toBe(246);
        const [anchorX, anchorY] = anchors.atlases[key][column];
        expect(anchorX).toBeGreaterThan(40);
        expect(anchorX).toBeLessThan(216);
        expect(anchorY).toBeGreaterThanOrEqual(248);
        expect(anchorY).toBeLessThanOrEqual(251);
      }

      for (let facing = 0; facing < 4; facing += 1) {
        expect(
          differingPixels(image, facing, facing + 4),
          `${filename} c${facing} has a materially different step pose`
        ).toBeGreaterThan(1_000);
        const neutralRoot =
          upperBodyCentroidX(image, facing) -
          anchors.atlases[key][facing][0];
        const motionRoot =
          upperBodyCentroidX(image, facing + 4) -
          anchors.atlases[key][facing + 4][0];
        expect(
          Math.abs(neutralRoot - motionRoot),
          `${filename} c${facing} keeps a stable torso root`
        ).toBeLessThanOrEqual(0.75);
      }

      if (
        filename === "occupation-atlas-dancer-asian-male.png" ||
        filename === "occupation-atlas-dancer-asian-female.png"
      ) {
        for (let column = 0; column < COLUMNS; column += 1) {
          expect(
            burgundyPixels(image, column),
            `${filename} c${column} preserves burgundy clothing`
          ).toBeGreaterThan(1_500);
        }
      }
    });
  }
});
