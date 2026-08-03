#!/usr/bin/env python3
"""Build deterministic packed career-outfit atlases.

Each authoring source is one pack-specific grid on a chroma screen. Rows follow
the immutable pack order below; columns are front, screen-left, back, and
screen-right. Neutral and motion sources are normalized into one eight-column
runtime row per uniform.

The builder validates the complete source and output sets in staging. It then
atomically replaces each runtime PNG and publishes the manifest last.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import tempfile
from collections import deque
from pathlib import Path
from types import ModuleType

from PIL import Image


PACKS: dict[str, tuple[str, ...]] = {
    "service": (
        "teacher",
        "chef",
        "barista",
        "athlete",
        "artist",
    ),
    "technical": (
        "generalengineer",
        "softwareengineer",
        "police",
        "entrepreneur",
    ),
    "leadership": (
        "manager",
        "analyst",
        "lawyer",
        "ceo",
    ),
}
HERITAGES = ("western", "asian")
GENDERS = ("male", "female")
SEASONS = ("standard", "summer")
POSES = ("neutral", "motion")
SOURCE_COLUMNS = ("front", "left", "back", "right")
RUNTIME_COLUMNS = (
    "frontNeutral",
    "screenLeftNeutral",
    "backNeutral",
    "screenRightNeutral",
    "frontMotion",
    "screenLeftMotion",
    "backMotion",
    "screenRightMotion",
)

CELL_SIZE = 256
CELL_PADDING = 5
GROUND_Y = CELL_SIZE - CELL_PADDING
ALPHA_THRESHOLD = 10
OPAQUE_THRESHOLD = 245
MIN_VISIBLE_PIXELS = 3_500
MIN_MOTION_DIFFERENCE = 1_000
MAX_TORSO_ROOT_DRIFT = 0.75
MIN_MOTION_HEIGHT_RATIO = 0.98
MAX_MOTION_HEIGHT_RATIO = 1.05
MANIFEST_NAME = "career-outfit-anchors.json"


def load_script(filename: str, module_name: str) -> ModuleType:
    script = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load atlas helpers from {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASE = load_script(
    "build-character-atlases.py",
    "v5_character_atlas_builder_for_career_outfits",
)
EXPANSION = load_script(
    "build-character-stage-expansions.py",
    "v5_character_expansion_builder_for_career_outfits",
)


def source_filename(
    pack: str,
    season: str,
    heritage: str,
    gender: str,
    pose: str,
) -> str:
    return (
        f"career-outfit-{pack}-{season}-{heritage}-{gender}-"
        f"{pose}-source.png"
    )


def runtime_filename(
    pack: str,
    season: str,
    heritage: str,
    gender: str,
) -> str:
    return (
        f"career-outfit-atlas-{pack}-{season}-{heritage}-{gender}.png"
    )


def atlas_key(
    pack: str,
    season: str,
    heritage: str,
    gender: str,
) -> str:
    return f"{pack}-{season}-{heritage}-{gender}"


def clean_transparent_rgb(image: Image.Image) -> Image.Image:
    """Canonicalize transparent pixels and discard faint chroma remnants."""

    result = image.convert("RGBA")
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < ALPHA_THRESHOLD:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (red, green, blue, alpha)
    return result


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    mask = image.getchannel("A").point(
        lambda alpha: 255 if alpha >= ALPHA_THRESHOLD else 0
    )
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("Career-outfit source cell is empty after cleanup")
    return bbox


def clear_edge_component(
    image: Image.Image,
    edge: str,
) -> Image.Image:
    """Remove a neighboring figure fragment connected to an interior edge."""

    if edge not in {"top", "bottom", "left", "right"}:
        raise ValueError(f"Unsupported crop edge {edge}")
    result = image.convert("RGBA")
    pixels = result.load()
    pending: deque[tuple[int, int]] = deque()
    visited: set[tuple[int, int]] = set()

    if edge == "top":
        seeds = ((x, 0) for x in range(result.width))
    elif edge == "bottom":
        seeds = ((x, result.height - 1) for x in range(result.width))
    elif edge == "left":
        seeds = ((0, y) for y in range(result.height))
    else:
        seeds = ((result.width - 1, y) for y in range(result.height))

    for x, y in seeds:
        if pixels[x, y][3] >= ALPHA_THRESHOLD:
            pending.append((x, y))
            visited.add((x, y))

    while pending:
        x, y = pending.popleft()
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
        for neighbor_x, neighbor_y in (
            (x - 1, y),
            (x + 1, y),
            (x, y - 1),
            (x, y + 1),
        ):
            neighbor = (neighbor_x, neighbor_y)
            if (
                0 <= neighbor_x < result.width
                and 0 <= neighbor_y < result.height
                and neighbor not in visited
                and pixels[neighbor_x, neighbor_y][3] >= ALPHA_THRESHOLD
            ):
                visited.add(neighbor)
                pending.append(neighbor)
    return result


def clean_source(path: Path) -> tuple[Image.Image, tuple[int, int, int]]:
    with Image.open(path) as source_file:
        source = source_file.convert("RGBA")
    connected, chroma_key, border_removed = BASE.remove_connected_chroma(
        source
    )
    cleaned, enclosed_removed = EXPANSION.clear_enclosed_chroma(
        connected,
        chroma_key,
    )
    cleaned = clean_transparent_rgb(cleaned)
    print(
        f"{path.name}: source={source.size}, "
        f"key=#{chroma_key[0]:02x}{chroma_key[1]:02x}"
        f"{chroma_key[2]:02x}, borderRemoved={border_removed}, "
        f"enclosedRemoved={enclosed_removed}"
    )
    return cleaned, chroma_key


def grid_cuts(
    sheet: Image.Image,
    rows: int,
) -> tuple[list[int], list[int]]:
    x_cuts = BASE.grid_cuts(
        BASE.projection(sheet, "x"),
        len(SOURCE_COLUMNS),
    )
    y_cuts = BASE.grid_cuts(BASE.projection(sheet, "y"), rows)
    if len(x_cuts) != len(SOURCE_COLUMNS) + 1:
        raise ValueError(f"Invalid horizontal grid cuts: {x_cuts}")
    if len(y_cuts) != rows + 1:
        raise ValueError(f"Invalid vertical grid cuts: {y_cuts}")
    if any(left >= right for left, right in zip(x_cuts, x_cuts[1:])):
        raise ValueError(f"Non-increasing horizontal grid cuts: {x_cuts}")
    if any(top >= bottom for top, bottom in zip(y_cuts, y_cuts[1:])):
        raise ValueError(f"Non-increasing vertical grid cuts: {y_cuts}")
    return x_cuts, y_cuts


def source_cell(
    sheet: Image.Image,
    row: int,
    column: int,
    rows: int,
    x_cuts: list[int],
    y_cuts: list[int],
) -> Image.Image:
    cell = sheet.crop(
        (
            x_cuts[column],
            y_cuts[row],
            x_cuts[column + 1],
            y_cuts[row + 1],
        )
    )
    if row > 0:
        cell = clear_edge_component(cell, "top")
    if row + 1 < rows:
        cell = clear_edge_component(cell, "bottom")
    if column > 0:
        cell = clear_edge_component(cell, "left")
    if column + 1 < len(SOURCE_COLUMNS):
        cell = clear_edge_component(cell, "right")
    return clean_transparent_rgb(cell)


def normalize_cell(
    source: Image.Image,
    chroma_key: tuple[int, int, int],
    preferred_height: int | None = None,
) -> Image.Image:
    sprite = clean_transparent_rgb(source)
    sprite = sprite.crop(visible_bbox(sprite))
    max_size = CELL_SIZE - CELL_PADDING * 2
    target_height = preferred_height or max_size
    scale = min(max_size / sprite.width, target_height / sprite.height)
    size = (
        max(1, round(sprite.width * scale)),
        max(1, round(sprite.height * scale)),
    )
    sprite = sprite.resize(size, Image.Resampling.LANCZOS)
    sprite, _ = EXPANSION.clear_enclosed_chroma(sprite, chroma_key)
    sprite = clean_transparent_rgb(sprite)
    sprite = sprite.crop(visible_bbox(sprite))

    # Wide walking strides can hit the horizontal inset before matching the
    # neutral height. Restore that height without changing the stride width.
    if (
        preferred_height is not None
        and sprite.height < round(preferred_height * MIN_MOTION_HEIGHT_RATIO)
    ):
        restored_height = min(max_size, preferred_height)
        sprite = sprite.resize(
            (sprite.width, restored_height),
            Image.Resampling.LANCZOS,
        )
        sprite, _ = EXPANSION.clear_enclosed_chroma(sprite, chroma_key)
        sprite = clean_transparent_rgb(sprite)
        sprite = sprite.crop(visible_bbox(sprite))

    if sprite.width > max_size or sprite.height > max_size:
        raise ValueError(
            f"Normalized career-outfit sprite exceeds {max_size}px: "
            f"{sprite.size}"
        )
    cell = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    paste_x = (CELL_SIZE - sprite.width) // 2
    paste_y = GROUND_Y - sprite.height
    cell.alpha_composite(sprite, (paste_x, paste_y))
    return clear_vivid_chroma_specks(clean_transparent_rgb(cell))


def vivid_magenta_pixels(image: Image.Image) -> int:
    return sum(
        1
        for red, green, blue, alpha in image.getdata()
        if (
            alpha >= ALPHA_THRESHOLD
            and red > 225
            and blue > 175
            and green < 75
            and min(red, blue) - green > 115
        )
    )


def clear_vivid_chroma_specks(
    image: Image.Image,
    max_component_size: int = 8,
) -> Image.Image:
    """Remove tiny isolated chroma flecks left by generated source art.

    Full background regions are removed before normalization. Resampling can
    occasionally leave one or two opaque hot-magenta pixels inside a contour;
    keeping the strict final validator while clearing only tiny connected
    components prevents those pixels from leaking into the runtime atlas.
    """

    result = image.convert("RGBA")
    pixels = result.load()
    candidates = {
        (x, y)
        for y in range(result.height)
        for x in range(result.width)
        if (
            pixels[x, y][3] >= ALPHA_THRESHOLD
            and pixels[x, y][0] > 225
            and pixels[x, y][2] > 175
            and pixels[x, y][1] < 75
            and min(pixels[x, y][0], pixels[x, y][2]) - pixels[x, y][1] > 115
        )
    }
    while candidates:
        seed = candidates.pop()
        component = {seed}
        pending = deque((seed,))
        while pending:
            x, y = pending.popleft()
            for neighbor in (
                (x - 1, y),
                (x + 1, y),
                (x, y - 1),
                (x, y + 1),
            ):
                if neighbor in candidates:
                    candidates.remove(neighbor)
                    component.add(neighbor)
                    pending.append(neighbor)
        if len(component) <= max_component_size:
            for x, y in component:
                pixels[x, y] = (0, 0, 0, 0)
    return clean_transparent_rgb(result)


def validate_cell(
    cell: Image.Image,
    key: str,
    row: int,
    column: int,
) -> tuple[int, int, int, int]:
    left, top, right, bottom = visible_bbox(cell)
    label = f"{key} r{row} c{column}"
    if (
        left < CELL_PADDING
        or top < CELL_PADDING
        or right > CELL_SIZE - CELL_PADDING
        or bottom > GROUND_Y + 1
    ):
        raise ValueError(
            f"{label} violates safety/ground bounds: "
            f"{(left, top, right, bottom)}"
        )
    if right - left < 45 or bottom - top < 145:
        raise ValueError(
            f"{label} is implausibly small: {(left, top, right, bottom)}"
        )
    if bottom < GROUND_Y - 2:
        raise ValueError(f"{label} floats above ground: bottom={bottom}")

    corners = (
        cell.getpixel((0, 0))[3],
        cell.getpixel((CELL_SIZE - 1, 0))[3],
        cell.getpixel((0, CELL_SIZE - 1))[3],
        cell.getpixel((CELL_SIZE - 1, CELL_SIZE - 1))[3],
    )
    if any(corners):
        raise ValueError(f"{label} has opaque corner pixels")

    alphas = list(cell.getchannel("A").getdata())
    visible = sum(alpha >= ALPHA_THRESHOLD for alpha in alphas)
    opaque = sum(alpha >= OPAQUE_THRESHOLD for alpha in alphas)
    transparent = sum(alpha == 0 for alpha in alphas)
    if visible < MIN_VISIBLE_PIXELS:
        raise ValueError(f"{label} has only {visible} visible pixels")
    if opaque / visible < 0.72:
        raise ValueError(
            f"{label} is unexpectedly translucent: {opaque}/{visible}"
        )
    if transparent < CELL_SIZE * CELL_SIZE * 0.35:
        raise ValueError(f"{label} lacks transparent separation")
    magenta = vivid_magenta_pixels(cell)
    if magenta:
        raise ValueError(
            f"{label} retains {magenta} opaque vivid-magenta pixels"
        )
    return left, top, right, bottom


def differing_pixels(first: Image.Image, second: Image.Image) -> int:
    if first.size != second.size:
        raise ValueError(
            f"Cannot compare differently sized cells: "
            f"{first.size} and {second.size}"
        )
    first_bytes = first.convert("RGBA").tobytes()
    second_bytes = second.convert("RGBA").tobytes()
    return sum(
        first_bytes[offset : offset + 4]
        != second_bytes[offset : offset + 4]
        for offset in range(0, len(first_bytes), 4)
    )


def atlas_cell(atlas: Image.Image, row: int, column: int) -> Image.Image:
    return atlas.crop(
        (
            column * CELL_SIZE,
            row * CELL_SIZE,
            (column + 1) * CELL_SIZE,
            (row + 1) * CELL_SIZE,
        )
    )


def validate_motion_pair(
    neutral: Image.Image,
    motion: Image.Image,
    neutral_anchor: list[float | int],
    motion_anchor: list[float | int],
    label: str,
) -> None:
    difference = differing_pixels(neutral, motion)
    if difference <= MIN_MOTION_DIFFERENCE:
        raise ValueError(
            f"{label} motion pose changes only {difference} pixels; "
            f"expected > {MIN_MOTION_DIFFERENCE}"
        )
    neutral_bounds = visible_bbox(neutral)
    motion_bounds = visible_bbox(motion)
    neutral_height = neutral_bounds[3] - neutral_bounds[1]
    motion_height = motion_bounds[3] - motion_bounds[1]
    ratio = motion_height / neutral_height
    if not MIN_MOTION_HEIGHT_RATIO <= ratio <= MAX_MOTION_HEIGHT_RATIO:
        raise ValueError(
            f"{label} motion/neutral height ratio {ratio:.3f} is outside "
            f"{MIN_MOTION_HEIGHT_RATIO:.2f}..{MAX_MOTION_HEIGHT_RATIO:.2f}"
        )

    neutral_root = (
        BASE.upper_body_centroid_x(neutral) - float(neutral_anchor[0])
    )
    motion_root = (
        BASE.upper_body_centroid_x(motion) - float(motion_anchor[0])
    )
    drift = abs(neutral_root - motion_root)
    if drift > MAX_TORSO_ROOT_DRIFT:
        raise ValueError(
            f"{label} torso root drifts {drift:.3f}px; "
            f"maximum is {MAX_TORSO_ROOT_DRIFT:.2f}px"
        )


def validate_direction_set(
    atlas: Image.Image,
    row: int,
    key: str,
) -> None:
    comparisons = (
        (0, 2, "front/back neutral"),
        (1, 3, "left/right neutral"),
        (4, 6, "front/back motion"),
        (5, 7, "left/right motion"),
    )
    for first_column, second_column, name in comparisons:
        difference = differing_pixels(
            atlas_cell(atlas, row, first_column),
            atlas_cell(atlas, row, second_column),
        )
        if difference <= MIN_MOTION_DIFFERENCE:
            raise ValueError(
                f"{key} r{row} {name} differs by only {difference} pixels"
            )


def validate_atlas(
    path: Path,
    key: str,
    uniforms: tuple[str, ...],
    anchors: list[list[list[float | int]]],
) -> None:
    with Image.open(path) as atlas_file:
        atlas = atlas_file.convert("RGBA")
    expected_size = (
        len(RUNTIME_COLUMNS) * CELL_SIZE,
        len(uniforms) * CELL_SIZE,
    )
    if atlas.size != expected_size:
        raise ValueError(
            f"{path} has size {atlas.size}; expected {expected_size}"
        )
    if len(anchors) != len(uniforms):
        raise ValueError(
            f"{key} has {len(anchors)} anchor rows; "
            f"expected {len(uniforms)}"
        )

    for row, uniform in enumerate(uniforms):
        if len(anchors[row]) != len(RUNTIME_COLUMNS):
            raise ValueError(
                f"{key} {uniform} has {len(anchors[row])} anchors"
            )
        for column in range(len(RUNTIME_COLUMNS)):
            cell = atlas_cell(atlas, row, column)
            validate_cell(cell, key, row, column)
            anchor = anchors[row][column]
            if (
                len(anchor) != 2
                or not 0 <= float(anchor[0]) <= CELL_SIZE
                or not GROUND_Y - 2
                <= float(anchor[1])
                <= GROUND_Y + 1
            ):
                raise ValueError(
                    f"{key} {uniform} c{column} has invalid anchor "
                    f"{anchor}"
                )

        for facing in range(len(SOURCE_COLUMNS)):
            validate_motion_pair(
                atlas_cell(atlas, row, facing),
                atlas_cell(
                    atlas,
                    row,
                    facing + len(SOURCE_COLUMNS),
                ),
                anchors[row][facing],
                anchors[row][facing + len(SOURCE_COLUMNS)],
                f"{key} {uniform} {SOURCE_COLUMNS[facing]}",
            )
        validate_direction_set(atlas, row, key)


def build_atlas(
    source_dir: Path,
    staging_dir: Path,
    pack: str,
    season: str,
    heritage: str,
    gender: str,
) -> tuple[str, list[list[list[float | int]]], Path]:
    uniforms = PACKS[pack]
    rows = len(uniforms)
    neutral_path = source_dir / source_filename(
        pack,
        season,
        heritage,
        gender,
        "neutral",
    )
    motion_path = source_dir / source_filename(
        pack,
        season,
        heritage,
        gender,
        "motion",
    )
    neutral_sheet, neutral_key = clean_source(neutral_path)
    motion_sheet, motion_key = clean_source(motion_path)
    neutral_x, neutral_y = grid_cuts(neutral_sheet, rows)
    motion_x, motion_y = grid_cuts(motion_sheet, rows)
    key = atlas_key(pack, season, heritage, gender)
    print(
        f"{key}: neutralGrid={neutral_x}/{neutral_y}, "
        f"motionGrid={motion_x}/{motion_y}"
    )

    atlas = Image.new(
        "RGBA",
        (len(RUNTIME_COLUMNS) * CELL_SIZE, rows * CELL_SIZE),
        (0, 0, 0, 0),
    )
    anchors: list[list[list[float | int]]] = []

    for row, uniform in enumerate(uniforms):
        neutral_cells: list[Image.Image] = []
        row_anchors: list[list[float | int]] = []
        frame_details: list[str] = []
        for column in range(len(SOURCE_COLUMNS)):
            cell = normalize_cell(
                source_cell(
                    neutral_sheet,
                    row,
                    column,
                    rows,
                    neutral_x,
                    neutral_y,
                ),
                neutral_key,
            )
            bounds = validate_cell(cell, key, row, column)
            atlas.alpha_composite(
                cell,
                (column * CELL_SIZE, row * CELL_SIZE),
            )
            neutral_cells.append(cell)
            row_anchors.append(BASE.ground_anchor(cell))
            frame_details.append(f"c{column}={bounds}")

        for column in range(len(SOURCE_COLUMNS)):
            runtime_column = column + len(SOURCE_COLUMNS)
            neutral_bounds = visible_bbox(neutral_cells[column])
            neutral_height = neutral_bounds[3] - neutral_bounds[1]
            cell = normalize_cell(
                source_cell(
                    motion_sheet,
                    row,
                    column,
                    rows,
                    motion_x,
                    motion_y,
                ),
                motion_key,
                neutral_height,
            )
            bounds = validate_cell(cell, key, row, runtime_column)
            motion_anchor = BASE.motion_anchor_matched_to_neutral(
                cell,
                neutral_cells[column],
            )
            validate_motion_pair(
                neutral_cells[column],
                cell,
                row_anchors[column],
                motion_anchor,
                f"{key} {uniform} {SOURCE_COLUMNS[column]}",
            )
            atlas.alpha_composite(
                cell,
                (runtime_column * CELL_SIZE, row * CELL_SIZE),
            )
            row_anchors.append(motion_anchor)
            frame_details.append(f"c{runtime_column}={bounds}")

        anchors.append(row_anchors)
        print(f"{key} {uniform}: " + ", ".join(frame_details))

    destination = staging_dir / runtime_filename(
        pack,
        season,
        heritage,
        gender,
    )
    atlas.save(destination, format="PNG", optimize=True)
    validate_atlas(destination, key, uniforms, anchors)
    return key, anchors, destination


def expected_source_filenames() -> set[str]:
    return {
        source_filename(pack, season, heritage, gender, pose)
        for pack in PACKS
        for season in SEASONS
        for heritage in HERITAGES
        for gender in GENDERS
        for pose in POSES
    }


def expected_runtime_filenames() -> set[str]:
    return {
        runtime_filename(pack, season, heritage, gender)
        for pack in PACKS
        for season in SEASONS
        for heritage in HERITAGES
        for gender in GENDERS
    }


def uniform_manifest() -> dict[str, dict[str, object]]:
    return {
        uniform: {
            "pack": pack,
            "row": row,
            "ageBand": "adult",
            "summer": True,
        }
        for pack, uniforms in PACKS.items()
        for row, uniform in enumerate(uniforms)
    }


def atomic_copy(source: Path, destination: Path) -> None:
    """Copy to a sibling temporary file, then atomically replace destination."""

    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        suffix=".tmp",
        dir=destination.parent,
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Pack the complete deterministic career-outfit source set into "
            "grounded runtime atlases."
        )
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("src/assets/career-outfits/source"),
        help=(
            "Directory containing the exact 48 source PNGs "
            "(default: %(default)s)"
        ),
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("src/assets/career-outfits"),
        help=(
            "Directory receiving 24 runtime PNGs and the manifest "
            "(default: %(default)s)"
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    expected_sources = expected_source_filenames()
    if not args.source_dir.is_dir():
        raise FileNotFoundError(
            f"Career-outfit source directory does not exist: "
            f"{args.source_dir}"
        )
    actual_sources = {
        path.name for path in args.source_dir.glob("*.png")
    }
    if actual_sources != expected_sources:
        missing = sorted(expected_sources - actual_sources)
        unexpected = sorted(actual_sources - expected_sources)
        raise ValueError(
            "Career-outfit source set differs from the exact 48-file "
            f"contract; missing={missing}, unexpected={unexpected}"
        )

    manifest: dict[str, object] = {
        "version": 1,
        "cellSize": CELL_SIZE,
        "anchorSpace": "source-cell-pixels",
        "packs": {
            pack: list(uniforms)
            for pack, uniforms in PACKS.items()
        },
        "heritages": list(HERITAGES),
        "genders": list(GENDERS),
        "seasons": list(SEASONS),
        "poses": list(POSES),
        "sourceColumns": list(SOURCE_COLUMNS),
        "columns": list(RUNTIME_COLUMNS),
        "uniforms": uniform_manifest(),
        "atlases": {},
    }
    manifest_atlases = manifest["atlases"]
    assert isinstance(manifest_atlases, dict)

    with tempfile.TemporaryDirectory(
        prefix="career-outfit-atlases-"
    ) as temporary_directory:
        staging_dir = Path(temporary_directory)
        staged_outputs: list[Path] = []
        for pack in PACKS:
            for season in SEASONS:
                for heritage in HERITAGES:
                    for gender in GENDERS:
                        key, anchors, path = build_atlas(
                            args.source_dir,
                            staging_dir,
                            pack,
                            season,
                            heritage,
                            gender,
                        )
                        manifest_atlases[key] = {
                            "file": path.name,
                            "rows": anchors,
                        }
                        staged_outputs.append(path)

        expected_outputs = expected_runtime_filenames()
        actual_outputs = {path.name for path in staged_outputs}
        if actual_outputs != expected_outputs:
            raise ValueError(
                "Staged career-outfit atlas set differs from the exact "
                f"24-file contract: {sorted(actual_outputs ^ expected_outputs)}"
            )

        staged_manifest = staging_dir / MANIFEST_NAME
        staged_manifest.write_text(
            json.dumps(
                manifest,
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
            newline="\n",
        )

        args.out_dir.mkdir(parents=True, exist_ok=True)
        for staged_path in sorted(
            staged_outputs,
            key=lambda path: path.name,
        ):
            atomic_copy(staged_path, args.out_dir / staged_path.name)
        # Publishing the manifest last prevents it from advertising an
        # incomplete staged set.
        atomic_copy(
            staged_manifest,
            args.out_dir / MANIFEST_NAME,
        )

    anchor_count = sum(
        len(uniforms)
        * len(SEASONS)
        * len(HERITAGES)
        * len(GENDERS)
        * len(RUNTIME_COLUMNS)
        for uniforms in PACKS.values()
    )
    print(
        f"published 24 career-outfit atlases and "
        f"{args.out_dir / MANIFEST_NAME} ({anchor_count} anchors)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
