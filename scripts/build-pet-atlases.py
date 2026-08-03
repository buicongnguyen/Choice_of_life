#!/usr/bin/env python3
"""Normalize reviewed dog and cat turnaround sheets into runtime atlases.

The ImageGen authoring sheets are square 4 x 4 layouts on a chroma-key
background.  The shared ImageGen chroma-removal helper is run before this
script.  This builder then isolates each cell, normalizes its scale, aligns
every paw/haunch contact to one canonical ground root, and validates the final
RGBA atlas before publishing it.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


PET_KINDS = ("dog", "cat")
CELL_SIZE = 256
GRID_SIZE = 4
CELL_PADDING = 5
GROUND_ANCHOR = (128, 236)
MAX_SPRITE_WIDTH = CELL_SIZE - CELL_PADDING * 2
# At the runtime's 76/72px square draw boxes this produces an approximately
# 56px dog and 53px cat, preserving the event-label clearance of the legacy
# renderer while remaining large enough to read.
MAX_SPRITE_HEIGHT = 190
ROWS = ("idle", "walkA", "walkB", "sit")
COLUMNS = ("front", "left", "back", "right")
SOURCE_CELL_BLEED = 14


def grid_edges(length: int) -> list[int]:
    """Return rounded equal-cell cuts, including both image edges."""

    return [round(index * length / GRID_SIZE) for index in range(GRID_SIZE + 1)]


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    # Ignore only near-invisible matte noise; retain the reviewed soft edge.
    mask = alpha.point(lambda value: 255 if value >= 10 else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("Atlas cell is empty after alpha cleanup")
    return bbox


def clean_transparent_rgb(image: Image.Image) -> Image.Image:
    """Zero RGB under fully transparent pixels for halo-safe resizing."""

    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 10:
                pixels[x, y] = (0, 0, 0, 0)
            elif alpha < 255:
                # Keep edge colors but clamp very weak alpha noise.
                pixels[x, y] = (red, green, blue, alpha)
    return image


def retain_largest_component(image: Image.Image) -> Image.Image:
    """Drop tiny detached matte fragments while preserving one closed pet."""

    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= 10 else 0)
    pixels = mask.load()
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(mask.height):
        for x in range(mask.width):
            if not pixels[x, y] or (x, y) in seen:
                continue
            component: list[tuple[int, int]] = []
            stack = [(x, y)]
            seen.add((x, y))
            while stack:
                current_x, current_y = stack.pop()
                component.append((current_x, current_y))
                for neighbor_x, neighbor_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if (
                        0 <= neighbor_x < mask.width
                        and 0 <= neighbor_y < mask.height
                        and pixels[neighbor_x, neighbor_y]
                        and (neighbor_x, neighbor_y) not in seen
                    ):
                        seen.add((neighbor_x, neighbor_y))
                        stack.append((neighbor_x, neighbor_y))

            components.append(component)

    if not components:
        raise ValueError("Atlas cell has no visible component")
    largest = max(components, key=len)
    keep = set(largest)
    source_pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            if (x, y) not in keep and source_pixels[x, y][3]:
                source_pixels[x, y] = (0, 0, 0, 0)
    return image


def normalize_cell(source: Image.Image) -> tuple[Image.Image, tuple[int, int]]:
    source = clean_transparent_rgb(source)
    source = retain_largest_component(source)
    sprite = source.crop(alpha_bbox(source))
    scale = min(
        MAX_SPRITE_WIDTH / sprite.width,
        MAX_SPRITE_HEIGHT / sprite.height,
    )
    size = (
        max(1, round(sprite.width * scale)),
        max(1, round(sprite.height * scale)),
    )
    sprite = sprite.resize(size, Image.Resampling.LANCZOS)
    sprite = clean_transparent_rgb(sprite)

    cell = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    paste_x = GROUND_ANCHOR[0] - size[0] // 2
    paste_y = GROUND_ANCHOR[1] - size[1]
    cell.alpha_composite(sprite, (paste_x, paste_y))
    return cell, size


def validate_atlas(atlas: Image.Image, kind: str) -> None:
    expected = (CELL_SIZE * GRID_SIZE, CELL_SIZE * GRID_SIZE)
    if atlas.size != expected or atlas.mode != "RGBA":
        raise ValueError(
            f"{kind} atlas is {atlas.mode} {atlas.size}; expected RGBA {expected}"
        )

    for row in range(GRID_SIZE):
        for column in range(GRID_SIZE):
            box = (
                column * CELL_SIZE,
                row * CELL_SIZE,
                (column + 1) * CELL_SIZE,
                (row + 1) * CELL_SIZE,
            )
            sprite = atlas.crop(box)
            bbox = sprite.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError(f"{kind} r{row}c{column} is empty")
            left, top, right, bottom = bbox
            if (
                left < CELL_PADDING
                or top < CELL_PADDING
                or right > CELL_SIZE - CELL_PADDING
                or bottom > GROUND_ANCHOR[1] + 1
            ):
                raise ValueError(
                    f"{kind} r{row}c{column} violates safety/root bounds: {bbox}"
                )
            corners = (
                sprite.getpixel((0, 0))[3],
                sprite.getpixel((CELL_SIZE - 1, 0))[3],
                sprite.getpixel((0, CELL_SIZE - 1))[3],
                sprite.getpixel((CELL_SIZE - 1, CELL_SIZE - 1))[3],
            )
            if any(corners):
                raise ValueError(
                    f"{kind} r{row}c{column} has a nontransparent corner"
                )


def build_one(source: Path, destination: Path, kind: str) -> list[list[list[int]]]:
    with Image.open(source) as image_file:
        image = image_file.convert("RGBA")
    if image.width != image.height:
        raise ValueError(f"{source} must be square, got {image.size}")

    x_edges = grid_edges(image.width)
    y_edges = grid_edges(image.height)
    atlas = Image.new(
        "RGBA",
        (CELL_SIZE * GRID_SIZE, CELL_SIZE * GRID_SIZE),
        (0, 0, 0, 0),
    )
    details: list[str] = []
    anchors: list[list[list[int]]] = []
    for row in range(GRID_SIZE):
        anchor_row: list[list[int]] = []
        for column in range(GRID_SIZE):
            nominal_region = (
                x_edges[column],
                y_edges[row],
                x_edges[column + 1],
                y_edges[row + 1],
            )
            source_region = (
                max(0, nominal_region[0] - SOURCE_CELL_BLEED),
                max(0, nominal_region[1] - SOURCE_CELL_BLEED),
                min(image.width, nominal_region[2] + SOURCE_CELL_BLEED),
                min(image.height, nominal_region[3] + SOURCE_CELL_BLEED),
            )
            cell, size = normalize_cell(image.crop(source_region))
            atlas.alpha_composite(
                cell,
                (column * CELL_SIZE, row * CELL_SIZE),
            )
            anchor_row.append([GROUND_ANCHOR[0], GROUND_ANCHOR[1]])
            details.append(
                f"r{row}c{column}={nominal_region}"
                f"/bleed{SOURCE_CELL_BLEED}->{size}"
            )
        anchors.append(anchor_row)

    validate_atlas(atlas, kind)
    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, format="PNG", optimize=True)
    print(f"{kind}: " + ", ".join(details))
    print(f"  wrote {destination}")
    return anchors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("src/assets/pets/source"),
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("src/assets/pets"),
    )
    args = parser.parse_args()

    manifest: dict[str, object] = {
        "version": 1,
        "cellSize": CELL_SIZE,
        "anchorSpace": "source-cell-pixels",
        "rows": list(ROWS),
        "columns": list(COLUMNS),
        "atlases": {},
    }
    atlas_entries = manifest["atlases"]
    assert isinstance(atlas_entries, dict)
    for kind in PET_KINDS:
        source = args.source_dir / f"pet-atlas-{kind}-rgba-full.png"
        destination = args.out_dir / f"pet-atlas-{kind}.png"
        atlas_entries[kind] = build_one(source, destination, kind)

    manifest_path = args.out_dir / "pet-anchors.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
