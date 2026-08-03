#!/usr/bin/env python3
"""Measure checked-in storybook cells for stable runtime presentation.

Generated crawling poses can be wider than they are tall. Packing every pose
into a square cell preserves the complete illustration, but it also means a
wide newborn profile occupies fewer vertical pixels than its front view. This
manifest records the alpha-visible height of every frame so the renderer can
apply one uniform scale correction (X and Y together) without cropping or
stretching the artwork.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from math import ceil
from pathlib import Path

from PIL import Image


CELL_SIZE = 256
CELL_PADDING = 5
ALPHA_THRESHOLD = 8
TARGET_DIRECTIONAL_VISIBLE_HEIGHT = CELL_SIZE - CELL_PADDING * 2
MAX_RUNTIME_SCALE_CORRECTION = 1.1
MIN_DIRECTIONAL_VISIBLE_HEIGHT = ceil(
    TARGET_DIRECTIONAL_VISIBLE_HEIGHT / MAX_RUNTIME_SCALE_CORRECTION
)
HERITAGES = ("western", "asian", "middleEastern", "black")
GENDERS = ("male", "female")

FAMILY_SPECS = {
    "base": {
        "prefix": "character-atlas-",
        "rows": ("baby", "child", "teen", "adult", "elder"),
        "columns": 4,
        "directionalColumns": 4,
    },
    "expansion": {
        "prefix": "character-stage-expansion-",
        "rows": ("earlyTeen", "youngAdult", "middleAge"),
        "columns": 4,
        "directionalColumns": 4,
    },
    "motionBase": {
        "prefix": "character-motion-base-",
        "rows": ("baby", "child", "teen", "adult", "elder"),
        "columns": 5,
        "directionalColumns": 4,
    },
    "motionExpansion": {
        "prefix": "character-motion-expansion-",
        "rows": ("earlyTeen", "youngAdult", "middleAge"),
        "columns": 5,
        "directionalColumns": 4,
    },
    "alternate": {
        "prefix": "character-appearance-alternate-",
        "rows": (
            "baby",
            "child",
            "earlyTeen",
            "teen",
            "youngAdult",
            "adult",
            "middleAge",
            "elder",
        ),
        "columns": 9,
        "directionalColumns": 8,
    },
}


def expected_atlas_keys() -> set[str]:
    return {
        f"{heritage}-{gender}"
        for heritage in HERITAGES
        for gender in GENDERS
    }


def visible_height(cell: Image.Image) -> int:
    mask = cell.getchannel("A").point(
        lambda alpha: 255 if alpha >= ALPHA_THRESHOLD else 0
    )
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError("Cannot measure an empty character cell")
    return bounds[3] - bounds[1]


def cell_at(
    atlas: Image.Image,
    row: int,
    column: int,
) -> Image.Image:
    return atlas.crop(
        (
            column * CELL_SIZE,
            row * CELL_SIZE,
            (column + 1) * CELL_SIZE,
            (row + 1) * CELL_SIZE,
        )
    )


def atlas_key(path: Path, prefix: str) -> str:
    if not path.name.startswith(prefix) or path.suffix.lower() != ".png":
        raise ValueError(f"Unexpected atlas filename: {path.name}")
    return path.name[len(prefix) : -len(path.suffix)]


def measure_family(
    asset_dir: Path,
    family: str,
    spec: dict[str, object],
) -> dict[str, object]:
    prefix = str(spec["prefix"])
    rows = tuple(str(row) for row in spec["rows"])
    columns = int(spec["columns"])
    directional_columns = int(spec["directionalColumns"])
    measured: dict[str, list[list[int]]] = {}

    for path in sorted(asset_dir.glob(f"{prefix}*.png")):
        key = atlas_key(path, prefix)
        with Image.open(path) as source:
            atlas = source.convert("RGBA")
        expected_size = (columns * CELL_SIZE, len(rows) * CELL_SIZE)
        if atlas.size != expected_size:
            raise ValueError(
                f"{path} is {atlas.size}; expected {expected_size}"
            )
        heights = [
            [
                visible_height(cell_at(atlas, row, column))
                for column in range(columns)
            ]
            for row in range(len(rows))
        ]
        for row, age_band in enumerate(rows):
            for column in range(directional_columns):
                height = heights[row][column]
                if not (
                    MIN_DIRECTIONAL_VISIBLE_HEIGHT
                    <= height
                    <= TARGET_DIRECTIONAL_VISIBLE_HEIGHT
                ):
                    raise ValueError(
                        f"{path} {age_band} c{column} has invalid "
                        f"visible height {height}; expected "
                        f"{MIN_DIRECTIONAL_VISIBLE_HEIGHT}.."
                        f"{TARGET_DIRECTIONAL_VISIBLE_HEIGHT}"
                    )
                if (
                    age_band != "baby"
                    and height != TARGET_DIRECTIONAL_VISIBLE_HEIGHT
                ):
                    raise ValueError(
                        f"{path} {age_band} c{column} has visible height "
                        f"{height}; expected "
                        f"{TARGET_DIRECTIONAL_VISIBLE_HEIGHT}"
                    )
        measured[key] = heights

    if set(measured) != expected_atlas_keys():
        missing = sorted(expected_atlas_keys() - set(measured))
        extra = sorted(set(measured) - expected_atlas_keys())
        raise ValueError(
            f"{family} atlas set is incomplete; missing={missing}, "
            f"extra={extra}"
        )

    return {
        "rows": list(rows),
        "columns": columns,
        "directionalColumns": directional_columns,
        "atlases": measured,
    }


def write_atomic(path: Path, manifest: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(
        prefix=f".{path.stem}-",
        suffix=".json",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as output:
            json.dump(manifest, output, indent=2)
            output.write("\n")
        temporary_path.replace(path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--asset-dir",
        type=Path,
        default=Path("src/assets/characters"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(
            "src/assets/characters/character-frame-metrics.json"
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    families = {
        family: measure_family(args.asset_dir, family, spec)
        for family, spec in FAMILY_SPECS.items()
    }
    manifest: dict[str, object] = {
        "version": 1,
        "cellSize": CELL_SIZE,
        "alphaThreshold": ALPHA_THRESHOLD,
        "directionalTargetVisibleHeight": (
            TARGET_DIRECTIONAL_VISIBLE_HEIGHT
        ),
        "families": families,
    }
    write_atomic(args.output, manifest)
    measured_cells = sum(
        len(rows) * int(family["columns"]) * len(expected_atlas_keys())
        for family, rows in (
            (families[name], FAMILY_SPECS[name]["rows"])
            for name in FAMILY_SPECS
        )
    )
    print(
        f"wrote {args.output} with {measured_cells} measured cells"
    )


if __name__ == "__main__":
    main()
