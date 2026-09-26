"""Brightwater — the big city three hours from the seaside hometown (chapters 4–6).

Groups:
  city          ground tiles, backdrop buildings, street furniture, vehicles, far silhouettes
  workplaces    career backdrop set pieces (shipyard, newsroom, aquarium lab, workshop)
  hazards_city  in-lane obstacles (obj['height'] <= .45 jumpable, .8–1.2 dodge) and sandbags

Conventions (see art/README.md): 1 unit = 1 m, Z up, fronts face -Y, pivot at the base
centre (0, 0, 0). Backdrop buildings are authored in place with their fronts at Y = +3.5
so the runtime can drop them at (x, 0, 0); root extras record width/depth/height/front_y.
Vehicles run along X with the front at +X. Ground tiles are exactly 8 m long in X.
"""
import math

from kit import GLOSS, MATTE, SATIN

import _city_blocks as blocks
import _city_civic as civic
import _city_street as street
import _city_work as work
import _city_hazards as hz
import _city_parts as cp
from _city_parts import Geo, building_props, finish, glass, lamp, mat


# =========================================================================== ground tiles
def sidewalk_tile(k):
    pave = mat(k, 'Paving', 'stone', MATTE)
    warm = mat(k, 'PavingWarm', '#e5825f', MATTE)
    grout = mat(k, 'Grout', '#8a7d9c', MATTE)
    kerb = mat(k, 'Kerb', '#f4e6cc', SATIN)
    road = mat(k, 'Asphalt', 'asphalt', MATTE)
    line = mat(k, 'RoadPaint', 'sun', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    parts = []
    # Road and gutter: straight extrusions along X, so tiles meet without seams.
    parts.append(k.prism('Road', [(-6, -.45), (-3.62, -.45), (-3.62, -.14), (-6, -.14)], 8, road, axis='X', bevel=0))
    parts.append(k.prism('Gutter', [(-3.62, -.45), (-3.41, -.45), (-3.41, -.125), (-3.62, -.135)], 8, grout, axis='X',
                         bevel=0))
    prof = [(-3.42, -.45), (-3.15, -.45), (-3.15, .012), (-3.33, .012), (-3.385, .0), (-3.412, -.03), (-3.425, -.08)]
    parts.append(k.prism('Kerb', prof, 8, kerb, axis='X', bevel=0))
    parts.append(k.prism('Bed', [(-3.15, -.45), (3.5, -.45), (3.5, -.035), (-3.15, -.035)], 8, grout, axis='X', bevel=0))
    # Paving: warm edge strips, a staggered main field, warm band at the building line.
    g_main, g_warm = Geo(), Geo()
    gap = .045
    rows = [(-3.15, -2.55, 1.0, 0, g_warm), (2.9, 3.5, 1.0, 0, g_warm)]
    y = -2.55
    for i in range(5):
        rows.append((y, y + 1.09, 1.0, .5 * (i % 2), g_main))
        y += 1.09
    for (y0, y1, length, stagger, geo) in rows:
        j = -4 + stagger - length
        while j < 4:
            x0, x1 = j + gap / 2, j + length - gap / 2
            cl = cr = .03
            if x0 < -4:
                x0, cl = -4, 0
            if x1 > 4:
                x1, cr = 4, 0
            if x1 - x0 > .05:
                geo.slab(x0, x1, y0 + gap / 2, y1 - gap / 2, 0, .1, .03, cl=cl, cr=cr)
            j += length
    parts.append(g_main.obj(k, 'Slabs', pave))
    parts.append(g_warm.obj(k, 'SlabsWarm', warm))
    # Dashed centre line (period 2 m tiles over 8 m), a manhole and a drain grate.
    for x in (-3, -1, 1, 3):
        parts.append(k.box('Dash', (x, -5.05, -.135), (1.15, .16, .03), line, bevel=.012, segments=1))
    parts.append(k.cyl('Manhole', (-1.9, -4.35, -.135), .36, .03, metal, vertices=16, bevel=.01, segments=1))
    parts.append(k.torus('ManholeRing', (-1.9, -4.35, -.12), .24, .02, metal, major_seg=16, minor_seg=4))
    g = Geo()
    g.box(2.05, 2.75, -3.6, -3.44, -.135, -.12)
    for i in range(5):
        x = 2.13 + i * .135
        g.box(x, x + .05, -3.62, -3.42, -.12, -.105)
    parts.append(g.obj(k, 'Drain', metal))
    obj = finish(k, 'sidewalk_tile', parts, lo=-.45, hi=.02, shade=.72)
    obj['length'] = 8.
    obj['surface_z'] = 0.
    obj['road_z'] = -.14
    obj['band'] = 'ground'
    return obj


def platform_tile(k):
    """8 m station platform: two-tone concrete slabs, a yellow tactile strip with studs and a
    cream coping along the back edge, then the drop to the track bed with sleepers and rails.
    Platform top at Z=0; rail tops at Z=-0.87 on a track centred at Y=+5.3."""
    slab1 = mat(k, 'Concrete', '#bba8c9', MATTE)
    slab2 = mat(k, 'Concrete2', '#a592b8', MATTE)
    tactile = mat(k, 'Tactile', '#ffc21a', GLOSS)
    coping = mat(k, 'Coping', 'cream', SATIN)
    wall = mat(k, 'Wall', '#8e7fa6', MATTE)
    ballast = mat(k, 'Ballast', '#6f6680', MATTE)
    sleeper = mat(k, 'Sleeper', 'wood_dark', SATIN)
    rail = mat(k, 'Rail', 'steel', .28, metal=.7)
    parts = [k.prism('Base', [(-6, -1.4), (3.45, -1.4), (3.45, -.05), (-6, -.05)], 8, wall, axis='X', bevel=0)]
    ga, gb = Geo(), Geo()
    gap = .05
    rows = 5
    y0, y1 = -6., 2.45
    for r in range(rows):
        ya = y0 + (y1 - y0) * r / rows
        yb = y0 + (y1 - y0) * (r + 1) / rows
        for i in range(4):
            xa, xb = -4 + i * 2, -2 + i * 2
            geo = ga if (i + r) % 2 == 0 else gb
            geo.slab(xa + gap / 2, xb - gap / 2, ya + gap / 2, yb - gap / 2, 0, .1, .035)
    parts.append(ga.obj(k, 'Slabs', slab1))
    parts.append(gb.obj(k, 'Slabs', slab2))
    gt = Geo()
    for i in range(16):
        xa = -4 + i * .5
        gt.slab(xa + .015, xa + .5 - .015, 2.47, 3.07, .005, .1, .02)
    studs = Geo()
    for row in range(3):
        yy = 2.6 + row * .17
        for i in range(32):
            x = -4 + .125 + i * .25 + (.0625 if row % 2 else 0)
            if x > 3.95:
                continue
            ring = [(x + math.cos(a) * .045, yy + math.sin(a) * .045) for a in [j * math.tau / 6 for j in range(6)]]
            top = [(px, py, .03) for px, py in ring]
            bot = [(px, py, .004) for px, py in ring]
            faces = [top] + [[bot[j], bot[(j + 1) % 6], top[(j + 1) % 6], top[j]] for j in range(6)]
            studs.hull(faces)
    parts.append(gt.obj(k, 'TactileTiles', tactile))
    parts.append(studs.obj(k, 'Studs', tactile))
    prof = [(3.08, -.12), (3.56, -.12), (3.6, -.07), (3.6, -.02), (3.56, .012), (3.08, .012)]
    parts.append(k.prism('Coping', prof, 8, coping, axis='X', bevel=0))
    g = Geo()
    for i in range(8):
        x = -3.5 + i
        g.box(x - .012, x + .012, 3.1, 3.58, .012, .016)
    parts.append(g.obj(k, 'CopingJoints', wall))
    parts.append(k.prism('Ballast', [(3.45, -1.4), (7.4, -1.4), (7.4, -1.22), (6.9, -1.1), (3.7, -1.1),
                                     (3.45, -1.2)], 8, ballast, axis='X', bevel=0))
    parts.append(k.prism('BackWall', [(7.4, -1.4), (7.75, -1.4), (7.75, -.55), (7.4, -.55)], 8, wall, axis='X',
                         bevel=0))
    for i in range(8):
        x = -3.5 + i
        parts.append(k.box('Sleeper', (x, 5.3, -1.06), (.26, 2.3, .12), sleeper, bevel=.02, segments=1))
    rp = [(-.035, -1.0), (.035, -1.0), (.035, -.935), (.05, -.925), (.05, -.87), (-.05, -.87), (-.05, -.925),
          (-.035, -.935)]
    for ry in (4.6, 6.0):
        parts.append(k.prism('Rail', [(p[0] + ry, p[1]) for p in rp], 8, rail, axis='X', bevel=0))
    obj = finish(k, 'platform_tile', parts, lo=-1.4, hi=.02, shade=.72)
    obj['length'] = 8.
    obj['surface_z'] = 0.
    obj['rail_z'] = -.87
    obj['rail_y'] = 5.3
    obj['band'] = 'ground'
    return obj


def plaza_tile(k):
    """8 m campus plaza: two-tone herringbone brick (the lattice repeats every 8 m), a cream
    kerb and a planted front strip with a clipped hedge and flowers."""
    brick = mat(k, 'Brick', 'brick', MATTE)
    brick2 = mat(k, 'Brick2', '#e58a5e', MATTE)
    grout = mat(k, 'Grout', '#8a6f7e', MATTE)
    kerb = mat(k, 'Kerb', 'cream', SATIN)
    lawn = mat(k, 'Lawn', 'grass', MATTE)
    hedge = mat(k, 'Hedge', 'leaf_dark', GLOSS)
    flower = mat(k, 'Flower', 'berry', GLOSS)
    flower2 = mat(k, 'Flower2', 'marigold', GLOSS)
    parts = [k.prism('Bed', [(-3.25, -.4), (3.5, -.4), (3.5, -.03), (-3.25, -.03)], 8, grout, axis='X', bevel=0),
             k.prism('Kerb', [(-3.45, -.4), (-3.2, -.4), (-3.2, .03), (-3.4, .03), (-3.45, -.01)], 8, kerb, axis='X',
                     bevel=0),
             k.prism('Lawn', [(-6, -.4), (-3.45, -.4), (-3.45, -.03), (-6, -.03)], 8, lawn, axis='X', bevel=0)]
    a = .4
    gap = .035
    gh, gv = Geo(), Geo()
    Y0, Y1 = -3.2, 3.5

    def put(geo, x0, x1, y0, y1):
        cl = cr = .025
        if x1 <= -4 or x0 >= 4 or y1 <= Y0 or y0 >= Y1:
            return
        x0, x1 = x0 + gap / 2, x1 - gap / 2
        if x0 < -4:
            x0, cl = -4, 0
        if x1 > 4:
            x1, cr = 4, 0
        y0, y1 = max(y0 + gap / 2, Y0 + .01), min(y1 - gap / 2, Y1)
        if x1 - x0 > .04 and y1 - y0 > .04:
            geo.slab(x0, x1, y0, y1, 0, .08, .025, cl=cl, cr=cr)
    for p in range(-30, 31):
        for q in range(-20, 21):
            ox, oy = (p + 2 * q) * a, (p - 2 * q) * a
            if ox > 5 or ox < -6 or oy > 4 or oy < -5:
                continue
            put(gh, ox, ox + 2 * a, oy, oy + a)
            put(gv, ox, ox + a, oy + a, oy + 3 * a)
    parts.append(gh.obj(k, 'Bricks', brick))
    parts.append(gv.obj(k, 'Bricks', brick2))
    hp = [(-5.15, -.03), (-4.1, -.03), (-4.02, .2), (-4.08, .42), (-4.3, .55), (-4.95, .55), (-5.17, .42),
          (-5.23, .2)]
    parts.append(k.prism('Hedge', hp, 8, hedge, axis='X', bevel=0))
    for i in range(8):
        x = -3.5 + i
        parts.append(k.ball('HedgeTop', (x, -4.62, .5), (.52, .5, .16), hedge, 8, 4))
    for i in range(6):
        x = -3.3 + i * 1.333
        for j in range(3):
            m = flower if (i + j) % 2 == 0 else flower2
            parts.append(k.ball('Flower', (x + (j - 1) * .18, -5.55 + (j % 2) * .12, .1 + (j % 2) * .04), .09, m, 6, 4))
        parts.append(k.ball('FlowerLeaf', (x, -5.5, .03), (.32, .2, .08), hedge, 7, 4))
    obj = finish(k, 'plaza_tile', parts, lo=-.4, hi=.6, shade=.74)
    obj['length'] = 8.
    obj['surface_z'] = 0.
    obj['band'] = 'ground'
    return obj


# =========================================================================== towers
def tower_a(k):
    """Teal classic mid-rise: stone plinth with a lit lobby, pilastered shaft, cornice,
    setback penthouse with a terrace railing, water tank and antenna."""
    wall = mat(k, 'Wall', 'teal', GLOSS)
    dark = mat(k, 'WallDark', 'teal_dark', SATIN)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    accent = mat(k, 'Accent', 'coral', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    wood = mat(k, 'Wood', 'marigold', SATIN)
    win = glass(k)
    lit = lamp(k)
    F = 3.5
    parts = []
    # ---------------------------------------------------------------- street level
    parts.append(k.box('Core', (0, 7.45, 1.9), (8.8, 6.1, 3.8), dark, bevel=.05, segments=1))
    parts.append(k.box('Glow', (0, F + .85, 1.8), (8.6, .1, 3.5), lit, bevel=0))
    parts.append(k.box('RecessFloor', (0, F + .5, .03), (8.6, 1.0, .06), dark, bevel=0))
    for x, w in ((-4.2, .62), (-1.85, .5), (1.85, .5), (4.2, .62)):
        parts.append(k.box('Pier', (x, F + .5, 1.8), (w, 1.08, 3.6), trim, bevel=.07, segments=1))
        parts.append(k.box('PierBase', (x, F + .48, .22), (w + .1, 1.14, .44), trim, bevel=.05, segments=1))
    parts.append(k.box('Fascia', (0, F + .45, 3.9), (9.1, 1.2, .72), accent, bevel=.1, segments=2))
    parts.append(k.box('FasciaCap', (0, F + .45, 4.33), (9.3, 1.3, .18), trim, bevel=.06, segments=1))
    # shop bays either side of the lobby: stallriser, mullions, transom, goods on shelves
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 2.1, sx * 3.89))
        cx = (x0 + x1) / 2
        parts.append(k.box('Stall', (cx, F + .12, .34), (x1 - x0, .2, .68), accent, bevel=.05, segments=1))
        parts.append(k.box('Sill', (cx, F + .06, .7), (x1 - x0 + .06, .3, .08), trim, bevel=.03, segments=1))
        g = Geo()
        for x in (x0 + .03, cx, x1 - .03):
            g.box(x - .045, x + .045, F + .05, F + .15, .74, 3.5)
        g.box(x0, x1, F + .05, F + .15, 2.62, 2.72)
        parts.append(g.obj(k, 'ShopFrame', metal))
        # silhouettes inside: a shelf and chunky goods
        parts.append(k.box('Shelf', (cx, F + .75, 1.45), (x1 - x0 - .2, .3, .06), wood, bevel=.02, segments=1))
        for i, c in enumerate((accent, wall, trim, wood)):
            parts.append(k.box('Goods', (x0 + .3 + i * .42, F + .7, 1.62 + (i % 2) * .05), (.26, .2, .28 + (i % 2) * .1),
                               c, bevel=0))
    # lobby: glazed double doors under a fan light and a marquee
    parts += cp.windows(k, [(-.52, .02, 1.0, 2.35), (.52, .02, 1.0, 2.35)], at=F + .7, glass_mat=lit, frame_mat=wood,
                        depth=.07, t=.09, mullion='h')
    parts.append(k.box('DoorFrame', (0, F + .66, 2.5), (2.4, .12, .14), metal, bevel=.03, segments=1))
    parts.append(k.cyl('Fan', (0, F + .68, 2.57), .95, .06, lit, axis='Y', vertices=20, bevel=0))
    for i in range(5):
        a = math.pi * (i + 1) / 6
        bar = k.box('Ray', (math.cos(a) * .45, F + .62, 2.57 + math.sin(a) * .45), (.9, .04, .05), metal, bevel=0,
                    rot=(0, -a, 0))
        parts.append(bar)
    parts.append(k.box('Marquee', (0, F - .55, 3.18), (4.0, 1.3, .32), accent, bevel=.1, segments=2))
    parts.append(k.box('MarqueeLights', (0, F - 1.21, 3.08), (3.8, .06, .1), lit, bevel=.02, segments=1))
    parts.append(k.box('MarqueeTrim', (0, F - .55, 3.36), (4.1, 1.36, .06), trim, bevel=.02, segments=1))
    for sx in (-1.6, 1.6):
        parts.append(cp.rod(k, 'Tie', [(sx, F - 1.1, 3.34), (sx, F + .2, 4.05)], .025, metal))
    parts.append(k.box('Step', (0, F - .1, .06), (3.0, .5, .12), trim, bevel=.04, segments=1))
    # ---------------------------------------------------------------- shaft
    top = 13.4
    parts.append(k.box('Shaft', (0, F + .15 + 3.4, (4.5 + top) / 2), (8.6, 6.8, top - 4.5), wall, bevel=.14,
                       segments=2))
    bays = cp.spaced(-4.3, 4.3, 4)
    floors = [4.6, 7.55, 10.5]
    for x in (-4.3, -2.15, 0, 2.15, 4.3):
        w = .5 if abs(x) > 4 else .36
        parts.append(k.box('Pilaster', (x, F + .02, (4.45 + top) / 2), (w, .3, top - 4.45), dark, bevel=.06, segments=1))
    for z in floors:
        parts.append(k.box('Ledge', (0, F - .01, z + .66), (8.8, .34, .12), trim, bevel=.04, segments=1))
    g = Geo()
    for z in floors:
        for x in bays:
            g.box(x - .62, x + .62, F + .06, F + .16, z + .13, z + .55, skip=('+y',))
    parts.append(g.obj(k, 'Spandrels', accent))
    rects = cp.grid(bays, [z + .75 for z in floors], 1.3, 1.78)
    parts += cp.windows(k, rects, at=F + .15, glass_mat=win, frame_mat=trim, depth=.1, t=.11, glint_mat=trim)
    # side columns so the block reads in three-quarter view
    side = cp.grid([6.9], [z + .75 for z in floors], 1.2, 1.7)
    parts += cp.windows(k, side, face='+x', at=4.3, glass_mat=win, frame_mat=trim, depth=.08, t=.1, mullion='v')
    parts += cp.windows(k, side, face='-x', at=-4.3, glass_mat=win, frame_mat=trim, depth=.08, t=.1, mullion='v')
    # ---------------------------------------------------------------- cornice and penthouse
    parts.append(k.box('CorniceBand', (0, 7.0, top + .12), (8.9, 7.3, .3), trim, bevel=.06, segments=1))
    g = Geo()
    for i in range(13):
        x = -4.2 + i * .7
        g.box(x - .1, x + .1, F - .12, F + .1, top + .27, top + .45)
    parts.append(g.obj(k, 'Dentils', trim))
    parts.append(k.box('Cornice', (0, 7.0, top + .6), (9.4, 7.8, .34), accent, bevel=.12, segments=2))
    z0 = top + .77
    parts.append(k.box('Penthouse', (0, 7.4, z0 + 1.7), (6.4, 4.6, 3.4), wall, bevel=.12, segments=2))
    parts += cp.windows(k, cp.grid(cp.spaced(-3.2, 3.2, 3), [z0 + .7], 1.3, 1.9), at=5.1, glass_mat=win, frame_mat=trim,
                        depth=.1, t=.11, glint_mat=trim)
    parts.append(k.box('PentCornice', (0, 7.4, z0 + 3.5), (6.8, 5.0, .3), trim, bevel=.1, segments=2))
    parts.append(cp.railing(k, -4.4, 4.4, F - .05, z0, .8, metal, post=.4))
    for sx in (-1, 1):
        parts.append(cp.railing(k, F - .05, 10.4, sx * 4.45, z0, .8, metal, post=.6, face='+x'))
    rz = z0 + 3.65
    parts += cp.water_tank(k, 1.3, 8.0, rz, .85, 1.5, wood, metal, metal)
    parts += cp.antenna(k, -2.1, 6.6, rz, 2.6, metal, lit)
    parts += cp.ac_unit(k, -.4, 8.6, rz, trim, metal)
    obj = finish(k, 'tower_a', parts, lo=-1, hi=13, shade=.72)
    return building_props(obj)


# =========================================================================== street furniture
def street_tree(k):
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    leaf2 = mat(k, 'LeafDark', 'leaf_dark', GLOSS)
    lime = mat(k, 'LeafLight', 'lime', GLOSS)
    bark = mat(k, 'Bark', 'wood_dark', SATIN)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    soil = mat(k, 'Soil', '#5a3a2a', MATTE)
    parts = []
    s = .62
    parts.append(k.box('Soil', (0, 0, .02), (1.1, 1.1, .04), soil, bevel=0))
    grate = Geo()
    grate.box(-s, s, -s, -s + .09, 0, .06)
    grate.box(-s, s, s - .09, s, 0, .06)
    grate.box(-s, -s + .09, -s, s, 0, .06)
    grate.box(s - .09, s, -s, s, 0, .06)
    for i in range(4):
        d = -.36 + i * .24
        grate.box(d - .03, d + .03, -s, s, 0, .055)
        grate.box(-s, s, d - .03, d + .03, 0, .055)
    parts.append(grate.obj(k, 'Grate', metal))
    # tree guard: four hoops of bar
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        x, y = math.cos(ang) * .42, math.sin(ang) * .42
        parts.append(k.cyl('Guard', (x, y, .6), .03, 1.2, metal, vertices=6, bevel=0))
    parts.append(k.torus('GuardRing', (0, 0, 1.18), .42, .035, metal, major_seg=14, minor_seg=4))
    parts.append(k.torus('GuardRing', (0, 0, .5), .42, .03, metal, major_seg=14, minor_seg=4))
    parts.append(k.cyl('Trunk', (0, 0, 1.2), .17, 2.4, bark, vertices=10, radius2=.1, bevel=0))
    parts.append(k.cyl('Flare', (0, 0, .1), .24, .2, bark, vertices=10, radius2=.17, bevel=0))
    for a, b in (((0, .02, 1.7), (.55, .05, 2.45)), ((0, .02, 1.9), (-.5, -.05, 2.6))):
        parts.append(k.capsule('Branch', a, b, .06, bark, vertices=8))
    blobs = [((0, .05, 3.05), (1.1, 1.0, .92), leaf), ((-.72, .1, 2.62), (.74, .7, .64), leaf2),
             ((.74, -.02, 2.64), (.76, .72, .64), leaf2), ((.3, -.38, 3.4), (.64, .58, .56), lime),
             ((-.38, -.28, 3.36), (.6, .55, .52), leaf)]
    for c, r, m in blobs:
        parts.append(k.ball('Canopy', c, r, m, 12, 7))
    obj = finish(k, 'street_tree', parts, shade=.6)
    return cp.measure(obj)


def hydrant(k):
    body = mat(k, 'Paint', 'red', GLOSS)
    cap = mat(k, 'Cap', 'cream', GLOSS)
    brass = mat(k, 'Brass', 'marigold', .28, metal=.5)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    parts = [k.cyl('Flange', (0, 0, .05), .23, .1, metal, vertices=16, bevel=.03, segments=1)]
    prof = [(.0, .08), (.17, .08), (.17, .12), (.15, .14), (.15, .52), (.18, .55), (.18, .6), (.0, .6)]
    parts.append(k.lathe('Barrel', prof, body, segments=18))
    parts.append(k.cyl('Collar', (0, 0, .6), .2, .07, cap, vertices=18, bevel=.025, segments=1))
    parts.append(k.ball('Dome', (0, 0, .63), (.17, .17, .14), cap, 14, 7))
    parts.append(k.cyl('Nut', (0, 0, .78), .05, .07, brass, vertices=6, bevel=.01, segments=1))
    for sx in (-1, 1):
        parts.append(k.cyl('Outlet', (sx * .2, 0, .42), .065, .12, body, axis='X', vertices=10, bevel=0))
        parts.append(k.cyl('OutletCap', (sx * .27, 0, .42), .075, .05, brass, axis='X', vertices=10, bevel=.015,
                           segments=1))
    parts.append(k.cyl('Pumper', (0, -.2, .38), .09, .14, body, axis='Y', vertices=12, bevel=.02, segments=1))
    parts.append(k.cyl('PumperCap', (0, -.28, .38), .1, .05, brass, axis='Y', vertices=12, bevel=.015, segments=1))
    for i in range(6):
        a = i * math.tau / 6
        parts.append(k.cyl('Bolt', (math.cos(a) * .19, math.sin(a) * .19, .11), .025, .04, brass, vertices=6, bevel=0))
    parts.append(cp.rod(k, 'Chain', [(.27, -.03, .38), (.2, -.12, .28), (.08, -.24, .3), (.03, -.28, .36)], .012, metal))
    obj = finish(k, 'hydrant', parts, shade=.65)
    return cp.measure(obj)


REGISTRY = {
    'sidewalk_tile': ('city', sidewalk_tile),
    'platform_tile': ('city', platform_tile),
    'plaza_tile': ('city', plaza_tile),
    'tower_a': ('city', tower_a),
    'tower_b': ('city', blocks.tower_b),
    'tower_c': ('city', blocks.tower_c),
    'apartment': ('city', blocks.apartment),
    'shop_cafe': ('city', blocks.shop_cafe),
    'shop_books': ('city', blocks.shop_books),
    'shop_laundry': ('city', blocks.shop_laundry),
    'station': ('city', civic.station),
    'train': ('city', civic.train),
    'campus': ('city', civic.campus),
    'hospital': ('city', civic.hospital),
    'office': ('city', civic.office),
    'street_tree': ('city', street_tree),
    'traffic_light': ('city', street.traffic_light),
    'hydrant': ('city', hydrant),
    'newsstand': ('city', street.newsstand),
    'bench_city': ('city', street.bench_city),
    'bike_rack': ('city', street.bike_rack),
    'bus': ('city', street.bus),
    'taxi': ('city', street.taxi),
    'car': ('city', street.car),
    'skyline_far': ('city', street.skyline_far),
    'bridge_far': ('city', street.bridge_far),
    'shipyard': ('workplaces', work.shipyard),
    'newsroom': ('workplaces', work.newsroom),
    'aquarium_lab': ('workplaces', work.aquarium_lab),
    'workshop': ('workplaces', work.workshop),
    'hz_suitcase': ('hazards_city', hz.hz_suitcase),
    'hz_wet_sign': ('hazards_city', hz.hz_wet_sign),
    'hz_paper_stack': ('hazards_city', hz.hz_paper_stack),
    'hz_coffee_spill': ('hazards_city', hz.hz_coffee_spill),
    'hz_scooter': ('hazards_city', hz.hz_scooter),
    'hz_branch': ('hazards_city', hz.hz_branch),
    'hz_storm_puddle': ('hazards_city', hz.hz_storm_puddle),
    'hz_bin_tipped': ('hazards_city', hz.hz_bin_tipped),
    'sandbags': ('hazards_city', hz.sandbags),
}


def registry():
    return dict(REGISTRY)
