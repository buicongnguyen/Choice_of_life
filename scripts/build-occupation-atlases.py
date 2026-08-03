#!/usr/bin/env python3
"""Build gender-separated Asian/Western occupation character atlases.

Each reviewed ImageGen source sheet is a 5-row by 4-column turnaround on a
magenta screen. Rows are doctor, trainer, dancer, soldier, and farmer. Neutral
and walking sheets are packed into one 1-row by 8-column runtime atlas per
job/heritage/gender, keeping every gender and heritage in a physically distinct
file while allowing the occupation picker to load only the five visible roles.
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


HERITAGES = ("western", "asian")
GENDERS = ("male", "female")
JOBS = ("doctor", "trainer", "dancer", "soldier", "farmer")
JOB_AGE_BANDS = {
    "doctor": "middleAge",
    "trainer": "adult",
    "dancer": "adult",
    "soldier": "adult",
    "farmer": "middleAge",
}
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
GROUND_Y = 251
SOURCE_ROWS = len(JOBS)
SOURCE_COLUMNS_COUNT = len(SOURCE_COLUMNS)
RUNTIME_COLUMNS_COUNT = len(RUNTIME_COLUMNS)
ALPHA_THRESHOLD = 10


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
    "v5_character_atlas_builder_for_occupations",
)
EXPANSION = load_script(
    "build-character-stage-expansions.py",
    "v5_character_expansion_builder_for_occupations",
)


def clean_transparent_rgb(image: Image.Image) -> Image.Image:
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
        raise ValueError("Occupation source cell is empty after chroma cleanup")
    return bbox


def clear_top_edge_components(image: Image.Image) -> Image.Image:
    """Remove opaque fragments that spill down from the preceding grid row."""
    result = image.convert("RGBA")
    pixels = result.load()
    pending: deque[tuple[int, int]] = deque()
    visited: set[tuple[int, int]] = set()

    for x in range(result.width):
        if pixels[x, 0][3] >= ALPHA_THRESHOLD:
            pending.append((x, 0))
            visited.add((x, 0))

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


def content_grid_edges(
    image: Image.Image,
    groups: int,
    axis: str,
) -> list[int]:
    """Find authored grid bands from transparent gaps between figures."""
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
                    pixels[coordinate, cross] if axis == "x"
                    else pixels[cross, coordinate]
                )
                >= ALPHA_THRESHOLD
                for cross in range(cross_length)
            )
        )

    runs: list[tuple[int, int]] = []
    run_start: int | None = None
    for coordinate, is_active in enumerate([*active, False]):
        if is_active and run_start is None:
            run_start = coordinate
        elif not is_active and run_start is not None:
            runs.append((run_start, coordinate))
            run_start = None

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
    return clear_top_edge_components(
        sheet.crop(
            (
                x_edges[column],
                y_edges[row],
                x_edges[column + 1],
                y_edges[row + 1],
            )
        )
    )


def normalize_cell(
    source: Image.Image,
    chroma_key: tuple[int, int, int],
    preferred_height: int | None = None,
) -> tuple[Image.Image, tuple[int, int]]:
    sprite = clean_transparent_rgb(source).crop(alpha_bbox(source))
    max_size = CELL_SIZE - CELL_PADDING * 2
    target_height = preferred_height or max_size
    scale = min(
        max_size / sprite.width,
        target_height / sprite.height,
        max_size / sprite.height,
    )
    size = (
        max(1, round(sprite.width * scale)),
        max(1, round(sprite.height * scale)),
    )
    sprite = sprite.resize(size, Image.Resampling.LANCZOS)
    sprite, _ = EXPANSION.clear_enclosed_chroma(sprite, chroma_key)
    sprite = clean_transparent_rgb(sprite)

    cell = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    paste_x = (CELL_SIZE - size[0]) // 2
    paste_y = GROUND_Y - size[1]
    cell.alpha_composite(sprite, (paste_x, paste_y))
    return cell, size


def cell_bounds(cell: Image.Image) -> tuple[int, int, int, int]:
    return alpha_bbox(cell)


def validate_cell(
    cell: Image.Image,
    atlas_key: str,
    column: int,
) -> None:
    left, top, right, bottom = cell_bounds(cell)
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
    if right - left < 48 or bottom - top < 150:
        raise ValueError(
            f"{atlas_key} c{column} is implausibly small: "
            f"{(left, top, right, bottom)}"
        )
    corners = (
        cell.getpixel((0, 0))[3],
        cell.getpixel((CELL_SIZE - 1, 0))[3],
        cell.getpixel((0, CELL_SIZE - 1))[3],
        cell.getpixel((CELL_SIZE - 1, CELL_SIZE - 1))[3],
    )
    if any(corners):
        raise ValueError(f"{atlas_key} c{column} has opaque corner pixels")


def build_identity(
    source_dir: Path,
    staging_dir: Path,
    heritage: str,
    gender: str,
) -> dict[str, list[list[float | int]]]:
    neutral_path = (
        source_dir
        / f"occupation-neutral-{heritage}-{gender}-source.png"
    )
    motion_path = (
        source_dir
        / f"occupation-motion-{heritage}-{gender}-source.png"
    )
    if not neutral_path.exists() or not motion_path.exists():
        raise FileNotFoundError(
            f"Missing occupation source pair for {heritage}-{gender}"
        )

    neutral_sheet, neutral_key = clean_source(neutral_path)
    motion_sheet, motion_key = clean_source(motion_path)
    neutral_x_edges = content_grid_edges(
        neutral_sheet, SOURCE_COLUMNS_COUNT, "x"
    )
    neutral_y_edges = content_grid_edges(
        neutral_sheet, SOURCE_ROWS, "y"
    )
    motion_x_edges = content_grid_edges(
        motion_sheet, SOURCE_COLUMNS_COUNT, "x"
    )
    motion_y_edges = content_grid_edges(
        motion_sheet, SOURCE_ROWS, "y"
    )
    print(
        f"{heritage}-{gender}: "
        f"neutralGrid={neutral_x_edges}/{neutral_y_edges}, "
        f"motionGrid={motion_x_edges}/{motion_y_edges}"
    )
    anchors: dict[str, list[list[float | int]]] = {}

    for row, job in enumerate(JOBS):
        atlas_key = f"{job}-{heritage}-{gender}"
        atlas = Image.new(
            "RGBA",
            (CELL_SIZE * RUNTIME_COLUMNS_COUNT, CELL_SIZE),
            (0, 0, 0, 0),
        )
        normalized_heights: list[int] = []
        details: list[str] = []

        for column in range(SOURCE_COLUMNS_COUNT):
            cell, size = normalize_cell(
                source_cell(
                    neutral_sheet,
                    row,
                    column,
                    neutral_x_edges,
                    neutral_y_edges,
                ),
                neutral_key,
            )
            validate_cell(cell, atlas_key, column)
            atlas.alpha_composite(cell, (column * CELL_SIZE, 0))
            normalized_heights.append(cell_bounds(cell)[3] - cell_bounds(cell)[1])
            details.append(f"c{column}={size}")

        for column in range(SOURCE_COLUMNS_COUNT):
            runtime_column = column + SOURCE_COLUMNS_COUNT
            cell, size = normalize_cell(
                source_cell(
                    motion_sheet,
                    row,
                    column,
                    motion_x_edges,
                    motion_y_edges,
                ),
                motion_key,
                normalized_heights[column],
            )
            validate_cell(cell, atlas_key, runtime_column)
            atlas.alpha_composite(cell, (runtime_column * CELL_SIZE, 0))
            details.append(f"c{runtime_column}={size}")

        anchor_row: list[list[float | int]] = []
        for column in range(RUNTIME_COLUMNS_COUNT):
            runtime_cell = atlas.crop(
                (
                    column * CELL_SIZE,
                    0,
                    (column + 1) * CELL_SIZE,
                    CELL_SIZE,
                )
            )
            if column >= SOURCE_COLUMNS_COUNT:
                neutral_column = column - SOURCE_COLUMNS_COUNT
                neutral_cell = atlas.crop(
                    (
                        neutral_column * CELL_SIZE,
                        0,
                        (neutral_column + 1) * CELL_SIZE,
                        CELL_SIZE,
                    )
                )
                anchor_row.append(
                    BASE.motion_anchor_matched_to_neutral(
                        runtime_cell, neutral_cell
                    )
                )
            else:
                anchor_row.append(BASE.ground_anchor(runtime_cell))
        anchors[atlas_key] = anchor_row

        destination = (
            staging_dir
            / f"occupation-atlas-{job}-{heritage}-{gender}.png"
        )
        atlas.save(destination, format="PNG", optimize=True)
        print(f"{atlas_key}: " + ", ".join(details))

    return anchors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("src/assets/occupations/source"),
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("src/assets/occupations"),
    )
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {
        "version": 1,
        "cellSize": CELL_SIZE,
        "anchorSpace": "source-cell-pixels",
        "jobs": list(JOBS),
        "ageBands": JOB_AGE_BANDS,
        "columns": list(RUNTIME_COLUMNS),
        "atlases": {},
    }
    manifest_atlases = manifest["atlases"]
    assert isinstance(manifest_atlases, dict)

    with tempfile.TemporaryDirectory(
        prefix="occupation-atlases-"
    ) as temp_dir:
        staging_dir = Path(temp_dir)
        for heritage in HERITAGES:
            for gender in GENDERS:
                manifest_atlases.update(
                    build_identity(
                        args.source_dir,
                        staging_dir,
                        heritage,
                        gender,
                    )
                )

        expected_files = {
            f"occupation-atlas-{job}-{heritage}-{gender}.png"
            for job in JOBS
            for heritage in HERITAGES
            for gender in GENDERS
        }
        actual_files = {path.name for path in staging_dir.glob("*.png")}
        if actual_files != expected_files:
            raise ValueError(
                f"Built occupation atlas set differs: {actual_files ^ expected_files}"
            )

        for filename in sorted(expected_files):
            shutil.copy2(staging_dir / filename, args.out_dir / filename)

    manifest_path = args.out_dir / "occupation-anchors.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
