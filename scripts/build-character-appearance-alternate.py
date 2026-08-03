#!/usr/bin/env python3
"""Pack the complete alternate v5 character appearance.

The generated authoring set contains four sheets for every heritage/gender:

* five-row neutral: baby, child, teen, adult, elder
* three-row neutral: early teen, young adult, middle age
* five-row motion: the four directional step/crawl poses plus seated
* three-row motion: the four directional step poses plus seated

This builder normalizes those 32 source sheets, canonicalizes side directions,
and combines them into eight runtime atlases. Each runtime atlas is an 8 x 9
grid: four neutral directions, four motion directions, and one seated pose.
All inputs are preflighted and every output is validated before anything is
published into the runtime asset directory.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import tempfile
from pathlib import Path
from types import ModuleType

from PIL import Image


HERITAGES = ("western", "asian", "middleEastern", "black")
GENDERS = ("male", "female")
CELL_SIZE = 256
CELL_PADDING = 5
NEUTRAL_COLUMNS = 4
MOTION_COLUMNS = 5
UNIFIED_COLUMNS = 9
UNIFIED_ROWS = (
    "baby",
    "child",
    "earlyTeen",
    "teen",
    "youngAdult",
    "adult",
    "middleAge",
    "elder",
)
ALTERNATE_BODY_ALIGNMENT_FRACTION = 0.55
HEAD_PATCH_FRACTION = 0.48
HEAD_CENTROID_FRACTION = 0.42
MAX_RENDERED_HEAD_DRIFT = 3.0
RUNTIME_HEIGHT_BY_ROW = (
    72 * 1.15,
    96 * 1.15,
    106 * 1.15,
    116 * 1.15,
    124 * 1.15,
    128 * 1.15,
    126 * 1.15,
    120 * 1.15,
)
SOURCE_FAMILIES = {
    "base-neutral": 5,
    "expansion-neutral": 3,
    "base-motion": 5,
    "expansion-motion": 3,
}

# Neutral turnaround sheets use the illustration convention "show the
# character's left side" in column two, so their side columns need swapping.
# The reviewed walking sheets already use literal screen direction and must
# retain their source order.
NEUTRAL_SOURCE_COLUMNS_TO_CANONICAL = (0, 3, 2, 1)
MOTION_SOURCE_COLUMNS_TO_CANONICAL = (0, 1, 2, 3)

# Generated rows did not all follow the same "character's left side" versus
# literal screen-left convention. This exhaustive reviewed table repairs the
# canonicalized runtime row after the global source convention above. "neutral"
# swaps columns 1/3; "motion" swaps columns 5/7; "none" is already literal.
SIDE_REPAIR_BY_ATLAS_ROW: dict[str, tuple[str, ...]] = {
    "western-male": (
        "none", "none", "neutral", "none",
        "neutral", "none", "neutral", "none",
    ),
    "western-female": (
        "none", "none", "neutral", "none",
        "neutral", "none", "neutral", "none",
    ),
    "asian-male": (
        "none", "none", "none", "none",
        "neutral", "none", "neutral", "none",
    ),
    "asian-female": (
        "motion", "motion", "neutral", "motion",
        "neutral", "motion", "neutral", "none",
    ),
    "middleEastern-male": (
        "none", "none", "neutral", "none",
        "neutral", "none", "neutral", "none",
    ),
    "middleEastern-female": (
        "motion", "none", "neutral", "none",
        "neutral", "none", "neutral", "none",
    ),
    "black-male": (
        "neutral", "neutral", "neutral", "neutral",
        "neutral", "neutral", "neutral", "none",
    ),
    "black-female": (
        "motion", "motion", "neutral", "motion",
        "neutral", "motion", "neutral", "motion",
    ),
}

# A small set of generated rows supplied the same screen-right profile twice.
# Mirror the reviewed right cell into the missing left cell after unification.
MIRROR_RIGHT_TO_LEFT_NEUTRAL_ROWS: dict[str, tuple[int, ...]] = {
    "western-male": (0, 7),
    "western-female": (7,),
    "asian-male": (0, 2, 7),
    "asian-female": (7,),
    "middleEastern-male": (0, 7),
    "middleEastern-female": (7,),
    "black-male": (7,),
}
MIRROR_RIGHT_TO_LEFT_MOTION_ROWS: dict[str, tuple[int, ...]] = {
    "asian-female": (7,),
}

# unified row -> (source family, source row)
UNIFIED_ROW_SOURCES = (
    ("base", 0),
    ("base", 1),
    ("expansion", 0),
    ("base", 2),
    ("expansion", 1),
    ("base", 3),
    ("expansion", 2),
    ("base", 4),
)


def load_script(filename: str, module_name: str) -> ModuleType:
    script = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load shared atlas helpers from {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASE = load_script(
    "build-character-atlases.py",
    "v5_character_atlas_builder_for_alternate_appearance",
)
EXPANSION = load_script(
    "build-character-stage-expansions.py",
    "v5_character_expansion_builder_for_alternate_appearance",
)
MOTION = load_script(
    "build-character-motion-atlases.py",
    "v5_character_motion_builder_for_alternate_appearance",
)


def heritage_slugs(heritage: str) -> tuple[str, ...]:
    if heritage == "middleEastern":
        return ("middle-eastern", "middleEastern")
    return (heritage,)


def locate_source(
    source_dir: Path,
    family: str,
    heritage: str,
    gender: str,
) -> Path:
    candidates = [
        source_dir
        / f"character-variant-b-{family}-{slug}-{gender}-source.png"
        for slug in heritage_slugs(heritage)
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Missing alternate appearance source; tried "
        + ", ".join(str(candidate) for candidate in candidates)
    )


def pack_neutral_sheet(
    source: Path,
    destination: Path,
    rows: int,
) -> None:
    """Normalize one neutral sheet while preserving its source column order."""

    connected, chroma_key, border_removed = BASE.remove_connected_chroma(
        Image.open(source)
    )
    keyed, enclosed_removed = EXPANSION.clear_enclosed_chroma(
        connected, chroma_key
    )
    x_cuts = BASE.grid_cuts(BASE.projection(keyed, "x"), NEUTRAL_COLUMNS)
    y_cuts = BASE.grid_cuts(BASE.projection(keyed, "y"), rows)
    atlas = Image.new(
        "RGBA",
        (NEUTRAL_COLUMNS * CELL_SIZE, rows * CELL_SIZE),
        (0, 0, 0, 0),
    )

    resized_fringe_removed = 0
    details: list[str] = []
    for row in range(rows):
        for column in range(NEUTRAL_COLUMNS):
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
            sprite, removed = EXPANSION.clear_enclosed_chroma(
                sprite, chroma_key
            )
            resized_fringe_removed += removed
            paste_x = column * CELL_SIZE + (CELL_SIZE - size[0]) // 2
            paste_y = row * CELL_SIZE + CELL_SIZE - CELL_PADDING - size[1]
            atlas.alpha_composite(sprite, (paste_x, paste_y))
            details.append(f"r{row}c{column}={bbox}->{size}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, format="PNG", optimize=True)
    print(
        f"{source.name}: key=#{chroma_key[0]:02x}{chroma_key[1]:02x}"
        f"{chroma_key[2]:02x}, borderRemoved={border_removed}, "
        f"enclosedRemoved={enclosed_removed}, "
        f"resizeFringeRemoved={resized_fringe_removed}, "
        f"xCuts={x_cuts}, yCuts={y_cuts}"
    )
    print("  " + ", ".join(details))
    print(f"  wrote {destination}")


def cell(
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


def canonicalize_directions(
    source: Path,
    destination: Path,
    rows: int,
    columns: int,
    source_columns: tuple[int, int, int, int],
) -> None:
    """Normalize one reviewed sheet into literal screen directions."""

    with Image.open(source) as image_file:
        image = image_file.convert("RGBA")
    expected = (columns * CELL_SIZE, rows * CELL_SIZE)
    if image.size != expected:
        raise ValueError(f"{source} has size {image.size}; expected {expected}")
    canonical = Image.new("RGBA", expected, (0, 0, 0, 0))
    for row in range(rows):
        for target_column, source_column in enumerate(
            source_columns
        ):
            canonical.alpha_composite(
                cell(image, row, source_column),
                (target_column * CELL_SIZE, row * CELL_SIZE),
            )
        if columns == MOTION_COLUMNS:
            canonical.alpha_composite(
                cell(image, row, 4),
                (4 * CELL_SIZE, row * CELL_SIZE),
            )
    canonical.save(destination, format="PNG", optimize=True)


def combine_atlases(
    base_neutral_path: Path,
    expansion_neutral_path: Path,
    base_motion_path: Path,
    expansion_motion_path: Path,
    destination: Path,
) -> Image.Image:
    paths = (
        base_neutral_path,
        expansion_neutral_path,
        base_motion_path,
        expansion_motion_path,
    )
    opened = [Image.open(path) for path in paths]
    try:
        base_neutral = opened[0].convert("RGBA")
        expansion_neutral = opened[1].convert("RGBA")
        base_motion = opened[2].convert("RGBA")
        expansion_motion = opened[3].convert("RGBA")
        unified = Image.new(
            "RGBA",
            (UNIFIED_COLUMNS * CELL_SIZE, len(UNIFIED_ROWS) * CELL_SIZE),
            (0, 0, 0, 0),
        )
        for target_row, (family, source_row) in enumerate(
            UNIFIED_ROW_SOURCES
        ):
            neutral = (
                base_neutral if family == "base" else expansion_neutral
            )
            motion = base_motion if family == "base" else expansion_motion
            for direction in range(4):
                unified.alpha_composite(
                    cell(neutral, source_row, direction),
                    (direction * CELL_SIZE, target_row * CELL_SIZE),
                )
                unified.alpha_composite(
                    cell(motion, source_row, direction),
                    ((direction + 4) * CELL_SIZE, target_row * CELL_SIZE),
                )
            unified.alpha_composite(
                cell(motion, source_row, 4),
                (8 * CELL_SIZE, target_row * CELL_SIZE),
            )
    finally:
        for image_file in opened:
            image_file.close()
    unified.save(destination, format="PNG", optimize=True)
    return unified


def repair_duplicate_side_views(
    atlas: Image.Image, atlas_key: str
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """Mirror reviewed right profiles into missing left-facing cells."""

    neutral_rows = MIRROR_RIGHT_TO_LEFT_NEUTRAL_ROWS.get(
        atlas_key, ()
    )
    motion_rows = MIRROR_RIGHT_TO_LEFT_MOTION_ROWS.get(
        atlas_key, ()
    )
    for rows, left_column, right_column in (
        (neutral_rows, 1, 3),
        (motion_rows, 5, 7),
    ):
        for row in rows:
            right = cell(atlas, row, right_column)
            left = right.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            atlas.paste(
                left,
                (
                    left_column * CELL_SIZE,
                    row * CELL_SIZE,
                    (left_column + 1) * CELL_SIZE,
                    (row + 1) * CELL_SIZE,
                ),
            )
    return neutral_rows, motion_rows


def validate_side_repair_contract() -> None:
    expected_keys = {
        f"{heritage}-{gender}"
        for heritage in HERITAGES
        for gender in GENDERS
    }
    if set(SIDE_REPAIR_BY_ATLAS_ROW) != expected_keys:
        raise ValueError(
            "Alternate side-repair table must cover every atlas exactly"
        )
    allowed = {"none", "neutral", "motion"}
    repaired_rows = 0
    for key, repairs in SIDE_REPAIR_BY_ATLAS_ROW.items():
        if len(repairs) != len(UNIFIED_ROWS):
            raise ValueError(
                f"{key} has {len(repairs)} side repairs; "
                f"expected {len(UNIFIED_ROWS)}"
            )
        unknown = set(repairs) - allowed
        if unknown:
            raise ValueError(f"{key} has unknown side repairs: {unknown}")
        repaired_rows += sum(repair != "none" for repair in repairs)
    if repaired_rows != 37:
        raise ValueError(
            f"Expected 37 reviewed side repairs, found {repaired_rows}"
        )


def swap_cells(
    atlas: Image.Image,
    row: int,
    first_column: int,
    second_column: int,
) -> None:
    first = cell(atlas, row, first_column)
    second = cell(atlas, row, second_column)
    atlas.paste(
        second,
        (
            first_column * CELL_SIZE,
            row * CELL_SIZE,
            (first_column + 1) * CELL_SIZE,
            (row + 1) * CELL_SIZE,
        ),
    )
    atlas.paste(
        first,
        (
            second_column * CELL_SIZE,
            row * CELL_SIZE,
            (second_column + 1) * CELL_SIZE,
            (row + 1) * CELL_SIZE,
        ),
    )


def repair_direction_pairing(
    atlas: Image.Image,
    atlas_key: str,
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    neutral_rows: list[int] = []
    motion_rows: list[int] = []
    for row, repair in enumerate(
        SIDE_REPAIR_BY_ATLAS_ROW[atlas_key]
    ):
        if repair == "neutral":
            swap_cells(atlas, row, 1, 3)
            neutral_rows.append(row)
        elif repair == "motion":
            swap_cells(atlas, row, 5, 7)
            motion_rows.append(row)
    return tuple(neutral_rows), tuple(motion_rows)


def visible_height(sprite: Image.Image) -> int:
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Cannot measure an empty character cell")
    return bbox[3] - bbox[1]


def match_motion_heights(
    atlas: Image.Image,
) -> tuple[tuple[int, int, int, int], ...]:
    """Renormalize motion pairs only when they fall outside the height guard."""

    adjustments: list[tuple[int, int, int, int]] = []
    max_size = CELL_SIZE - CELL_PADDING * 2
    for row in range(len(UNIFIED_ROWS)):
        for direction in range(4):
            neutral = cell(atlas, row, direction)
            motion_column = direction + 4
            motion = cell(atlas, row, motion_column)
            neutral_height = visible_height(neutral)
            motion_height = visible_height(motion)
            ratio = motion_height / neutral_height
            if 0.98 <= ratio <= 1.05:
                continue

            bbox = motion.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError(
                    f"Cannot normalize empty motion r{row}c{motion_column}"
                )
            sprite = motion.crop(bbox)
            target_height = min(max_size, neutral_height)
            target_width = max(
                1,
                round(sprite.width * target_height / motion_height),
            )
            if target_width > max_size:
                target_width = max_size
            sprite = sprite.resize(
                (target_width, target_height),
                Image.Resampling.LANCZOS,
            )
            replacement = Image.new(
                "RGBA",
                (CELL_SIZE, CELL_SIZE),
                (0, 0, 0, 0),
            )
            replacement.alpha_composite(
                sprite,
                (
                    (CELL_SIZE - target_width) // 2,
                    CELL_SIZE - CELL_PADDING - target_height,
                ),
            )
            atlas.paste(
                replacement,
                (
                    motion_column * CELL_SIZE,
                    row * CELL_SIZE,
                    (motion_column + 1) * CELL_SIZE,
                    (row + 1) * CELL_SIZE,
                ),
            )
            adjustments.append(
                (row, motion_column, motion_height, target_height)
            )
    return tuple(adjustments)


def vivid_magenta_pixels(sprite: Image.Image) -> int:
    return sum(
        1
        for red, green, blue, alpha in sprite.getdata()
        if (
            alpha > 32
            and red > 225
            and blue > 175
            and green < 65
            and min(red, blue) - green > 125
        )
    )


def atlas_anchors(
    atlas: Image.Image,
) -> list[list[list[float | int]]]:
    return [
        [
            (
                BASE.motion_anchor_matched_to_neutral(
                    cell(atlas, row, column),
                    cell(atlas, row, column - 4),
                    ALTERNATE_BODY_ALIGNMENT_FRACTION,
                )
                if 4 <= column <= 7
                else BASE.ground_anchor(cell(atlas, row, column))
            )
            for column in range(UNIFIED_COLUMNS)
        ]
        for row in range(len(UNIFIED_ROWS))
    ]


def normalized_head_patch(sprite: Image.Image) -> Image.Image:
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Cannot compare an empty head patch")
    head_bottom = min(
        bbox[3],
        bbox[1]
        + max(1, round((bbox[3] - bbox[1]) * HEAD_PATCH_FRACTION)),
    )
    crop = sprite.crop((bbox[0], bbox[1], bbox[2], head_bottom))
    background = Image.new("RGBA", crop.size, (38, 56, 74, 255))
    background.alpha_composite(crop)
    return background.convert("RGB").resize(
        (96, 96),
        Image.Resampling.BILINEAR,
    )


def mean_rgb_difference(
    first: Image.Image,
    second: Image.Image,
) -> float:
    first_bytes = first.convert("RGB").tobytes()
    second_bytes = second.convert("RGB").tobytes()
    return sum(
        abs(first_bytes[index] - second_bytes[index])
        for index in range(len(first_bytes))
    ) / len(first_bytes)


def head_centroid_x(sprite: Image.Image) -> float:
    return BASE.upper_body_centroid_x(
        sprite,
        HEAD_CENTROID_FRACTION,
    )


def validate_side_pairing(
    image: Image.Image,
    path: Path,
    row: int,
    anchors: list[list[list[float | int]]],
) -> None:
    neutral_left = cell(image, row, 1)
    neutral_right = cell(image, row, 3)
    motion_left = cell(image, row, 5)
    motion_right = cell(image, row, 7)
    patches = [
        normalized_head_patch(sprite)
        for sprite in (
            neutral_left,
            neutral_right,
            motion_left,
            motion_right,
        )
    ]
    correct = (
        mean_rgb_difference(patches[0], patches[2])
        + mean_rgb_difference(patches[1], patches[3])
    ) / 2
    swapped = (
        mean_rgb_difference(patches[0], patches[3])
        + mean_rgb_difference(patches[1], patches[2])
    ) / 2
    if correct >= swapped * 0.95:
        raise ValueError(
            f"{path} r{row} side profiles are mismatched: "
            f"correctMAD={correct:.3f}, swappedMAD={swapped:.3f}"
        )

    for neutral_column in (1, 3):
        motion_column = neutral_column + 4
        neutral_root = (
            head_centroid_x(cell(image, row, neutral_column))
            - float(anchors[row][neutral_column][0])
        )
        motion_root = (
            head_centroid_x(cell(image, row, motion_column))
            - float(anchors[row][motion_column][0])
        )
        rendered_drift = (
            abs(neutral_root - motion_root)
            * RUNTIME_HEIGHT_BY_ROW[row]
            / CELL_SIZE
        )
        if rendered_drift > MAX_RENDERED_HEAD_DRIFT:
            raise ValueError(
                f"{path} r{row} c{neutral_column} head drifts "
                f"{rendered_drift:.3f}px; maximum is "
                f"{MAX_RENDERED_HEAD_DRIFT:.1f}px"
            )


def validate_unified(
    path: Path,
    anchors: list[list[list[float | int]]],
) -> None:
    with Image.open(path) as image_file:
        image = image_file.convert("RGBA")
    expected = (
        UNIFIED_COLUMNS * CELL_SIZE,
        len(UNIFIED_ROWS) * CELL_SIZE,
    )
    if image.size != expected:
        raise ValueError(f"{path} has size {image.size}; expected {expected}")
    for row in range(len(UNIFIED_ROWS)):
        for column in range(UNIFIED_COLUMNS):
            sprite = cell(image, row, column)
            bbox = sprite.getchannel("A").getbbox()
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
                1
                for alpha in sprite.getchannel("A").getdata()
                if alpha > 32
            )
            if opaque < 500:
                raise ValueError(
                    f"{path} r{row}c{column} has only {opaque} opaque pixels"
                )
            magenta = vivid_magenta_pixels(sprite)
            if magenta:
                raise ValueError(
                    f"{path} r{row}c{column} retains {magenta} "
                    "opaque chroma-key pixels"
                )
            actual = (
                BASE.motion_anchor_matched_to_neutral(
                    sprite,
                    cell(image, row, column - 4),
                    ALTERNATE_BODY_ALIGNMENT_FRACTION,
                )
                if 4 <= column <= 7
                else BASE.ground_anchor(sprite)
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
            if 4 <= column <= 7:
                ratio = visible_height(sprite) / visible_height(
                    cell(image, row, column - 4)
                )
                if ratio < 0.98 or ratio > 1.05:
                    raise ValueError(
                        f"{path} r{row}c{column} height ratio "
                        f"{ratio:.3f} would visibly pulse"
                    )
        validate_side_pairing(image, path, row, anchors)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        required=True,
        help="Directory containing the 32 alternate appearance source sheets.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("src/assets/characters"),
        help="Directory for the eight unified runtime PNG atlases.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        help=(
            "Default: "
            "<out-dir>/character-appearance-alternate-anchors.json."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    validate_side_repair_contract()
    manifest_destination = (
        args.manifest
        or args.out_dir / "character-appearance-alternate-anchors.json"
    )

    # Preflight the complete, gender-separated source set before staging.
    jobs: list[tuple[str, dict[str, Path]]] = []
    for heritage in HERITAGES:
        for gender in GENDERS:
            key = f"{heritage}-{gender}"
            sources = {
                family: locate_source(
                    args.source_dir, family, heritage, gender
                )
                for family in SOURCE_FAMILIES
            }
            jobs.append((key, sources))

    atlases: dict[str, list[list[list[float | int]]]] = {}
    staged_outputs: list[tuple[Path, Path]] = []
    with tempfile.TemporaryDirectory(
        prefix="pixel-life-v5-alternate-appearance-"
    ) as temporary:
        temporary_dir = Path(temporary)
        for key, sources in jobs:
            raw_base_neutral = temporary_dir / f"{key}-base-neutral-raw.png"
            raw_expansion_neutral = (
                temporary_dir / f"{key}-expansion-neutral-raw.png"
            )
            raw_base_motion = temporary_dir / f"{key}-base-motion-raw.png"
            raw_expansion_motion = (
                temporary_dir / f"{key}-expansion-motion-raw.png"
            )
            pack_neutral_sheet(
                sources["base-neutral"], raw_base_neutral, 5
            )
            pack_neutral_sheet(
                sources["expansion-neutral"],
                raw_expansion_neutral,
                3,
            )
            base_neutral = temporary_dir / f"{key}-base-neutral.png"
            expansion_neutral = (
                temporary_dir / f"{key}-expansion-neutral.png"
            )
            canonicalize_directions(
                raw_base_neutral,
                base_neutral,
                5,
                NEUTRAL_COLUMNS,
                NEUTRAL_SOURCE_COLUMNS_TO_CANONICAL,
            )
            canonicalize_directions(
                raw_expansion_neutral,
                expansion_neutral,
                3,
                NEUTRAL_COLUMNS,
                NEUTRAL_SOURCE_COLUMNS_TO_CANONICAL,
            )

            base_motion_anchors = MOTION.pack_sheet(
                sources["base-motion"],
                raw_base_motion,
                base_neutral,
                5,
            )
            MOTION.validate_atlas(
                raw_base_motion,
                5,
                base_motion_anchors,
                base_neutral,
            )
            expansion_motion_anchors = MOTION.pack_sheet(
                sources["expansion-motion"],
                raw_expansion_motion,
                expansion_neutral,
                3,
            )
            MOTION.validate_atlas(
                raw_expansion_motion,
                3,
                expansion_motion_anchors,
                expansion_neutral,
            )

            base_motion = temporary_dir / f"{key}-base-motion.png"
            expansion_motion = (
                temporary_dir / f"{key}-expansion-motion.png"
            )
            canonicalize_directions(
                raw_base_motion,
                base_motion,
                5,
                MOTION_COLUMNS,
                MOTION_SOURCE_COLUMNS_TO_CANONICAL,
            )
            canonicalize_directions(
                raw_expansion_motion,
                expansion_motion,
                3,
                MOTION_COLUMNS,
                MOTION_SOURCE_COLUMNS_TO_CANONICAL,
            )

            output_name = f"character-appearance-alternate-{key}.png"
            staged_path = temporary_dir / output_name
            unified = combine_atlases(
                base_neutral,
                expansion_neutral,
                base_motion,
                expansion_motion,
                staged_path,
            )
            neutral_repairs, motion_repairs = repair_duplicate_side_views(
                unified, key
            )
            neutral_swaps, motion_swaps = repair_direction_pairing(
                unified, key
            )
            height_adjustments = match_motion_heights(unified)
            unified.save(staged_path, format="PNG", optimize=True)
            anchors = atlas_anchors(unified)
            validate_unified(staged_path, anchors)
            atlases[key] = anchors
            staged_outputs.append(
                (staged_path, args.out_dir / output_name)
            )
            print(
                f"validated {staged_path} ({len(anchors) * 9} cells), "
                f"mirroredNeutralRows={neutral_repairs}, "
                f"mirroredMotionRows={motion_repairs}, "
                f"swappedNeutralRows={neutral_swaps}, "
                f"swappedMotionRows={motion_swaps}, "
                f"heightAdjustments={height_adjustments}"
            )

        manifest = {
            "version": 1,
            "appearance": "alternate",
            "cellSize": CELL_SIZE,
            "anchorSpace": "source-cell-pixels",
            "rows": list(UNIFIED_ROWS),
            "columns": [
                "frontNeutral",
                "screenLeftNeutral",
                "backNeutral",
                "screenRightNeutral",
                "frontMotion",
                "screenLeftMotion",
                "backMotion",
                "screenRightMotion",
                "floorSeatedFront",
            ],
            "atlases": atlases,
        }
        staged_manifest = temporary_dir / manifest_destination.name
        staged_manifest.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )

        # Publish only after the complete set validates. Existing files are
        # backed up so a handled replace/write failure restores the prior set.
        # The manifest is switched last, after all matching PNGs are present.
        publications = [
            *staged_outputs,
            (staged_manifest, manifest_destination),
        ]
        backup_dir = temporary_dir / "publish-backup"
        backup_dir.mkdir()
        published: list[tuple[Path, Path | None]] = []
        try:
            for index, (staged_path, final_path) in enumerate(publications):
                final_path.parent.mkdir(parents=True, exist_ok=True)
                backup_path: Path | None = None
                if final_path.exists():
                    backup_path = (
                        backup_dir / f"{index:02d}-{final_path.name}"
                    )
                    shutil.copy2(final_path, backup_path)
                staged_path.replace(final_path)
                published.append((final_path, backup_path))
        except BaseException:
            for final_path, backup_path in reversed(published):
                if backup_path is not None:
                    shutil.copy2(backup_path, final_path)
                elif final_path.exists():
                    final_path.unlink()
            raise

    print(
        f"published {len(staged_outputs)} alternate appearance atlases "
        f"and {manifest_destination} "
        f"({len(atlases) * len(UNIFIED_ROWS) * UNIFIED_COLUMNS} anchors)"
    )


if __name__ == "__main__":
    main()
