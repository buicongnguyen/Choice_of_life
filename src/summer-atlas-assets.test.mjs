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
const HERITAGES = [
  "western",
  "asian",
  "middleEastern",
  "black",
];
const GENDERS = ["male", "female"];
const directory = fileURLToPath(
  new URL("./assets/summer/", import.meta.url)
);
const sourceDirectory = `${directory}/source`;
const expectedAtlases = HERITAGES.flatMap((heritage) =>
  GENDERS.map(
    (gender) => `summer-atlas-${heritage}-${gender}.png`
  )
).sort();
const expectedSources = HERITAGES.flatMap((heritage) =>
  GENDERS.map(
    (gender) => `summer-${heritage}-${gender}-source.png`
  )
).sort();
const anchors = JSON.parse(
  readFileSync(`${directory}/summer-anchors.json`, "utf8")
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
    if (end + 4 > png.length) {
      throw new Error(`${path} contains a truncated ${type} chunk`);
    }
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
  const expectedLength = (rowBytes + 1) * header.height;
  if (filtered.length !== expectedLength) {
    throw new Error(
      `${path} inflated to ${filtered.length}; expected ${expectedLength}`
    );
  }
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
        throw new Error(`${path} uses unsupported filter ${filter}`);
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
  let visiblePixels = 0;
  let opaquePixels = 0;
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
      if (alpha >= 245) opaquePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (
        red > 225 &&
        blue > 175 &&
        green < 75 &&
        Math.min(red, blue) - green > 115
      ) {
        visibleMagenta += 1;
      }
    }
  }
  return {
    visiblePixels,
    opaquePixels,
    visibleMagenta,
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
  const startX = column * CELL_SIZE;
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
      const alpha = pixel(image, startX + x, y)[3];
      if (alpha <= 64) continue;
      totalWeight += alpha;
      weightedX += (x + 0.5) * alpha;
    }
  }
  return weightedX / totalWeight;
}

describe("summer character atlas assets", () => {
  it("preserves the exact eight gender-separated source sheets", () => {
    expect(
      readdirSync(sourceDirectory)
        .filter((name) => name.endsWith(".png"))
        .sort()
    ).toEqual(expectedSources);
    for (const filename of expectedSources) {
      expect(statSync(`${sourceDirectory}/${filename}`).size)
        .toBeGreaterThan(1_000_000);
    }
  });

  it("checks in one runtime atlas per heritage and gender", () => {
    expect(
      readdirSync(directory)
        .filter((name) => /^summer-atlas-.*\.png$/.test(name))
        .sort()
    ).toEqual(expectedAtlases);
  });

  it("records the complete two-row source and eight-column runtime contract", () => {
    expect(anchors).toMatchObject({
      version: 1,
      cellSize: CELL_SIZE,
      anchorSpace: "source-cell-pixels",
      heritages: HERITAGES,
      genders: GENDERS,
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
    expect(Object.keys(anchors.atlases).sort()).toEqual(
      expectedAtlases
        .map((name) =>
          name
            .replace("summer-atlas-", "")
            .replace(".png", "")
        )
        .sort()
    );
  });

  for (const filename of expectedAtlases) {
    it(`${filename} is a clean, opaque, grounded 1 x 8 RGBA atlas`, () => {
      const path = `${directory}/${filename}`;
      expect(statSync(path).size).toBeGreaterThan(150_000);
      expect(statSync(path).size).toBeLessThan(1_000_000);
      const image = decodeRgbaPng(path);
      expect([image.width, image.height]).toEqual([
        CELL_SIZE * COLUMNS,
        CELL_SIZE,
      ]);
      const key = filename
        .replace("summer-atlas-", "")
        .replace(".png", "");
      expect(anchors.atlases[key]).toHaveLength(COLUMNS);

      for (let column = 0; column < COLUMNS; column += 1) {
        const stats = inspectCell(image, column);
        expect(
          stats.visiblePixels,
          `${filename} c${column} visible pixels`
        ).toBeGreaterThan(4_000);
        expect(
          stats.opaquePixels / stats.visiblePixels,
          `${filename} c${column} opacity`
        ).toBeGreaterThan(0.72);
        expect(
          stats.visibleMagenta,
          `${filename} c${column} magenta fringe`
        ).toBe(0);
        expect(stats.bounds.minX).toBeGreaterThanOrEqual(5);
        expect(stats.bounds.minY).toBeGreaterThanOrEqual(5);
        expect(stats.bounds.maxX).toBeLessThanOrEqual(251);
        expect(stats.bounds.maxY).toBe(251);
        expect(
          stats.bounds.maxY - stats.bounds.minY,
          `${filename} c${column} visible height`
        ).toBe(246);

        const [anchorX, anchorY] = anchors.atlases[key][column];
        expect(anchorX).toBeGreaterThan(40);
        expect(anchorX).toBeLessThan(216);
        expect(anchorY).toBe(251);
        const startX = column * CELL_SIZE;
        expect([
          pixel(image, startX, 0)[3],
          pixel(image, startX + CELL_SIZE - 1, 0)[3],
          pixel(image, startX, CELL_SIZE - 1)[3],
          pixel(
            image,
            startX + CELL_SIZE - 1,
            CELL_SIZE - 1
          )[3],
        ]).toEqual([0, 0, 0, 0]);
      }

      for (let facing = 0; facing < 4; facing += 1) {
        expect(
          differingPixels(image, facing, facing + 4),
          `${filename} c${facing} has a real walking pose`
        ).toBeGreaterThan(1_000);
      }
      for (const facing of [1, 3]) {
        const neutralRoot =
          upperBodyCentroidX(image, facing) -
          anchors.atlases[key][facing][0];
        const motionRoot =
          upperBodyCentroidX(image, facing + 4) -
          anchors.atlases[key][facing + 4][0];
        expect(
          Math.abs(neutralRoot - motionRoot),
          `${filename} side c${facing} stable horizontal root`
        ).toBeLessThanOrEqual(0.75);
      }
      expect(differingPixels(image, 0, 2)).toBeGreaterThan(1_000);
      expect(differingPixels(image, 1, 3)).toBeGreaterThan(1_000);
      expect(differingPixels(image, 4, 6)).toBeGreaterThan(1_000);
      expect(differingPixels(image, 5, 7)).toBeGreaterThan(1_000);
    });
  }
});
