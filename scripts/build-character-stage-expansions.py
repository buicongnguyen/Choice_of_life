#!/usr/bin/env python3
"""Pack the three-row v5 life-stage expansion atlases.

The expansion sheets add early-teen, young-adult, and middle-age art without
regenerating the stable five-row base atlases. Generated source images remain
working material; this script removes their chroma background, normalizes every
figure into a 256 px cell, and writes the 96 runtime ground anchors.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from types import ModuleType

from PIL import Image


HERITAGES = ("western", "asian", "middleEastern", "black")
GENDERS = ("male", "female")
ROWS = 3
COLUMNS = 4
CELL_SIZE = 256
CELL_PADDING = 5


def load_base_builder() -> ModuleType:
    """Load shared chroma, grid, and anchor helpers from the base packer."""

    script = Path(__file__).with_name("build-character-atlases.py")
    spec = importlib.util.spec_from_file_location("v5_character_atlas_builder", script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load shared atlas helpers from {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASE = load_base_builder()


def clear_enclosed_chroma(
    image: Image.Image, key: tuple[int, int, int]
) -> tuple[Image.Image, int]:
    """Clear key-colored islands that a border flood fill cannot reach.

    Enclosed cleanup must use the strict key-color matcher. The shared broad
    predicate is reserved for border-connected flood fill; globally applying
    its hue test can erase burgundy, purple, and green clothing.
    """

    return BASE.remove_isolated_chroma(image, key)


def pack_sheet(source: Path, destination: Path, atlas_key: str) -> Image.Image:
    """Normalize one generated 3 × 4 source into a transparent runtime atlas."""

    connected, chroma_key, border_removed = BASE.remove_connected_chroma(
        Image.open(source)
    )
    keyed, enclosed_removed = clear_enclosed_chroma(connected, chroma_key)
    x_cuts = BASE.grid_cuts(BASE.projection(keyed, "x"), COLUMNS)
    y_cuts = BASE.grid_cuts(BASE.projection(keyed, "y"), ROWS)
    atlas = Image.new(
        "RGBA",
        (COLUMNS * CELL_SIZE, ROWS * CELL_SIZE),
        (0, 0, 0, 0),
    )

    frame_sizes: list[str] = []
    resize_fringe_removed = 0
    for row in range(ROWS):
        for column in range(COLUMNS):
            region = (
                x_cuts[column],
                y_cuts[row],
                x_cuts[column + 1],
                y_cuts[row + 1],
            )
            bbox = BASE.alpha_bbox(keyed, region)
            sprite = keyed.crop(bbox)
            max_size = CELL_SIZE - CELL_PADDING * 2
            scale = min(max_size / sprite.width, max_size / sprite.height)
            size = (
                max(1, round(sprite.width * scale)),
                max(1, round(sprite.height * scale)),
            )
            sprite = sprite.resize(size, Image.Resampling.LANCZOS)
            # Lanczos can blend an otherwise transparent key-colored edge back
            # into a very low-alpha pink pixel. Reapply the reviewed key after
            # resizing so runtime cells remain completely chroma-free.
            sprite, removed_after_resize = clear_enclosed_chroma(
                sprite, chroma_key
            )
            resize_fringe_removed += removed_after_resize
            paste_x = column * CELL_SIZE + (CELL_SIZE - size[0]) // 2
            paste_y = row * CELL_SIZE + CELL_SIZE - CELL_PADDING - size[1]
            atlas.alpha_composite(sprite, (paste_x, paste_y))
            frame_sizes.append(f"r{row}c{column}={bbox}->{size}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, format="PNG", optimize=True)
    print(
        f"{source.name}: key=#{chroma_key[0]:02x}{chroma_key[1]:02x}"
        f"{chroma_key[2]:02x}, borderRemoved={border_removed}, "
        f"enclosedRemoved={enclosed_removed}, "
        f"resizeFringeRemoved={resize_fringe_removed}, "
        f"xCuts={x_cuts}, yCuts={y_cuts}"
    )
    print("  " + ", ".join(frame_sizes))
    print(f"  wrote {destination}")
    return atlas


def atlas_ground_anchors(atlas: Image.Image) -> list[list[list[float | int]]]:
    expected_size = (COLUMNS * CELL_SIZE, ROWS * CELL_SIZE)
    if atlas.size != expected_size:
        raise ValueError(f"Expansion atlas has size {atlas.size}; expected {expected_size}")
    rgba = atlas.convert("RGBA")
    return [
        [
            BASE.ground_anchor(
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


def write_anchor_manifest(out_dir: Path, destination: Path) -> None:
    atlases: dict[str, list[list[list[float | int]]]] = {}
    for heritage in HERITAGES:
        for gender in GENDERS:
            key = f"{heritage}-{gender}"
            atlas_path = out_dir / f"character-stage-expansion-{key}.png"
            if not atlas_path.exists():
                raise FileNotFoundError(
                    f"Cannot build complete expansion anchors; missing {atlas_path}"
                )
            with Image.open(atlas_path) as atlas:
                atlases[key] = atlas_ground_anchors(atlas)

    manifest = {
        "version": 1,
        "cellSize": CELL_SIZE,
        "anchorSpace": "source-cell-pixels",
        "rows": ["earlyTeen", "youngAdult", "middleAge"],
        "atlases": atlases,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {destination} ({len(atlases) * ROWS * COLUMNS} anchors)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("src/assets/source"),
        help="Directory containing character-stage-expansion-*-source.png.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("src/assets/characters"),
        help="Directory for normalized runtime PNG atlases.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        help=(
            "Anchor manifest path "
            "(default: <out-dir>/character-stage-expansion-anchors.json)."
        ),
    )
    parser.add_argument(
        "--anchors-only",
        action="store_true",
        help="Regenerate anchors without modifying runtime atlases.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest = (
        args.manifest
        or args.out_dir / "character-stage-expansion-anchors.json"
    )
    if not args.anchors_only:
        for heritage in HERITAGES:
            for gender in GENDERS:
                key = f"{heritage}-{gender}"
                source = (
                    args.source_dir
                    / f"character-stage-expansion-{key}-source.png"
                )
                if not source.exists():
                    raise FileNotFoundError(f"Missing generated source atlas: {source}")
                destination = (
                    args.out_dir / f"character-stage-expansion-{key}.png"
                )
                pack_sheet(source, destination, key)
    write_anchor_manifest(args.out_dir, manifest)


if __name__ == "__main__":
    main()
