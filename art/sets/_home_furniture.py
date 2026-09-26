"""Cottage on Gull Lane furniture and indoor dressing.

Every builder returns one joined object with its origin at the footprint centre,
base at Z = 0. Most pieces face -Y; the high chair and the rocking horse are
authored side-on (their best silhouette faces the -Y camera, extras.facing).
"""
import math
import random

from mathutils import Vector

import _home_util as U
from kit import GLOSS, MATTE, SATIN


def _finish(k, name, parts, height=None, shade=.66, **extras):
    obj = k.join(name, parts, pivot=(0, 0, 0))
    bz = [v.co.z for v in obj.data.vertices]
    obj['height'] = round(float(height if height is not None else max(bz)), 3)
    for key, value in extras.items():
        obj[key] = value
    k.paint([obj], lo=0, hi=max(bz), shade=shade)
    return obj


def _turn(obj, angle):
    """Rotate a finished object about Z (bakes into the mesh)."""
    obj.rotation_euler = (0, 0, angle)
    U.bake(obj)
    return obj


# ----------------------------------------------------------------------------- crib
def build_crib(k):
    wood = k.mat('Honey', U.HONEY_LIGHT, SATIN)
    coral = k.mat('Coral', 'coral', GLOSS)
    gold = k.mat('Marigold', 'marigold', GLOSS)
    white = k.mat('Cream', 'white', SATIN)
    teal = k.mat('Teal', 'teal', SATIN)
    sheet = k.mat('Sheet', U.CREAM_WARM, SATIN)
    L, D = 1.3, .72
    hx, hy = L / 2, D / 2
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(k.cyl('Post', (sx * hx, sy * hy, .55), .045, 1.1, wood, vertices=12, bevel=.015, segments=1))
            parts.append(k.ball('Finial', (sx * hx, sy * hy, 1.15), .065, gold, 10, 6))
            parts.append(k.cyl('Foot', (sx * hx, sy * hy, .03), .055, .06, wood, vertices=12, bevel=.015, segments=1))
    # Arched coral end panels with a marigold star.
    for sx in (-1, 1):
        arch = [(-hy + .04, .3), (hy - .04, .3), (hy - .04, .92)]
        for i in range(1, 12):
            t = i / 12
            y = (hy - .04) - t * (D - .08)
            arch.append((y, .92 + math.sin(t * math.pi) * .16))
        arch.append((-hy + .04, .92))
        parts.append(k.prism('EndPanel', arch, .045, coral, loc=(sx * hx, 0, 0), axis='X', bevel=.018, segments=2))
        parts.append(U.relief(k, 'EndStar', U.star(.12, .055, 5), .03, gold, loc=(sx * (hx + .02), 0, .72),
                              plane='YZ' if sx < 0 else 'ZY'))
    for sy in (-1, 1):
        parts.append(k.box('TopRail', (0, sy * hy, .98), (L - .05, .065, .065), wood, bevel=.022, segments=2))
        parts.append(k.box('LowRail', (0, sy * hy, .31), (L - .05, .06, .08), wood, bevel=.02, segments=2))
        for i in range(11):
            x = -hx + .11 + i * (L - .22) / 10
            parts.append(k.cyl('Bar', (x, sy * hy, .645), .019, .62, white, vertices=8, bevel=0))
    parts.append(k.box('Base', (0, 0, .3), (L - .04, D - .04, .05), wood, bevel=.015, segments=1))
    parts.append(k.box('Mattress', (0, 0, .4), (L - .1, D - .1, .15), sheet, bevel=.055, segments=3))
    parts.append(k.box('Blanket', (.16, 0, .485), (.84, D - .06, .05), teal, bevel=.024, segments=2))
    parts.append(k.box('Fold', (-.24, 0, .5), (.14, D - .05, .075), white, bevel=.034, segments=2))
    for x, y in ((.0, -.14), (.3, .1), (.46, -.18), (.12, .2)):
        parts.append(U.relief(k, 'BlanketStar', U.star(.06, .028, 5), .012, gold, loc=(x, y, .51), plane='XY'))
    pillow = U.puff(k, 'Pillow', U.pillow_outline(.26, .42), .09, white, rings=3, n=2.6, plane='XY',
                    loc=(-.46, 0, .52))
    parts.append(pillow)
    # A tiny plush bunny tucked in.
    parts.append(k.ball('BunnyBody', (-.3, .12, .56), (.07, .06, .065), coral, 10, 6))
    parts.append(k.ball('BunnyHead', (-.36, .1, .63), .05, coral, 10, 6))
    for s in (-1, 1):
        parts.append(k.capsule('BunnyEar', (-.37, .1 + s * .025, .66), (-.39, .1 + s * .04, .74), .016, coral, 6))
    # Mobile: a marigold arm from the back post curling over the crib.
    arm = U.bezier((-hx, hy, 1.1), (-hx, hy, 1.75), (-.2, .15, 1.95), (0, 0, 1.9), 8)
    parts.append(k.tube('MobileArm', arm, .02, gold))
    parts.append(k.ball('Hub', (0, 0, 1.88), .045, coral, 10, 6))
    parts.append(k.cyl('Drop', (0, 0, 1.8), .006, .16, white, vertices=5, bevel=0))
    ring = k.torus('MobileRing', (0, 0, 1.72), .26, .014, gold, major_seg=20, minor_seg=5)
    parts.append(ring)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * .26, math.sin(a) * .26
        drop = .18 + (i % 2) * .08
        parts.append(k.cyl('String', (x, y, 1.72 - drop / 2), .005, drop, white, vertices=4, bevel=0))
        z = 1.72 - drop - .07
        if i % 2 == 0:
            parts.append(U.puff(k, 'MobileStar', U.star(.085, .04, 5), .05, gold, rings=2, loc=(x, y, z)))
        else:
            hull = [(-.09, .02), (.09, .02), (.06, -.035), (-.06, -.035)]
            parts.append(k.prism('MobileHull', hull, .045, coral, loc=(x, y, z - .02), bevel=.012, segments=1))
            parts.append(k.prism('MobileSail', [(-.05, .03), (.05, .03), (0, .13)], .02, white, loc=(x, y, z - .02),
                                 bevel=.008, segments=1))
    return _finish(k, 'crib', parts, height=1.95)


# ----------------------------------------------------------------------------- sofa
def _throw(k, mats, path, width, thick=.05, ribs=9):
    """A knitted throw following a path in XZ, ribbed across its width, banded by material."""
    loops = []
    pts = [Vector(p) for p in path]
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = Vector((-t.z, 0, t.x))
        if n.z < 0:
            n = -n
        front, back = [], []
        m = 14
        for j in range(m + 1):
            y = -width / 2 + width * j / m
            rib = abs(math.sin(j / m * ribs * math.pi)) * .018
            front.append(tuple(p + Vector((0, y, 0)) + n * (thick / 2 + rib)))
            back.append(tuple(p + Vector((0, y, 0)) - n * thick / 2))
        loops.append(front + back[::-1])
    parts = []
    bands = mats['bands']
    for b, (i0, i1) in enumerate(mats['spans']):
        parts.append(U.loft(k, 'Throw', loops[i0:i1 + 1], bands[b % len(bands)]))
    return parts


def build_sofa(k):
    sofa = k.mat('Sofa', 'coral', SATIN)
    dark = k.mat('SofaButton', 'coral_dark', GLOSS)
    wood = k.mat('Honey', U.HONEY_DEEP, SATIN)
    cream = k.mat('Cream', 'cream', SATIN)
    teal = k.mat('Teal', 'teal', SATIN)
    gold = k.mat('Marigold', 'marigold', SATIN)
    berry = k.mat('Berry', 'berry', SATIN)
    parts = []
    for s in (-1, 1):
        parts.append(k.box('Arm', (s * .97, -.01, .36), (.27, .88, .52), sofa, bevel=.08, segments=3))
        parts.append(k.capsule('Roll', (s * .97, -.3, .6), (s * .97, .32, .6), .155, sofa, 12))
        ring = k.torus('Piping', (s * .97, -.378, .6), .13, .016, cream, rot=(math.pi / 2, 0, 0), major_seg=18,
                       minor_seg=5)
        parts.append(ring)
        for sy in (-1, 1):
            parts.append(k.cyl('Foot', (s * .96, sy * .34, .06), .055, .12, wood, vertices=10, bevel=.015, segments=1,
                               radius2=.038))
    parts.append(k.box('Deck', (0, -.02, .26), (1.74, .84, .3), sofa, bevel=.07, segments=3))
    parts.append(k.box('Back', (0, .36, .63), (2.16, .24, .66), sofa, bevel=.1, segments=3))
    parts.append(k.tube('DeckPiping', [(-.84, -.445, .41), (.84, -.445, .41)], .017, cream))
    for x in (-.42, .42):
        parts.append(k.box('Seat', (x, -.07, .49), (.84, .7, .18), sofa, bevel=.075, segments=2))
        parts.append(k.box('BackCushion', (x, .17, .8), (.83, .2, .46), sofa, bevel=.09, segments=3,
                           rot=(math.radians(-10), 0, 0)))
        for bx in (-.2, .2):
            parts.append(k.ball('Tuft', (x + bx, .062, .83), .028, dark, 8, 6))
    # Throw pillows: teal square on the left, marigold on the right.
    p = U.puff(k, 'Pillow', U.pillow_outline(.42, .4), .17, teal, rings=3, n=2.3, loc=(-.6, .02, .78),
               rot=(math.radians(-14), math.radians(12), math.radians(8)))
    parts.append(p)
    parts.append(k.ball('PillowButton', (-.62, -.07, .77), .03, cream, 8, 6))
    p = U.puff(k, 'Pillow', U.pillow_outline(.36, .34), .15, gold, rings=3, n=2.3, loc=(.5, .02, .76),
               rot=(math.radians(-14), math.radians(-10), math.radians(-6)))
    parts.append(p)
    for i in range(5):
        parts.append(k.ball('Dot', (.5 + (i - 2) * .06, -.065, .76 + (i % 2) * .05 - .025), .018, cream, 6, 4))
    # Knitted berry-and-cream throw draped over the right arm.
    path = U.bezier((.62, 0, .6), (.78, 0, .66), (.86, 0, .8), (.98, 0, .8), 5)[:-1] + \
        U.bezier((.98, 0, .8), (1.08, 0, .8), (1.15, 0, .7), (1.15, 0, .33), 5)
    parts += _throw(k, {'bands': [berry, cream, berry, cream, berry], 'spans': [(0, 3), (3, 4), (4, 6), (6, 7),
                                                                                     (7, 10)]}, path, .62)
    for i in range(8):
        y = -.28 + i * .08
        parts.append(k.ball('Tassel', (1.165, y, .24), (.026, .026, .045), berry, 6, 4))
    return _finish(k, 'sofa', parts)


# ----------------------------------------------------------------------------- armchair
def build_armchair(k):
    teal = k.mat('Chair', 'teal', SATIN)
    dark = k.mat('ChairButton', 'ocean', GLOSS)
    wood = k.mat('Honey', U.HONEY_DEEP, SATIN)
    gold = k.mat('Marigold', 'marigold', SATIN)
    coral = k.mat('Coral', 'coral', GLOSS)
    cream = k.mat('Cream', 'cream', SATIN)
    parts = []
    for s in (-1, 1):
        parts.append(k.box('Arm', (s * .42, -.01, .35), (.22, .84, .5), teal, bevel=.08, segments=3))
        parts.append(k.capsule('Roll', (s * .42, -.27, .58), (s * .42, .3, .58), .13, teal, 14))
        parts.append(k.torus('Piping', (s * .42, -.34, .58), .11, .014, cream, rot=(math.pi / 2, 0, 0), major_seg=16,
                             minor_seg=5))
        for sy in (-1, 1):
            parts.append(k.cyl('Foot', (s * .42, sy * .32, .06), .05, .12, wood, vertices=10, bevel=.015, segments=1,
                               radius2=.034))
    parts.append(k.box('Deck', (0, -.02, .26), (.66, .8, .3), teal, bevel=.07, segments=3))
    parts.append(k.box('Back', (0, .34, .6), (1.04, .22, .78), teal, bevel=.11, segments=3))
    parts.append(k.ball('BackTop', (0, .34, .96), (.5, .11, .1), teal, 18, 8))
    parts.append(k.box('Seat', (0, -.07, .49), (.62, .64, .17), teal, bevel=.075, segments=3))
    parts.append(k.box('BackCushion', (0, .17, .78), (.6, .18, .42), teal, bevel=.085, segments=3,
                       rot=(math.radians(-10), 0, 0)))
    for bx, bz in ((-.14, .84), (.14, .84), (0, .7)):
        parts.append(k.ball('Tuft', (bx, .07, bz), .025, dark, 8, 6))
    parts.append(k.tube('DeckPiping', [(-.32, -.425, .41), (.32, -.425, .41)], .015, cream))
    # Round marigold cushion with a coral button.
    cushion = U.puff(k, 'RoundCushion', U.scallop_circle(.2, 8, .1), .15, gold, rings=3, n=2.3, loc=(.02, -.02, .76),
                     rot=(math.radians(-16), 0, math.radians(6)))
    parts.append(cushion)
    parts.append(k.ball('Button', (.02, -.1, .745), (.04, .025, .04), coral, 10, 6))
    # Crocheted doily draped over the rounded back top.
    doily = U.disc(k, 'Doily', [(x * 1.35, y * 1.1) for x, y in U.scallop_circle(.2, 10, .12)], 0, cream, rings=5,
                   dome=.004)

    def drape(v):
        ang = -v.y / .12
        return Vector((v.x, .34 - math.sin(ang) * (.12 + v.z), .96 + math.cos(ang) * (.11 + v.z)))
    U.deform(doily, drape)
    parts.append(doily)
    return _finish(k, 'armchair', parts)


# ----------------------------------------------------------------------------- bookshelf
def build_bookshelf(k):
    wood = k.mat('Honey', U.HONEY, SATIN)
    back = k.mat('ShelfBack', 'ocean', SATIN)
    cols = {'coral': k.mat('Coral', 'coral', GLOSS), 'gold': k.mat('Marigold', 'marigold', GLOSS),
            'leaf': k.mat('Leaf', 'leaf', GLOSS), 'berry': k.mat('Berry', 'berry', GLOSS),
            'cream': k.mat('Cream', 'cream', SATIN), 'sky': k.mat('Sky', 'sky', GLOSS)}
    rnd = random.Random(5)
    W, D, H = 1.3, .36, 2.1
    parts = []
    for s in (-1, 1):
        parts.append(k.box('Side', (s * (W / 2 - .03), 0, H / 2 - .02), (.06, D, H - .04), wood, bevel=.02, segments=2))
    parts.append(k.box('Top', (0, -.01, H - .03), (W + .1, D + .06, .06), wood, bevel=.025, segments=2))
    parts.append(k.box('Crown', (0, -.005, H - .08), (W + .04, D + .03, .05), wood, bevel=.018, segments=1))
    parts.append(k.box('Plinth', (0, .01, .06), (W - .04, D - .03, .12), wood, bevel=.02, segments=1))
    parts.append(k.box('Back', (0, D / 2 - .015, H / 2), (W - .08, .03, H - .1), back, bevel=.01, segments=1))
    shelves = [.14, .6, 1.08, 1.56]
    for z in shelves[1:]:
        parts.append(k.box('Shelf', (0, 0, z - .02), (W - .1, D - .04, .04), wood, bevel=.012, segments=1))
    parts.append(k.box('Shelf', (0, 0, .13), (W - .1, D - .04, .03), wood, bevel=.01, segments=1))
    names = list(cols)
    last = [None]

    def pick():
        c = rnd.choice([n for n in names if n != last[0]])
        last[0] = c
        return cols[c]

    def row(z, x0, x1, hmin, hmax):
        x = x0
        while x < x1 - .05:
            w = rnd.uniform(.05, .085)
            if x + w > x1:
                break
            h = rnd.uniform(hmin, hmax)
            d = rnd.uniform(.23, .27)
            mat = pick()
            parts.append(k.box('Book', (x + w / 2, -.01 + (.27 - d) / 2, z + h / 2), (w, d, h), mat, bevel=.012,
                               segments=1))
            if rnd.random() < .45:
                band = cols['cream'] if mat is not cols['cream'] else cols['coral']
                parts.append(k.box('Band', (x + w / 2, -.01 + (.27 - d) / 2 - d / 2, z + h * .78), (w + .004, .012, .025),
                                   band, bevel=0))
            x += w + .004
        return x

    # Bottom: big books and a lying stack.
    x = row(shelves[0], -.58, .3, .3, .38)
    for i in range(3):
        w = rnd.uniform(.24, .28)
        parts.append(k.box('Stack', (.44, -.01, shelves[0] + .03 + i * .06), (w, .22, .055), pick(), bevel=.012,
                           segments=1, rot=(0, 0, rnd.uniform(-.12, .12))))
    # Second: books and the toy boat.
    row(shelves[1], -.58, .18, .28, .36)
    bx, bz = .38, shelves[1]
    hull = [(-.17, .1), (.19, .1), (.13, 0), (-.12, 0)]
    parts.append(k.prism('BoatHull', hull, .12, cols['coral'], loc=(bx, -.03, bz), bevel=.025, segments=2))
    parts.append(k.box('BoatStripe', (bx, -.03, bz + .085), (.35, .125, .02), cols['cream'], bevel=.008, segments=1))
    parts.append(k.cyl('Mast', (bx - .01, -.03, bz + .25), .012, .3, wood, vertices=8, bevel=0))
    parts.append(k.prism('Sail', [(.0, .13), (.12, .13), (.0, .38)], .02, cols['cream'], loc=(bx - .005, -.03, bz),
                         bevel=.008, segments=1))
    parts.append(k.prism('Jib', [(-.02, .14), (-.13, .14), (-.02, .33)], .02, cols['sky'], loc=(bx - .005, -.03, bz),
                         bevel=.008, segments=1))
    parts.append(k.prism('Flag', [(0, .38), (.07, .41), (0, .44)], .012, cols['gold'], loc=(bx - .01, -.03, bz),
                         bevel=.004, segments=1))
    # Third: books with a leaning pair.
    x = row(shelves[2], -.58, .38, .26, .36)
    for i in range(2):
        parts.append(k.box('Lean', (.48 + i * .075, -.01, shelves[2] + .15), (.06, .25, .32), pick(), bevel=.012,
                           segments=1, rot=(0, math.radians(-18), 0)))
    # Top compartment: globe and a few books.
    gx, gz = -.32, shelves[3]
    parts.append(k.cyl('GlobeFoot', (gx, -.02, gz + .02), .1, .04, cols['gold'], vertices=14, bevel=.012, segments=1))
    parts.append(k.cyl('GlobeStem', (gx, -.02, gz + .08), .015, .1, cols['gold'], vertices=8, bevel=0))
    globe_c = Vector((gx, -.02, gz + .27))
    parts.append(k.ball('Globe', globe_c, .15, cols['sky'], 18, 10))
    for d, sz in (((-.4, -1, .3), (.07, .02, .05)), ((.5, -1, -.2), (.06, .02, .08)), ((-.1, -1, -.5), (.05, .02, .04)),
                  ((.2, -.6, .7), (.06, .02, .04))):
        parts.append(U.decal(k, 'Land', globe_c, (.15, .15, .15), d, sz, cols['leaf'], lift=-.004, seg=8,
                              rings=4))
    meridian = k.torus('Meridian', globe_c, .175, .012, cols['gold'], major_seg=20, minor_seg=4, arc=math.pi * 1.1)
    meridian.rotation_euler = (math.pi / 2, math.radians(20), 0)
    parts.append(meridian)
    row(shelves[3], -.1, .58, .24, .32)
    # A trailing plant on top.
    parts.append(k.lathe('PlantPot', [(0, H), (.08, H), (.1, H + .12), (.11, H + .13), (0, H + .13)], cols['coral'],
                         loc=(.4, -.02, 0), segments=12))
    for i in range(7):
        a = i * math.tau / 7
        parts.append(k.ball('Ivy', (.4 + math.cos(a) * .08, -.02 + math.sin(a) * .06, H + .17 + (i % 2) * .04),
                            .06, cols['leaf'], 8, 6))
    vine = [(.48, -.1, H + .1), (.56, -.2, H - .05), (.6, -.22, H - .25), (.58, -.22, H - .42)]
    parts.append(k.tube('Vine', vine, .012, cols['leaf']))
    for i, p in enumerate(vine[1:]):
        parts.append(k.ball('IvyLeaf', (p[0] + .025, p[1] - .02, p[2]), (.04, .02, .03), cols['leaf'], 8, 4))
    return _finish(k, 'bookshelf', parts)


# ----------------------------------------------------------------------------- toy chest
def build_toy_chest(k):
    wood = k.mat('Honey', U.HONEY, SATIN)
    coral = k.mat('Coral', 'coral', GLOSS)
    gold = k.mat('Marigold', 'marigold', GLOSS)
    teal = k.mat('Teal', 'teal', GLOSS)
    cream = k.mat('Cream', 'white', GLOSS)
    leaf = k.mat('Leaf', 'leaf', GLOSS)
    inside = k.mat('Inside', U.WOOD_SEAM, SATIN)
    W, D, H = 1.0, .56, .52
    t = .05
    parts = []
    z0 = .06
    parts.append(k.box('Bottom', (0, 0, z0 + .03), (W, D, .06), wood, bevel=.02, segments=1))
    parts.append(k.box('Front', (0, -D / 2 + t / 2, z0 + H / 2), (W, t, H), wood, bevel=.02, segments=2))
    parts.append(k.box('BackWall', (0, D / 2 - t / 2, z0 + H / 2), (W, t, H), wood, bevel=.02, segments=2))
    for s in (-1, 1):
        parts.append(k.box('Side', (s * (W / 2 - t / 2), 0, z0 + H / 2), (t, D, H), wood, bevel=.02, segments=2))
    parts.append(k.box('Fill', (0, 0, z0 + H - .12), (W - 2 * t, D - 2 * t, .02), inside, bevel=0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(k.ball('BunFoot', (sx * (W / 2 - .07), sy * (D / 2 - .07), .045), (.06, .06, .05), gold, 10, 6))
    for z in (z0 + .07, z0 + H - .06):
        parts.append(k.box('Band', (0, 0, z), (W + .02, D + .02, .05), coral, bevel=.02, segments=1))
    parts.append(k.cyl('Badge', (0, -D / 2 - .01, z0 + H / 2), .14, .025, teal, axis='Y', vertices=18, bevel=.01,
                       segments=1))
    parts.append(U.relief(k, 'BadgeStar', U.star(.1, .045, 5), .03, gold, loc=(0, -D / 2 - .022, z0 + H / 2)))
    for s in (-1, 1):
        handle = k.torus('Handle', (s * (W / 2 + .01), 0, z0 + H * .62), .09, .018, cream, major_seg=14, minor_seg=5,
                         arc=math.pi * .9)
        handle.rotation_euler = (math.pi / 2, 0, math.pi / 2)
        parts.append(handle)
        for sy in (-1, 1):
            parts.append(k.ball('Cap', (s * (W / 2 - .01), sy * (D / 2 - .01), z0 + H), .03, gold, 8, 6))
    # Open lid, leaning back on its hinge, painted inside.
    lid = [k.box('Lid', (0, 0, z0 + H + .035), (W + .04, D + .04, .07), wood, bevel=.025, segments=2),
           k.box('LidBand', (0, 0, z0 + H + .035), (W + .06, D + .06, .03), coral, bevel=.012, segments=1),
           k.box('LidPanel', (0, 0, z0 + H - .004), (W - .16, D - .16, .012), teal, bevel=.006, segments=1)]
    for x in (-.28, 0, .28):
        star = U.relief(k, 'LidStar', U.star(.07, .032, 5), .02, gold, loc=(x, 0, z0 + H - .01), plane='XY',
                        rot=(math.pi, 0, 0))
        lid.append(star)
    hinge = (0, D / 2 + .02, z0 + H + .035)
    lid_obj = k.join('LidPart', lid, pivot=hinge)
    lid_obj.rotation_euler = (math.radians(-104), 0, 0)
    parts.append(lid_obj)
    # Toys peeking out.
    parts.append(U.sector_ball(k, 'BeachBall', (.25, -.02, z0 + H + .02), .17, [coral, cream, teal, gold, cream],
                               sectors=4, segments=16, rings=10, axis_tilt=(.5, .3, 0)))
    parts.append(k.ball('DuckBody', (-.26, -.06, z0 + H + .03), (.11, .09, .08), gold, 12, 8))
    parts.append(k.ball('DuckHead', (-.33, -.08, z0 + H + .13), .065, gold, 12, 8))
    parts.append(k.ball('DuckBeak', (-.4, -.1, z0 + H + .12), (.04, .03, .018), coral, 8, 6))
    parts.append(k.ball('DuckTail', (-.16, -.05, z0 + H + .07), (.04, .03, .04), gold, 8, 6))
    for s in (-1, 1):
        parts.append(k.ball('DuckEye', (-.36 + s * .0, -.08 + s * .045, z0 + H + .15), .012, teal, 6, 4))
    for pos, size, rot, mat in (((0, .02, z0 + H - .02), .15, (.2, .1, .5), leaf), ((-.05, .12, z0 + H + .08), .12,
                                                                                    (0, .4, .2), cream)):
        parts.append(k.box('Block', pos, (size,) * 3, mat, bevel=.025, segments=2, rot=rot))
    # A star wand poking out at the back.
    parts.append(k.cyl('Wand', (.05, .16, z0 + H + .1), .012, .36, cream, vertices=6, bevel=0,
                       rot=(math.radians(-10), math.radians(12), 0)))
    parts.append(U.puff(k, 'WandStar', U.star(.08, .038, 5), .045, gold, rings=2, loc=(.09, .19, z0 + H + .29)))
    return _finish(k, 'toy_chest', parts)


# ----------------------------------------------------------------------------- floor lamp
def build_floor_lamp(k):
    brass = k.mat('Brass', 'brass', .28, metal=.6)
    teal = k.mat('Teal', 'teal', GLOSS)
    lamp = k.mat('Lamp', '#ffe39a', .4, emit=.9)
    coral = k.mat('Coral', 'coral', SATIN)
    gold = k.mat('Marigold', 'marigold', SATIN)
    parts = [U.lathe(k, 'Base', [(0, 0), (.22, 0), (.235, .02), (.22, .045), (.12, .075), (.05, .1), (.03, .12),
                                 (0, .12)], teal, segments=22)]
    parts.append(k.cyl('Pole', (0, 0, .76), .02, 1.3, brass, vertices=10, bevel=0))
    parts.append(k.ball('Knuckle', (0, 0, .75), .04, brass, 10, 6))
    parts.append(k.ball('Collar', (0, 0, 1.36), .035, brass, 10, 6))
    # Pleated drum shade with marigold star appliques.
    loops = []
    n = 48
    for z, r in ((1.36, .31), (1.5, .27), (1.66, .21)):
        loops.append([(math.cos(i * math.tau / n) * r * (1 + .045 * math.cos(i * math.pi)),
                       math.sin(i * math.tau / n) * r * (1 + .045 * math.cos(i * math.pi)), z) for i in range(n)])
    parts.append(U.loft(k, 'Shade', loops, lamp))
    slope = math.atan2(.1, .3)
    for i in range(5):
        a = -math.pi / 2 + (i - 2) * math.tau / 5
        r = .285
        star = U.puff(k, 'ShadeStar', U.star(.055, .026, 5), .03, gold, rings=2, back='flat')
        star.rotation_euler = (-slope, 0, a + math.pi / 2)
        star.location = (math.cos(a) * r, math.sin(a) * r, 1.47)
        parts.append(star)
    parts.append(k.torus('TrimLow', (0, 0, 1.36), .315, .02, coral, major_seg=28, minor_seg=5))
    parts.append(k.torus('TrimTop', (0, 0, 1.66), .215, .018, coral, major_seg=24, minor_seg=5))
    for i in range(14):
        a = i * math.tau / 14
        parts.append(k.ball('Pom', (math.cos(a) * .31, math.sin(a) * .31, 1.31), .028, gold, 8, 5))
    parts.append(k.ball('Finial', (0, 0, 1.7), .035, brass, 10, 6))
    parts.append(k.cyl('Chain', (.12, -.12, 1.25), .004, .2, brass, vertices=4, bevel=0))
    parts.append(k.ball('Bead', (.12, -.12, 1.14), .022, gold, 8, 5))
    return _finish(k, 'floor_lamp', parts, shade=.72)


# ----------------------------------------------------------------------------- big plant
def _leaf(k, name, base, yaw, tilt, length, width, mat, droop=.25, vein=None):
    leaf = U.puff(k, name, U.leaf_outline(length, width, n=9, tip=.3), .05, mat, rings=2, n=2.2)
    U.deform(leaf, lambda v: Vector((v.x, v.y + droop * (v.z / length) ** 2 * length, v.z)))
    leaf.rotation_euler = (tilt, 0, yaw)
    leaf.location = base
    return leaf


def _monstera_outline(length, width, slits=3, n=10):
    """Broad heart-based leaf with radial splits, base at (0, 0), tip at (0, length)."""
    cu, cv = 0., length * .45
    right = []
    for i in range(1, n):
        t = i / n
        w = width / 2 * math.sin(math.pi * min(1., t * 1.05) ** .75) ** .7
        right.append((w, length * (.1 + .9 * t) - length * .1 * (1 - t) ** 3))
    cuts = {int(n * f) for f in (.3, .5, .7)[:slits]}
    out = []
    for i, (x, v) in enumerate(right):
        if i in cuts:
            out.append((x, v - length * .03))
            out.append((cu + (x - cu) * .45, cv + (v - cv) * .45 + length * .04))
            out.append((x, v + length * .03))
        else:
            out.append((x, v))
    left = [(-x, v) for x, v in out]
    return [(0, length * .1), (width * .12, 0)] + out + [(0, length)] + left[::-1] + [(-width * .12, 0)]


def build_plant_big(k):
    pot = k.mat('Terracotta', U.TERRACOTTA, MATTE)
    band = k.mat('Teal', 'teal', GLOSS)
    soil = k.mat('Soil', '#6b3b22', MATTE)
    leaf = k.mat('Leaf', 'leaf', GLOSS)
    dark = k.mat('LeafDark', 'leaf_dark', GLOSS)
    stem = k.mat('Stem', 'moss', SATIN)
    parts = [U.lathe(k, 'Pot', [(0, 0), (.2, 0), (.22, .03), (.27, .38), (.3, .39), (.31, .45), (.29, .47), (.25, .46),
                                (0, .46)], pot, segments=24)]
    parts.append(k.torus('Band', (0, 0, .24), .25, .025, band, major_seg=24, minor_seg=5))
    parts.append(k.cyl('Soil', (0, 0, .45), .26, .03, soil, vertices=20, bevel=.01, segments=1))
    for i in range(6):
        a = i * math.tau / 6 + .4
        parts.append(k.ball('Dot', (math.cos(a) * .255, math.sin(a) * .255, .12), .022, band, 6, 4))
    # (fan angle from vertical, forward tilt, stem height, depth offset, leaf length)
    fan = [(-78, .15, .72, .1, .46), (-52, .1, .98, .14, .5), (-24, .05, 1.14, .16, .52), (6, .05, 1.2, .18, .52),
           (34, .1, 1.06, .14, .5), (60, .15, .86, .1, .48), (84, .2, .66, .06, .44),
           (-40, .95, .72, -.1, .42), (18, 1.0, .74, -.12, .44), (58, .9, .64, -.08, .4)]
    for i, (ang, tilt, h, dy, length) in enumerate(fan):
        a = math.radians(ang)
        base = Vector((math.sin(a) * .22 * (h / 1.2), dy, h))
        mid = Vector((base.x * .35, dy * .5, .45 + (h - .45) * .55))
        parts.append(k.tube('Stem', [(0, 0, .45), tuple(mid), tuple(base)], .018, stem))
        blade = U.puff(k, 'Leaf', _monstera_outline(length, length * .92), .05, leaf if i % 2 == 0 else dark, rings=2,
                       n=2.2)

        def cup(v, L=length):
            t = v.z / L
            return Vector((v.x, v.y + (v.x / L) ** 2 * .35 * L - t * t * .12 * L, v.z))
        U.deform(blade, cup)
        blade.rotation_euler = (tilt, a, 0)
        blade.location = base
        parts.append(blade)
    return _finish(k, 'plant_big', parts, shade=.62)


# ----------------------------------------------------------------------------- kitchen counter
def build_kitchen_counter(k):
    cab = k.mat('Cabinet', 'cream', SATIN)
    door = k.mat('Marigold', 'marigold', GLOSS)
    wood = k.mat('Honey', U.HONEY, SATIN)
    steel = k.mat('Steel', 'steel', .25, metal=.7)
    coral = k.mat('Coral', 'coral', GLOSS)
    teal = k.mat('Teal', 'teal', GLOSS)
    red = k.mat('Apple', 'red', GLOSS)
    leaf = k.mat('Leaf', 'leaf', GLOSS)
    W, D = 2.4, .62
    parts = [k.box('Kick', (0, .03, .05), (W - .08, D - .08, .1), cab, bevel=.015, segments=1),
             k.box('Carcass', (0, 0, .5), (W, D, .8), cab, bevel=.03, segments=2),
             k.box('Top', (0, -.01, .92), (W + .06, D + .06, .06), wood, bevel=.02, segments=2)]
    fy = -D / 2
    for x in (-.87, -.29, .29, .87):
        parts.append(k.box('Door', (x, fy - .012, .39), (.54, .03, .5), door, bevel=.02, segments=2))
        parts.append(k.box('DoorPanel', (x, fy - .03, .39), (.36, .02, .32), door, bevel=.015, segments=1))
        parts.append(k.box('Drawer', (x, fy - .012, .755), (.54, .03, .15), door, bevel=.02, segments=2))
        parts.append(k.ball('DrawerKnob', (x, fy - .05, .755), .028, coral, 8, 6))
        kx = x + (.2 if x < 0 else -.2)
        parts.append(k.ball('DoorKnob', (kx, fy - .045, .56), .026, coral, 8, 6))
    # Sink: steel rim around a shallow basin, gooseneck tap with hot/cold caps.
    sx, sy = .45, .0
    parts.append(k.box('Basin', (sx, sy, .952), (.5, .34, .01), steel, bevel=0))
    for dx, dy, w, d in ((0, -.2, .62, .06), (0, .2, .62, .06), (-.28, 0, .06, .34), (.28, 0, .06, .34)):
        parts.append(k.box('Rim', (sx + dx, sy + dy, .96), (w, d, .035), steel, bevel=.012, segments=1))
    tap = [(sx, .22, .95), (sx, .22, 1.2), (sx, .17, 1.27), (sx, .09, 1.27), (sx, .05, 1.21), (sx, .05, 1.17)]
    parts.append(k.tube('Tap', tap, .022, steel))
    for s, mat in ((-1, red), (1, teal)):
        parts.append(k.cyl('Valve', (sx + s * .12, .22, .99), .022, .08, steel, vertices=8, bevel=.005, segments=1))
        parts.append(k.ball('ValveCap', (sx + s * .12, .22, 1.04), .03, mat, 8, 6))
    # Coral kettle with a honey handle.
    kx, ky = -.72, .02
    parts.append(U.lathe(k, 'Kettle', [(0, .95), (.13, .95), (.155, .97), (.165, 1.04), (.15, 1.12), (.1, 1.17),
                                       (.06, 1.18), (0, 1.18)], coral, loc=(kx, ky, 0), segments=18))
    parts.append(k.ball('Lid', (kx, ky, 1.19), .04, cab, 10, 6))
    parts.append(k.capsule('Spout', (kx - .13, ky, 1.02), (kx - .25, ky, 1.14), .026, coral, 10))
    parts.append(k.tube('Handle', [(kx + .1, ky, 1.14), (kx + .08, ky, 1.27), (kx - .06, ky, 1.27),
                                   (kx - .1, ky, 1.15)], .018, wood))
    # Teal fruit bowl: oranges, apples and a banana.
    fx, fy2 = -.12, -.02
    parts.append(U.lathe(k, 'Bowl', [(0, .95), (.09, .95), (.2, 1.0), (.235, 1.07), (.215, 1.075), (.18, 1.02),
                                     (0, 1.0)], teal, loc=(fx, fy2, 0), segments=18))
    for dx, dy, dz, mat in ((-.08, -.04, 1.08, door), (.07, -.05, 1.08, door), (0, .07, 1.09, door),
                            (-.02, -.06, 1.15, red), (.1, .04, 1.1, red)):
        parts.append(k.ball('Fruit', (fx + dx, fy2 + dy, dz), .062, mat, 10, 6))
        if mat is red:
            parts.append(k.cyl('FruitStem', (fx + dx, fy2 + dy, dz + .065), .006, .03, wood, vertices=4, bevel=0))
            parts.append(k.ball('FruitLeaf', (fx + dx + .02, fy2 + dy, dz + .07), (.022, .01, .012), leaf, 6, 4))
    banana = [(fx - .15, fy2 + .05, 1.1), (fx - .05, fy2 + .02, 1.19), (fx + .08, fy2 + 0, 1.2), (fx + .17, fy2 - .02,
                                                                                                  1.14)]
    for a, b in zip(banana, banana[1:]):
        parts.append(k.capsule('Banana', a, b, .03, door, 10))
    # Utensil crock and a striped tea towel.
    parts.append(U.lathe(k, 'Crock', [(0, .95), (.07, .95), (.075, 1.12), (.08, 1.13), (0, 1.12)], teal,
                         loc=(-1.04, .14, 0), segments=12))
    for i, (dx, dy) in enumerate(((-.02, 0), (.02, .02), (0, -.02))):
        parts.append(k.cyl('Spoon', (-1.04 + dx, .14 + dy, 1.2), .008, .2, wood, vertices=5, bevel=0,
                           rot=(dy * 6, dx * 6, 0)))
        parts.append(k.ball('SpoonHead', (-1.04 + dx * 3, .14 + dy * 3, 1.3), (.025, .012, .035), wood, 8, 4))
    towel = U.puff(k, 'Towel', U.rounded_rect(-.12, .12, -.34, 0, .02, 2), .02, cab, rings=2, n=3,
                   loc=(.87, fy - .05, .74))
    parts.append(towel)
    for z in (.5, .56):
        parts.append(k.box('TowelStripe', (.87, fy - .063, z), (.245, .012, .025), coral, bevel=.004, segments=1))
    parts.append(k.box('TowelFold', (.87, fy - .05, .735), (.25, .035, .04), cab, bevel=.015, segments=1))
    return _finish(k, 'kitchen_counter', parts)


# ----------------------------------------------------------------------------- fridge
def build_fridge(k):
    mint = k.mat('Mint', 'mint', GLOSS)
    steel = k.mat('Chrome', 'steel', .2, metal=.8)
    paper = k.mat('Paper', 'white', SATIN)
    cols = {'gold': k.mat('Marigold', 'marigold', GLOSS), 'coral': k.mat('Coral', 'coral', GLOSS),
            'teal': k.mat('Teal', 'teal', GLOSS), 'leaf': k.mat('Leaf', 'leaf', GLOSS),
            'berry': k.mat('Berry', 'berry', GLOSS)}
    W, D, H = .82, .7, 1.78
    parts = [k.box('Body', (0, 0, .08 + (H - .08) / 2), (W, D, H - .08), mint, bevel=.16, segments=4)]
    fy = -D / 2
    parts.append(k.box('Freezer', (0, fy - .01, 1.47), (W - .08, .06, .5), mint, bevel=.06, segments=3))
    parts.append(k.box('Door', (0, fy - .01, .68), (W - .08, .06, 1.0), mint, bevel=.06, segments=3))
    parts.append(k.box('Seam', (0, fy + .01, 1.2), (W - .1, .04, .04), steel, bevel=.012, segments=1))
    for z0, z1 in ((1.3, 1.52), (.78, 1.08)):
        parts.append(k.capsule('Handle', (W / 2 - .1, fy - .075, z0), (W / 2 - .1, fy - .075, z1), .022, steel, 8))
        for z in (z0, z1):
            parts.append(k.cyl('Post', (W / 2 - .1, fy - .05, z), .014, .05, steel, axis='Y', vertices=6, bevel=0))
    parts.append(k.ball('Badge', (0, fy - .04, 1.13), (.1, .015, .035), steel, 12, 6))
    parts.append(k.box('Grille', (0, fy + .02, .1), (W - .16, .04, .08), steel, bevel=.015, segments=1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(k.cyl('Foot', (sx * (W / 2 - .1), sy * (D / 2 - .1), .03), .03, .06, steel, vertices=8,
                               bevel=.01, segments=1))
    # Magnets.
    my = fy - .045
    parts.append(U.puff(k, 'MagStar', U.star(.05, .024, 5), .035, cols['gold'], rings=2, loc=(.2, my, 1.55)))
    parts.append(U.puff(k, 'MagHeart', U.heart(.09, 24), .035, cols['coral'], rings=2, loc=(-.22, my, 1.4)))
    parts.append(k.cyl('MagDot', (.25, my, .55), .035, .03, cols['teal'], axis='Y', vertices=12, bevel=.01, segments=1))
    for i in range(5):
        a = i * math.tau / 5
        parts.append(k.ball('Petal', (-.2 + math.cos(a) * .03, my, .45 + math.sin(a) * .03), (.022, .014, .022),
                            cols['berry'], 8, 4))
    parts.append(k.ball('FlowerEye', (-.2, my - .01, .45), .018, cols['gold'], 8, 4))
    # The child's drawing: sun, house, grass, held up by a teal magnet.
    dx, dz = -.08, .86
    tilt = (0, math.radians(5), 0)
    draw = [U.puff(k, 'Drawing', U.rounded_rect(-.17, .17, -.14, .14, .01, 1), .012, paper, rings=2, n=3,
                   loc=(0, 0, 0))]
    draw.append(k.box('Grass', (0, -.008, -.105), (.32, .006, .05), cols['leaf'], bevel=.002, segments=1))
    draw.append(k.box('House', (-.03, -.009, -.04), (.11, .006, .09), cols['coral'], bevel=.002, segments=1))
    draw.append(k.prism('Roof', [(-.1, .005), (.04, .005), (-.03, .07)], .006, cols['berry'], loc=(0, -.009, 0),
                        bevel=.001, segments=1))
    draw.append(k.box('DoorDoodle', (-.03, -.012, -.065), (.03, .004, .045), cols['gold'], bevel=.001, segments=1))
    draw.append(k.cyl('Sun', (.1, -.009, .08), .035, .006, cols['gold'], axis='Y', vertices=12, bevel=.001, segments=1))
    for i in range(6):
        a = i * math.tau / 6
        draw.append(k.box('Ray', (.1 + math.cos(a) * .052, -.009, .08 + math.sin(a) * .052), (.02, .004, .006),
                          cols['gold'], bevel=.001, segments=1, rot=(0, -a, 0)))
    for s in (-1, 1):
        draw.append(k.capsule('Stick', (.02 + s * .025, -.009, -.08), (.02 + s * .025, -.009, -.02), .005,
                              cols['teal'], 6))
    draw.append(k.ball('StickHead', (.045, -.009, .0), .016, cols['teal'], 8, 4))
    draw.append(k.cyl('Magnet', (0, -.02, .13), .03, .025, cols['teal'], axis='Y', vertices=12, bevel=.008, segments=1))
    drawing = k.join('DrawingPart', draw, pivot=(0, 0, 0))
    drawing.location = (dx, fy - .046, dz)
    drawing.rotation_euler = tilt
    parts.append(drawing)
    # A little photo in the corner.
    parts.append(k.box('Photo', (.2, fy - .045, 1.36), (.14, .01, .1), paper, bevel=.003, segments=1,
                       rot=(0, math.radians(-8), 0)))
    parts.append(k.box('PhotoSky', (.2, fy - .052, 1.365), (.11, .004, .07), cols['teal'], bevel=.002, segments=1,
                       rot=(0, math.radians(-8), 0)))
    return _finish(k, 'fridge', parts)


# ----------------------------------------------------------------------------- dining table
def _chair(k, wood, cushion, x, facing):
    parts = []
    sh = .46
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(k.cyl('Leg', (sx * .18, sy * .17, sh / 2), .026, sh, wood, vertices=8, bevel=0, radius2=.02))
    parts.append(k.box('Seat', (0, 0, sh + .02), (.46, .44, .05), wood, bevel=.02, segments=2))
    parts.append(k.box('Cushion', (0, -.01, sh + .07), (.4, .38, .06), cushion, bevel=.028, segments=2))
    for sx in (-1, 1):
        parts.append(k.cyl('BackPost', (sx * .19, .19, sh + .28), .024, .56, wood, vertices=8, bevel=0))
        parts.append(k.ball('PostCap', (sx * .19, .19, sh + .58), .032, wood, 8, 6))
    parts.append(k.box('TopRail', (0, .19, sh + .5), (.44, .05, .12), wood, bevel=.025, segments=2))
    for bx in (-.08, 0, .08):
        parts.append(k.cyl('Spindle', (bx, .19, sh + .22), .014, .4, wood, vertices=6, bevel=0))
    for sx in (-1, 1):
        parts.append(k.box('Brace', (sx * .18, 0, .16), (.024, .34, .03), wood, bevel=.008, segments=1))
    chair = k.join('Chair', parts, pivot=(0, 0, 0))
    chair.rotation_euler = (0, 0, facing)
    chair.location = (x, 0, 0)
    return chair


def build_dining_table(k):
    wood = k.mat('Honey', U.HONEY, SATIN)
    teal = k.mat('Teal', 'teal', GLOSS)
    coral = k.mat('Coral', 'coral', SATIN)
    cream = k.mat('Cream', 'white', GLOSS)
    leaf = k.mat('Leaf', 'leaf', GLOSS)
    gold = k.mat('Marigold', 'marigold', GLOSS)
    berry = k.mat('Berry', 'berry', GLOSS)
    sky = k.mat('Sky', 'sky', GLOSS)
    parts = [k.box('Top', (0, 0, .755), (1.44, .88, .05), wood, bevel=.02, segments=2),
             k.box('Apron', (0, 0, .68), (1.28, .74, .1), wood, bevel=.015, segments=1)]
    leg = [(0, 0), (.035, 0), (.042, .04), (.03, .12), (.046, .28), (.03, .44), (.042, .56), (.045, .66), (0, .66)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(U.lathe(k, 'Leg', leg, wood, loc=(sx * .62, sy * .35, 0), segments=8))
    parts.append(k.box('Runner', (0, 0, .783), (1.52, .36, .008), teal, bevel=.003, segments=1))
    for s in (-1, 1):
        parts.append(k.box('RunnerDrop', (s * .762, 0, .72), (.01, .36, .13), teal, bevel=.003, segments=1))
        parts.append(k.box('RunnerStripe', (s * .6, 0, .789), (.04, .362, .006), cream, bevel=.002, segments=1))
        # Place settings.
        parts.append(k.cyl('Plate', (s * .46, -.2, .795), .12, .016, cream, vertices=16, bevel=.006, segments=1))
        parts.append(k.cyl('Cup', (s * .46, .12, .83), .045, .08, coral, vertices=12, bevel=.01, segments=1,
                           radius2=.05))
        parts.append(k.torus('CupHandle', (s * .46 + s * .055, .12, .835), .025, .008, coral,
                             rot=(math.pi / 2, 0, 0), major_seg=8, minor_seg=4))
    parts.append(U.lathe(k, 'Vase', [(0, .787), (.07, .787), (.1, .84), (.1, .93), (.06, 1.0), (.048, 1.04), (.066, 1.07),
                                     (.05, 1.075), (0, 1.05)], sky, segments=16))
    heads = [((-.1, -.04, 1.34), 'daisy'), ((.08, -.06, 1.38), 'tulip'), ((.0, .06, 1.45), 'pom'),
             ((.16, .04, 1.27), 'daisy'), ((-.17, .05, 1.24), 'tulip')]
    for (x, y, z), kind in heads:
        parts.append(k.tube('Stem', [(x * .15, y * .15, 1.03), (x * .6, y * .6, (1.03 + z) / 2), (x, y, z - .03)],
                            .01, leaf))
        if kind == 'daisy':
            for i in range(7):
                a = i * math.tau / 7
                parts.append(k.ball('Petal', (x + math.cos(a) * .045, y - .01, z + math.sin(a) * .045),
                                    (.03, .012, .018), cream, 6, 3, rot=(0, -a, 0)))
            parts.append(k.ball('Eye', (x, y - .02, z), .028, gold, 8, 5))
        elif kind == 'tulip':
            parts.append(U.lathe(k, 'Tulip', [(0, -.02), (.04, -.01), (.05, .04), (.04, .07), (.028, .06), (0, .05)],
                                 coral, loc=(x, y, z), segments=10))
        else:
            parts.append(k.ball('Pom', (x, y, z), .05, berry, 10, 6))
    for s in (-1, 1):
        parts.append(_leaf(k, 'VaseLeaf', (s * .03, 0, 1.06), s * 1.4, -.9, .2, .09, leaf, droop=.05))
    parts.append(_chair(k, teal, coral, -.98, math.pi / 2))
    parts.append(_chair(k, teal, coral, .98, -math.pi / 2))
    return _finish(k, 'dining_table', parts)


# ----------------------------------------------------------------------------- high chair
def build_high_chair(k):
    wood = k.mat('Honey', U.HONEY_LIGHT, SATIN)
    coral = k.mat('Coral', 'coral', GLOSS)
    gold = k.mat('Marigold', 'marigold', SATIN)
    teal = k.mat('Teal', 'teal', GLOSS)
    cream = k.mat('Cream', 'white', GLOSS)
    parts = []
    seat_z = .6
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * .16, sy * .14, seat_z)
            foot = (sx * .27, sy * .28, .02)
            parts.append(k.capsule('Leg', top, foot, .026, wood, 8))
            parts.append(k.ball('FootCap', (foot[0], foot[1], .025), (.035, .035, .025), coral, 8, 4))
    for sy in (-1, 1):
        parts.append(k.capsule('SideBrace', (-.235, sy * .235, .15), (.235, sy * .235, .15), .014, wood, 6))
    for sx in (-1, 1):
        parts.append(k.capsule('Brace', (sx * .235, -.235, .15), (sx * .235, .235, .15), .014, wood, 6))
    parts.append(k.box('Footrest', (0, -.235, .32), (.4, .07, .03), wood, bevel=.012, segments=1))
    parts.append(k.box('Seat', (0, 0, seat_z), (.38, .36, .05), wood, bevel=.02, segments=2))
    parts.append(k.box('SeatPad', (0, -.01, seat_z + .045), (.33, .31, .045), gold, bevel=.02, segments=2))
    back = [(-.19, 0), (.19, 0), (.19, .32)]
    for i in range(1, 10):
        t = i / 10
        back.append((.19 - t * .38, .32 + math.sin(t * math.pi) * .1))
    back.append((-.19, .32))
    parts.append(k.prism('Back', back, .045, wood, loc=(0, .17, seat_z + .02), bevel=.02, segments=2))
    parts.append(U.puff(k, 'BackHeart', U.heart(.16, 24), .04, coral, rings=2, loc=(0, .14, seat_z + .26)))
    for sx in (-1, 1):
        parts.append(k.box('ArmRest', (sx * .19, -.02, seat_z + .19), (.045, .34, .04), wood, bevel=.015, segments=1))
        parts.append(k.capsule('ArmPost', (sx * .19, -.16, seat_z + .02), (sx * .19, -.16, seat_z + .18), .018, wood, 6))
    # Tray with a raised rim, a teal bowl and a spoon.
    ty, tz = -.31, seat_z + .2
    parts.append(k.box('Tray', (0, ty, tz), (.56, .26, .03), coral, bevel=.012, segments=1))
    for dx, dy, w, d in ((0, -.12, .56, .03), (0, .12, .56, .03), (-.27, 0, .03, .26), (.27, 0, .03, .26)):
        parts.append(k.box('TrayRim', (dx, ty + dy, tz + .025), (w, d, .03), coral, bevel=.012, segments=1))
    for sx in (-1, 1):
        parts.append(k.box('TrayArm', (sx * .19, ty + .12, tz - .01), (.04, .14, .03), coral, bevel=.01, segments=1))
    parts.append(U.lathe(k, 'Bowl', [(0, 0), (.04, 0), (.08, .045), (.085, .05), (.072, .05), (.035, .015), (0, .015)],
                         teal, loc=(.08, ty, tz + .015), segments=14))
    parts.append(k.capsule('Spoon', (-.14, ty - .04, tz + .03), (-.02, ty + .02, tz + .03), .009, cream, 6))
    parts.append(k.ball('SpoonBowl', (-.16, ty - .05, tz + .03), (.025, .018, .008), cream, 8, 4))
    parts.append(k.ball('Cereal', (.08, ty, tz + .055), (.05, .05, .015), gold, 8, 4))
    chair = k.join('high_chair', parts, pivot=(0, 0, 0))
    _turn(chair, math.radians(-58))
    zs = [v.co.z for v in chair.data.vertices]
    chair['height'] = round(max(zs), 3)
    chair['facing'] = '3/4 toward -X'
    k.paint([chair], lo=0, hi=max(zs), shade=.66)
    return chair


# ----------------------------------------------------------------------------- rocking horse
def build_rocking_horse(k):
    white = k.mat('Horse', '#fff3e0', GLOSS)
    wood = k.mat('Rocker', 'wood', SATIN)
    coral = k.mat('Coral', 'coral', GLOSS)
    gold = k.mat('Marigold', 'marigold', GLOSS)
    teal = k.mat('Teal', 'teal', GLOSS)
    eye = k.mat('Eye', '#1b1426', .12)
    shine = k.mat('EyeShine', '#ffffff', .2, emit=1.4)
    parts = []
    R = 1.6
    for sy in (-1, 1):
        outer, inner = [], []
        for i in range(13):
            a = math.radians(-112 + i * 44 / 12)
            outer.append((math.cos(a) * R, R + math.sin(a) * R))
            inner.append((math.cos(a) * (R - .07), R + math.sin(a) * (R - .07)))
        parts.append(k.prism('Rocker', outer + inner[::-1], .055, wood, loc=(0, sy * .17, 0), bevel=.018, segments=1))
        for sx in (-1, 1):
            a = math.radians(-90 + sx * 22)
            parts.append(k.ball('Curl', (math.cos(a) * (R - .035), sy * .17, R + math.sin(a) * (R - .035)), .045, gold,
                                10, 6))
    for x in (-.32, 0, .32):
        z = R - math.sqrt(R * R - x * x) + .06
        parts.append(k.box('Slat', (x, 0, z), (.08, .4, .04), wood, bevel=.015, segments=1))
    # Body, legs and hooves.
    parts.append(k.capsule('Body', (-.2, 0, .58), (.22, 0, .58), .165, white, 14))
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * .17, sy * .08, .5)
            x = sx * .3
            z = R - math.sqrt(R * R - x * x) + .09
            parts.append(k.capsule('Leg', top, (x, sy * .16, z + .05), .048, white, 8))
            parts.append(k.cyl('Hoof', (x, sy * .16, z + .02), .055, .05, coral, vertices=10, bevel=0))
    # Neck, head and face.
    parts.append(k.capsule('Neck', (-.22, 0, .64), (-.36, 0, .88), .1, white, 12))
    head_c = Vector((-.44, 0, .92))
    head = k.ball('Head', head_c, (.15, .1, .1), white, 14, 8, rot=(0, math.radians(28), 0))
    parts.append(head)
    parts.append(k.ball('Snout', (-.55, 0, .84), (.085, .085, .075), white, 12, 7))
    parts.append(k.torus('Bridle', (-.53, 0, .855), .085, .014, gold, rot=(0, math.radians(90 - 30), 0),
                         major_seg=16, minor_seg=4))
    for s in (-1, 1):
        parts.append(k.ball('Nostril', (-.625, s * .035, .84), .012, eye, 6, 4))
        parts.append(k.capsule('Ear', (-.38, s * .05, 1.0), (-.35, s * .06, 1.09), .025, white, 8))
        parts.append(k.ball('EarIn', (-.365, s * .052 - s * .0, 1.045), (.012, .012, .03), coral, 6, 4))
        parts.append(k.ball('Eye', (-.47, s * .095, .96), (.025, .012, .03), eye, 8, 6))
        parts.append(k.ball('Shine', (-.478, s * .105, .97), .007, shine, 6, 4))
    parts.append(k.cyl('Handle', (-.4, 0, .98), .018, .34, wood, axis='Y', vertices=8, bevel=0))
    for s in (-1, 1):
        parts.append(k.ball('HandleEnd', (-.4, s * .17, .98), .03, gold, 8, 6))
    # Mane and tail in coral and marigold tufts.
    for i in range(7):
        t = i / 6
        p = Vector((-.39, 0, 1.0)).lerp(Vector((-.14, 0, .74)), t)
        parts.append(k.ball('Mane', p + Vector((.02, 0, .03)), (.05, .055, .06), coral if i % 2 == 0 else gold, 8, 6))
    for i, (dx, dz, rot) in enumerate(((.39, .62, .6), (.43, .52, .9), (.4, .45, 1.2))):
        parts.append(k.ball('Tail', (dx, 0, dz), (.05, .045, .1), coral if i != 1 else gold, 8, 6,
                            rot=(0, rot, 0)))
    # Saddle, blanket, stirrups and dapples.
    parts.append(k.box('Blanket', (.03, 0, .7), (.3, .4, .03), gold, bevel=.012, segments=1))
    parts.append(k.box('Saddle', (.03, 0, .74), (.22, .3, .06), teal, bevel=.028, segments=2))
    parts.append(k.ball('Pommel', (-.07, 0, .78), (.03, .05, .04), teal, 8, 6))
    for s in (-1, 1):
        parts.append(k.box('Strap', (.03, s * .17, .6), (.03, .01, .18), teal, bevel=.004, segments=1))
        parts.append(k.torus('Stirrup', (.03, s * .175, .49), .035, .01, gold, rot=(math.pi / 2, 0, 0), major_seg=10,
                             minor_seg=4))
    body_c = Vector((0, 0, .58))
    for d, sz in (((.5, -1, .3), .035), ((-.2, -1, .5), .03), ((.9, -1, -.1), .028), ((-.6, -1, .1), .025),
                  ((.4, 1, .3), .035), ((-.3, 1, .4), .03)):
        parts.append(U.decal(k, 'Dapple', body_c, (.38, .165, .165), d, (sz, .01, sz * .8), coral, lift=-.002,
                              seg=10, rings=4))
    horse = k.join('rocking_horse', parts, pivot=(0, 0, 0))
    zs = [v.co.z for v in horse.data.vertices]
    horse['height'] = round(max(zs), 3)
    horse['facing'] = '-X'
    k.paint([horse], lo=0, hi=max(zs), shade=.66)
    return horse


BUILDERS = {
    'crib': build_crib,
    'sofa': build_sofa,
    'armchair': build_armchair,
    'bookshelf': build_bookshelf,
    'toy_chest': build_toy_chest,
    'floor_lamp': build_floor_lamp,
    'plant_big': build_plant_big,
    'kitchen_counter': build_kitchen_counter,
    'fridge': build_fridge,
    'dining_table': build_dining_table,
    'high_chair': build_high_chair,
    'rocking_horse': build_rocking_horse,
}
