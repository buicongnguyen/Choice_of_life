"""Cottage on Gull Lane garden: lawn tile, picket fence tile, flower bed, lollipop tree
and Dad's boat-repair shed with its upturned rowboat.

garden_floor and garden_fence are 8 m tiles in world space (lawn top at Z = 0, fence
front near Y = +3.5). The rest are props with the origin at the footprint centre.
"""
import math
import random

from mathutils import Vector

import _home_util as U
from kit import GLOSS, MATTE, SATIN

GRASS_A = '#6fd04a'
GRASS_B = '#57bf3c'
SOIL = '#8a5230'
STONE = '#a99fd4'


# ----------------------------------------------------------------------------- lawn
def _clover(k, mat, x, y, size, spin, lift=.035):
    parts = []
    for i in range(3):
        a = spin + i * math.tau / 3
        leaf = U.disc(k, 'Clover', U.heart(size, 10), 0, mat, dome=size * .22, rings=1)
        # The heart's point sits at the clover centre, lobes outward.
        U.deform(leaf, lambda v, s=size: Vector((v.x, v.y + s * .45, v.z)))
        leaf.rotation_euler = (math.radians(18), 0, a - math.pi / 2)
        leaf.location = (x, y, lift)
        parts.append(leaf)
    return parts


def build_garden_floor(k):
    rnd = random.Random(21)
    ga = k.mat('Grass', GRASS_A, SATIN)
    gb = k.mat('GrassDeep', GRASS_B, SATIN)
    soil = k.mat('Soil', SOIL, MATTE)
    stone = k.mat('Stone', STONE, MATTE)
    clover = k.mat('Clover', 'leaf_dark', GLOSS)
    bloom = k.mat('Bloom', 'white', SATIN)
    pink = k.mat('BloomPink', 'pink', SATIN)
    parts = []
    # Mown stripes along X (seamless by construction).
    y = -6.
    bands = 10
    step = 9.5 / bands
    for i in range(bands):
        parts.append(U.rail(k, 'Lawn', [(y, -.03), (y + step, -.03), (y + step, 0), (y, 0)], -4.2, 4.2,
                            ga if i % 2 == 0 else gb))
        y += step
    # Diorama cut: a rounded grass lip over a chunky soil layer.
    lip = U.rounded_rect(-6.03, 3.6, -.12, -.004, .06, 3, corners=(False, False, False, True))
    parts.append(U.rail(k, 'Lip', lip, -4.2, 4.2, ga))
    body = U.rounded_rect(-5.98, 3.6, -.42, -.1, .08, 3, corners=(True, False, False, False))
    parts.append(U.rail(k, 'SoilLayer', body, -4.2, 4.2, soil))
    for i in range(9):
        x = -3.6 + i * .9 + rnd.uniform(-.2, .2)
        parts.append(k.ball('Pebble', (x, -5.99, -.25 + rnd.uniform(-.08, .08)), (.07, .03, .05), stone, 8, 4))
    # Stepping-stone path that snakes through the lanes and repeats every 8 m.
    count = 12
    for i in range(count):
        x = -4 + (i + .5) * 8 / count
        yy = -.4 + 1.1 * math.sin(math.tau * (x + 4) / 8)
        outline = U.blob(.25, 14, .1, 100 + i, sx=1.2, sy=.95)
        s = U.puff(k, 'Stone', outline, .11, stone, rings=3, n=2.3, plane='XY', back='flat', loc=(x, yy, -.02),
                   rot=(0, 0, rnd.uniform(0, math.pi)))
        parts.append(s)
    # Clover tufts with a few white and pink clover blooms.
    spots = []
    while len(spots) < 20:
        x, y = rnd.uniform(-3.7, 3.7), rnd.uniform(-5.6, 3.3)
        path_y = -.4 + 1.1 * math.sin(math.tau * (x + 4) / 8)
        if abs(y - path_y) < .45 or any((x - a) ** 2 + (y - b) ** 2 < .8 for a, b in spots):
            continue
        spots.append((x, y))
    for j, (x, y) in enumerate(spots):
        for c in range(2 if j % 3 else 3):
            ang = c * 2.2 + j
            cx, cy = x + math.cos(ang) * .1 * c, y + math.sin(ang) * .08 * c
            parts += _clover(k, clover, cx, cy, rnd.uniform(.13, .17), rnd.uniform(0, math.tau), lift=.03 + .015 * c)
        if j % 3 == 0:
            parts.append(k.ball('CloverBloom', (x + .05, y + .06, .12), (.045, .045, .05), bloom if j % 2 else pink,
                                8, 5))
            parts.append(k.cyl('BloomStem', (x + .05, y + .06, .05), .007, .1, clover, vertices=4, bevel=0))
    # A scatter of daisies and buttercups for colour.
    gold = k.mat('Buttercup', 'sun', GLOSS)
    placed = 0
    while placed < 7:
        x, y = rnd.uniform(-3.7, 3.7), rnd.uniform(-5.4, 3.2)
        path_y = -.4 + 1.1 * math.sin(math.tau * (x + 4) / 8)
        if abs(y - path_y) < .5 or any((x - a) ** 2 + (y - b) ** 2 < .3 for a, b in spots):
            continue
        if placed % 2 == 0:
            parts.append(U.puff(k, 'Daisy', U.scallop_circle(.1, 6, .35, 2), .03, bloom, rings=1, plane='XY',
                                back='none', loc=(x, y, .045), rot=(rnd.uniform(-.3, .3), rnd.uniform(-.3, .3), 0)))
            parts.append(k.ball('DaisyEye', (x, y, .062), (.038, .038, .02), gold, 6, 4))
        else:
            parts.append(k.ball('Buttercup', (x, y, .06), (.05, .05, .035), gold, 8, 4))
        parts.append(k.cyl('DaisyStem', (x, y, .02), .006, .05, clover, vertices=4, bevel=0))
        placed += 1
    # Grass blade clumps along the front and back edges and across the lawn.
    clumps = []
    for i in range(10):
        clumps.append((-3.6 + i * .8 + rnd.uniform(-.15, .15), (-5.75 if i % 2 == 0 else 3.25) + rnd.uniform(-.05, .05)))
    while len(clumps) < 24:
        x, y = rnd.uniform(-3.7, 3.7), rnd.uniform(-5.3, 3.0)
        if abs(y - (-.4 + 1.1 * math.sin(math.tau * (x + 4) / 8))) > .45:
            clumps.append((x, y))
    for i, (x, y) in enumerate(clumps):
        for b in range(3):
            a = b * 2.1 + i
            tip = (x + math.cos(a) * .06, y + math.sin(a) * .05, .16 + .05 * (b % 2))
            parts.append(k.cyl('Blade', (x + math.cos(a) * .03, y + math.sin(a) * .025, .07), .035, .14, gb,
                               vertices=4, bevel=0, radius2=.004, rot=(math.sin(a) * .3, math.cos(a) * .3, a)))
    lawn = k.join('garden_floor', parts, pivot=(0, 0, 0))
    U.clip_x(lawn)
    lawn['tile'] = 8.0
    lawn['height'] = 0.0
    k.paint([lawn], lo=-.42, hi=.15, shade=.7)
    return lawn


# ----------------------------------------------------------------------------- fence
def _picket_outline(w=.12, z0=.05, z1=.82, tip=.97):
    pts = [(-w / 2, z0), (w / 2, z0), (w / 2, z1)]
    for i in range(1, 5):
        t = i / 5
        a = t * math.pi / 2
        pts.append((w / 2 * math.cos(a) ** 1.4, z1 + (tip - z1) * math.sin(a)))
    pts.append((0, tip))
    for i in range(4, 0, -1):
        t = i / 5
        a = t * math.pi / 2
        pts.append((-w / 2 * math.cos(a) ** 1.4, z1 + (tip - z1) * math.sin(a)))
    pts.append((-w / 2, z1))
    return pts


def build_garden_fence(k):
    rnd = random.Random(31)
    white = k.mat('Picket', 'white', SATIN)
    post_m = k.mat('Post', 'cream', SATIN)
    vine = k.mat('Vine', 'leaf_dark', SATIN)
    leaf = k.mat('Leaf', 'leaf', GLOSS)
    berry = k.mat('Berry', 'berry', GLOSS)
    coral = k.mat('Coral', 'coral', GLOSS)
    gold = k.mat('Marigold', 'marigold', GLOSS)
    y0 = 3.55
    parts = []
    outline = _picket_outline()
    for i in range(32):
        x = -4 + .125 + i * .25
        parts.append(U.puff(k, 'Picket', outline, .07, white, rings=2, n=8, back='none', loc=(x, y0, 0)))
        parts.append(k.box('PicketBack', (x, y0 + .02, .5), (.1, .04, .8), white, bevel=0))
    for z in (.3, .72):
        rail = U.rounded_rect(y0 + .035, y0 + .09, z - .045, z + .045, .018, 2)
        parts.append(U.rail(k, 'Rail', rail, -4.3, 4.3, white))
    for x in U.wrap_copies([-4., 0., 4.], margin=.2):
        parts.append(k.box('Post', (x, y0 + .03, .52), (.13, .13, 1.04), post_m, bevel=.03, segments=2))
        parts.append(k.box('PostCap', (x, y0 + .03, 1.06), (.17, .17, .05), post_m, bevel=.02, segments=1))
        parts.append(k.ball('Finial', (x, y0 + .03, 1.13), .065, post_m, 10, 6))
    # Two climbing vines weaving over the pickets, with heart leaves and blooms.
    for vx, length, seed in ((-2.1, 1.7, 1), (1.6, 1.9, 2)):
        r = random.Random(seed)
        pts = []
        n = 11
        for i in range(n + 1):
            t = i / n
            pts.append((vx - length / 2 + length * t, y0 - .045 + .012 * math.sin(t * 17),
                        .12 + .75 * math.sin(t * math.pi) ** .7 + .1 * math.sin(t * 9)))
        parts.append(k.tube('Vine', pts, .013, vine))
        for i, p in enumerate(pts[1:-1]):
            side = 1 if i % 2 else -1
            lf = U.puff(k, 'VineLeaf', U.heart(.13, 10), .03, leaf, rings=1, back='flat')
            lf.rotation_euler = (0, math.radians(180 + side * 40 + r.uniform(-15, 15)), 0)
            lf.location = (p[0], p[1] - .012, p[2] + side * .05)
            parts.append(lf)
        for i, p in enumerate(pts[1:-1:2]):
            mat = (berry, coral)[i % 2]
            fl = U.puff(k, 'Bloom', U.scallop_circle(.1, 5, .3, 3), .04, mat, rings=2, back='flat',
                        loc=(p[0] + .03, p[1] - .03, p[2] + .02))
            parts.append(fl)
            parts.append(k.ball('BloomEye', (p[0] + .03, p[1] - .055, p[2] + .02), .028, gold, 6, 4))
    fence = k.join('garden_fence', parts, pivot=(0, 0, 0))
    U.clip_x(fence)
    fence['tile'] = 8.0
    fence['height'] = 1.2
    fence['front'] = 3.5
    k.paint([fence], lo=0, hi=1.2, shade=.7)
    return fence


# ----------------------------------------------------------------------------- flower bed
def build_flower_bed(k):
    rnd = random.Random(41)
    brick = k.mat('Edging', 'terracotta', MATTE)
    soil = k.mat('Soil', SOIL, MATTE)
    leaf = k.mat('Leaf', 'leaf', GLOSS)
    dark = k.mat('LeafDark', 'leaf_dark', GLOSS)
    coral = k.mat('Coral', 'coral', GLOSS)
    berry = k.mat('Berry', 'berry', GLOSS)
    white = k.mat('Petal', 'white', SATIN)
    gold = k.mat('Marigold', 'marigold', GLOSS)
    W, D = 2.0, .9
    parts = [U.puff(k, 'Mound', U.rounded_rect(-W / 2 + .06, W / 2 - .06, -D / 2 + .06, D / 2 - .06, .3, 4), .2, soil,
                    rings=3, n=3, plane='XY', back='flat', loc=(0, 0, 0))]
    # Scalloped terracotta edging around the bed.
    path = U.rounded_rect(-W / 2, W / 2, -D / 2, D / 2, .32, 3)
    per = [Vector(p + (0,)) for p in path]
    total = sum((per[(i + 1) % len(per)] - per[i]).length for i in range(len(per)))
    count = 18
    for i in range(count):
        d = total * i / count
        j = 0
        while d > (per[(j + 1) % len(per)] - per[j]).length:
            d -= (per[(j + 1) % len(per)] - per[j]).length
            j += 1
        a, b = per[j], per[(j + 1) % len(per)]
        p = a + (b - a).normalized() * d
        ang = math.atan2((b - a).y, (b - a).x)
        parts.append(k.box('Edge', (p.x, p.y, .07), (.24, .08, .15), brick, bevel=.035, segments=1,
                           rot=(0, 0, ang)))
    # Back row tulips, middle daisies, front pompoms, leaf clumps between.
    for i, x in enumerate((-.72, -.36, 0, .36, .72)):
        y = .18 + rnd.uniform(-.04, .04)
        h = .38 + rnd.uniform(-.03, .05)
        parts.append(k.cyl('Stem', (x, y, h / 2), .014, h, leaf, vertices=6, bevel=0))
        parts.append(U.lathe(k, 'Tulip', [(0, -.035), (.06, -.02), (.08, .05), (.07, .11), (.05, .1), (.03, .13),
                                          (.012, .09), (0, .08)], (coral, berry)[i % 2], loc=(x, y, h), segments=8))
        blade = U.puff(k, 'Blade', U.leaf_outline(.26, .09, n=5), .02, dark, rings=2, n=2.2)
        blade.rotation_euler = (math.radians(15), math.radians(-25 if i % 2 else 25), 0)
        blade.location = (x, y - .03, .1)
        parts.append(blade)
    for i, x in enumerate((-.56, -.18, .2, .58)):
        y = -.02 + rnd.uniform(-.04, .04)
        h = .3 + rnd.uniform(-.03, .04)
        parts.append(k.cyl('Stem', (x, y, h / 2), .011, h, leaf, vertices=6, bevel=0))
        daisy = U.puff(k, 'Daisy', U.scallop_circle(.1, 7, .35, 3), .035, white, rings=2, n=2.6, back='flat',
                       loc=(x, y - .01, h + .03), rot=(math.radians(-25), 0, 0))
        parts.append(daisy)
        parts.append(k.ball('DaisyEye', (x, y - .035, h + .037), (.04, .025, .04), gold, 8, 5))
    for i, x in enumerate((-.75, -.38, 0, .38, .75)):
        y = -.26 + rnd.uniform(-.03, .03)
        parts.append(k.ball('Clump', (x + .08, y + .06, .16), (.13, .1, .1), (leaf, dark)[i % 2], 8, 5))
        parts.append(k.ball('Pom', (x, y, .22), .085, gold if i % 2 == 0 else coral, 10, 6))
        for j in range(3):
            a = j * math.tau / 3 + i
            parts.append(k.ball('PomPetal', (x + math.cos(a) * .06, y - .03, .22 + math.sin(a) * .06), .045,
                                gold if i % 2 == 0 else coral, 6, 4))
    bed = k.join('flower_bed', parts, pivot=(0, 0, 0))
    zs = [v.co.z for v in bed.data.vertices]
    bed['height'] = round(max(zs), 3)
    k.paint([bed], lo=0, hi=max(zs), shade=.66)
    return bed


# ----------------------------------------------------------------------------- tree
def build_tree_round(k):
    rnd = random.Random(51)
    bark = k.mat('Bark', 'wood', SATIN)
    bark_dark = k.mat('BarkDark', 'wood_dark', SATIN)
    leaf = k.mat('Leaf', 'leaf', SATIN)
    dark = k.mat('LeafDark', 'leaf_dark', SATIN)
    lime = k.mat('LeafLight', 'lime', SATIN)
    apple = k.mat('Apple', 'red', GLOSS)
    gold = k.mat('Marigold', 'marigold', GLOSS)
    coral = k.mat('Coral', 'coral', GLOSS)
    parts = []
    # Trunk: lofted rings along a gentle S-curve.
    # The base flares into five soft root buttresses that sink into the lawn.
    loops = []
    n = 20
    for t in (0., .03, .08, .16, .3, .45, .62, .8, 1.):
        z = -.06 + t * 2.66
        r = .28 - .14 * t + .12 * (1 - t) ** 6
        lobe = .6 * (1 - t) ** 5
        cx = .08 * math.sin(t * 3.2)
        loop = []
        for j in range(n):
            a = j * math.tau / n
            k_ = 1 + lobe * (.5 + .5 * math.cos(5 * (a - .3))) ** 2
            loop.append((cx + math.cos(a) * r * k_, math.sin(a) * r * .92 * k_, z))
        loops.append(loop)
    parts.append(U.loft(k, 'Trunk', loops, bark))
    for a, zb, length in ((.6, 2.0, .7), (2.6, 2.2, .6), (4.4, 1.9, .65)):
        base = Vector((.05, 0, zb))
        tip = base + Vector((math.cos(a) * length, math.sin(a) * length * .6, length * .8))
        parts.append(k.capsule('Branch', tuple(base), tuple(tip), .075, bark, 8))
    # Knot hole with a tiny birdhouse on the trunk.
    parts.append(k.ball('Knot', (.02, -.24, 1.1), (.07, .03, .09), bark_dark, 10, 6))
    hx, hy, hz = .02, -.26, 1.72
    parts.append(k.box('BirdHouse', (hx, hy, hz), (.24, .2, .26), gold, bevel=.03, segments=2))
    parts.append(k.prism('BirdRoof', [(-.17, .1), (.17, .1), (0, .26)], .26, coral, loc=(hx, hy, hz), bevel=.02,
                         segments=1))
    parts.append(k.cyl('BirdHole', (hx, hy - .1, hz + .02), .045, .02, bark_dark, axis='Y', vertices=12, bevel=0))
    parts.append(k.cyl('Perch', (hx, hy - .13, hz - .06), .012, .08, bark, axis='Y', vertices=6, bevel=0))
    # Canopy: a cloud of overlapping leaf puffs, bright on top, deeper below.
    blobs = [((0, 0, 3.15), 1.15, leaf), ((-.95, -.1, 2.85), .8, dark), ((.95, .05, 2.9), .82, dark),
             ((-.5, -.55, 3.55), .72, leaf), ((.55, -.5, 3.6), .7, leaf), ((0, -.35, 3.95), .62, lime),
             ((-.2, .55, 3.7), .75, leaf), ((.6, .5, 3.3), .7, dark), ((-.7, .45, 3.2), .7, dark),
             ((.1, -.75, 2.8), .68, dark), ((-.45, -.3, 4.05), .45, lime), ((.4, -.2, 4.1), .42, lime)]
    for (x, y, z), r, mat in blobs:
        parts.append(k.ball('Leaves', (x, y, z), (r, r * .95, r * .88), mat, 14, 9))
    # Apples and blossoms peeking out of the canopy front.
    def inside(p):
        return any(((p.x - c[0]) / r) ** 2 + ((p.y - c[1]) / (r * .95)) ** 2 + ((p.z - c[2]) / (r * .88)) ** 2 < 1
                   for c, r, _ in blobs)
    for i in range(12):
        a = -math.pi / 2 + (i - 5.5) * .24 + rnd.uniform(-.08, .08)
        el = -.45 + (i % 4) * .32 + rnd.uniform(-.06, .06)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        t = 2.6
        while t > 0 and not inside(Vector((0, 0, 3.3)) + d * t):
            t -= .02
        p = Vector((0, 0, 3.3)) + d * (t + .03)
        parts.append(k.ball('Fruit', p, .09, apple if i % 3 else coral, 8, 5))
    tree = k.join('tree_round', parts, pivot=(0, 0, 0))
    zs = [v.co.z for v in tree.data.vertices]
    tree['height'] = round(max(zs), 3)
    k.paint([tree], lo=0, hi=max(zs), shade=.6)
    return tree


# ----------------------------------------------------------------------------- boat shed
def _striped_torus(k, name, loc, major, minor, mats, stripes, rot, major_seg=20, minor_seg=6):
    t = k.torus(name, (0, 0, 0), major, minor, mats[0], major_seg=major_seg, minor_seg=minor_seg)
    for m in mats[1:]:
        t.data.materials.append(m)
    for f in t.data.polygons:
        c = f.center
        a = (math.atan2(c.y, c.x) + math.tau) % math.tau
        f.material_index = int(a / math.tau * stripes) % len(mats)
    t.location = loc
    t.rotation_euler = rot
    return t


def build_boat_shed(k):
    wood = k.mat('Wood', 'wood', SATIN)
    wood_l = k.mat('WoodLight', 'wood_light', SATIN)
    coral = k.mat('Coral', 'coral', SATIN)
    teal = k.mat('Teal', 'teal', GLOSS)
    cream = k.mat('Cream', 'white', SATIN)
    gold = k.mat('Marigold', 'marigold', GLOSS)
    glass = k.mat('Window', '#8fd8ff', .12)
    rope = k.mat('Rope', 'sand', MATTE)
    parts = []
    sx0 = -1.0                        # shed centre X (the rowboat sits to the right)
    W, D, Hw, Hr = 4.2, 3.0, 2.7, 4.3
    fy = -D / 2
    parts.append(k.box('Body', (sx0, 0, Hw / 2), (W, D, Hw), wood, bevel=.04, segments=1))
    gable = [(-W / 2, Hw), (W / 2, Hw), (0, Hr - .1)]
    parts.append(k.prism('Gable', gable, D, wood, loc=(sx0, 0, 0), bevel=.03, segments=1))
    # Horizontal clapboards on the front, alternating two wood tones.
    z = .1
    i = 0
    while z < Hr - .45:
        h = .28
        half = W / 2 if z + h / 2 < Hw else (W / 2) * max(0., (Hr - .1 - (z + h / 2)) / (Hr - .1 - Hw))
        if half > .25:
            parts.append(k.box('Board', (sx0, fy - .02, z + h / 2), (2 * half - .02, .05, h - .02), (wood_l, wood)[i % 2],
                               bevel=.018, segments=1, rot=(math.radians(-4), 0, 0)))
        z += h
        i += 1
    for s in (-1, 1):
        parts.append(k.box('Corner', (sx0 + s * (W / 2 - .02), fy - .04, Hw / 2), (.14, .1, Hw), cream, bevel=.03,
                           segments=1))
    # Roof: two coral slabs with shingle steps, cream bargeboards and a ridge roll.
    pitch = math.atan2(Hr - Hw, W / 2)
    slope_len = math.hypot(W / 2, Hr - Hw) + .35
    for s in (-1, 1):
        cx = sx0 + s * (W / 4 + .05)
        cz = (Hw + Hr - .1) / 2 + .07
        rot = (0, s * pitch, 0)
        parts.append(k.box('Roof', (cx, 0, cz), (slope_len, D + .5, .14), coral, bevel=.05, segments=2, rot=rot))
        for j in range(3):
            t = (j + .5) / 3 - .5
            px = cx + s * t * slope_len * math.cos(pitch) * .95
            pz = cz - t * slope_len * math.sin(pitch) * .95 + .09
            parts.append(k.box('Shingle', (px, 0, pz), (.12, D + .5, .06), coral, bevel=.025, segments=1, rot=rot))
        parts.append(k.box('Barge', (cx, fy - .27, cz - .03), (slope_len, .09, .3), coral, bevel=.035, segments=2,
                           rot=rot))
        parts.append(k.box('Fascia', (cx, fy - .24, cz - .2), (slope_len - .1, .05, .07), cream, bevel=.02, segments=1,
                           rot=rot))
    parts.append(k.cyl('Ridge', (sx0, 0, Hr + .06), .12, D + .6, cream, axis='Y', vertices=12, bevel=.03, segments=1))
    # Teal double door with cream Z-braces and a marigold latch.
    dw, dh = 2.1, 2.3
    parts.append(k.box('DoorFrame', (sx0, fy - .07, dh / 2 + .1), (dw + .3, .08, dh + .2), cream, bevel=.03, segments=2))
    for s in (-1, 1):
        lx = sx0 + s * dw / 4
        parts.append(k.box('Door', (lx, fy - .12, dh / 2 + .04), (dw / 2 - .04, .06, dh), teal, bevel=.03, segments=2))
        for zz in (.35, dh - .2):
            parts.append(k.box('Brace', (lx, fy - .16, zz), (dw / 2 - .16, .03, .14), cream, bevel=.015, segments=1))
        ang = math.atan2(dh - .55, dw / 2 - .25) * s
        parts.append(k.box('Diagonal', (lx, fy - .16, dh / 2 + .07), (math.hypot(dw / 2 - .25, dh - .55), .03, .13),
                           cream, bevel=.015, segments=1, rot=(0, -ang, 0)))
    parts.append(k.box('Latch', (sx0, fy - .19, 1.15), (.5, .04, .07), gold, bevel=.015, segments=1))
    parts.append(k.cyl('LatchPin', (sx0 + .18, fy - .21, 1.15), .04, .05, gold, axis='Y', vertices=10, bevel=.01,
                       segments=1))
    # Ribbon sign board with a little boat painted on it.
    sy = Hw + .2
    ribbon = [(-.95, -.22), (.95, -.22), (1.1, 0), (.95, .22), (-.95, .22), (-1.1, 0)]
    parts.append(k.prism('Sign', ribbon, .08, gold, loc=(sx0, fy - .1, sy), bevel=.03, segments=2))
    parts.append(k.prism('SignHull', [(-.28, .02), (.28, .02), (.2, -.1), (-.22, -.1)], .03, coral,
                         loc=(sx0 - .1, fy - .15, sy), bevel=.01, segments=1))
    parts.append(k.prism('SignSail', [(-.08, .04), (.14, .04), (-.08, .19)], .03, cream, loc=(sx0 - .1, fy - .15, sy),
                         bevel=.01, segments=1))
    parts.append(k.prism('SignWave', [(.25, -.12), (.62, -.12), (.62, -.04), (.5, .0), (.4, -.06), (.3, -.02)], .03, teal,
                         loc=(sx0, fy - .15, sy), bevel=.01, segments=1))
    # Porthole window high in the gable.
    parts.append(k.cyl('Porthole', (sx0, fy - .03, Hr - .68), .28, .05, glass, axis='Y', vertices=16, bevel=0))
    parts.append(k.torus('PortRing', (sx0, fy - .08, Hr - .68), .3, .06, cream, rot=(math.pi / 2, 0, 0), major_seg=18,
                         minor_seg=5))
    # Lifebuoy on a hook, oars leaning left, coiled rope on the ground.
    parts.append(k.cyl('Hook', (sx0 + 1.55, fy - .08, 2.05), .025, .12, gold, axis='Y', vertices=8, bevel=0))
    parts.append(_striped_torus(k, 'Lifebuoy', (sx0 + 1.55, fy - .12, 1.72), .3, .09, [coral, cream], 8,
                                (math.pi / 2, 0, 0)))
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        parts.append(k.torus('BuoyRope', (sx0 + 1.55 + math.cos(a) * .3, fy - .12, 1.72 + math.sin(a) * .3), .1, .018,
                             rope, rot=(0, -a, 0), major_seg=8, minor_seg=3))
    for s, lean in ((-1, .16), (1, -.1)):
        ox = sx0 - 1.62 + s * .14
        parts.append(k.cyl('OarShaft', (ox, fy - .2, 1.1), .035, 2.1, wood_l, vertices=8, bevel=.01, segments=1,
                           rot=(0, lean, 0)))
        blade_z = .28
        bx = ox - math.sin(lean) * (1.1 - blade_z)
        parts.append(k.box('OarBlade', (bx, fy - .2, blade_z), (.2, .04, .55), teal if s < 0 else coral, bevel=.02,
                           segments=1, rot=(0, lean, 0)))
    for i, (r, z) in enumerate(((.34, .05), (.27, .14))):
        parts.append(k.torus('RopeCoil', (sx0 - 1.95, fy - .55, z), r, .055, rope, major_seg=14, minor_seg=4))
    # Upturned rowboat on two trestles beside the shed: coral bottom up, cream topsides,
    # teal gunwale and keel, pointed bow toward the shed and a flat transom.
    bx, by, bz = 1.75, -2.1, .58
    n_arch = 10
    loops, rim_l, rim_r, keel = [], [], [], []
    stations = 9
    for i in range(stations):
        t = i / (stations - 1)
        x = .95 - 2.15 * t
        w = .5 * (1 - t ** 2.4) + .025
        d = .4 * (1 - .3 * t ** 2)
        base = -.1 * t ** 2
        loop = []
        for j in range(n_arch + 1):
            th = math.pi * j / n_arch
            loop.append((x, w * math.cos(th), base + d * math.sin(th) ** .6))
        loops.append(loop)
        rim_l.append((x, w, base))
        rim_r.append((x, -w, base))
        keel.append((x, 0, base + d + .015))

    def pick(li, j):
        return 1 if j < 2 or n_arch - 2 <= j < n_arch else 0
    hull = U.loft(k, 'Hull', loops, [coral, cream], pick=pick)
    rim_a = k.tube('Gunwale', rim_l[::2], .035, teal)
    rim_b = k.tube('Gunwale', rim_r[::2], .035, teal)
    keel_o = k.tube('Keel', keel[:-1:2], .03, teal)
    transom = k.box('Transom', (.97, 0, .2), (.03, .9, .3), teal, bevel=.012, segments=1)
    boat = k.join('Boat', [hull, rim_a, rim_b, keel_o, transom], pivot=(0, 0, 0))
    boat.rotation_euler = (0, 0, math.radians(-6))
    boat.location = (bx, by, bz)
    parts.append(boat)
    for tx in (-.6, .6):
        parts.append(k.box('TrestleBeam', (bx + tx, by, bz - .08), (.1, 1.0, .08), wood_l, bevel=.02, segments=1))
        for sy in (-1, 1):
            for sx in (-1, 1):
                parts.append(k.cyl('TrestleLeg', (bx + tx + sx * .08, by + sy * .38, (bz - .1) / 2), .03, bz - .08,
                                   wood_l, vertices=6, bevel=0, rot=(sy * .2, sx * -.25, 0)))
    parts.append(k.cyl('PaintTin', (bx + .1, by - .6, .12), .1, .24, teal, vertices=12, bevel=.02, segments=1))
    parts.append(k.cyl('PaintLid', (bx + .1, by - .6, .25), .1, .02, cream, vertices=12, bevel=.008, segments=1))
    parts.append(k.cyl('Brush', (bx + .14, by - .6, .36), .014, .26, wood_l, vertices=6, bevel=0, rot=(0, .3, 0)))
    shed = k.join('boat_shed', parts, pivot=(0, 0, 0))
    xs = [v.co.x for v in shed.data.vertices]
    ys = [v.co.y for v in shed.data.vertices]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    U.deform(shed, lambda v: Vector((v.x - cx, v.y - cy, v.z)))
    zs = [v.co.z for v in shed.data.vertices]
    shed['height'] = round(max(zs), 3)
    shed['width'] = round(max(xs) - min(xs), 3)
    shed['depth'] = round(max(ys) - min(ys), 3)
    k.paint([shed], lo=0, hi=max(zs), shade=.66)
    return shed


BUILDERS = {
    'garden_floor': build_garden_floor,
    'garden_fence': build_garden_fence,
    'flower_bed': build_flower_bed,
    'tree_round': build_tree_round,
    'boat_shed': build_boat_shed,
}
