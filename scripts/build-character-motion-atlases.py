#!/usr/bin/env python3
"""Build v5 movement and floor-seated companion character atlases.

Each generated source has five columns:

    front step, screen-left step, back step, screen-right step, floor seated

Base sources have five age rows and expansion sources have three.  The packed
atlases keep the existing 256 px cell contract. Movement cells are normalized
to the matching neutral-frame height, and every packed frame receives its own
reviewed ground anchor so animation always maps to one world-space root.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import tempfile
from collections import deque
from pathlib import Path
from statistics import median
from types import ModuleType

from PIL import Image


HERITAGES = ("western", "asian", "middleEastern", "black")
GENDERS = ("male", "female")
COLUMNS = 5
CELL_SIZE = 256
CELL_PADDING = 5
ALPHA_THRESHOLD = 8

FAMILIES = {
    "base": {
        "rows": ("baby", "child", "teen", "adult", "elder"),
        "neutralPrefix": "character-atlas",
        "neutralManifest": "character-anchors.json",
    },
    "expansion": {
        "rows": ("earlyTeen", "youngAdult", "middleAge"),
        "neutralPrefix": "character-stage-expansion",
        "neutralManifest": "character-stage-expansion-anchors.json",
    },
}


def load_base_builder() -> ModuleType:
    script = Path(__file__).with_name("build-character-atlases.py")
    spec = importlib.util.spec_from_file_location(
        "v5_character_atlas_builder_for_motion", script
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load shared atlas helpers from {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASE = load_base_builder()


def clear_all_chroma(
    image: Image.Image, key: tuple[int, int, int]
) -> tuple[Image.Image, int]:
    """Clear exact-key islands without treating garment hues as background."""

    return BASE.remove_isolated_chroma(image, key)


def clear_detached_cast_shadows(image: Image.Image) -> tuple[Image.Image, int]:
    """Remove only unmistakable, detached, low and wide shadow components.

    Canes, bags, shoes, curls, and hands are intentionally retained.  A
    component is removed only when it is detached, lies at the very bottom of
    the cell, is very flat, and is substantially wider than it is tall.
    """

    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    pixels = alpha.load()
    width, height = rgba.size
    seen = bytearray(width * height)
    components: list[list[int]] = []

    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] <= ALPHA_THRESHOLD:
                continue
            seen[start] = 1
            queue: deque[int] = deque([start])
            component: list[int] = []
            while queue:
                index = queue.popleft()
                component.append(index)
                px = index % width
                py = index // width
                for nx, ny in (
                    (px - 1, py),
                    (px + 1, py),
                    (px, py - 1),
                    (px, py + 1),
                    (px - 1, py - 1),
                    (px + 1, py - 1),
                    (px - 1, py + 1),
                    (px + 1, py + 1),
                ):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    neighbor = ny * width + nx
                    if seen[neighbor] or pixels[nx, ny] <= ALPHA_THRESHOLD:
                        continue
                    seen[neighbor] = 1
                    queue.append(neighbor)
            components.append(component)

    if len(components) <= 1:
        return rgba, 0

    main = max(components, key=len)
    main_bottom = max(index // width for index in main)
    clear: list[int] = []
    for component in components:
        if component is main:
            continue
        xs = [index % width for index in component]
        ys = [index // width for index in component]
        component_width = max(xs) - min(xs) + 1
        component_height = max(ys) - min(ys) + 1
        is_shadow = (
            component_width >= max(14, round(width * 0.08))
            and component_width >= component_height * 2.8
            and component_height <= max(12, round(height * 0.08))
            and min(ys) >= main_bottom - round(height * 0.05)
            and len(component) <= len(main) * 0.16
        )
        if is_shadow:
            clear.extend(component)

    rgba_pixels = rgba.load()
    for index in clear:
        rgba_pixels[index % width, index // width] = (0, 0, 0, 0)
    return rgba, len(clear)


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Empty motion sprite")
    return bbox


def visible_height(image: Image.Image) -> int:
    bbox = visible_bbox(image)
    return bbox[3] - bbox[1]


def source_slug(heritage: str) -> str:
    return "middle-eastern" if heritage == "middleEastern" else heritage


def locate_source(
    source_dir: Path, family: str, heritage: str, gender: str
) -> Path:
    slugs = (source_slug(heritage), heritage)
    candidates = [
        source_dir
        / f"character-motion-{family}-{slug}-{gender}-source.png"
        for slug in slugs
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Missing generated motion source; tried "
        + ", ".join(str(candidate) for candidate in candidates)
    )


def neutral_cell(
    atlas: Image.Image, row: int, column: int
) -> Image.Image:
    return atlas.crop(
        (
            column * CELL_SIZE,
            row * CELL_SIZE,
            (column + 1) * CELL_SIZE,
            (row + 1) * CELL_SIZE,
        )
    )


def resize_sprite(
    sprite: Image.Image,
    scale: float,
    key: tuple[int, int, int],
    target_visible_height: int | None = None,
) -> tuple[Image.Image, int]:
    """Resize to the neutral height, then fit inside the reviewed cell inset.

    Wide crawling poses can reach the horizontal inset before they reach the
    neutral pose's height. In that case, restore only the lost vertical scale
    so alternating frames do not make a newborn visibly shrink.
    """

    size = (
        max(1, round(sprite.width * scale)),
        max(1, round(sprite.height * scale)),
    )
    resized = sprite.resize(size, Image.Resampling.LANCZOS)
    resized, fringe_removed = clear_all_chroma(resized, key)
    max_size = CELL_SIZE - CELL_PADDING * 2
    fit = min(
        1.0,
        max_size / resized.width,
        max_size / resized.height,
    )
    if fit < 0.999:
        size = (
            max(1, round(resized.width * fit)),
            max(1, round(resized.height * fit)),
        )
        resized = resized.resize(size, Image.Resampling.LANCZOS)
        resized, extra_removed = clear_all_chroma(resized, key)
        fringe_removed += extra_removed
    if target_visible_height is not None:
        actual_height = visible_height(resized)
        desired_height = min(max_size, target_visible_height)
        if actual_height < desired_height:
            stretched_height = min(
                max_size,
                max(
                    resized.height,
                    round(resized.height * desired_height / actual_height),
                ),
            )
            resized = resized.resize(
                (resized.width, stretched_height),
                Image.Resampling.LANCZOS,
            )
            resized, extra_removed = clear_all_chroma(resized, key)
            fringe_removed += extra_removed
    return resized, fringe_removed


def paste_sprite(
    atlas: Image.Image,
    sprite: Image.Image,
    row: int,
    column: int,
) -> list[float | int]:
    paste_x = (
        column * CELL_SIZE + (CELL_SIZE - sprite.width) // 2
    )
    paste_y = (
        row * CELL_SIZE + CELL_SIZE - CELL_PADDING - sprite.height
    )
    atlas.alpha_composite(sprite, (paste_x, paste_y))
    packed = neutral_cell(atlas, row, column)
    return BASE.ground_anchor(packed)


def pack_sheet(
    source: Path,
    destination: Path,
    neutral_path: Path,
    rows: int,
) -> list[list[list[float | int]]]:
    connected, chroma_key, border_removed = BASE.remove_connected_chroma(
        Image.open(source)
    )
    keyed, enclosed_removed = clear_all_chroma(connected, chroma_key)
    x_cuts = BASE.grid_cuts(BASE.projection(keyed, "x"), COLUMNS)
    y_cuts = BASE.grid_cuts(BASE.projection(keyed, "y"), rows)
    atlas = Image.new(
        "RGBA", (COLUMNS * CELL_SIZE, rows * CELL_SIZE), (0, 0, 0, 0)
    )

    with Image.open(neutral_path) as neutral_file:
        neutral = neutral_file.convert("RGBA")
    expected_neutral_size = (4 * CELL_SIZE, rows * CELL_SIZE)
    if neutral.size != expected_neutral_size:
        raise ValueError(
            f"{neutral_path} has size {neutral.size}; expected {expected_neutral_size}"
        )

    source_sprites: list[list[Image.Image]] = []
    shadow_removed = 0
    for row in range(rows):
        row_sprites: list[Image.Image] = []
        for column in range(COLUMNS):
            region = (
                x_cuts[column],
                y_cuts[row],
                x_cuts[column + 1],
                y_cuts[row + 1],
            )
            bbox = BASE.alpha_bbox(keyed, region)
            sprite = keyed.crop(bbox)
            sprite, removed = clear_detached_cast_shadows(sprite)
            shadow_removed += removed
            trimmed = visible_bbox(sprite)
            row_sprites.append(sprite.crop(trimmed))
        source_sprites.append(row_sprites)

    anchors: list[list[list[float | int]]] = []
    resize_fringe_removed = 0
    details: list[str] = []
    for row, row_sprites in enumerate(source_sprites):
        direction_scales = [
            visible_height(neutral_cell(neutral, row, column))
            / visible_height(row_sprites[column])
            for column in range(4)
        ]
        seated_scale = float(median(direction_scales))
        row_anchors: list[list[float | int]] = []
        for column, sprite in enumerate(row_sprites):
            if column < 4:
                scale = direction_scales[column]
                target_visible_height = visible_height(
                    neutral_cell(neutral, row, column)
                )
            else:
                scale = seated_scale
                target_visible_height = None
            resized, removed = resize_sprite(
                sprite,
                scale,
                chroma_key,
                target_visible_height,
            )
            resize_fringe_removed += removed
            packed_anchor = paste_sprite(atlas, resized, row, column)
            if column < 4:
                packed_anchor = BASE.motion_anchor_matched_to_neutral(
                    neutral_cell(atlas, row, column),
                    neutral_cell(neutral, row, column),
                )
            row_anchors.append(packed_anchor)
            details.append(
                f"r{row}c{column}={sprite.size}->{resized.size}"
                f"@{packed_anchor}"
            )
        anchors.append(row_anchors)

    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, format="PNG", optimize=True)
    print(
        f"{source.name}: key=#{chroma_key[0]:02x}{chroma_key[1]:02x}"
        f"{chroma_key[2]:02x}, borderRemoved={border_removed}, "
        f"enclosedRemoved={enclosed_removed}, "
        f"shadowRemoved={shadow_removed}, "
        f"resizeFringeRemoved={resize_fringe_removed}, "
        f"xCuts={x_cuts}, yCuts={y_cuts}"
    )
    print("  " + ", ".join(details))
    print(f"  wrote {destination}")
    return anchors


def validate_atlas(
    path: Path,
    rows: int,
    anchors: list[list[list[float | int]]],
    neutral_path: Path,
) -> None:
    with Image.open(path) as image_file:
        image = image_file.convert("RGBA")
    expected = (COLUMNS * CELL_SIZE, rows * CELL_SIZE)
    if image.size != expected:
        raise ValueError(f"{path} has size {image.size}; expected {expected}")
    with Image.open(neutral_path) as neutral_file:
        neutral = neutral_file.convert("RGBA")
    for row in range(rows):
        for column in range(COLUMNS):
            cell = neutral_cell(image, row, column)
            bbox = cell.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError(f"{path} r{row}c{column} is empty")
            if (
                bbox[0] < CELL_PADDING
                or bbox[1] < CELL_PADDING
                or bbox[2] > CELL_SIZE - CELL_PADDING
                or bbox[3] > CELL_SIZE - CELL_PADDING
            ):
                raise ValueError(
                    f"{path} r{row}c{column} violates the "
                    f"{CELL_PADDING}px safety inset: {bbox}"
                )
            opaque = sum(
                1 for alpha in cell.getchannel("A").getdata() if alpha > 32
            )
            if opaque < 500:
                raise ValueError(
                    f"{path} r{row}c{column} has only {opaque} opaque pixels"
                )
            actual = (
                BASE.motion_anchor_matched_to_neutral(
                    cell,
                    neutral_cell(neutral, row, column),
                )
                if column < 4
                else BASE.ground_anchor(cell)
            )
            recorded = anchors[row][column]
            if (
                abs(float(actual[0]) - float(recorded[0])) > 0.01
                or abs(float(actual[1]) - float(recorded[1])) > 0.01
            ):
                raise ValueError(
                    f"{path} r{row}c{column} anchor mismatch: "
                    f"{actual} != {recorded}"
                )
            if column < 4:
                neutral_height = visible_height(
                    neutral_cell(neutral, row, column)
                )
                motion_height = bbox[3] - bbox[1]
                ratio = motion_height / neutral_height
                if ratio < 0.98 or ratio > 1.05:
                    raise ValueError(
                        f"{path} r{row}c{column} height ratio "
                        f"{ratio:.3f} would visibly pulse against neutral"
                    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("src/assets/source"),
        help="Directory containing character-motion-*-source.png files.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("src/assets/characters"),
        help="Directory for normalized runtime motion atlases.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        help="Default: <out-dir>/character-motion-anchors.json.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    jobs: dict[str, list[tuple[str, Path, Path, Path]]] = {}
    # Preflight the complete input set before writing any runtime artifact.
    for family, config in FAMILIES.items():
        neutral_manifest_path = (
            args.out_dir / str(config["neutralManifest"])
        )
        neutral_manifest = json.loads(
            neutral_manifest_path.read_text(encoding="utf-8")
        )
        if neutral_manifest.get("cellSize") != CELL_SIZE:
            raise ValueError(
                f"{neutral_manifest_path} cellSize must be {CELL_SIZE}"
            )
        family_jobs: list[tuple[str, Path, Path, Path]] = []
        for heritage in HERITAGES:
            for gender in GENDERS:
                key = f"{heritage}-{gender}"
                source = locate_source(
                    args.source_dir, family, heritage, gender
                )
                neutral_path = (
                    args.out_dir
                    / f"{config['neutralPrefix']}-{key}.png"
                )
                if not neutral_path.exists():
                    raise FileNotFoundError(
                        f"Missing matching neutral atlas: {neutral_path}"
                    )
                final_path = (
                    args.out_dir
                    / f"character-motion-{family}-{key}.png"
                )
                family_jobs.append(
                    (key, source, neutral_path, final_path)
                )
        jobs[family] = family_jobs

    families: dict[str, dict] = {}
    staged_outputs: list[tuple[Path, Path]] = []
    with tempfile.TemporaryDirectory(
        prefix="pixel-life-v5-motion-atlases-"
    ) as temporary:
        temporary_dir = Path(temporary)
        for family, config in FAMILIES.items():
            rows = len(config["rows"])
            atlases: dict[str, list] = {}
            for key, source, neutral_path, final_path in jobs[family]:
                staged_path = temporary_dir / final_path.name
                anchors = pack_sheet(
                    source,
                    staged_path,
                    neutral_path,
                    rows,
                )
                validate_atlas(
                    staged_path, rows, anchors, neutral_path
                )
                atlases[key] = anchors
                staged_outputs.append((staged_path, final_path))
            families[family] = {
                "rows": list(config["rows"]),
                "atlases": atlases,
            }

        manifest = {
            "version": 1,
            "cellSize": CELL_SIZE,
            "anchorSpace": "source-cell-pixels",
            "columns": [
                "frontStep",
                "screenLeftStep",
                "backStep",
                "screenRightStep",
                "floorSeatedFront",
            ],
            "families": families,
        }
        destination = (
            args.manifest
            or args.out_dir / "character-motion-anchors.json"
        )
        staged_manifest = temporary_dir / destination.name
        staged_manifest.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )

        args.out_dir.mkdir(parents=True, exist_ok=True)
        for staged_path, final_path in staged_outputs:
            staged_path.replace(final_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        staged_manifest.replace(destination)

    total = sum(
        len(family["rows"]) * COLUMNS * len(family["atlases"])
        for family in families.values()
    )
    print(
        f"published {len(staged_outputs)} atlases and "
        f"{destination} ({total} anchors)"
    )


if __name__ == "__main__":
    main()
