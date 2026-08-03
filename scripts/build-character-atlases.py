#!/usr/bin/env python3
"""Remove connected chroma backgrounds and pack v5 character atlases.

Image generation produces a regular five-age by four-facing sheet, but the
figures are not guaranteed to land on mathematically equal grid boundaries.
This script finds the transparent gaps between rows/columns, trims each frame,
and packs every sheet into the same 4 x 5 grid of 256 px square cells.

The chroma remover deliberately flood-fills *from the image border*. A plain
per-pixel magenta key can mistake warm red-dominant skin for background; border
connectivity removes the backdrop while preserving enclosed character colors.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from statistics import median
from typing import Iterable

from PIL import Image


HERITAGES = ("western", "asian", "middleEastern", "black")
GENDERS = ("male", "female")
ROWS = 5
COLUMNS = 4
CELL_SIZE = 256
CELL_PADDING = 5
GROUND_ALPHA_THRESHOLD = 64
GROUND_BAND_FRACTION = 0.125
GROUND_BAND_MIN_PIXELS = 8
GROUND_EDGE_TRIM_FRACTION = 0.12
CHROMA_FRINGE_LAYERS = 2

# Source turnarounds sometimes use the illustration convention "show the
# subject's left side" (so the figure looks screen-right), even when the prompt
# says "face left". Runtime atlases are normalized to the unambiguous order
# front, screen-left, back, screen-right.
SOURCE_COLUMNS_TO_CANONICAL: dict[str, tuple[int, int, int, int]] = {
    "western-male": (0, 3, 2, 1),
    "western-female": (0, 3, 2, 1),
    "asian-male": (0, 3, 2, 1),
    "asian-female": (0, 3, 2, 1),
    "middleEastern-male": (0, 3, 2, 1),
    "middleEastern-female": (0, 3, 2, 1),
    "black-male": (0, 1, 2, 3),
    "black-female": (0, 3, 2, 1),
}

# A few ImageGen rows supplied two genuinely screen-right profiles even though
# the sheet prompt requested opposite side views. The canonical left cell is
# mirrored from that row's clean right profile so gameplay direction is never
# ambiguous. Rows not listed retain their independently generated left view.
MIRROR_RIGHT_TO_LEFT_ROWS: dict[str, tuple[int, ...]] = {
    "western-male": (0, 4),
    "western-female": (4,),
    "asian-male": (0, 4),
    "asian-female": (4,),
    "middleEastern-male": (0, 4),
    "middleEastern-female": (0, 4),
    "black-male": (4,),
}

# Chroma cleanup is intentionally cell-specific. Some finished costumes contain
# legitimate mint, teal, or olive accents, so applying a saturation key to the
# complete atlas would punch holes in real clothing. These are the reviewed
# cells that still contain unmistakable source-screen green.
NEON_GREEN_CELLS: dict[str, tuple[tuple[int, int], ...]] = {
    "asian-male": ((4, 1),),
    "asian-female": ((2, 3),),
    "middleEastern-male": ((1, 0), (1, 1), (1, 3)),
    "middleEastern-female": (
        (0, 1),
        (0, 3),
        (1, 1),
        (1, 3),
        (2, 0),
        (2, 1),
        (2, 3),
        (3, 3),
        (4, 1),
        (4, 3),
    ),
    "black-male": ((1, 3), (2, 1), (2, 3)),
}


def is_neon_green(rgb: tuple[int, int, int]) -> bool:
    """Detect saturated green-screen remnants, not normal teal/olive clothing."""

    red, green, blue = rgb
    return (
        green >= 170
        and green - max(red, blue) >= 55
        and green >= red * 1.4
        and green >= blue * 1.4
    )


def is_green_fringe(rgb: tuple[int, int, int]) -> bool:
    """Detect the softer antialias fringe immediately around a neon core."""

    red, green, blue = rgb
    return green >= 65 and green - max(red, blue) >= 20


def remove_neon_green_remnants(image: Image.Image) -> int:
    """Clear isolated green-key cores and a two-pixel antialias fringe."""

    pixels = image.load()
    width, height = image.size
    clear: set[tuple[int, int]] = set()
    frontier: set[tuple[int, int]] = set()
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 8 and is_neon_green((red, green, blue)):
                clear.add((x, y))
                frontier.add((x, y))

    # Keep the expansion deliberately local. A full flood fill could reach
    # intentional green garments; two pixels are enough for resampling halos.
    for _ in range(2):
        next_frontier: set[tuple[int, int]] = set()
        for x, y in frontier:
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    if (nx, ny) in clear:
                        continue
                    red, green, blue, alpha = pixels[nx, ny]
                    if alpha > 0 and is_green_fringe((red, green, blue)):
                        clear.add((nx, ny))
                        next_frontier.add((nx, ny))
        frontier = next_frontier

    for x, y in clear:
        pixels[x, y] = (0, 0, 0, 0)
    return len(clear)


def repair_runtime_atlas(
    atlas: Image.Image, atlas_key: str
) -> tuple[Image.Image, int, tuple[int, ...]]:
    """Enforce clean chroma and true screen-left views in a packed atlas."""

    repaired = atlas.convert("RGBA")
    removed = 0
    for row, column in NEON_GREEN_CELLS.get(atlas_key, ()):
        box = (
            column * CELL_SIZE,
            row * CELL_SIZE,
            (column + 1) * CELL_SIZE,
            (row + 1) * CELL_SIZE,
        )
        cell = repaired.crop(box)
        removed += remove_neon_green_remnants(cell)
        repaired.paste(cell, box)
    mirrored_rows = MIRROR_RIGHT_TO_LEFT_ROWS.get(atlas_key, ())
    for row in mirrored_rows:
        right_box = (
            3 * CELL_SIZE,
            row * CELL_SIZE,
            4 * CELL_SIZE,
            (row + 1) * CELL_SIZE,
        )
        right_profile = repaired.crop(right_box)
        left_profile = right_profile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        left_box = (
            1 * CELL_SIZE,
            row * CELL_SIZE,
            2 * CELL_SIZE,
            (row + 1) * CELL_SIZE,
        )
        repaired.paste(left_profile, left_box)
    return repaired, removed, mirrored_rows


def border_key(image: Image.Image) -> tuple[int, int, int]:
    """Return the median RGB color from a thin border sample."""

    pixels = image.load()
    width, height = image.size
    band = max(2, min(width, height) // 200)
    samples: list[tuple[int, int, int]] = []
    for y in range(height):
        for x in range(width):
            if x < band or x >= width - band or y < band or y >= height - band:
                samples.append(pixels[x, y][:3])
    return tuple(int(median(channel)) for channel in zip(*samples))


def channel_distance(rgb: tuple[int, int, int], key: tuple[int, int, int]) -> int:
    return max(abs(rgb[index] - key[index]) for index in range(3))


def is_chroma_candidate(
    rgb: tuple[int, int, int], key: tuple[int, int, int]
) -> bool:
    """Recognize key-colored fringe for a bounded local expansion."""

    red, green, blue = rgb
    key_red, key_green, key_blue = key
    if channel_distance(rgb, key) <= 48:
        return True

    # Green-screen generations. Warm skin never satisfies green dominance.
    if key_green > key_red + 70 and key_green > key_blue + 70:
        return green > 40 and green - max(red, blue) > 12

    # Magenta-screen generations. Requiring both red and blue protects skin.
    if key_red > key_green + 70 and key_blue > key_green + 70:
        return (
            red > 40
            and blue > 35
            and min(red, blue) - green > 12
            and abs((red - blue) - (key_red - key_blue)) < 120
        )

    return False


def is_isolated_chroma_candidate(
    rgb: tuple[int, int, int], key: tuple[int, int, int]
) -> bool:
    """Match only the actual key-color core.

    The broad predicate above can mistake burgundy, purple, or green clothes
    for the screen color. It is therefore allowed only in the two-pixel fringe
    around an already-proven key-color core.
    """

    return channel_distance(rgb, key) <= 64


def pixel_neighbors(index: int, width: int, height: int) -> tuple[int, ...]:
    x = index % width
    y = index // width
    return tuple(
        neighbor
        for neighbor in (
            index - 1 if x else -1,
            index + 1 if x < width - 1 else -1,
            index - width if y else -1,
            index + width if y < height - 1 else -1,
            index - width - 1 if x and y else -1,
            index - width + 1 if x < width - 1 and y else -1,
            index + width - 1 if x and y < height - 1 else -1,
            index + width + 1 if x < width - 1 and y < height - 1 else -1,
        )
        if neighbor >= 0
    )


def expand_chroma_fringe(
    selected: bytearray,
    broad_candidates: bytearray,
    width: int,
    height: int,
) -> None:
    """Grow a proven key-color region through at most two antialias pixels."""

    frontier = [index for index, value in enumerate(selected) if value]
    for _ in range(CHROMA_FRINGE_LAYERS):
        next_frontier: list[int] = []
        for index in frontier:
            for neighbor in pixel_neighbors(index, width, height):
                if (
                    broad_candidates[neighbor]
                    and not selected[neighbor]
                ):
                    selected[neighbor] = 1
                    next_frontier.append(neighbor)
        frontier = next_frontier
        if not frontier:
            break


def remove_isolated_chroma(
    image: Image.Image, key: tuple[int, int, int]
) -> tuple[Image.Image, int]:
    """Clear isolated exact-key pockets plus only their local edge fringe."""

    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    selected = bytearray(width * height)
    broad_candidates = bytearray(width * height)
    for y in range(height):
        offset = y * width
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if not alpha:
                continue
            rgb = (red, green, blue)
            if is_isolated_chroma_candidate(rgb, key):
                selected[offset + x] = 1
            if is_chroma_candidate(rgb, key):
                broad_candidates[offset + x] = 1
    expand_chroma_fringe(
        selected, broad_candidates, width, height
    )
    removed = 0
    for index, should_remove in enumerate(selected):
        if not should_remove:
            continue
        pixels[index % width, index // width] = (0, 0, 0, 0)
        removed += 1
    return rgba, removed


def remove_connected_chroma(image: Image.Image) -> tuple[Image.Image, tuple[int, int, int], int]:
    """Clear border-connected exact key plus a bounded antialias fringe."""

    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    key = border_key(rgba)
    core_candidates = bytearray(width * height)
    broad_candidates = bytearray(width * height)

    for y in range(height):
        offset = y * width
        for x in range(width):
            rgb = pixels[x, y][:3]
            if is_isolated_chroma_candidate(rgb, key):
                core_candidates[offset + x] = 1
            if is_chroma_candidate(rgb, key):
                broad_candidates[offset + x] = 1

    background = bytearray(width * height)
    queue: deque[int] = deque()

    def seed(x: int, y: int) -> None:
        index = y * width + x
        if core_candidates[index] and not background[index]:
            background[index] = 1
            queue.append(index)

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(height):
        seed(0, y)
        seed(width - 1, y)

    while queue:
        index = queue.popleft()
        for neighbor in pixel_neighbors(index, width, height):
            if core_candidates[neighbor] and not background[neighbor]:
                background[neighbor] = 1
                queue.append(neighbor)

    expand_chroma_fringe(
        background, broad_candidates, width, height
    )
    removed = 0
    for index, is_background in enumerate(background):
        if not is_background:
            continue
        x = index % width
        y = index // width
        pixels[x, y] = (0, 0, 0, 0)
        removed += 1

    return rgba, key, removed


def projection(image: Image.Image, axis: str) -> list[int]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    width, height = alpha.size
    if axis == "x":
        return [
            sum(1 for y in range(height) if pixels[x, y] > 8)
            for x in range(width)
        ]
    return [
        sum(1 for x in range(width) if pixels[x, y] > 8)
        for y in range(height)
    ]


def low_runs(values: list[int], start: int, end: int) -> Iterable[tuple[int, int]]:
    run_start: int | None = None
    for index in range(start, end):
        if values[index] <= 2:
            if run_start is None:
                run_start = index
        elif run_start is not None:
            yield run_start, index
            run_start = None
    if run_start is not None:
        yield run_start, end


def grid_cuts(values: list[int], groups: int) -> list[int]:
    """Find transparent valleys near the expected regular-grid boundaries."""

    size = len(values)
    cuts = [0]
    radius = max(12, int(size / groups * 0.42))
    for group in range(1, groups):
        expected = round(size * group / groups)
        start = max(cuts[-1] + 1, expected - radius)
        end = min(size - 1, expected + radius)
        runs = list(low_runs(values, start, end))
        if runs:
            run = min(
                runs,
                key=lambda pair: (
                    abs(((pair[0] + pair[1]) // 2) - expected),
                    -(pair[1] - pair[0]),
                ),
            )
            cut = (run[0] + run[1]) // 2
        else:
            cut = min(range(start, end), key=lambda index: (values[index], abs(index - expected)))
        cuts.append(cut)
    cuts.append(size)
    return cuts


def alpha_bbox(image: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    cell = image.crop(box)
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"No visible sprite found in source region {box}")
    return (
        box[0] + bbox[0],
        box[1] + bbox[1],
        box[0] + bbox[2],
        box[1] + bbox[3],
    )


def ground_anchor(cell: Image.Image) -> list[float | int]:
    """Return the stable body/feet anchor in source-cell pixel coordinates."""

    alpha = cell.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Cannot derive a ground anchor from an empty cell")

    # Use the lowest part of the silhouette so hair, bags, and arm poses do not
    # pull the runtime character sideways. Weighted edge trimming suppresses a
    # cane or one extended foot while retaining the body's contact footprint.
    band_height = max(
        GROUND_BAND_MIN_PIXELS,
        round((bbox[3] - bbox[1]) * GROUND_BAND_FRACTION),
    )
    band_top = max(bbox[1], bbox[3] - band_height)
    pixels = alpha.load()
    weighted_columns: list[tuple[float, int]] = []
    for x in range(bbox[0], bbox[2]):
        weight = sum(
            pixels[x, y]
            for y in range(band_top, bbox[3])
            if pixels[x, y] > GROUND_ALPHA_THRESHOLD
        )
        if weight:
            # Pixel centers make mirrored anchors exactly 256 - originalX.
            weighted_columns.append((x + 0.5, weight))

    total_weight = sum(weight for _, weight in weighted_columns)
    if not total_weight:
        raise ValueError(f"No ground pixels found in visible bounds {bbox}")

    lower_bound = total_weight * GROUND_EDGE_TRIM_FRACTION
    upper_bound = total_weight * (1 - GROUND_EDGE_TRIM_FRACTION)
    cumulative = 0.0
    retained_weight = 0.0
    weighted_x = 0.0
    for x, weight in weighted_columns:
        next_cumulative = cumulative + weight
        retained = max(
            0.0,
            min(next_cumulative, upper_bound) - max(cumulative, lower_bound),
        )
        weighted_x += x * retained
        retained_weight += retained
        cumulative = next_cumulative

    # bbox bottom is the pixel boundary just below the final visible row. It
    # therefore preserves the packer's five transparent inset pixels while
    # mapping the actual feet to footY at runtime.
    return [round(weighted_x / retained_weight, 2), bbox[3]]


DEFAULT_BODY_ALIGNMENT_FRACTION = 0.82


def upper_body_centroid_x(
    cell: Image.Image,
    body_fraction: float = DEFAULT_BODY_ALIGNMENT_FRACTION,
) -> float:
    """Return an alpha-weighted torso/head X center, excluding the stride."""

    if not 0 < body_fraction <= 1:
        raise ValueError(
            f"Body alignment fraction must be within (0, 1], got "
            f"{body_fraction}"
        )
    alpha = cell.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Cannot derive a body center from an empty cell")
    body_bottom = min(
        bbox[3],
        bbox[1]
        + max(1, round((bbox[3] - bbox[1]) * body_fraction)),
    )
    pixels = alpha.load()
    total_weight = 0
    weighted_x = 0.0
    for y in range(bbox[1], body_bottom):
        for x in range(bbox[0], bbox[2]):
            weight = pixels[x, y]
            if weight <= GROUND_ALPHA_THRESHOLD:
                continue
            total_weight += weight
            weighted_x += (x + 0.5) * weight
    if not total_weight:
        raise ValueError(f"No upper-body pixels found in visible bounds {bbox}")
    return weighted_x / total_weight


def motion_anchor_matched_to_neutral(
    motion_cell: Image.Image,
    neutral_cell: Image.Image,
    body_fraction: float = DEFAULT_BODY_ALIGNMENT_FRACTION,
) -> list[float | int]:
    """Keep a motion pose's torso on the neutral pose's world-space root."""

    motion_ground = ground_anchor(motion_cell)
    neutral_ground = ground_anchor(neutral_cell)
    neutral_body_offset = (
        upper_body_centroid_x(neutral_cell, body_fraction)
        - float(neutral_ground[0])
    )
    matched_x = (
        upper_body_centroid_x(motion_cell, body_fraction)
        - neutral_body_offset
    )
    return [round(matched_x, 2), motion_ground[1]]


def atlas_ground_anchors(atlas: Image.Image, atlas_key: str) -> list[list[list[float | int]]]:
    """Derive all five-by-four frame anchors from one normalized atlas."""

    expected_size = (COLUMNS * CELL_SIZE, ROWS * CELL_SIZE)
    if atlas.size != expected_size:
        raise ValueError(
            f"character-atlas-{atlas_key}.png has size {atlas.size}; "
            f"expected {expected_size}"
        )

    rgba = atlas.convert("RGBA")
    return [
        [
            ground_anchor(
                rgba.crop(
                    (
                        column * CELL_SIZE,
                        row * CELL_SIZE,
                        (column + 1) * CELL_SIZE,
                        (row + 1) * CELL_SIZE,
                    )
                )
            )
            for column in range(COLUMNS)
        ]
        for row in range(ROWS)
    ]


def write_ground_anchor_manifest(out_dir: Path, destination: Path) -> None:
    """Write a deterministic manifest derived from every final runtime PNG."""

    atlases: dict[str, list[list[list[float | int]]]] = {}
    for heritage in HERITAGES:
        for gender in GENDERS:
            key = f"{heritage}-{gender}"
            atlas_path = out_dir / f"character-atlas-{key}.png"
            if not atlas_path.exists():
                raise FileNotFoundError(
                    f"Cannot build complete ground-anchor manifest; "
                    f"missing runtime atlas: {atlas_path}"
                )
            with Image.open(atlas_path) as atlas:
                atlases[key] = atlas_ground_anchors(atlas, key)

    manifest = {
        "version": 1,
        "cellSize": CELL_SIZE,
        "anchorSpace": "source-cell-pixels",
        "atlases": atlases,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {destination} ({len(atlases) * ROWS * COLUMNS} anchors)")


def pack_sheet(source: Path, destination: Path) -> None:
    keyed, chroma_key, removed = remove_connected_chroma(Image.open(source))
    x_cuts = grid_cuts(projection(keyed, "x"), COLUMNS)
    y_cuts = grid_cuts(projection(keyed, "y"), ROWS)
    atlas = Image.new("RGBA", (COLUMNS * CELL_SIZE, ROWS * CELL_SIZE), (0, 0, 0, 0))
    atlas_key = source.name.removeprefix("character-atlas-").removesuffix("-source.png")
    source_columns = SOURCE_COLUMNS_TO_CANONICAL.get(atlas_key, (0, 1, 2, 3))

    frame_sizes: list[str] = []
    for row in range(ROWS):
        for column, source_column in enumerate(source_columns):
            region = (
                x_cuts[source_column],
                y_cuts[row],
                x_cuts[source_column + 1],
                y_cuts[row + 1],
            )
            bbox = alpha_bbox(keyed, region)
            sprite = keyed.crop(bbox)
            max_size = CELL_SIZE - CELL_PADDING * 2
            scale = min(max_size / sprite.width, max_size / sprite.height)
            size = (
                max(1, round(sprite.width * scale)),
                max(1, round(sprite.height * scale)),
            )
            sprite = sprite.resize(size, Image.Resampling.LANCZOS)
            paste_x = column * CELL_SIZE + (CELL_SIZE - size[0]) // 2
            paste_y = row * CELL_SIZE + CELL_SIZE - CELL_PADDING - size[1]
            atlas.alpha_composite(sprite, (paste_x, paste_y))
            frame_sizes.append(
                f"r{row}c{column}<-source{source_column}={bbox}->{size}"
            )

    atlas, neon_removed, mirrored_rows = repair_runtime_atlas(atlas, atlas_key)
    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, format="PNG", optimize=True)
    print(
        f"{source.name}: key=#{chroma_key[0]:02x}{chroma_key[1]:02x}"
        f"{chroma_key[2]:02x}, removed={removed}, xCuts={x_cuts}, "
        f"yCuts={y_cuts}, sourceColumns={source_columns}, "
        f"neonRemoved={neon_removed}, mirroredLeftRows={mirrored_rows}"
    )
    print("  " + ", ".join(frame_sizes))
    print(f"  wrote {destination}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("src/assets/source"),
        help="Directory containing character-atlas-*-source.png files.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("src/assets/characters"),
        help="Directory for normalized runtime PNG atlases.",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        help="Optional atlas key such as western-male; may be repeated.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--repair-runtime",
        action="store_true",
        help="Repair already-packed PNGs in --out-dir when sources are absent.",
    )
    mode.add_argument(
        "--anchors-only",
        action="store_true",
        help="Regenerate the anchor manifest without modifying runtime PNGs.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        help="Anchor manifest path (default: <out-dir>/character-anchors.json).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest = args.manifest or args.out_dir / "character-anchors.json"
    requested = set(args.only)
    all_keys = [
        f"{heritage}-{gender}"
        for heritage in HERITAGES
        for gender in GENDERS
    ]
    unknown_keys = requested.difference(all_keys)
    if unknown_keys:
        raise ValueError(f"Unknown atlas key(s): {', '.join(sorted(unknown_keys))}")
    keys = [key for key in all_keys if not requested or key in requested]
    if args.anchors_only:
        write_ground_anchor_manifest(args.out_dir, manifest)
        return
    if args.repair_runtime:
        for key in keys:
            destination = args.out_dir / f"character-atlas-{key}.png"
            if not destination.exists():
                raise FileNotFoundError(f"Missing runtime atlas: {destination}")
            repaired, removed, mirrored_rows = repair_runtime_atlas(
                Image.open(destination), key
            )
            repaired.save(destination, format="PNG", optimize=True)
            print(
                f"{destination.name}: neonRemoved={removed}, "
                f"mirroredLeftRows={mirrored_rows}"
            )
        write_ground_anchor_manifest(args.out_dir, manifest)
        return
    for key in keys:
        source = args.source_dir / f"character-atlas-{key}-source.png"
        if not source.exists():
            raise FileNotFoundError(f"Missing generated source atlas: {source}")
        pack_sheet(source, args.out_dir / f"character-atlas-{key}.png")
    write_ground_anchor_manifest(args.out_dir, manifest)


if __name__ == "__main__":
    main()
