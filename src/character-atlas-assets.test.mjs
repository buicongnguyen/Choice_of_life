import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const CELL_SIZE = 256;
const COLUMNS = 4;
const MOTION_COLUMNS = 5;
const ALTERNATE_COLUMNS = 9;
const BASE_ROWS = 5;
const EXPANSION_ROWS = 3;
const ALTERNATE_ROWS = 8;
const ALTERNATE_BODY_ALIGNMENT_FRACTION = 0.55;
const ALTERNATE_RUNTIME_HEIGHTS = [
  72 * 1.15,
  96 * 1.15,
  106 * 1.15,
  116 * 1.15,
  124 * 1.15,
  128 * 1.15,
  126 * 1.15,
  120 * 1.15,
];
const MIN_VISIBLE_PIXELS_PER_CELL = 1_000;
const atlasDirectory = fileURLToPath(
  new URL("./assets/characters/", import.meta.url)
);
const expectedAtlases = [
  "character-atlas-asian-female.png",
  "character-atlas-asian-male.png",
  "character-atlas-black-female.png",
  "character-atlas-black-male.png",
  "character-atlas-middleEastern-female.png",
  "character-atlas-middleEastern-male.png",
  "character-atlas-western-female.png",
  "character-atlas-western-male.png",
];
const expectedExpansionAtlases = [
  "character-stage-expansion-asian-female.png",
  "character-stage-expansion-asian-male.png",
  "character-stage-expansion-black-female.png",
  "character-stage-expansion-black-male.png",
  "character-stage-expansion-middleEastern-female.png",
  "character-stage-expansion-middleEastern-male.png",
  "character-stage-expansion-western-female.png",
  "character-stage-expansion-western-male.png",
];
const expectedMotionBaseAtlases = [
  "character-motion-base-asian-female.png",
  "character-motion-base-asian-male.png",
  "character-motion-base-black-female.png",
  "character-motion-base-black-male.png",
  "character-motion-base-middleEastern-female.png",
  "character-motion-base-middleEastern-male.png",
  "character-motion-base-western-female.png",
  "character-motion-base-western-male.png",
];
const expectedMotionExpansionAtlases = [
  "character-motion-expansion-asian-female.png",
  "character-motion-expansion-asian-male.png",
  "character-motion-expansion-black-female.png",
  "character-motion-expansion-black-male.png",
  "character-motion-expansion-middleEastern-female.png",
  "character-motion-expansion-middleEastern-male.png",
  "character-motion-expansion-western-female.png",
  "character-motion-expansion-western-male.png",
];
const expectedAlternateAtlases = [
  "character-appearance-alternate-asian-female.png",
  "character-appearance-alternate-asian-male.png",
  "character-appearance-alternate-black-female.png",
  "character-appearance-alternate-black-male.png",
  "character-appearance-alternate-middleEastern-female.png",
  "character-appearance-alternate-middleEastern-male.png",
  "character-appearance-alternate-western-female.png",
  "character-appearance-alternate-western-male.png",
];
const frameMetricFamilyPrefixes = {
  base: "character-atlas-",
  expansion: "character-stage-expansion-",
  motionBase: "character-motion-base-",
  motionExpansion: "character-motion-expansion-",
  alternate: "character-appearance-alternate-",
};
const frameMetricFamilySchema = {
  base: {
    rows: ["baby", "child", "teen", "adult", "elder"],
    columns: 4,
    directionalColumns: 4,
  },
  expansion: {
    rows: ["earlyTeen", "youngAdult", "middleAge"],
    columns: 4,
    directionalColumns: 4,
  },
  motionBase: {
    rows: ["baby", "child", "teen", "adult", "elder"],
    columns: 5,
    directionalColumns: 4,
  },
  motionExpansion: {
    rows: ["earlyTeen", "youngAdult", "middleAge"],
    columns: 5,
    directionalColumns: 4,
  },
  alternate: {
    rows: [
      "baby",
      "child",
      "earlyTeen",
      "teen",
      "youngAdult",
      "adult",
      "middleAge",
      "elder",
    ],
    columns: 9,
    directionalColumns: 8,
  },
};
const headSilhouetteRange = {
  baby: [0.52, 0.8],
  child: [0.37, 0.63],
  earlyTeen: [0.26, 0.48],
  teen: [0.27, 0.45],
  youngAdult: [0.22, 0.4],
  adult: [0.26, 0.42],
  middleAge: [0.24, 0.41],
  elder: [0.36, 0.48],
};
const headSilhouetteMedianRange = {
  baby: [0.6, 0.66],
  child: [0.43, 0.52],
  earlyTeen: [0.3, 0.37],
  teen: [0.32, 0.38],
  youngAdult: [0.31, 0.38],
  adult: [0.33, 0.38],
  middleAge: [0.32, 0.37],
  elder: [0.39, 0.44],
};
const alternateAnchorManifest = JSON.parse(
  readFileSync(
    `${atlasDirectory}/character-appearance-alternate-anchors.json`,
    "utf8"
  )
);
const motionAnchorManifest = JSON.parse(
  readFileSync(
    `${atlasDirectory}/character-motion-anchors.json`,
    "utf8"
  )
);
const frameMetricsManifest = JSON.parse(
  readFileSync(
    `${atlasDirectory}/character-frame-metrics.json`,
    "utf8"
  )
);
const alternateBuilder = readFileSync(
  fileURLToPath(
    new URL(
      "../scripts/build-character-appearance-alternate.py",
      import.meta.url
    )
  ),
  "utf8"
);
const alphaPreservationCells = {
  "character-appearance-alternate-western-female.png": [
    [2, 0, 14_500],
  ],
  "character-appearance-alternate-asian-female.png": [
    [2, 0, 14_500],
  ],
  "character-appearance-alternate-black-female.png": [
    [4, 0, 16_500],
  ],
};
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
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

function visiblePixelsInCell(image, row, column) {
  let visiblePixels = 0;
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  for (let y = startY; y < startY + CELL_SIZE; y += 1) {
    for (let x = startX; x < startX + CELL_SIZE; x += 1) {
      const alpha = image.rgba[(y * image.width + x) * 4 + 3];
      if (alpha > 8) visiblePixels += 1;
    }
  }
  return visiblePixels;
}

function visibleBoundsInCell(image, row, column) {
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  let minX = CELL_SIZE;
  let minY = CELL_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const alpha =
        image.rgba[
          ((startY + y) * image.width + startX + x) * 4 + 3
        ];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0
    ? undefined
    : { minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
}

function metricVisibleHeight(
  image,
  row,
  column,
  alphaThreshold
) {
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  let minY = CELL_SIZE;
  let maxY = -1;
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const alpha =
        image.rgba[
          ((startY + y) * image.width + startX + x) * 4 + 3
        ];
      if (alpha < alphaThreshold) continue;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxY < 0) throw new Error(`empty metric cell ${row}:${column}`);
  return maxY - minY + 1;
}

function frontHeadSilhouetteRatio(image, row, column = 0) {
  const bounds = visibleBoundsInCell(image, row, column);
  if (!bounds) {
    throw new Error(`empty front head cell ${row}:${column}`);
  }
  const visibleHeight = bounds.maxY - bounds.minY;
  const headBottom = Math.min(
    bounds.maxY,
    bounds.minY + Math.round(visibleHeight * 0.42)
  );
  const spans = [];
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  for (let y = bounds.minY; y < headBottom; y += 1) {
    let minX = CELL_SIZE;
    let maxX = -1;
    for (let x = bounds.minX; x < bounds.maxX; x += 1) {
      const alpha =
        image.rgba[
          ((startY + y) * image.width + startX + x) *
            4 +
            3
        ];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    if (maxX >= 0) spans.push(maxX - minX + 1);
  }
  spans.sort((first, second) => first - second);
  const percentileIndex = Math.floor((spans.length - 1) * 0.95);
  return spans[percentileIndex] / visibleHeight;
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function recomputeGroundAnchor(image, row, column) {
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  let minX = CELL_SIZE;
  let minY = CELL_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const alpha =
        image.rgba[
          ((startY + y) * image.width + startX + x) * 4 + 3
        ];
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error(`empty cell ${row}:${column}`);
  const bboxBottom = maxY + 1;
  const bandHeight = Math.max(
    8,
    Math.round((bboxBottom - minY) * 0.125)
  );
  const bandTop = Math.max(minY, bboxBottom - bandHeight);
  const weightedColumns = [];
  for (let x = minX; x <= maxX; x += 1) {
    let weight = 0;
    for (let y = bandTop; y < bboxBottom; y += 1) {
      const alpha =
        image.rgba[
          ((startY + y) * image.width + startX + x) * 4 + 3
        ];
      if (alpha > 64) weight += alpha;
    }
    if (weight) weightedColumns.push([x + 0.5, weight]);
  }
  const totalWeight = weightedColumns.reduce(
    (sum, [, weight]) => sum + weight,
    0
  );
  const lowerBound = totalWeight * 0.12;
  const upperBound = totalWeight * 0.88;
  let cumulative = 0;
  let retainedWeight = 0;
  let weightedX = 0;
  for (const [x, weight] of weightedColumns) {
    const nextCumulative = cumulative + weight;
    const retained = Math.max(
      0,
      Math.min(nextCumulative, upperBound) -
        Math.max(cumulative, lowerBound)
    );
    weightedX += x * retained;
    retainedWeight += retained;
    cumulative = nextCumulative;
  }
  return [
    Math.round((weightedX / retainedWeight) * 100) / 100,
    bboxBottom,
  ];
}

function upperBodyCentroidX(
  image,
  row,
  column,
  bodyFraction = 0.82
) {
  const bounds = visibleBoundsInCell(image, row, column);
  if (!bounds) throw new Error(`empty cell ${row}:${column}`);
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  const bodyBottom = Math.min(
    bounds.maxY,
    bounds.minY +
      Math.max(
        1,
        Math.round(
          (bounds.maxY - bounds.minY) * bodyFraction
        )
      )
  );
  let totalWeight = 0;
  let weightedX = 0;
  for (let y = bounds.minY; y < bodyBottom; y += 1) {
    for (let x = bounds.minX; x < bounds.maxX; x += 1) {
      const alpha =
        image.rgba[
          ((startY + y) * image.width + startX + x) * 4 + 3
        ];
      if (alpha <= 64) continue;
      totalWeight += alpha;
      weightedX += (x + 0.5) * alpha;
    }
  }
  if (!totalWeight) {
    throw new Error(`no upper body in ${row}:${column}`);
  }
  return weightedX / totalWeight;
}

function recomputeMatchedMotionAnchor(
  motion,
  neutral,
  row,
  motionColumn,
  neutralColumn,
  bodyFraction = 0.82
) {
  const motionGround = recomputeGroundAnchor(
    motion,
    row,
    motionColumn
  );
  const neutralGround = recomputeGroundAnchor(
    neutral,
    row,
    neutralColumn
  );
  const neutralBodyOffset =
    upperBodyCentroidX(
      neutral,
      row,
      neutralColumn,
      bodyFraction
    ) -
    neutralGround[0];
  return [
    Math.round(
      (upperBodyCentroidX(
        motion,
        row,
        motionColumn,
        bodyFraction
      ) -
        neutralBodyOffset) *
        100
    ) / 100,
    motionGround[1],
  ];
}

function normalizedHeadPatch(image, row, column) {
  const bounds = visibleBoundsInCell(image, row, column);
  if (!bounds) throw new Error(`empty head cell ${row}:${column}`);
  const cropWidth = bounds.maxX - bounds.minX;
  const cropHeight = Math.max(
    1,
    Math.round((bounds.maxY - bounds.minY) * 0.48)
  );
  const patchSize = 96;
  const result = new Uint8Array(patchSize * patchSize * 3);
  const background = [38, 56, 74];
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;

  for (let targetY = 0; targetY < patchSize; targetY += 1) {
    const sourceY =
      bounds.minY +
      Math.min(
        cropHeight - 1,
        Math.floor(
          ((targetY + 0.5) * cropHeight) / patchSize
        )
      );
    for (let targetX = 0; targetX < patchSize; targetX += 1) {
      const sourceX =
        bounds.minX +
        Math.min(
          cropWidth - 1,
          Math.floor(
            ((targetX + 0.5) * cropWidth) / patchSize
          )
        );
      const sourceOffset =
        ((startY + sourceY) * image.width +
          startX +
          sourceX) *
        4;
      const targetOffset =
        (targetY * patchSize + targetX) * 3;
      const alpha = image.rgba[sourceOffset + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        result[targetOffset + channel] = Math.round(
          image.rgba[sourceOffset + channel] * alpha +
            background[channel] * (1 - alpha)
        );
      }
    }
  }
  return result;
}

function meanRgbDifference(first, second) {
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference += Math.abs(first[index] - second[index]);
  }
  return difference / first.length;
}

function alphaDifference(
  image,
  row,
  firstColumn,
  secondColumn,
  mirrorSecond = false
) {
  let difference = 0;
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const first =
        ((row * CELL_SIZE + y) * image.width +
          firstColumn * CELL_SIZE +
          x) *
          4 +
        3;
      const secondX = mirrorSecond ? CELL_SIZE - 1 - x : x;
      const second =
        ((row * CELL_SIZE + y) * image.width +
          secondColumn * CELL_SIZE +
          secondX) *
          4 +
        3;
      difference += Math.abs(
        image.rgba[first] - image.rgba[second]
      );
    }
  }
  return difference;
}

describe("v5 character atlas assets", () => {
  it("checks in exactly the eight expected runtime atlases", () => {
    const actualAtlases = readdirSync(atlasDirectory)
      .filter((name) => /^character-atlas-.*\.png$/.test(name))
      .sort();
    expect(actualAtlases).toEqual(expectedAtlases);
  });

  for (const filename of expectedAtlases) {
    it(`${filename} is a populated 4 x 5 RGBA atlas`, () => {
      const image = decodeRgbaPng(`${atlasDirectory}/${filename}`);
      expect([image.width, image.height]).toEqual([
        COLUMNS * CELL_SIZE,
        BASE_ROWS * CELL_SIZE,
      ]);

      const populatedCells = [];
      for (let row = 0; row < BASE_ROWS; row += 1) {
        for (let column = 0; column < COLUMNS; column += 1) {
          const visiblePixels = visiblePixelsInCell(image, row, column);
          if (visiblePixels >= MIN_VISIBLE_PIXELS_PER_CELL) {
            populatedCells.push(`${row}:${column}`);
          }
        }
      }
      expect(populatedCells).toHaveLength(BASE_ROWS * COLUMNS);
    });
  }

  it("checks in exactly the eight expected stage-expansion atlases", () => {
    const actualAtlases = readdirSync(atlasDirectory)
      .filter((name) => /^character-stage-expansion-.*\.png$/.test(name))
      .sort();
    expect(actualAtlases).toEqual(expectedExpansionAtlases);
  });

  for (const filename of expectedExpansionAtlases) {
    it(`${filename} is a populated 4 x 3 RGBA atlas`, () => {
      const image = decodeRgbaPng(`${atlasDirectory}/${filename}`);
      expect([image.width, image.height]).toEqual([
        COLUMNS * CELL_SIZE,
        EXPANSION_ROWS * CELL_SIZE,
      ]);

      const populatedCells = [];
      for (let row = 0; row < EXPANSION_ROWS; row += 1) {
        for (let column = 0; column < COLUMNS; column += 1) {
          const visiblePixels = visiblePixelsInCell(image, row, column);
          if (visiblePixels >= MIN_VISIBLE_PIXELS_PER_CELL) {
            populatedCells.push(`${row}:${column}`);
          }
        }
      }
      expect(populatedCells).toHaveLength(EXPANSION_ROWS * COLUMNS);
    });
  }

  it("checks in exactly the sixteen expected motion companion atlases", () => {
    const actualAtlases = readdirSync(atlasDirectory)
      .filter((name) =>
        /^character-motion-(base|expansion)-.*\.png$/.test(name)
      )
      .sort();
    expect(actualAtlases).toEqual(
      [...expectedMotionBaseAtlases, ...expectedMotionExpansionAtlases].sort()
    );
  });

  for (const [filenames, rows, motionPrefix, neutralPrefix] of [
    [
      expectedMotionBaseAtlases,
      BASE_ROWS,
      "character-motion-base-",
      "character-atlas-",
    ],
    [
      expectedMotionExpansionAtlases,
      EXPANSION_ROWS,
      "character-motion-expansion-",
      "character-stage-expansion-",
    ],
  ]) {
    for (const filename of filenames) {
      it(`${filename} is a clean populated 5 x ${rows} RGBA atlas`, () => {
        const image = decodeRgbaPng(`${atlasDirectory}/${filename}`);
        const neutral = decodeRgbaPng(
          `${atlasDirectory}/${neutralPrefix}${filename.slice(motionPrefix.length)}`
        );
        const family = motionPrefix.includes("-base-")
          ? "base"
          : "expansion";
        const atlasKey = filename
          .slice(motionPrefix.length)
          .replace(/\.png$/, "");
        const recordedAnchors =
          motionAnchorManifest.families[family].atlases[atlasKey];
        expect([image.width, image.height]).toEqual([
          MOTION_COLUMNS * CELL_SIZE,
          rows * CELL_SIZE,
        ]);

        const populatedCells = [];
        let opaqueChromaPixels = 0;
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < MOTION_COLUMNS; column += 1) {
            const visiblePixels = visiblePixelsInCell(
              image,
              row,
              column
            );
            const bounds = visibleBoundsInCell(image, row, column);
            if (visiblePixels >= MIN_VISIBLE_PIXELS_PER_CELL) {
              populatedCells.push(`${row}:${column}`);
            }
            expect(bounds).toBeDefined();
            expect(bounds.minX).toBeGreaterThanOrEqual(5);
            expect(bounds.minY).toBeGreaterThanOrEqual(5);
            expect(bounds.maxX).toBeLessThanOrEqual(CELL_SIZE - 5);
            expect(bounds.maxY).toBeLessThanOrEqual(CELL_SIZE - 5);
            if (column < COLUMNS) {
              const neutralBounds = visibleBoundsInCell(
                neutral,
                row,
                column
              );
              expect(neutralBounds).toBeDefined();
              const motionHeight = bounds.maxY - bounds.minY;
              const neutralHeight =
                neutralBounds.maxY - neutralBounds.minY;
              expect(motionHeight / neutralHeight).toBeGreaterThanOrEqual(
                0.98
              );
              expect(motionHeight / neutralHeight).toBeLessThanOrEqual(
                1.05
              );
            }
            const recomputed =
              column < COLUMNS
                ? recomputeMatchedMotionAnchor(
                    image,
                    neutral,
                    row,
                    column,
                    column
                  )
                : recomputeGroundAnchor(image, row, column);
            const recorded = recordedAnchors[row][column];
            expect(
              Math.abs(recomputed[0] - recorded[0]),
              `${filename} stable root x ${row}:${column}`
            ).toBeLessThanOrEqual(0.75);
            expect(
              recomputed[1],
              `${filename} ground y ${row}:${column}`
            ).toBe(recorded[1]);
          }
        }
        for (let offset = 0; offset < image.rgba.length; offset += 4) {
          const red = image.rgba[offset];
          const green = image.rgba[offset + 1];
          const blue = image.rgba[offset + 2];
          const alpha = image.rgba[offset + 3];
          if (
            alpha > 8 &&
            red >= 250 &&
            green <= 8 &&
            blue >= 250
          ) {
            opaqueChromaPixels += 1;
          }
        }
        expect(populatedCells).toHaveLength(rows * MOTION_COLUMNS);
        expect(opaqueChromaPixels).toBe(0);
      });
    }
  }

  it("checks in exactly the eight alternate appearance atlases", () => {
    const actualAtlases = readdirSync(atlasDirectory)
      .filter((name) =>
        /^character-appearance-alternate-.*\.png$/.test(name)
      )
      .sort();
    expect(actualAtlases).toEqual(expectedAlternateAtlases);
    expect(alternateAnchorManifest.rows).toHaveLength(ALTERNATE_ROWS);
    expect(alternateAnchorManifest.columns).toHaveLength(
      ALTERNATE_COLUMNS
    );
  });

  for (const filename of expectedAlternateAtlases) {
    it(`${filename} is a clean populated 9 x 8 unified atlas`, () => {
      const image = decodeRgbaPng(`${atlasDirectory}/${filename}`);
      const atlasKey = filename
        .slice("character-appearance-alternate-".length)
        .replace(/\.png$/, "");
      const recordedAnchors =
        alternateAnchorManifest.atlases[atlasKey];
      expect(recordedAnchors).toHaveLength(ALTERNATE_ROWS);
      expect([image.width, image.height]).toEqual([
        ALTERNATE_COLUMNS * CELL_SIZE,
        ALTERNATE_ROWS * CELL_SIZE,
      ]);

      const populatedCells = [];
      let opaqueChromaPixels = 0;
      for (let row = 0; row < ALTERNATE_ROWS; row += 1) {
        for (
          let column = 0;
          column < ALTERNATE_COLUMNS;
          column += 1
        ) {
          const visiblePixels = visiblePixelsInCell(
            image,
            row,
            column
          );
          const bounds = visibleBoundsInCell(image, row, column);
          if (visiblePixels >= 500) {
            populatedCells.push(`${row}:${column}`);
          }
          expect(bounds).toBeDefined();
          expect(bounds.minX).toBeGreaterThanOrEqual(5);
          expect(bounds.minY).toBeGreaterThanOrEqual(5);
          expect(bounds.maxX).toBeLessThanOrEqual(CELL_SIZE - 5);
          expect(bounds.maxY).toBeLessThanOrEqual(CELL_SIZE - 5);
          if (column >= 4 && column <= 7) {
            const neutralBounds = visibleBoundsInCell(
              image,
              row,
              column - 4
            );
            expect(neutralBounds).toBeDefined();
            const motionHeight = bounds.maxY - bounds.minY;
            const neutralHeight =
              neutralBounds.maxY - neutralBounds.minY;
            expect(motionHeight / neutralHeight).toBeGreaterThanOrEqual(
              0.98
            );
            expect(motionHeight / neutralHeight).toBeLessThanOrEqual(
              1.05
            );
          }
          const recomputed =
            column >= 4 && column <= 7
              ? recomputeMatchedMotionAnchor(
                  image,
                  image,
                  row,
                  column,
                  column - 4,
                  ALTERNATE_BODY_ALIGNMENT_FRACTION
                )
              : recomputeGroundAnchor(image, row, column);
          const recorded = recordedAnchors[row][column];
          expect(
            Math.abs(recomputed[0] - recorded[0]),
            `${filename} anchor x ${row}:${column}`
          ).toBeLessThanOrEqual(0.75);
          expect(
            recomputed[1],
            `${filename} anchor y ${row}:${column}`
          ).toBe(recorded[1]);
        }

        const neutralLeft = normalizedHeadPatch(image, row, 1);
        const neutralRight = normalizedHeadPatch(image, row, 3);
        const motionLeft = normalizedHeadPatch(image, row, 5);
        const motionRight = normalizedHeadPatch(image, row, 7);
        const correctPairing =
          (meanRgbDifference(neutralLeft, motionLeft) +
            meanRgbDifference(neutralRight, motionRight)) /
          2;
        const swappedPairing =
          (meanRgbDifference(neutralLeft, motionRight) +
            meanRgbDifference(neutralRight, motionLeft)) /
          2;
        expect(
          correctPairing,
          `${filename} literal side pairing ${row}`
        ).toBeLessThan(swappedPairing * 0.95);

        for (const neutralColumn of [1, 3]) {
          const motionColumn = neutralColumn + 4;
          const recordedHeights =
            frameMetricsManifest.families.alternate.atlases[
              atlasKey
            ][row];
          for (const [region, bodyFraction] of [
            ["torso", 0.82],
            ["head", 0.42],
          ]) {
            const neutralRoot =
              upperBodyCentroidX(
                image,
                row,
                neutralColumn,
                bodyFraction
              ) - recordedAnchors[row][neutralColumn][0];
            const motionRoot =
              upperBodyCentroidX(
                image,
                row,
                motionColumn,
                bodyFraction
              ) - recordedAnchors[row][motionColumn][0];
            const neutralScale =
              frameMetricsManifest.directionalTargetVisibleHeight /
              recordedHeights[neutralColumn];
            const motionScale =
              frameMetricsManifest.directionalTargetVisibleHeight /
              recordedHeights[motionColumn];
            const renderedDrift =
              (Math.abs(
                neutralRoot * neutralScale -
                  motionRoot * motionScale
              ) *
                ALTERNATE_RUNTIME_HEIGHTS[row]) /
              CELL_SIZE;
            const uncorrectedRenderedDrift =
              (Math.abs(neutralRoot - motionRoot) *
                ALTERNATE_RUNTIME_HEIGHTS[row]) /
              CELL_SIZE;
            expect(
              renderedDrift - uncorrectedRenderedDrift,
              `${filename} scale-added side ${region} drift ${row}:${neutralColumn}`
            ).toBeLessThanOrEqual(1);
            if (region === "head") {
              expect(
                renderedDrift,
                `${filename} stable rendered side head ${row}:${neutralColumn}`
              ).toBeLessThanOrEqual(4);
            }
          }
        }
      }
      for (let offset = 0; offset < image.rgba.length; offset += 4) {
        const red = image.rgba[offset];
        const green = image.rgba[offset + 1];
        const blue = image.rgba[offset + 2];
        const alpha = image.rgba[offset + 3];
        if (
          alpha > 32 &&
          red > 225 &&
          blue > 175 &&
          green < 65 &&
          Math.min(red, blue) - green > 125
        ) {
          opaqueChromaPixels += 1;
        }
      }
      expect(populatedCells).toHaveLength(
        ALTERNATE_ROWS * ALTERNATE_COLUMNS
      );
      expect(opaqueChromaPixels).toBe(0);
      for (const [
        row,
        column,
        minimumVisiblePixels,
      ] of alphaPreservationCells[filename] ?? []) {
        expect(
          visiblePixelsInCell(image, row, column),
          `${filename} preserves garment alpha ${row}:${column}`
        ).toBeGreaterThanOrEqual(minimumVisiblePixels);
      }
      for (let row = 0; row < ALTERNATE_ROWS; row += 1) {
        const directDifference = alphaDifference(
          image,
          row,
          5,
          7
        );
        const mirroredDifference = alphaDifference(
          image,
          row,
          5,
          7,
          true
        );
        expect(
          mirroredDifference,
          `${filename} motion side directions ${row}`
        ).toBeLessThan(directDifference);
      }
    });
  }

  it("records every frame size and normalizes directional stature without distortion", () => {
    expect(frameMetricsManifest).toMatchObject({
      version: 1,
      cellSize: CELL_SIZE,
      alphaThreshold: 8,
      directionalTargetVisibleHeight: 246,
    });
    expect(Object.keys(frameMetricsManifest.families).sort()).toEqual(
      Object.keys(frameMetricFamilyPrefixes).sort()
    );

    let measuredCells = 0;
    for (const [family, prefix] of Object.entries(
      frameMetricFamilyPrefixes
    )) {
      const metricFamily = frameMetricsManifest.families[family];
      expect(metricFamily).toBeDefined();
      expect(metricFamily).toMatchObject(
        frameMetricFamilySchema[family]
      );
      expect(Object.keys(metricFamily.atlases)).toHaveLength(8);
      for (const [atlasKey, recordedRows] of Object.entries(
        metricFamily.atlases
      )) {
        const image = decodeRgbaPng(
          `${atlasDirectory}/${prefix}${atlasKey}.png`
        );
        expect(recordedRows).toHaveLength(metricFamily.rows.length);
        for (let row = 0; row < recordedRows.length; row += 1) {
          expect(recordedRows[row]).toHaveLength(metricFamily.columns);
          for (
            let column = 0;
            column < recordedRows[row].length;
            column += 1
          ) {
            const recordedHeight = recordedRows[row][column];
            expect(recordedHeight).toBe(
              metricVisibleHeight(
                image,
                row,
                column,
                frameMetricsManifest.alphaThreshold
              )
            );
            measuredCells += 1;
            if (column >= metricFamily.directionalColumns) continue;

            const correction =
              frameMetricsManifest.directionalTargetVisibleHeight /
              recordedHeight;
            expect(correction).toBeGreaterThanOrEqual(1);
            expect(correction).toBeLessThanOrEqual(1.1);
            expect(recordedHeight * correction).toBeCloseTo(246, 6);
            if (metricFamily.rows[row] !== "baby") {
              expect(recordedHeight).toBe(246);
            }
          }
        }
      }
    }

    expect(measuredCells).toBe(1_152);
  }, 15_000);

  it("keeps neutral front upper silhouettes inside reviewed stage ranges", () => {
    const cohorts = {
      classic: Object.fromEntries(
        Object.keys(headSilhouetteRange).map((ageBand) => [
          ageBand,
          [],
        ])
      ),
      alternate: Object.fromEntries(
        Object.keys(headSilhouetteRange).map((ageBand) => [
          ageBand,
          [],
        ])
      ),
    };
    const recordAtlas = (
      appearance,
      filename,
      ageBands
    ) => {
      const image = decodeRgbaPng(`${atlasDirectory}/${filename}`);
      ageBands.forEach((ageBand, row) => {
        const ratio = frontHeadSilhouetteRatio(image, row);
        const [minimum, maximum] = headSilhouetteRange[ageBand];
        expect(
          ratio,
          `${filename} ${ageBand} front head silhouette`
        ).toBeGreaterThanOrEqual(minimum);
        expect(
          ratio,
          `${filename} ${ageBand} front head silhouette`
        ).toBeLessThanOrEqual(maximum);
        cohorts[appearance][ageBand].push(ratio);
      });
    };

    for (const filename of expectedAtlases) {
      recordAtlas("classic", filename, [
        "baby",
        "child",
        "teen",
        "adult",
        "elder",
      ]);
    }
    for (const filename of expectedExpansionAtlases) {
      recordAtlas("classic", filename, [
        "earlyTeen",
        "youngAdult",
        "middleAge",
      ]);
    }
    for (const filename of expectedAlternateAtlases) {
      recordAtlas("alternate", filename, [
        "baby",
        "child",
        "earlyTeen",
        "teen",
        "youngAdult",
        "adult",
        "middleAge",
        "elder",
      ]);
    }

    for (const [appearance, ageBands] of Object.entries(cohorts)) {
      for (const [ageBand, values] of Object.entries(ageBands)) {
        expect(values).toHaveLength(8);
        const [minimum, maximum] =
          headSilhouetteMedianRange[ageBand];
        expect(
          median(values),
          `${appearance} ${ageBand} median head silhouette`
        ).toBeGreaterThanOrEqual(minimum);
        expect(
          median(values),
          `${appearance} ${ageBand} median head silhouette`
        ).toBeLessThanOrEqual(maximum);
      }
    }
  });

  it("keeps front-motion upper silhouettes close to their neutral identity", () => {
    const inspectPair = (
      label,
      neutralImage,
      motionImage,
      ageBands,
      motionColumn
    ) => {
      ageBands.forEach((ageBand, row) => {
        const neutralRatio = frontHeadSilhouetteRatio(
          neutralImage,
          row
        );
        const motionRatio = frontHeadSilhouetteRatio(
          motionImage,
          row,
          motionColumn
        );
        const pairRatio = motionRatio / neutralRatio;
        expect(
          pairRatio,
          `${label} ${ageBand} neutral-motion upper-silhouette ratio`
        ).toBeGreaterThanOrEqual(
          ageBand === "baby" ? 0.72 : 0.82
        );
        expect(
          pairRatio,
          `${label} ${ageBand} neutral-motion upper-silhouette ratio`
        ).toBeLessThanOrEqual(1.2);
      });
    };

    for (const filename of expectedAtlases) {
      inspectPair(
        filename,
        decodeRgbaPng(`${atlasDirectory}/${filename}`),
        decodeRgbaPng(
          `${atlasDirectory}/${filename.replace(
            "character-atlas-",
            "character-motion-base-"
          )}`
        ),
        ["baby", "child", "teen", "adult", "elder"],
        0
      );
    }
    for (const filename of expectedExpansionAtlases) {
      inspectPair(
        filename,
        decodeRgbaPng(`${atlasDirectory}/${filename}`),
        decodeRgbaPng(
          `${atlasDirectory}/${filename.replace(
            "character-stage-expansion-",
            "character-motion-expansion-"
          )}`
        ),
        ["earlyTeen", "youngAdult", "middleAge"],
        0
      );
    }
    for (const filename of expectedAlternateAtlases) {
      const image = decodeRgbaPng(
        `${atlasDirectory}/${filename}`
      );
      inspectPair(
        filename,
        image,
        image,
        [
          "baby",
          "child",
          "earlyTeen",
          "teen",
          "youngAdult",
          "adult",
          "middleAge",
          "elder",
        ],
        4
      );
    }
  });

  it("keeps an exhaustive reviewed row-level direction repair contract", () => {
    expect(alternateBuilder).toContain(
      "NEUTRAL_SOURCE_COLUMNS_TO_CANONICAL = (0, 3, 2, 1)"
    );
    expect(alternateBuilder).toContain(
      "MOTION_SOURCE_COLUMNS_TO_CANONICAL = (0, 1, 2, 3)"
    );
    expect(alternateBuilder).toContain(
      "SIDE_REPAIR_BY_ATLAS_ROW"
    );
    expect(alternateBuilder).toContain(
      "Expected 37 reviewed side repairs"
    );
    expect(alternateBuilder).toContain(
      "ALTERNATE_BODY_ALIGNMENT_FRACTION = 0.55"
    );
  });
});
