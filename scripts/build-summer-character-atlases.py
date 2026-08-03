#!/usr/bin/env python3
"""Build the adult summer character atlases.

Each ImageGen source is a two-row by four-column turnaround:

    row 0: front, screen-left, back, screen-right neutral
    row 1: front, screen-left, back, screen-right walking

The builder removes the connected magenta screen, finds the authored grid from
the resulting transparent gaps, normalizes all eight full-body figures into
256 px cells, aligns motion roots to their neutral partners, validates the
complete gender/heritage set in staging, and publishes the manifest last.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import tempfile
from collections import deque
from pathlib import Path
from types import ModuleType

from PIL import Image


HERITAGES = ("western", "asian", "middleEastern", "black")
GENDERS = ("male", "female")
SOURCE_ROWS = ("neutral", "motion")
SOURCE_COLUMNS = ("front", "screenLeft", "back", "screenRight")
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
    "v5_character_atlas_builder_for_summer",
)
EXPANSION = load_script(
    "build-character-stage-expansions.py",
    "v5_character_expansion_builder_for_summer",
)


def source_slug(heritage: str) -> str:
    return "middleEastern" if heritage == "middleEastern" else heritage


def source_path(source_dir: Path, heritage: str, gender: str) -> Path:
    return source_dir / f"summer-{source_slug(heritage)}-{gender}-source.png"


def clean_transparent_rgb(image: Image.Image) -> Image.Image:
    """Make fully transparent pixels canonical and discard faint key fringe."""
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


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    mask = image.getchannel("A").point(
        lambda alpha: 255 if alpha >= ALPHA_THRESHOLD else 0
    )
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("Summer source cell is empty after chroma cleanup")
    return bbox


def clear_edge_component(
    image: Image.Image,
    edge: str,
) -> Image.Image:
    """Remove opaque spill connected to a crop edge between authored cells."""
    if edge not in {"top", "bottom", "left", "right"}:
        raise ValueError(f"Unsupported edge {edge}")
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
        for nx, ny in (
            (x - 1, y),
            (x + 1, y),
            (x, y - 1),
            (x, y + 1),
        ):
            neighbor = (nx, ny)
            if (
                0 <= nx < result.width
                and 0 <= ny < result.height
                and neighbor not in visited
                and pixels[nx, ny][3] >= ALPHA_THRESHOLD
            ):
                visited.add(neighbor)
                pending.append(neighbor)
    return result


def content_grid_edges(
    image: Image.Image,
    groups: int,
    axis: str,
) -> list[int]:
    """Find authored figure bands from the transparent gaps between them."""
    if axis not in {"x", "y"}:
        raise ValueError(f"Unsupported grid axis {axis}")
    alpha = image.getchannel("A")
    pixels = alpha.load()
    length = image.width if axis == "x" else image.height
    cross_length = image.height if axis == "x" else image.width
    active: list[bool] = []

    for coordinate in range(length):
        active.append(
            any(
                (
                    pixels[coordinate, cross]
                    if axis == "x"
                    else pixels[cross, coordinate]
                )
                >= ALPHA_THRESHOLD
                for cross in range(cross_length)
            )
        )

    runs: list[tuple[int, int]] = []
    start: int | None = None
    for coordinate, is_active in enumerate([*active, False]):
        if is_active and start is None:
            start = coordinate
        elif not is_active and start is not None:
            runs.append((start, coordinate))
            start = None

    if len(runs) != groups:
        raise ValueError(
            f"Expected {groups} authored {axis}-bands, found {runs}"
        )

    edges = [0]
    for (_, previous_end), (next_start, _) in zip(runs, runs[1:]):
        edges.append(round((previous_end + next_start) / 2))
    edges.append(length)
    return edges


def clean_source(path: Path) -> tuple[Image.Image, tuple[int, int, int]]:
    with Image.open(path) as image_file:
        image = image_file.convert("RGBA")
    connected, chroma_key, border_removed = BASE.remove_connected_chroma(image)
    cleaned, enclosed_removed = EXPANSION.clear_enclosed_chroma(
        connected, chroma_key
    )
    cleaned = clean_transparent_rgb(cleaned)
    print(
        f"{path.name}: source={image.size}, "
        f"key=#{chroma_key[0]:02x}{chroma_key[1]:02x}{chroma_key[2]:02x}, "
        f"borderRemoved={border_removed}, enclosedRemoved={enclosed_removed}"
    )
    return cleaned, chroma_key


def source_cell(
    sheet: Image.Image,
    row: int,
    column: int,
    x_edges: list[int],
    y_edges: list[int],
) -> Image.Image:
    result = sheet.crop(
        (
            x_edges[column],
            y_edges[row],
            x_edges[column + 1],
            y_edges[row + 1],
        )
    )
    # Only shared interior edges can contain a fragment from a neighboring cell.
    if row > 0:
        result = clear_edge_component(result, "top")
    if row + 1 < len(SOURCE_ROWS):
        result = clear_edge_component(result, "bottom")
    if column > 0:
        result = clear_edge_component(result, "left")
    if column + 1 < len(SOURCE_COLUMNS):
        result = clear_edge_component(result, "right")
    return result


def normalize_cell(
    source: Image.Image,
    chroma_key: tuple[int, int, int],
    preferred_height: int | None = None,
) -> Image.Image:
    sprite = clean_transparent_rgb(source)
    sprite = sprite.crop(alpha_bbox(sprite))
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
    sprite = sprite.crop(alpha_bbox(sprite))

    # A wide walking stride can hit the horizontal inset first. Restore the
    # reviewed neutral height without widening it, preventing a visible pulse.
    if (
        preferred_height is not None
        and sprite.height < round(preferred_height * 0.98)
    ):
        restored_height = min(max_size, preferred_height)
        sprite = sprite.resize(
            (sprite.width, restored_height),
            Image.Resampling.LANCZOS,
        )
        sprite, _ = EXPANSION.clear_enclosed_chroma(sprite, chroma_key)
        sprite = clean_transparent_rgb(sprite)
        sprite = sprite.crop(alpha_bbox(sprite))

    if sprite.width > max_size or sprite.height > max_size:
        raise ValueError(
            f"Normalized summer sprite exceeds {max_size}px: {sprite.size}"
        )
    cell = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    paste_x = (CELL_SIZE - sprite.width) // 2
    paste_y = GROUND_Y - sprite.height
    cell.alpha_composite(sprite, (paste_x, paste_y))
    return clean_transparent_rgb(cell)


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


def validate_cell(
    cell: Image.Image,
    atlas_key: str,
    column: int,
) -> tuple[int, int, int, int]:
    left, top, right, bottom = alpha_bbox(cell)
    if (
        left < CELL_PADDING
        or top < CELL_PADDING
        or right > CELL_SIZE - CELL_PADDING
        or bottom > GROUND_Y + 1
    ):
        raise ValueError(
            f"{atlas_key} c{column} violates safety/root bounds: "
            f"{(left, top, right, bottom)}"
        )
    if right - left < 45 or bottom - top < 145:
        raise ValueError(
            f"{atlas_key} c{column} is implausibly small: "
            f"{(left, top, right, bottom)}"
        )
    if bottom < GROUND_Y - 2:
        raise ValueError(
            f"{atlas_key} c{column} floats above the ground: bottom={bottom}"
        )
    corners = (
        cell.getpixel((0, 0))[3],
        cell.getpixel((CELL_SIZE - 1, 0))[3],
        cell.getpixel((0, CELL_SIZE - 1))[3],
        cell.getpixel((CELL_SIZE - 1, CELL_SIZE - 1))[3],
    )
    if any(corners):
        raise ValueError(f"{atlas_key} c{column} has opaque corner pixels")

    alphas = list(cell.getchannel("A").getdata())
    visible = sum(alpha >= ALPHA_THRESHOLD for alpha in alphas)
    opaque = sum(alpha >= OPAQUE_THRESHOLD for alpha in alphas)
    transparent = sum(alpha == 0 for alpha in alphas)
    if visible < 1800:
        raise ValueError(
            f"{atlas_key} c{column} has only {visible} visible pixels"
        )
    if opaque / visible < 0.72:
        raise ValueError(
            f"{atlas_key} c{column} is unexpectedly translucent: "
            f"{opaque}/{visible} opaque"
        )
    if transparent < CELL_SIZE * CELL_SIZE * 0.35:
        raise ValueError(
            f"{atlas_key} c{column} lacks transparent separation"
        )
    magenta = vivid_magenta_pixels(cell)
    if magenta:
        raise ValueError(
            f"{atlas_key} c{column} retains {magenta} opaque magenta pixels"
        )
    return left, top, right, bottom


def atlas_cell(atlas: Image.Image, column: int) -> Image.Image:
    return atlas.crop(
        (
            column * CELL_SIZE,
            0,
            (column + 1) * CELL_SIZE,
            CELL_SIZE,
        )
    )


def validate_atlas(
    path: Path,
    atlas_key: str,
    anchors: list[list[float | int]],
) -> None:
    with Image.open(path) as image_file:
        atlas = image_file.convert("RGBA")
    expected = (len(RUNTIME_COLUMNS) * CELL_SIZE, CELL_SIZE)
    if atlas.size != expected:
        raise ValueError(f"{path} has size {atlas.size}; expected {expected}")
    if len(anchors) != len(RUNTIME_COLUMNS):
        raise ValueError(f"{atlas_key} has {len(anchors)} anchors")

    bounds = [
        validate_cell(atlas_cell(atlas, column), atlas_key, column)
        for column in range(len(RUNTIME_COLUMNS))
    ]
    for column in range(4, 8):
        neutral_height = bounds[column - 4][3] - bounds[column - 4][1]
        motion_height = bounds[column][3] - bounds[column][1]
        ratio = motion_height / neutral_height
        if ratio < 0.98 or ratio > 1.05:
            raise ValueError(
                f"{atlas_key} c{column} height ratio {ratio:.3f} pulses"
            )
    for column, anchor in enumerate(anchors):
        if (
            len(anchor) != 2
            or not 0 <= float(anchor[0]) <= CELL_SIZE
            or not GROUND_Y - 2 <= float(anchor[1]) <= GROUND_Y + 1
        ):
            raise ValueError(
                f"{atlas_key} c{column} has invalid ground anchor {anchor}"
            )


def build_identity(
    source_dir: Path,
    staging_dir: Path,
    heritage: str,
    gender: str,
) -> tuple[str, list[list[float | int]], Path]:
    path = source_path(source_dir, heritage, gender)
    if not path.exists():
        raise FileNotFoundError(f"Missing summer source sheet: {path}")
    sheet, chroma_key = clean_source(path)
    x_edges = content_grid_edges(sheet, len(SOURCE_COLUMNS), "x")
    y_edges = content_grid_edges(sheet, len(SOURCE_ROWS), "y")
    atlas_key = f"{heritage}-{gender}"
    print(f"{atlas_key}: grid={x_edges}/{y_edges}")

    atlas = Image.new(
        "RGBA",
        (len(RUNTIME_COLUMNS) * CELL_SIZE, CELL_SIZE),
        (0, 0, 0, 0),
    )
    neutral_heights: list[int] = []
    details: list[str] = []
    for column in range(4):
        cell = normalize_cell(
            source_cell(sheet, 0, column, x_edges, y_edges),
            chroma_key,
        )
        bounds = validate_cell(cell, atlas_key, column)
        neutral_heights.append(bounds[3] - bounds[1])
        atlas.alpha_composite(cell, (column * CELL_SIZE, 0))
        details.append(f"c{column}={bounds}")

    for column in range(4):
        runtime_column = column + 4
        cell = normalize_cell(
            source_cell(sheet, 1, column, x_edges, y_edges),
            chroma_key,
            neutral_heights[column],
        )
        bounds = validate_cell(cell, atlas_key, runtime_column)
        atlas.alpha_composite(cell, (runtime_column * CELL_SIZE, 0))
        details.append(f"c{runtime_column}={bounds}")

    anchors: list[list[float | int]] = []
    for column in range(8):
        runtime_cell = atlas_cell(atlas, column)
        if column < 4:
            anchors.append(BASE.ground_anchor(runtime_cell))
        else:
            anchors.append(
                BASE.motion_anchor_matched_to_neutral(
                    runtime_cell,
                    atlas_cell(atlas, column - 4),
                )
            )

    destination = staging_dir / f"summer-atlas-{heritage}-{gender}.png"
    atlas.save(destination, format="PNG", optimize=True)
    validate_atlas(destination, atlas_key, anchors)
    print(f"{atlas_key}: " + ", ".join(details))
    return atlas_key, anchors, destination


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("src/assets/summer/source"),
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("src/assets/summer"),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    expected_sources = {
        source_path(args.source_dir, heritage, gender).name
        for heritage in HERITAGES
        for gender in GENDERS
    }
    actual_sources = {path.name for path in args.source_dir.glob("*.png")}
    if actual_sources != expected_sources:
        raise ValueError(
            "Summer source set differs from the required eight sheets: "
            f"{actual_sources ^ expected_sources}"
        )

    manifest: dict[str, object] = {
        "version": 1,
        "cellSize": CELL_SIZE,
        "anchorSpace": "source-cell-pixels",
        "heritages": list(HERITAGES),
        "genders": list(GENDERS),
        "rows": list(SOURCE_ROWS),
        "sourceColumns": list(SOURCE_COLUMNS),
        "columns": list(RUNTIME_COLUMNS),
        "atlases": {},
    }
    manifest_atlases = manifest["atlases"]
    assert isinstance(manifest_atlases, dict)

    with tempfile.TemporaryDirectory(
        prefix="summer-character-atlases-"
    ) as temporary:
        staging_dir = Path(temporary)
        staged_outputs: list[Path] = []
        for heritage in HERITAGES:
            for gender in GENDERS:
                key, anchors, path = build_identity(
                    args.source_dir,
                    staging_dir,
                    heritage,
                    gender,
                )
                manifest_atlases[key] = anchors
                staged_outputs.append(path)

        expected_outputs = {
            f"summer-atlas-{heritage}-{gender}.png"
            for heritage in HERITAGES
            for gender in GENDERS
        }
        actual_outputs = {path.name for path in staged_outputs}
        if actual_outputs != expected_outputs:
            raise ValueError(
                "Built summer atlas set differs: "
                f"{actual_outputs ^ expected_outputs}"
            )

        staged_manifest = staging_dir / "summer-anchors.json"
        staged_manifest.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )

        args.out_dir.mkdir(parents=True, exist_ok=True)
        for staged_path in staged_outputs:
            shutil.copy2(staged_path, args.out_dir / staged_path.name)
        shutil.copy2(staged_manifest, args.out_dir / staged_manifest.name)

    print(
        f"published 8 summer atlases and "
        f"{args.out_dir / 'summer-anchors.json'} (64 anchors)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
