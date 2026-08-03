import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const CELL_SIZE = 256;
const COLUMNS = [
  "frontNeutral",
  "screenLeftNeutral",
  "backNeutral",
  "screenRightNeutral",
  "frontMotion",
  "screenLeftMotion",
  "backMotion",
  "screenRightMotion",
];
const SOURCE_COLUMNS = ["front", "left", "back", "right"];
const PACKS = {
  service: [
    "teacher",
    "chef",
    "barista",
    "athlete",
    "artist",
  ],
  technical: [
    "generalengineer",
    "softwareengineer",
    "police",
    "entrepreneur",
  ],
  leadership: [
    "manager",
    "analyst",
    "lawyer",
    "ceo",
  ],
};
const HERITAGES = ["western", "asian"];
const GENDERS = ["male", "female"];
const SEASONS = ["standard", "summer"];
const POSES = ["neutral", "motion"];
const directory = fileURLToPath(
  new URL("./assets/career-outfits/", import.meta.url)
);
const manifest = JSON.parse(
  readFileSync(
    `${directory}/career-outfit-anchors.json`,
    "utf8"
  )
);
const expectedAtlases = Object.keys(PACKS).flatMap((pack) =>
  SEASONS.flatMap((season) =>
    HERITAGES.flatMap((heritage) =>
      GENDERS.map((gender) => {
        const key = `${pack}-${season}-${heritage}-${gender}`;
        return {
          key,
          pack,
          season,
          heritage,
          gender,
          file: `career-outfit-atlas-${key}.png`,
        };
      })
    )
  )
);
const expectedFiles = expectedAtlases
  .map(({ file }) => file)
  .sort();
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
        throw new Error(
          `${path} uses unsupported PNG filter ${filter}`
        );
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

function inspectCell(image, row, column) {
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  let visiblePixels = 0;
  let opaquePixels = 0;
  let transparentPixels = 0;
  let hotMagentaPixels = 0;
  let minX = CELL_SIZE;
  let minY = CELL_SIZE;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const [red, green, blue, alpha] = pixel(
        image,
        startX + x,
        startY + y
      );
      if (alpha === 0) transparentPixels += 1;
      if (alpha < 10) continue;
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
        hotMagentaPixels += 1;
      }
    }
  }

  return {
    visiblePixels,
    opaquePixels,
    transparentPixels,
    hotMagentaPixels,
    corners: [
      pixel(image, startX, startY)[3],
      pixel(image, startX + CELL_SIZE - 1, startY)[3],
      pixel(image, startX, startY + CELL_SIZE - 1)[3],
      pixel(
        image,
        startX + CELL_SIZE - 1,
        startY + CELL_SIZE - 1
      )[3],
    ],
    bounds: {
      left: minX,
      top: minY,
      right: maxX + 1,
      bottom: maxY + 1,
    },
  };
}

function differingPixels(first, second, row, column) {
  let difference = 0;
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const firstOffset =
        ((startY + y) * first.width + startX + x) * 4;
      const secondOffset =
        ((startY + y) * second.width + startX + x) * 4;
      if (
        first.rgba[firstOffset] !== second.rgba[secondOffset] ||
        first.rgba[firstOffset + 1] !==
          second.rgba[secondOffset + 1] ||
        first.rgba[firstOffset + 2] !==
          second.rgba[secondOffset + 2] ||
        first.rgba[firstOffset + 3] !==
          second.rgba[secondOffset + 3]
      ) {
        difference += 1;
      }
    }
  }
  return difference;
}

function upperBodyCentroidX(image, row, column) {
  const { bounds } = inspectCell(image, row, column);
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  const bodyBottom = Math.min(
    bounds.bottom,
    bounds.top +
      Math.max(
        1,
        Math.round((bounds.bottom - bounds.top) * 0.82)
      )
  );
  let totalWeight = 0;
  let weightedX = 0;
  for (let y = bounds.top; y < bodyBottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const alpha = pixel(
        image,
        startX + x,
        startY + y
      )[3];
      if (alpha <= 64) continue;
      totalWeight += alpha;
      weightedX += (x + 0.5) * alpha;
    }
  }
  return weightedX / totalWeight;
}

function frontUpperSilhouetteRatio(image, row, column) {
  const { bounds } = inspectCell(image, row, column);
  const startX = column * CELL_SIZE;
  const startY = row * CELL_SIZE;
  const visibleHeight = bounds.bottom - bounds.top;
  const sampleBottom = Math.min(
    bounds.bottom,
    bounds.top + Math.round(visibleHeight * 0.42)
  );
  const spans = [];
  for (let y = bounds.top; y < sampleBottom; y += 1) {
    let left = CELL_SIZE;
    let right = -1;
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (
        pixel(image, startX + x, startY + y)[3] <= 8
      ) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
    if (right >= 0) spans.push(right - left + 1);
  }
  spans.sort((first, second) => first - second);
  return (
    spans[Math.floor((spans.length - 1) * 0.95)] /
    visibleHeight
  );
}

describe("career outfit atlas manifest", () => {
  it("records the exact schema, packs, identities, seasons, and columns", () => {
    expect(Object.keys(manifest).sort()).toEqual(
      [
        "version",
        "cellSize",
        "anchorSpace",
        "packs",
        "heritages",
        "genders",
        "seasons",
        "poses",
        "sourceColumns",
        "columns",
        "uniforms",
        "atlases",
      ].sort()
    );
    expect(manifest.version).toBe(1);
    expect(manifest.cellSize).toBe(CELL_SIZE);
    expect(manifest.anchorSpace).toBe("source-cell-pixels");
    expect(manifest.packs).toEqual(PACKS);
    expect(manifest.heritages).toEqual(HERITAGES);
    expect(manifest.genders).toEqual(GENDERS);
    expect(manifest.seasons).toEqual(SEASONS);
    expect(manifest.poses).toEqual(POSES);
    expect(manifest.sourceColumns).toEqual(SOURCE_COLUMNS);
    expect(manifest.columns).toEqual(COLUMNS);

    const expectedUniforms = {};
    for (const [pack, uniforms] of Object.entries(PACKS)) {
      for (const [row, uniform] of uniforms.entries()) {
        expectedUniforms[uniform] = {
          pack,
          row,
          ageBand: "adult",
          summer: true,
        };
      }
    }
    expect(manifest.uniforms).toEqual(expectedUniforms);
    expect(Object.keys(manifest.uniforms)).toHaveLength(13);
    expect(Object.keys(manifest.atlases).sort()).toEqual(
      expectedAtlases.map(({ key }) => key).sort()
    );

    for (const {
      key,
      pack,
      file,
    } of expectedAtlases) {
      const entry = manifest.atlases[key];
      expect(Object.keys(entry).sort()).toEqual(["file", "rows"]);
      expect(entry.file).toBe(file);
      expect(entry.rows).toHaveLength(PACKS[pack].length);
      for (const row of entry.rows) {
        expect(row).toHaveLength(COLUMNS.length);
      }
    }
  });

  it("checks in exactly the 24 declared runtime PNGs", () => {
    const actualFiles = readdirSync(directory)
      .filter((name) =>
        /^career-outfit-atlas-.*\.png$/.test(name)
      )
      .sort();
    expect(actualFiles).toEqual(expectedFiles);
    expect(actualFiles).toHaveLength(24);
  });
});

describe("career outfit atlas pixels and anchors", () => {
  for (const {
    key,
    pack,
    file,
  } of expectedAtlases) {
    it(`${file} is a clean grounded RGBA atlas`, () => {
      const path = `${directory}/${file}`;
      expect(statSync(path).size).toBeGreaterThan(50_000);
      const image = decodeRgbaPng(path);
      expect([image.width, image.height]).toEqual([
        COLUMNS.length * CELL_SIZE,
        PACKS[pack].length * CELL_SIZE,
      ]);

      const anchorRows = manifest.atlases[key].rows;
      for (
        let row = 0;
        row < PACKS[pack].length;
        row += 1
      ) {
        for (
          let column = 0;
          column < COLUMNS.length;
          column += 1
        ) {
          const stats = inspectCell(image, row, column);
          const label = `${file} r${row} c${column}`;
          expect(
            stats.visiblePixels,
            `${label} visible pixels`
          ).toBeGreaterThanOrEqual(3_500);
          expect(
            stats.opaquePixels / stats.visiblePixels,
            `${label} opaque ratio`
          ).toBeGreaterThanOrEqual(0.72);
          expect(
            stats.transparentPixels,
            `${label} transparent separation`
          ).toBeGreaterThan(CELL_SIZE * CELL_SIZE * 0.35);
          expect(
            stats.hotMagentaPixels,
            `${label} vivid-magenta leak`
          ).toBe(0);
          expect(stats.corners, `${label} transparent corners`).toEqual(
            [0, 0, 0, 0]
          );
          expect(stats.bounds.left).toBeGreaterThanOrEqual(5);
          expect(stats.bounds.top).toBeGreaterThanOrEqual(5);
          expect(stats.bounds.right).toBeLessThanOrEqual(251);
          expect(stats.bounds.bottom).toBeLessThanOrEqual(252);
          expect(
            stats.bounds.bottom - stats.bounds.top,
            `${label} visible height`
          ).toBe(246);

          const anchor = anchorRows[row][column];
          expect(anchor).toHaveLength(2);
          expect(Number.isFinite(anchor[0])).toBe(true);
          expect(Number.isFinite(anchor[1])).toBe(true);
          expect(anchor[0]).toBeGreaterThanOrEqual(5);
          expect(anchor[0]).toBeLessThanOrEqual(251);
          expect(anchor[1]).toBeGreaterThanOrEqual(249);
          expect(anchor[1]).toBeLessThanOrEqual(252);
        }

        for (const facing of [1, 3]) {
          const neutralRoot =
            upperBodyCentroidX(image, row, facing) -
            anchorRows[row][facing][0];
          const motionRoot =
            upperBodyCentroidX(image, row, facing + 4) -
            anchorRows[row][facing + 4][0];
          expect(
            Math.abs(neutralRoot - motionRoot),
            `${file} r${row} side c${facing} stable horizontal root`
          ).toBeLessThanOrEqual(0.75);
        }
      }
    });
  }
});

describe("career outfit seasonal artwork", () => {
  for (const pack of Object.keys(PACKS)) {
    for (const heritage of HERITAGES) {
      for (const gender of GENDERS) {
        it(`${pack} ${heritage} ${gender} has distinct summer art for every uniform`, () => {
          const standard = decodeRgbaPng(
            `${directory}/career-outfit-atlas-${pack}-standard-${heritage}-${gender}.png`
          );
          const summer = decodeRgbaPng(
            `${directory}/career-outfit-atlas-${pack}-summer-${heritage}-${gender}.png`
          );
          for (
            let row = 0;
            row < PACKS[pack].length;
            row += 1
          ) {
            expect(
              differingPixels(standard, summer, row, 0),
              `${PACKS[pack][row]} front neutral summer differs`
            ).toBeGreaterThan(1_000);
          }
        });
      }
    }
  }
});

describe("career outfit motion proportions", () => {
  it("keeps front-step upper silhouettes close to their neutral identity", () => {
    for (const { key, pack, file } of expectedAtlases) {
      const image = decodeRgbaPng(`${directory}/${file}`);
      for (
        let row = 0;
        row < PACKS[pack].length;
        row += 1
      ) {
        const neutral = frontUpperSilhouetteRatio(
          image,
          row,
          0
        );
        const motion = frontUpperSilhouetteRatio(
          image,
          row,
          4
        );
        const ratio = motion / neutral;
        expect(
          ratio,
          `${key} ${PACKS[pack][row]} front upper-silhouette ratio`
        ).toBeGreaterThanOrEqual(0.8);
        expect(
          ratio,
          `${key} ${PACKS[pack][row]} front upper-silhouette ratio`
        ).toBeLessThanOrEqual(1.15);
      }
    }
  });

  it("keeps the corrected Western female leadership motion identities especially close", () => {
    const image = decodeRgbaPng(
      `${directory}/career-outfit-atlas-leadership-standard-western-female.png`
    );
    for (
      let row = 0;
      row < PACKS.leadership.length;
      row += 1
    ) {
      const neutral = frontUpperSilhouetteRatio(
        image,
        row,
        0
      );
      const motion = frontUpperSilhouetteRatio(
        image,
        row,
        4
      );
      expect(
        motion / neutral,
        `${PACKS.leadership[row]} corrected front upper-silhouette ratio`
      ).toBeGreaterThanOrEqual(0.9);
      expect(
        motion / neutral,
        `${PACKS.leadership[row]} corrected front upper-silhouette ratio`
      ).toBeLessThanOrEqual(1.1);
    }
  });
});
