"""Marigold Bay town: the cobbled street tile, terraced houses, bakery, schools and fish market.

Buildings are authored in place on the street band: origin at (0, 0, 0) on the street
centre line, facade on Y = +3.5 facing -Y, base at Z = 0 (root extras: front, width, depth).
"""
import math
import random

import bmesh
from mathutils import Matrix

import _harbour_lib as L
from _harbour_lib import FRONT, GLOSS, MATTE, SATIN, box, cyl, ball, rod

Y0 = FRONT


# ============================================================================ street tile
def street_tile(k):
    rng = random.Random(11)
    grout = k.mat('Grout', '#a05a4e', MATTE)
    tones = [k.mat('Cobble', '#f4ae74', MATTE), k.mat('Cobble2', '#ec9470', MATTE), k.mat('Cobble3', '#f8c98c', MATTE)]
    kerb = k.mat('Kerb', '#fff4e2', SATIN)
    pave = k.mat('Paving', '#c8b3dd', MATTE)
    iron = k.mat('Iron', '#3b3550', GLOSS)
    parts = [box(k, 'Bed', (0, -1.25, -.13), (8, 9.5, .12), grout, 0)]
    # Cobble rows between the front kerb and the back kerb, running bond, 3 warm tones.
    bm = bmesh.new()
    y_lo, y_hi, rows = -5.66, 2.78, 11
    rd = (y_hi - y_lo) / rows
    for r in range(rows):
        cy = y_lo + rd * (r + .5)
        for a, b in L.periodic(L.wrap_rows(rng, -4., 4., .74, 1.12)):
            w = b - a - .08
            d = rd - .08 + rng.uniform(-.02, .02)
            h = rng.uniform(.12, .15)
            m4 = Matrix.Translation(((a + b) / 2, cy + rng.uniform(-.02, .02), -.1)) @ Matrix.Rotation(
                rng.uniform(-.03, .03), 4, 'Z')
            L.add_pillow(bm, m4, w, d, h, rng.choice((0, 0, 1, 1, 2)), inset=.09, corner=.36, crown=.45,
                         corner_seg=2)
    stones = L.mesh_object(k, 'Cobbles', bm, tones)
    L.clip_x(stones)
    parts.append(stones)
    # Raised back kerb + footpath of lilac paving slabs (the houses stand on its back edge).
    for i in range(8):
        x = -3.5 + i
        parts.append(box(k, 'Kerb', (x, 2.93, .04), (.985, .3, .3), kerb, .05, 1))
    for i in range(10):
        x = -3.6 + i * .8
        parts.append(box(k, 'Slab', (x, 3.25, .1), (.77, .5, .14), pave, .035, 1))
    parts.append(box(k, 'PathBed', (0, 3.25, 0), (8, .54, .12), grout, 0))
    # Low front kerb.
    for i in range(4):
        x = -3 + i * 2
        parts.append(box(k, 'FrontKerb', (x, -5.84, -.04), (1.98, .3, .16), kerb, .045, 1))
    parts.append(box(k, 'Verge', (0, -5.97, -.1), (8, .06, .1), grout, 0))
    # A gutter grate against the back kerb.
    parts.append(box(k, 'Grate', (2.1, 2.66, -.04), (.62, .26, .06), iron, .02, 1))
    for i in range(4):
        parts.append(box(k, 'GrateBar', (1.88 + i * .15, 2.66, -.005), (.05, .22, .04), grout, .01, 1))
    obj = L.finish(k, parts, 'street_tile', paint=dict(lo=-.25, hi=.25, shade=.72), sharp=65)
    obj['tile'] = 8.
    obj['surface'] = 0.
    return obj


# ============================================================================ house pieces
def house_mats(k, wall, trim, roof, accent, stone, flower, leaf='leaf'):
    m = L.mats(k, wall=('Wall', wall, .42), trim=('Trim', trim, GLOSS), roof=('Roof', roof, GLOSS),
               accent=('Accent', accent, GLOSS), stone=('Stone', stone, MATTE), flower=('Flower', flower, GLOSS),
               leaf=('Leaf', leaf, SATIN))
    m['glass'] = L.glass(k)
    return m


def body(k, m, W, H, D=5., pilasters=True, plinth=.55):
    parts = [box(k, 'Wall', (0, Y0 + D / 2, H / 2), (W, D, H), m['wall'], .1, 2),
             box(k, 'Plinth', (0, Y0 + .12, plinth / 2), (W + .06, .42, plinth), m['stone'], .06, 2)]
    if pilasters:
        for s in (-1, 1):
            parts.append(box(k, 'Pilaster', (s * (W / 2 - .12), Y0 - .02, (H + plinth) / 2 - .05),
                             (.26, .18, H - plinth - .1), m['trim'], .05, 1))
    return parts


def band(k, m, W, z, proud=.14, h=.16, mat=None):
    return [box(k, 'Band', (0, Y0 - proud / 2 + .04, z), (W + .08, proud + .08, h), mat or m['trim'], .04, 1)]


def cornice(k, m, W, z, depth=.42, mat=None, dentils=0):
    mat = mat or m['trim']
    parts = [box(k, 'Cornice', (0, Y0 - depth / 2 + .12, z), (W + .34, depth + .24, .24), mat, .07, 2),
             box(k, 'Moulding', (0, Y0 - .06, z - .19), (W + .12, .3, .12), mat, .04, 1)]
    if dentils:
        for i in range(dentils):
            x = -W / 2 + .3 + (W - .6) * i / (dentils - 1)
            parts.append(box(k, 'Dentil', (x, Y0 - .19, z - .33), (.14, .14, .14), mat, 0))
    return parts


def drainpipe(k, m, x, top, mat=None):
    mat = mat or m['roof']
    parts = [cyl(k, 'Pipe', (x, Y0 - .13, top / 2 + .05), .06, top - .1, mat, v=8, bevel=0),
             k.tbox('Hopper', (x, Y0 - .15, top + .02), (.3, .26), (.16, .16), .26, mat, bevel=.03, segments=1),
             box(k, 'Shoe', (x, Y0 - .24, .16), (.13, .22, .1), mat, .03, 1)]
    for z in (top * .3, top * .62):
        parts.append(box(k, 'Clip', (x, Y0 - .09, z), (.18, .1, .07), mat, 0))
    return parts


def chimney(k, m, x, y, z0, h, w=.72, d=.56, mat=None, pots=2):
    mat = mat or m['wall']
    parts = [box(k, 'Stack', (x, y, z0 + h / 2), (w, d, h), mat, .06, 1),
             box(k, 'StackBand', (x, y, z0 + h - .28), (w + .08, d + .08, .1), m['trim'], 0),
             box(k, 'StackCap', (x, y, z0 + h + .05), (w + .16, d + .16, .14), m['trim'], .04, 1)]
    for i in range(pots):
        px = x + (i - (pots - 1) / 2) * w * .44
        parts.append(L.pot(k, 'Pot', (px, y, z0 + h + .1), .12, .45, m['roof']))
    return parts


def slab(k, name, a, b, thick, depth, y, mat, bevel=.07, seg=2):
    """A roof slab from point a=(x, z) to b=(x, z) in the XZ plane, lifted on its outward side, depth along Y."""
    ax, az = a
    bx, bz = b
    L_ = math.hypot(bx - ax, bz - az)
    ang = math.atan2(bz - az, bx - ax)
    nx, nz = -math.sin(ang), math.cos(ang)
    if nz < 0:
        nx, nz = -nx, -nz
    cx, cz = (ax + bx) / 2 + nx * thick / 2, (az + bz) / 2 + nz * thick / 2
    return box(k, name, (cx, y, cz), (L_, depth, thick), mat, bevel, seg, rot=(0, -ang, 0))


def gable_roof_y(k, m, W, H, G, D, over=.35, eave=.32, thick=.24, courses=3):
    """Roof with its ridge along Y (gable end to the street): two slabs, bargeboards, ridge, courses."""
    parts = []
    half = W / 2
    ang = math.atan2(G, half)
    ex, ez = half + eave * math.cos(ang), H - eave * math.sin(ang)
    ydep = D + over + .2
    yc = Y0 + D / 2 - over / 2 + .1
    for s in (-1, 1):
        parts.append(slab(k, 'RoofSlab', (s * ex, ez), (s * -.02, H + G + .02), thick, ydep, yc, m['roof']))
        # Tile courses stepping down the slope (they give the roof edge a toy scalloped profile).
        for i in range(1, courses + 1):
            t = i / (courses + 1)
            px, pz = s * ex * (1 - t), ez + (H + G - ez) * t
            parts.append(slab(k, 'Course', (px + s * .2 * math.cos(ang), pz - .2 * math.sin(ang)),
                              (px - s * .14 * math.cos(ang), pz + .14 * math.sin(ang)), thick + .07, ydep, yc,
                              m['roof'], .04, seg=1))
        # Bargeboard along the front edge.
        bx0, bz0 = s * (ex + .02), ez - .05
        parts.append(slab(k, 'Barge', (bx0, bz0 - .12), (0, H + G - .12), .2, .14, Y0 - over + .02, m['trim'], .04))
    parts.append(cyl(k, 'Ridge', (0, yc, H + G + thick * .8), .14, ydep + .08, m['roof'], axis='Y', v=10, bevel=.04))
    return parts


# ============================================================================ houses
def house_a(k):
    """Coral townhouse with a front gable, teal roof, round attic window and flower boxes."""
    W, H, G, D = 4.6, 5.2, 2.2, 5.
    m = house_mats(k, 'coral', 'white', 'teal', 'marigold', 'stone', 'berry')
    parts = body(k, m, W, H, D)
    parts.append(k.prism('Gable', [(-W / 2, H - .02), (W / 2, H - .02), (0, H + G)], D, m['wall'],
                         loc=(0, Y0 + D / 2, 0), bevel=.06))
    parts += band(k, m, W, 2.9)
    parts += band(k, m, W, H + .02, .2, .2)
    parts += gable_roof_y(k, m, W, H, G, D)
    # Round attic window.
    zc = H + G * .42
    parts.append(k.torus('Porthole', (0, Y0 - .06, zc), .42, .09, m['trim'], rot=(math.pi / 2, 0, 0), major_seg=16,
                         minor_seg=5))
    parts.append(cyl(k, 'AtticGlass', (0, Y0 - .02, zc), .4, .06, m['glass'], axis='Y', v=20, bevel=0))
    parts.append(box(k, 'AtticBar', (0, Y0 - .06, zc), (.05, .04, .8), m['trim'], .012))
    parts.append(box(k, 'AtticBar', (0, Y0 - .06, zc), (.8, .04, .05), m['trim'], .012))
    # Finial.
    parts.append(ball(k, 'Finial', (0, Y0 - .3, H + G + .5), .13, m['accent'], 10, 6))
    parts.append(cyl(k, 'FinialPost', (0, Y0 - .3, H + G + .3), .05, .3, m['trim'], v=8))
    # Ground floor: door left, window right.
    parts += L.door(k, m, -1.15, 1.0, 2.1, steps=2, canopy=False)
    parts += L.window(k, m, 1.05, 1.55, 1.2, 1.25, style='grid', shutters=False, flowers=True)
    # First floor.
    for x in (-1.1, 1.1):
        parts += L.window(k, m, x, 4.0, .92, 1.3, style='sash', flowers=True)
    parts += drainpipe(k, m, W / 2 - .34, H - .1)
    parts += chimney(k, m, -1.35, Y0 + 3.2, H + .6, 1.7)
    parts.append(box(k, 'Number', (-1.15, Y0 - .13, 2.78 + .12), (.26, .04, .18), m['accent'], .02))
    return L.finish(k, parts, 'house_a', front=Y0, width=W, depth=D)


def house_b(k):
    """Marigold house with a crow-stepped gable, teal shutters and a fish weathervane."""
    W, H, D = 4.2, 5.3, 5.
    m = house_mats(k, '#ffb627', 'white', '#d9442c', 'teal', 'stone', 'berry')
    parts = body(k, m, W, H, D)
    # Stepped gable facade (4 steps per side) and cap stones.
    steps = 4
    sw, sh = .42, .58
    prof = [(-W / 2, H - .02), (W / 2, H - .02)]
    right = []
    x, z = W / 2, H - .02
    for i in range(steps):
        z += sh
        right.append((x, z))
        x -= sw
        right.append((x, z))
    top_z = z + sh
    prof += right[:-1] + [(right[-1][0], top_z)]
    left = [(-px, pz) for px, pz in reversed(right)]
    prof += [(-right[-1][0], top_z)] + left[1:]
    parts.append(k.prism('StepGable', prof, .5, m['wall'], loc=(0, Y0 + .25, 0), bevel=.05))
    x, z = W / 2, H
    for i in range(steps):
        z += sh
        for s in (-1, 1):
            parts.append(box(k, 'CapStone', (s * (x - sw / 2 + .02), Y0 + .25, z + .05), (sw + .12, .62, .12),
                             m['trim'], .035, 1))
        x -= sw
    parts.append(box(k, 'TopCap', (0, Y0 + .25, top_z + .06), (x * 2 + .14, .64, .14), m['trim'], .04, 1))
    # Roof behind the gable (ridge along Y), hidden steps give it depth from the street.
    G = top_z - H - .4
    parts += [slab(k, 'RoofSlab', (s * (W / 2 + .1), H - .05), (0, H + G), .24, D - .3, Y0 + D / 2 + .3, m['roof'])
              for s in (-1, 1)]
    # Gable windows: arched window and a round vent.
    parts += L.window(k, m, 0, H + 1.05, .8, 1.05, arch=True, style='cross', sill=True)
    parts.append(k.torus('Vent', (0, Y0 - .05, top_z - .45), .2, .06, m['trim'], rot=(math.pi / 2, 0, 0),
                         major_seg=12, minor_seg=4))
    parts.append(cyl(k, 'VentGlass', (0, Y0 - .02, top_z - .45), .19, .05, m['glass'], axis='Y', v=16, bevel=0))
    # Fish weathervane on the top cap.
    vz = top_z + .12
    parts.append(rod(k, 'VaneRod', (0, Y0 + .25, vz), (0, Y0 + .25, vz + 1.0), .03, m['roof']))
    fish = [(-.36, 0), (-.1, .13), (.16, .12), (.3, .0), (.16, -.12), (-.1, -.13)]
    parts.append(k.prism('VaneFish', [(x_, z_ + vz + .78) for x_, z_ in fish], .04, m['accent'],
                         loc=(0, Y0 + .25, 0), bevel=.01))
    parts.append(k.prism('VaneTail', [(.28, vz + .78), (.46, vz + .92), (.46, vz + .64)], .04, m['accent'],
                         loc=(0, Y0 + .25, 0), bevel=.01))
    parts.append(ball(k, 'VaneBall', (0, Y0 + .25, vz + .5), .07, m['trim'], 8, 5))
    # Ground floor: window left, door right with a little tiled canopy.
    parts += L.door(k, m, .95, 1.0, 2.1, steps=2, canopy=True)
    parts += L.window(k, m, -.95, 1.55, 1.1, 1.25, style='grid', flowers=True)
    parts += band(k, m, W, 2.95)
    for x in (-1.0, 1.0):
        parts += L.window(k, m, x, 4.1, .82, 1.3, style='sash', shutters=True)
    parts += cornice(k, m, W, H - .02, .3)
    parts += drainpipe(k, m, -W / 2 + .3, H - .2)
    parts += chimney(k, m, 1.2, Y0 + 3.6, H + .5, 2.3, mat=m['roof'])
    return L.finish(k, parts, 'house_b', front=Y0, width=W, depth=D)


def house_c(k):
    """Teal corner shop with a navy mansard roof, dormers, striped awning and a hanging fish sign."""
    W, H, D = 5.2, 4.9, 5.
    m = house_mats(k, '#12a5b8', '#fff4e2', '#2c3f7c', 'coral', 'stone', '#ffd84a')
    parts = body(k, m, W, H, D)
    # Mansard: steep front slope with tile courses, flat top, dormers.
    mh = 1.75
    parts.append(k.tbox('Mansard', (0, Y0 + D / 2, H + mh / 2), (W - 1.1, D - 1.1), (W + .3, D + .3), mh, m['roof'],
                        bevel=.09, segments=2))
    for i in range(4):
        t = (i + .5) / 4
        z = H + mh * t - .1
        inset = .55 * t
        parts.append(box(k, 'Course', (0, Y0 - .15 + inset + .05, z), (W + .3 - 2 * inset, .12, .1), m['roof'], .03))
    parts.append(box(k, 'MansardTop', (0, Y0 + D / 2, H + mh + .06), (W - .9, D - .9, .16), m['trim'], .05, 1))
    for i in range(7):
        x = -(W - 1.3) / 2 + (W - 1.3) * i / 6
        parts.append(ball(k, 'Cresting', (x, Y0 + .45, H + mh + .22), .08, m['trim'], 6, 4))
    for x in (-1.25, 1.25):
        dz = H + .9
        parts.append(box(k, 'Dormer', (x, Y0 + .3, dz), (1.05, .9, 1.25), m['wall'], .06, 2))
        parts.append(k.prism('DormerRoof', [(-.7, 0), (.7, 0), (0, .5)], 1.05, m['roof'], loc=(x, Y0 + .32, dz + .62),
                             bevel=.05))
        parts += L.window(k, m, x, dz - .02, .56, .78, y=Y0 - .15, style='cross', sill=False, border=.09)
    parts += cornice(k, m, W, H - .02, .38, dentils=9)
    # Shop front: big display window, glazed door, awning, fascia board.
    parts.append(box(k, 'ShopFront', (0, Y0 - .04, 1.55), (W - .6, .1, 2.6), m['accent'], .05, 2))
    parts += L.window(k, m, -.72, 1.45, 2.3, 1.55, y=Y0 - .09, style='grid', border=.1, sill=True)
    parts += L.door(k, m, 1.55, .95, 2.1, y=Y0 - .09, steps=1, glass_top=True, panels=False)
    parts.append(plate(k, 'DoorGlass', 1.55, .16 + 1.02, .6, .9, Y0 - .15, m['glass']))
    parts.append(box(k, 'Fascia', (0, Y0 - .16, 2.96), (W - .5, .14, .42), m['trim'], .05, 2))
    for i in range(4):
        parts.append(ball(k, 'FasciaDot', (-1.2 + i * .8, Y0 - .24, 2.96), .08, m['accent'], 6, 4))
    parts += L.awning(k, -.35, 3.4, 2.72, Y0 - .2, 1.05, .55, m['accent'], m['trim'], n=7, frame_mat=m['roof'])
    # Hanging fish sign on a wrought bracket (perpendicular to the facade).
    sx = 2.35
    parts.append(rod(k, 'SignArm', (sx, Y0 - .05, 3.55), (sx, Y0 - 1.0, 3.55), .035, m['roof']))
    parts.append(rod(k, 'SignStay', (sx, Y0 - .05, 3.15), (sx, Y0 - .7, 3.55), .025, m['roof']))
    parts.append(k.prism('SignDisc', L.circle(.36, 16, 0, 3.02), .08, m['trim'], loc=(sx, Y0 - .7, 0), axis='X',
                         bevel=0))
    fish = [(-.24, 3.02), (-.02, 3.14), (.16, 3.1), (.26, 3.02), (.16, 2.94), (-.02, 2.9)]
    parts.append(k.prism('SignFish', [(y_ - 0, z_) for y_, z_ in fish], .12, m['accent'], loc=(sx, Y0 - .7, 0),
                         axis='X', bevel=.015))
    parts.append(k.prism('SignTail', [(-.2, 3.02), (-.36, 3.14), (-.36, 2.9)], .12, m['accent'], loc=(sx, Y0 - .7, 0),
                         axis='X', bevel=.015))
    for yy in (-.52, -.88):
        parts.append(rod(k, 'SignChain', (sx, Y0 + yy - .0, 3.55), (sx, Y0 + yy, 3.36), .015, m['roof']))
    # First floor windows with keystones.
    for x in (-1.3, 1.3):
        parts += L.window(k, m, x, 3.95, .95, 1.25, style='sash', lintel=True, flowers=x < 0)
    parts += drainpipe(k, m, -W / 2 + .32, H - .15)
    parts += chimney(k, m, 1.7, Y0 + 3.3, H + 1.2, 1.3, mat=m['wall'])
    return L.finish(k, parts, 'house_c', front=Y0, width=W, depth=D)


def plate(k, name, x, z, w, h, y, mat):
    return box(k, name, (x, y, z), (w, .03, h), mat, 0)


def house_d(k):
    """Pink flat-roofed house with a balustraded parapet, a French balcony and a rooftop aerial."""
    W, H, D = 4.8, 5.6, 5.
    m = house_mats(k, '#ff7aa2', 'white', '#e0764a', '#0b6e8a', 'stone', '#ffd84a')
    parts = body(k, m, W, H, D)
    parts += band(k, m, W, 3.0)
    parts += cornice(k, m, W, H - .02, .36)
    # Parapet: base rail, balusters, top rail and corner piers with ball finials.
    pz = H + .12
    parts.append(box(k, 'ParapetBase', (0, Y0 + .02, pz + .06), (W - .1, .36, .14), m['trim'], .04, 1))
    parts.append(box(k, 'ParapetTop', (0, Y0 + .02, pz + .64), (W - .1, .4, .14), m['trim'], .04, 2))
    for i in range(8):
        x = -W / 2 + .75 + (W - 1.5) * i / 7
        parts.append(k.lathe('Baluster', [(.08, 0), (.055, .22), (.1, .36), (.07, .5)],
                             m['trim'], loc=(x, Y0 + .02, pz + .09), segments=6))
    for s in (-1, 1):
        parts.append(box(k, 'Pier', (s * (W / 2 - .2), Y0 + .02, pz + .38), (.4, .42, .76), m['wall'], .05, 2))
        parts.append(box(k, 'PierCap', (s * (W / 2 - .2), Y0 + .02, pz + .8), (.5, .5, .1), m['trim'], .03, 1))
        parts.append(ball(k, 'PierBall', (s * (W / 2 - .2), Y0 + .02, pz + 1.0), .17, m['roof'], 8, 5))
    # Back parapet (so the roof reads as a real roof from any angle) and roof deck details.
    parts.append(box(k, 'BackParapet', (0, Y0 + D - .15, pz + .3), (W, .3, .6), m['wall'], .05, 1))
    for s in (-1, 1):
        parts.append(box(k, 'SideParapet', (s * (W / 2 - .15), Y0 + D / 2 + .2, pz + .3), (.3, D - .4, .6), m['wall'],
                         .05, 1))
    parts += chimney(k, m, -1.3, Y0 + 3.6, H, 1.6, w=.9, pots=3)
    parts.append(rod(k, 'Aerial', (1.3, Y0 + 3.4, H), (1.3, Y0 + 3.4, H + 2.1), .03, m['accent']))
    for i, wd in enumerate((.9, .7, .5)):
        parts.append(rod(k, 'AerialBar', (1.3 - wd / 2, Y0 + 3.4, H + 1.4 + i * .25),
                         (1.3 + wd / 2, Y0 + 3.4, H + 1.4 + i * .25), .02, m['accent']))
    parts.append(box(k, 'Skylight', (.2, Y0 + 3.0, H + .25), (1.0, .8, .4), m['trim'], .05, 1))
    # Ground floor: central door with a fanlight, two windows.
    parts += L.door(k, m, 0, 1.05, 2.15, steps=2, arch=True)
    for x in (-1.5, 1.5):
        parts += L.window(k, m, x, 1.6, .85, 1.3, style='sash', flowers=True)
    # First floor: three tall windows, the middle one with a French balcony.
    for x in (-1.5, 0, 1.5):
        parts += L.window(k, m, x, 4.25, .78, 1.55, style='sash', lintel=True)
    by = Y0 - .45
    parts.append(box(k, 'Balcony', (0, Y0 - .22, 3.38), (1.5, .52, .12), m['trim'], .04, 1))
    parts.append(rod(k, 'Rail', (-.72, by, 4.05), (.72, by, 4.05), .035, m['accent']))
    for i in range(7):
        x = -.66 + i * .22
        parts.append(rod(k, 'Spindle', (x, by, 3.45), (x, by, 4.05), .02, m['accent']))
    parts.append(ball(k, 'Plant', (-.45, by + .12, 3.62), (.22, .16, .2), m['leaf'], 8, 5))
    parts.append(ball(k, 'Plant', (.48, by + .12, 3.6), (.18, .15, .17), m['leaf'], 8, 5))
    for x in (-.45, .5):
        parts.append(ball(k, 'Bloom', (x, by - .06, 3.72), .07, m['flower'], 8, 5))
    parts += drainpipe(k, m, W / 2 - .33, H - .1)
    return L.finish(k, parts, 'house_d', front=Y0, width=W, depth=D)


# ============================================================================ bakery
def bakery(k):
    """Mint bakery with a bell gable, berry/cream striped awning, bread display and a chalkboard.
    Eight materials: the slate 'Stone' doubles as the chalkboard, berry 'Roof' as the blooms."""
    W, H, D = 5.4, 4.9, 5.
    m = house_mats(k, '#3fcf9a', '#fff4e2', '#e8416f', '#ffb627', '#4a4466', 'coral')
    m['bread'] = k.mat('Bread', '#d9822f', SATIN)
    m['board'] = m['stone']
    m['flower'] = m['roof']
    parts = body(k, m, W, H, D)
    # Bell-shaped gable: S-curves up to a rounded top.
    prof = [(-W / 2 + .1, H - .02), (W / 2 - .1, H - .02)]
    right = []
    for i in range(9):
        t = i / 8
        x = (W / 2 - .1) - (W / 2 - .95) * (math.sin(t * math.pi / 2) ** 1.4)
        z = H + .05 + 1.3 * (t - math.sin(t * math.tau) * .12)
        right.append((x, z))
    top = []
    for i in range(1, 8):
        a = i / 8 * math.pi
        top.append((.85 * math.cos(a), right[-1][1] + .75 * math.sin(a)))
    prof += right[1:] + top + [(-x, z) for x, z in reversed(right[1:])]
    parts.append(k.prism('BellGable', prof, .45, m['wall'], loc=(0, Y0 + .22, 0), bevel=.05))
    trim_top = [(x * 1.03, z + .08) for x, z in right[1:] + top + [(-x, z) for x, z in reversed(right[1:])]]
    parts.append(L.rod(k, 'GableTrim0', (trim_top[0][0], Y0 - .02, trim_top[0][1]),
                       (trim_top[1][0], Y0 - .02, trim_top[1][1]), .07, m['trim']))
    parts.append(L.tube(k, 'GableTrim', [(x, Y0 - .02, z) for x, z in trim_top], .08, m['trim']))
    G = right[-1][1] + .75 - H - .3
    parts += [slab(k, 'RoofSlab', (s * (W / 2 + .1), H - .05), (0, H + G), .24, D - .4, Y0 + D / 2 + .35, m['roof'])
              for s in (-1, 1)]
    # Gable: round window with a wheat-sheaf (loaf) emblem above.
    zc = H + 1.1
    parts.append(k.torus('Porthole', (0, Y0 - .06, zc), .36, .08, m['trim'], rot=(math.pi / 2, 0, 0), major_seg=16,
                         minor_seg=5))
    parts.append(cyl(k, 'AtticGlass', (0, Y0 - .02, zc), .34, .06, m['glass'], axis='Y', v=18, bevel=0))
    parts.append(ball(k, 'Emblem', (0, Y0 - .06, zc + .72), (.3, .1, .16), m['bread'], 10, 5))
    for x in (-.12, 0, .12):
        parts.append(box(k, 'Score', (x, Y0 - .15, zc + .76), (.04, .03, .14), m['trim'], 0, rot=(0, .5, 0)))
    parts += cornice(k, m, W, H - .02, .38, dentils=10)
    # Upper floor.
    for x in (-1.35, 1.35):
        parts += L.window(k, m, x, 3.95, .9, 1.25, style='sash', lintel=True, lite=True)
    parts += L.flower_box(k, m, 0, 3.55, .9, Y0 - .1)
    parts.append(box(k, 'Fascia', (0, Y0 - .12, 3.0), (W - .4, .12, .44), m['accent'], .05, 2))
    for i in range(6):
        parts.append(k.prism('FasciaLoaf', [(-.14, -.05), (.14, -.05), (.1, .05), (-.1, .05)], .05, m['trim'],
                             loc=(-1.75 + i * .7, Y0 - .2, 3.0), bevel=0))
    # Shop window: a deep display bay with shelves of bread in front of the glass.
    bx, bw, bh, bz = -.75, 2.6, 1.5, 1.45
    parts.append(box(k, 'Bay', (bx, Y0 - .06, .62), (bw + .5, .7, .5), m['accent'], .06, 2))
    parts.append(box(k, 'BaySill', (bx, Y0 - .2, .92), (bw + .6, .82, .1), m['trim'], .04, 1))
    parts += L.window(k, m, bx, bz + .05, bw, bh - .15, y=Y0 - .12, style='cross', sill=False, border=.12)
    parts.append(box(k, 'Shelf', (bx, Y0 - .38, 1.62), (bw, .3, .06), m['trim'], .02, 1))
    rng = random.Random(3)
    for i in range(5):
        x = bx - bw / 2 + .3 + i * .5
        parts.append(ball(k, 'Loaf', (x, Y0 - .4, 1.07), (.19, .14, .12), m['bread'], 8, 4))
        parts.append(box(k, 'Slash', (x, Y0 - .5, 1.14), (.05, .04, .12), m['trim'], 0, rot=(0, .6, 0)))
    for i in range(3):
        x = bx - .8 + i * .8
        parts.append(ball(k, 'Baguette', (x, Y0 - .4, 1.75), (.32, .075, .075), m['bread'], 8, 4, rot=(0, -.15, 0)))
    parts += L.door(k, m, 1.75, 1.0, 2.1, steps=1, glass_top=True)
    parts += L.awning(k, -.1, W - .5, 2.72, Y0 - .1, 1.2, .6, m['roof'], m['trim'], n=7, frame_mat=m['accent'])
    # Chalkboard A-frame on the pavement with a loaf pictogram.
    cx, cy = .55, Y0 - .6
    for s in (-1, 1):
        parts.append(box(k, 'ChalkFrame', (cx, cy + s * .14, .5), (.62, .06, .98), m['accent'], .02, 1,
                         rot=(s * .16, 0, 0)))
    parts.append(box(k, 'ChalkBoard', (cx, cy - .19, .55), (.5, .03, .72), m['board'], .01, 1, rot=(-.16, 0, 0)))
    parts.append(k.prism('ChalkLoaf', [(-.14, -.04), (.14, -.04), (.11, .05), (-.11, .05)], .02, m['trim'],
                         loc=(cx, cy - .21, .72), bevel=.005, rot=(-.16, 0, 0)))
    for i, w in enumerate((.3, .22, .26)):
        parts.append(box(k, 'ChalkLine', (cx, cy - .205 + i * .012, .52 - i * .1), (w, .02, .03), m['trim'], 0,
                         rot=(-.16, 0, 0)))
    parts += drainpipe(k, m, W / 2 - .3, H - .15, mat=m['accent'])
    parts += chimney(k, m, -1.6, Y0 + 3.4, H + .8, 1.6, mat=m['roof'])
    return L.finish(k, parts, 'bakery', front=Y0, width=W, depth=D)


# ============================================================================ schools
def _hip_roof(k, m, W, D, H, rise, over=.4, y=None):
    y = Y0 + D / 2 if y is None else y
    parts = [k.tbox('Hip', (0, y, H + rise / 2), (W * .55, .3), (W + 2 * over, D + 2 * over), rise, m['roof'],
                    bevel=.1, segments=2)]
    return parts


def school(k):
    """Primary school: coral brick, big grid windows, clock pediment, bell cupola, steps."""
    W, H, D = 10., 6.2, 6.
    m = L.mats(k, wall=('Brick', '#e5654a', .5), trim=('Trim', '#fff4e2', GLOSS), roof=('Roof', '#1f8fa6', GLOSS),
               accent=('Accent', '#23407a', GLOSS), stone=('Stone', '#c8b8dc', MATTE), bell=('Bell', 'brass', .3, .7),
               leaf=('Leaf', 'leaf', SATIN), flower=('Flower', 'marigold', GLOSS))
    m['glass'] = L.glass(k)
    parts = body(k, m, W, H, D, plinth=.7)
    parts += band(k, m, W, 3.15, .16, .2)
    parts += cornice(k, m, W, H, .45, dentils=12)
    parts += _hip_roof(k, m, W, D, H + .12, 2.0)
    # Central entrance bay with pediment and clock.
    bw = 3.4
    parts.append(box(k, 'Bay', (0, Y0 - .2, (H + .5) / 2), (bw, .5, H + .5), m['wall'], .08, 2))
    parts.append(k.prism('Pediment', [(-bw / 2 - .3, 0), (bw / 2 + .3, 0), (0, 1.35)], .7, m['trim'],
                         loc=(0, Y0 - .15, H + .45), bevel=.06))
    parts.append(k.prism('PedimentFace', [(-bw / 2 + .1, 0), (bw / 2 - .1, 0), (0, 1.0)], .7, m['wall'],
                         loc=(0, Y0 - .19, H + .6), bevel=.04))
    cz = H + 1.0
    parts.append(k.torus('ClockRim', (0, Y0 - .6, cz), .5, .08, m['accent'], rot=(math.pi / 2, 0, 0), major_seg=20,
                         minor_seg=4))
    parts.append(cyl(k, 'ClockFace', (0, Y0 - .56, cz), .5, .08, m['trim'], axis='Y', v=20, bevel=0))
    for i in range(4):
        a = i / 4 * math.tau
        parts.append(box(k, 'Tick', (math.sin(a) * .37, Y0 - .62, cz + math.cos(a) * .37), (.07, .02, .16),
                         m['accent'], 0, rot=(0, a, 0)))
    parts.append(box(k, 'HandH', (.1, Y0 - .64, cz + .06), (.05, .02, .26), m['accent'], 0, rot=(0, math.radians(50), 0)))
    parts.append(box(k, 'HandM', (-.02, Y0 - .66, cz + .16), (.04, .02, .34), m['accent'], 0, rot=(0, math.radians(-8), 0)))
    parts.append(ball(k, 'Hub', (0, Y0 - .68, cz), .05, m['bell'], 6, 4))
    # Bell cupola on the ridge.
    cy_ = Y0 + D / 2
    rz = H + 2.1
    parts.append(box(k, 'CupolaBase', (0, cy_, rz + .1), (1.3, 1.3, .7), m['trim'], .06, 1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(k, 'CupolaPost', (sx * .48, cy_ + sy * .48, rz + .9), (.2, .2, 1.0), m['trim'], .04, 1))
    parts.append(ball(k, 'Bell', (0, cy_, rz + .88), (.3, .3, .34), m['bell'], 10, 6))
    parts.append(cyl(k, 'BellLip', (0, cy_, rz + .64), .34, .1, m['bell'], v=10, bevel=0))
    parts.append(box(k, 'CupolaCap', (0, cy_, rz + 1.45), (1.45, 1.45, .14), m['trim'], .04, 1))
    parts.append(k.tbox('CupolaRoof', (0, cy_, rz + 1.9), (.06, .06), (1.35, 1.35), .8, m['roof'], bevel=.04,
                        segments=1))
    parts.append(ball(k, 'CupolaBall', (0, cy_, rz + 2.4), .12, m['bell'], 6, 4))
    parts.append(rod(k, 'Spire', (0, cy_, rz + 2.3), (0, cy_, rz + 2.9), .03, m['bell']))
    # Entrance: double door, arched fanlight, steps.
    parts += L.door(k, m, 0, 1.6, 2.35, y=Y0 - .45, steps=3, arch=True, glass_top=True)
    parts.append(box(k, 'DoorSplit', (0, Y0 - .5, 1.3), (.05, .05, 1.8), m['trim'], .01))
    parts += L.window(k, m, 0, 4.55, 1.3, 1.5, y=Y0 - .45, style='grid', arch=True)
    # Big classroom windows in the wings.
    for x in (-3.55, -2.0, 2.0, 3.55):
        parts += L.window(k, m, x, 1.95, 1.15, 1.8, style='grid', lintel=True, lite=True)
        parts += L.window(k, m, x, 4.6, 1.15, 1.7, style='grid', lite=True)
    # Name board (no text) and railings.
    parts.append(box(k, 'NameBoard', (0, Y0 - .5, 3.45), (2.4, .1, .4), m['accent'], .05, 1))
    for i in range(3):
        parts.append(k.prism('Star', L.star(.13, .055), .04, m['bell'], loc=(-.7 + i * .7, Y0 - .57, 3.45), bevel=0))
    for s in (-1, 1):
        parts.append(rod(k, 'HandRail', (s * 1.0, Y0 - 1.4, .9), (s * 1.0, Y0 - .5, 1.2), .035, m['accent']))
        parts.append(rod(k, 'RailPost', (s * 1.0, Y0 - 1.4, 0), (s * 1.0, Y0 - 1.4, .9), .035, m['accent']))
        # Round topiary shrubs in tubs either side of the steps.
        parts.append(cyl(k, 'Tub', (s * 1.75, Y0 - .45, .25), .32, .5, m['accent'], v=10, bevel=0, r2=.26))
        parts.append(ball(k, 'Shrub', (s * 1.75, Y0 - .45, .85), .42, m['leaf'], 10, 6))
    parts += drainpipe(k, m, -W / 2 + .35, H - .1, mat=m['accent'])
    parts += drainpipe(k, m, W / 2 - .35, H - .1, mat=m['accent'])
    parts += chimney(k, m, -3.2, Y0 + 4.2, H + .8, 2.0, pots=1)
    parts += chimney(k, m, 3.2, Y0 + 4.2, H + .8, 2.0, pots=1)
    return L.finish(k, parts, 'school', front=Y0 - 1.6, width=W, depth=D)


def high_school(k):
    """High school: 12 m brick block, columned porch, wide steps, flag pole."""
    W, H, D = 12., 8.4, 7.
    m = L.mats(k, wall=('Brick', '#e0764a', .5), trim=('Trim', '#fff4e2', GLOSS), roof=('Roof', '#2c3f7c', GLOSS),
               accent=('Accent', '#12a5b8', GLOSS), stone=('Stone', '#c8b8dc', MATTE), flag=('Flag', 'marigold', SATIN),
               metal=('Metal', 'steel', .3, .6), leaf=('Leaf', 'leaf', SATIN))
    m['glass'] = L.glass(k)
    parts = body(k, m, W, H, D, plinth=.8)
    for z in (3.0, 5.7):
        parts += band(k, m, W, z, .14, .18)
    parts += cornice(k, m, W, H, .5, dentils=10)
    parts.append(box(k, 'Attic', (0, Y0 + .3, H + .5), (W - .4, .6, .8), m['wall'], .06, 1))
    parts.append(box(k, 'AtticCap', (0, Y0 + .3, H + .95), (W - .2, .8, .16), m['trim'], .04, 1))
    parts += _hip_roof(k, m, W - .6, D - 1, H + .1, 1.6, over=.1, y=Y0 + D / 2 + .5)
    # Columned porch and entablature.
    pw = 4.6
    for i in range(4):
        x = -pw / 2 + .35 + i * (pw - .7) / 3
        parts.append(cyl(k, 'Column', (x, Y0 - 1.3, 2.3), .2, 3.6, m['trim'], v=10, bevel=.03))
        parts.append(box(k, 'Capital', (x, Y0 - 1.3, 4.18), (.56, .56, .2), m['trim'], 0))
        parts.append(box(k, 'Base', (x, Y0 - 1.3, .58), (.5, .5, .16), m['trim'], 0))
    parts.append(box(k, 'Entablature', (0, Y0 - .75, 4.55), (pw + .5, 1.6, .6), m['trim'], .06, 1))
    parts.append(k.prism('Pediment', [(-pw / 2 - .25, 0), (pw / 2 + .25, 0), (0, 1.1)], 1.5, m['trim'],
                         loc=(0, Y0 - .8, 4.85), bevel=.06))
    parts.append(k.prism('Tympanum', [(-pw / 2 + .2, 0), (pw / 2 - .2, 0), (0, .8)], 1.5, m['accent'],
                         loc=(0, Y0 - .84, 4.98), bevel=.04))
    parts.append(L.rod(k, 'Frieze', (-pw / 2 - .1, Y0 - 1.58, 4.4), (pw / 2 + .1, Y0 - 1.58, 4.4), .05, m['accent']))
    # Wide steps.
    for i in range(3):
        d = 2.1 - i * .5
        parts.append(box(k, 'Step', (0, Y0 - d / 2 + .1, .08 + i * .16), (pw + 1.4 - i * .3, d, .16), m['stone'],
                         .035, 1))
    parts.append(box(k, 'Porch', (0, Y0 - .6, .5), (pw + .6, 1.4, .1), m['stone'], .03, 1))
    parts += L.door(k, m, 0, 1.8, 2.4, y=Y0, z0=.55, steps=0, arch=True)
    parts.append(box(k, 'DoorSplit', (0, Y0 - .05, 1.5), (.05, .05, 1.8), m['trim'], .01))
    # Three rows of windows.
    for x in (-4.9, -3.6, 3.6, 4.9):
        parts += L.window(k, m, x, 1.95, .95, 1.55, style='grid', lintel=True, lite=True)
    for x in (-4.9, -3.6, -1.6, 0, 1.6, 3.6, 4.9):
        parts += L.window(k, m, x, 4.35, .95, 1.55, style='sash', lite=True)
        parts += L.window(k, m, x, 7.0, .95, 1.4, style='sash', sill=True, lite=True)
    for x in (-2.2, 2.2):
        parts += L.window(k, m, x, 1.95, .7, 1.4, style='cross', lite=True)
    # Flag pole with a marigold flag and a teal star.
    fx, fy = -6.9, Y0 - .6
    parts.append(cyl(k, 'PoleBase', (fx, fy, .2), .3, .4, m['stone'], v=12, bevel=.05))
    parts.append(cyl(k, 'Pole', (fx, fy, 4.3), .06, 8.0, m['trim'], v=10, bevel=0))
    parts.append(ball(k, 'PoleTop', (fx, fy, 8.36), .12, m['flag'], 10, 6))
    wave = []
    for i in range(7):
        t = i / 6
        wave.append((fx - .08 - 1.6 * t, fy + math.sin(t * math.pi * 1.5) * .12))  # flies away from the building
    bm = bmesh.new()
    top_v = [bm.verts.new((x, y, 8.1 - t * .06)) for (x, y), t in zip(wave, [i / 6 for i in range(7)])]
    bot_v = [bm.verts.new((x, y, 7.1 + t * .06)) for (x, y), t in zip(wave, [i / 6 for i in range(7)])]
    for i in range(6):
        bm.faces.new((bot_v[i], bot_v[i + 1], top_v[i + 1], top_v[i]))
    flag = L.mesh_object(k, 'Flag', bm, [m['flag']])
    mod = flag.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = .04
    k._apply_mods(flag)
    parts.append(flag)
    parts.append(k.prism('FlagStar', L.star(.26, .11), .07, m['accent'], loc=(fx - .85, fy + .02, 7.6), bevel=0))
    for s in (-1, 1):
        parts.append(ball(k, 'Hedge', (s * 4.2, Y0 - .5, .45), (1.5, .45, .5), m['leaf'], 10, 5))
    parts += drainpipe(k, m, -W / 2 + .4, H - .1, mat=m['accent'])
    parts += drainpipe(k, m, W / 2 - .4, H - .1, mat=m['accent'])
    return L.finish(k, parts, 'high_school', front=Y0 - 2.0, width=W, depth=D)


# ============================================================================ fish market
def fish_market(k):
    """Open fish stall: striped canopy, fish crates on crushed ice, hanging scales, price board."""
    m = L.mats(k, wood=('Wood', 'wood', SATIN), canopy=('Canopy', 'teal', SATIN), cream=('Trim', 'white', GLOSS),
               ice=('Ice', '#dff6ff', .15), fish=('Fish', '#8fb7e6', GLOSS), fish2=('Fish2', '#ff8a6a', GLOSS),
               metal=('Brass', 'brass', .3, .6), board=('Board', '#23407a', GLOSS))
    parts = []
    W, Dp = 4.0, 2.2
    # Posts and the striped canopy.
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(k, 'Post', (sx * (W / 2 - .12), sy * (Dp / 2 - .12), 1.3), (.16, .16, 2.6), m['wood'], .03))
    parts += L.awning(k, 0, W + .3, 2.95, Dp / 2 + .2, Dp + .5, .45, m['canopy'], m['cream'], n=9)
    parts.append(box(k, 'Ridge', (0, Dp / 2 + .1, 3.0), (W + .3, .3, .16), m['canopy'], .04, 1))
    # Counter: sloped display with ice and crates.
    parts.append(box(k, 'Counter', (0, -.35, .45), (W - .2, 1.1, .9), m['canopy'], .05, 2))
    for i in range(6):
        parts.append(box(k, 'Plank', (-(W - .2) / 2 + .34 + i * .66, -.92, .45), (.56, .04, .76), m['cream'], .02, 1))
        parts.append(ball(k, 'PlankFish', (-(W - .2) / 2 + .34 + i * .66, -.95, .47), (.14, .02, .07),
                          m['fish2'] if i % 2 else m['fish'], 8, 4))
    parts.append(box(k, 'IceBed', (0, -.35, .95), (W - .3, 1.05, .14), m['ice'], .06, 2))
    rng = random.Random(5)
    for i in range(3):
        cx = -1.25 + i * 1.25
        parts.append(box(k, 'Crate', (cx, -.35, 1.08), (1.1, .9, .22), m['wood'], .03, 1))
        parts.append(box(k, 'CrateIce', (cx, -.35, 1.19), (.96, .76, .06), m['ice'], .02, 1))
        for j in range(3):
            fx = cx - .3 + j * .3
            fm = m['fish2'] if (i + j) % 3 == 1 else m['fish']
            parts.append(ball(k, 'Fish', (fx, -.35 + rng.uniform(-.06, .06), 1.27), (.1, .3, .07), fm, 10, 6,
                              rot=(0, 0, rng.uniform(-.3, .3))))
            parts.append(k.prism('Tail', [(0, 0), (-.09, .14), (.09, .14)], .03, fm,
                                 loc=(fx, -.35 + .26, 1.27), axis='Y', bevel=0, rot=(-math.pi / 2, 0, 0)))
    for i in range(10):
        parts.append(box(k, 'IceChunk', (rng.uniform(-1.8, 1.8), rng.uniform(-.85, -.75), 1.05),
                         (.14, .12, .1), m['ice'], .03, 1, rot=(rng.uniform(0, 1), rng.uniform(0, 1), 0)))
    # Hanging scale.
    sx = 1.2
    parts.append(rod(k, 'ScaleChain', (sx, -.7, 2.9), (sx, -.7, 2.35), .015, m['metal']))
    parts.append(cyl(k, 'Dial', (sx, -.7, 2.2), .17, .08, m['cream'], axis='Y', v=16, bevel=.02))
    parts.append(k.torus('DialRim', (sx, -.75, 2.2), .17, .03, m['metal'], rot=(math.pi / 2, 0, 0), major_seg=16,
                         minor_seg=5))
    parts.append(box(k, 'Needle', (sx + .03, -.76, 2.24), (.02, .02, .12), m['fish2'], 0, rot=(0, .5, 0)))
    parts.append(rod(k, 'PanHook', (sx, -.7, 2.02), (sx, -.7, 1.8), .012, m['metal']))
    parts.append(cyl(k, 'Pan', (sx, -.7, 1.76), .22, .06, m['metal'], v=14, bevel=.02, r2=.17))
    # Price board with a fish pictogram, and a lifebuoy-coloured bucket.
    parts.append(box(k, 'PriceBoard', (-1.3, -.95, 2.35), (.8, .06, .5), m['board'], .03, 1))
    parts.append(ball(k, 'Pict', (-1.34, -.99, 2.35), (.18, .03, .09), m['cream'], 10, 5))
    parts.append(k.prism('PictTail', [(.0, -.09), (.0, .09), (.14, 0)], .03, m['cream'], loc=(-1.06, -.99, 2.35),
                         rot=(0, 0, math.pi)))
    parts.append(rod(k, 'BoardHook', (-1.3, -.95, 2.6), (-1.3, -.95, 2.9), .015, m['metal']))
    parts.append(cyl(k, 'Bucket', (1.75, -1.05, .25), .24, .5, m['fish2'], v=12, bevel=.03, r2=.2))
    parts.append(cyl(k, 'BucketIce', (1.75, -1.05, .48), .2, .06, m['ice'], v=12, bevel=.02))
    parts.append(box(k, 'Crate', (-1.6, -1.2, .2), (.7, .5, .4), m['wood'], .03, 1))
    parts.append(box(k, 'CrateSlat', (-1.6, -1.46, .2), (.7, .03, .1), m['cream'], .01))
    return L.finish(k, parts, 'fish_market', width=W, depth=Dp)
