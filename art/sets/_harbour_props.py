"""Marigold Bay street furniture, festival pieces and in-lane hazards.

Props: origin at the centre of the footprint, base at Z = 0, front facing -Y.
Hazards also carry root extras 'kind' ('low' can be jumped, 'tall' must be dodged).
"""
import math
import random

import bmesh
from mathutils import Vector

import _harbour_lib as L
from _harbour_lib import GLOSS, MATTE, SATIN, box, cyl, ball, rod

RAINBOW = ['coral', 'marigold', 'teal', 'berry', 'leaf', 'sky']


# ============================================================================ street furniture
def lamp_post(k):
    """Ornate harbour lamp: stone foot, fluted teal column, scroll arm with a flower basket, glowing lantern."""
    iron = k.mat('Iron', '#0e6f86', GLOSS)
    gold = k.mat('Gold', 'marigold', .3, metal=.5)
    stone = k.mat('Stone', '#c8b8dc', MATTE)
    glow = L.lamp(k)
    leaf = k.mat('Leaf', 'leaf', SATIN)
    bloom = k.mat('Flower', 'berry', GLOSS)
    parts = [k.lathe('Foot', [(.3, 0), (.3, .12), (.24, .16), (.22, .42), (.15, .5), (.13, .56)], stone, segments=8),
             k.lathe('Column', [(.13, .5), (.1, .8), (.085, 2.55), (.1, 2.62), (.1, 2.68)], iron, segments=10)]
    for z in (.62, 1.55, 2.62):
        parts.append(cyl(k, 'Collar', (0, 0, z), .13, .07, gold, v=10, bevel=0))
    for i in range(5):
        a = i / 5 * math.tau
        parts.append(box(k, 'Flute', (math.cos(a) * .1, math.sin(a) * .1, 1.1), (.03, .03, .8), iron, 0,
                         rot=(0, 0, a)))
    # Lantern: bottom cup, four glass panes (Lamp), corner posts, pyramid roof, finial.
    z0 = 2.72
    parts.append(k.lathe('Cup', [(.05, z0 - .12), (.16, z0 - .02), (.2, z0 + .04), (.16, z0 + .06)], iron, segments=8))
    parts.append(k.tbox('Glass', (0, 0, z0 + .3), (.34, .34), (.24, .24), .5, glow, bevel=.02, segments=1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(rod(k, 'Post', (sx * .12, sy * .12, z0 + .05), (sx * .175, sy * .175, z0 + .56), .025, iron, 6))
    parts.append(k.tbox('Brim', (0, 0, z0 + .6), (.46, .46), (.44, .44), .07, iron, bevel=.02, segments=1))
    parts.append(k.tbox('Roof', (0, 0, z0 + .78), (.06, .06), (.42, .42), .3, iron, bevel=.03, segments=1))
    parts.append(ball(k, 'Finial', (0, 0, z0 + 1.0), .07, gold, 8, 5))
    # Scroll arm with a hanging flower basket.
    pts = [(.06, 0, 2.3), (.3, 0, 2.38), (.5, 0, 2.32), (.58, 0, 2.2), (.53, 0, 2.1), (.44, 0, 2.14)]
    parts.append(L.tube(k, 'Scroll', pts, .032, iron))
    parts.append(rod(k, 'Stay', (.06, 0, 2.05), (.4, 0, 2.34), .022, iron, 6))
    parts.append(rod(k, 'Hanger', (.5, 0, 2.32), (.5, 0, 1.98), .014, gold, 5))
    parts.append(k.lathe('Basket', [(.05, 1.68), (.2, 1.74), (.25, 1.88), (.23, 1.92)], iron, loc=(.5, 0, 0), segments=10))
    parts.append(ball(k, 'Greens', (.5, 0, 1.92), (.28, .28, .16), leaf, 10, 5))
    rng = random.Random(4)
    for i in range(7):
        a = i / 7 * math.tau + .3
        parts.append(ball(k, 'Bloom', (.5 + math.cos(a) * .22, math.sin(a) * .22, 1.96 + rng.uniform(0, .06)), .065,
                          bloom, 6, 4))
    for a in (-1.2, .4, 2.2):
        parts.append(ball(k, 'Trail', (.5 + math.cos(a) * .22, math.sin(a) * .22, 1.72), (.07, .07, .15), leaf, 6, 4))
    obj = L.finish(k, parts, 'lamp_post')
    obj['light_z'] = z0 + .3
    return obj


def bench(k):
    """Harbour bench: warm wooden slats on teal cast-iron ends with scrolled arms."""
    wood = k.mat('Wood', 'wood_light', SATIN)
    iron = k.mat('Iron', '#0e6f86', GLOSS)
    gold = k.mat('Gold', 'marigold', .3, metal=.5)
    W = 1.8
    parts = []
    for i in range(3):
        parts.append(box(k, 'Seat', (0, -.2 + i * .15, .47), (W, .13, .06), wood, .025, 1))
    for i in range(2):
        z = .66 + i * .17
        parts.append(box(k, 'Back', (0, .22 + i * .03, z), (W, .06, .13), wood, .025, 1, rot=(-.2, 0, 0)))
    side = [(-.26, 0), (-.18, 0), (-.12, .38), (.12, .38), (.2, 0), (.28, 0), (.2, .44), (.24, .95), (.3, 1.0),
            (.26, 1.04), (.14, .5), (-.2, .5), (-.28, .66), (-.3, .6), (-.24, .44)]
    for s in (-1, 1):
        parts.append(k.prism('End', side, .07, iron, loc=(s * (W / 2 - .12), 0, 0), axis='X', bevel=.015))
        parts.append(box(k, 'Arm', (s * (W / 2 - .12), -.1, .64), (.1, .42, .06), wood, .02, 1))
        parts.append(ball(k, 'ArmKnob', (s * (W / 2 - .12), -.31, .64), .05, gold, 6, 4))
        parts.append(box(k, 'Foot', (s * (W / 2 - .12), 0, .02), (.16, .66, .05), iron, .02, 1))
    parts.append(box(k, 'Plaque', (0, .27, .92), (.26, .02, .07), gold, 0, rot=(-.2, 0, 0)))
    return L.finish(k, parts, 'bench')


def planter(k):
    """Marigold wooden planter with cream trim, overflowing with leaves and berry/coral/sun blooms."""
    body_m = k.mat('Box', 'marigold', GLOSS)
    trim = k.mat('Trim', 'cream', GLOSS)
    soil = k.mat('Soil', '#6a3a2a', MATTE)
    leaf = k.mat('Leaf', 'leaf', SATIN)
    dark = k.mat('LeafDark', 'leaf_dark', SATIN)
    blooms = [k.mat('Flower', 'berry', GLOSS), k.mat('Flower2', 'coral', GLOSS), k.mat('Flower3', 'sun', GLOSS)]
    W, D, H = 1.2, .5, .42
    parts = [box(k, 'Body', (0, 0, H / 2 + .04), (W, D, H), body_m, .05, 2),
             box(k, 'Rim', (0, 0, H + .05), (W + .08, D + .08, .07), trim, .025, 1),
             box(k, 'Soil', (0, 0, H + .04), (W - .08, D - .08, .06), soil, 0)]
    for sx in (-1, 1):
        parts.append(box(k, 'Leg', (sx * (W / 2 - .04), -D / 2 + .04, .12), (.1, .1, .24), trim, .02, 1))
        parts.append(box(k, 'Leg', (sx * (W / 2 - .04), D / 2 - .04, .12), (.1, .1, .24), trim, .02, 1))
    for i in range(3):
        parts.append(box(k, 'Batten', (-W / 3 + i * W / 3, -D / 2 - .01, H / 2 + .04), (.06, .03, H - .08), trim, 0))
    rng = random.Random(9)
    for i in range(4):
        x = -.45 + i * .3
        parts.append(ball(k, 'Leaves', (x, rng.uniform(-.06, .06), H + .15), (.2, .2, .15), leaf if i % 2 else dark,
                          8, 5))
    for i in range(9):
        x = -.5 + i * .125
        parts.append(ball(k, 'Bloom', (x, rng.uniform(-.14, .1), H + .24 + rng.uniform(0, .06)), .065,
                          blooms[i % 3], 6, 4))
    for s in (-1, 1):
        parts.append(ball(k, 'Trail', (s * .35, -D / 2 - .03, H - .02), (.09, .06, .14), leaf, 6, 4))
    return L.finish(k, parts, 'planter', sharp=70)


def bollard(k):
    """Mooring bollard: navy cast iron with a marigold band and a rope loop trailing off."""
    iron = k.mat('Iron', '#23407a', GLOSS)
    band = k.mat('Band', 'marigold', GLOSS)
    rope = k.mat('Rope', '#f0c27a', SATIN)
    stone = k.mat('Stone', '#c8b8dc', MATTE)
    parts = [box(k, 'Plate', (0, 0, .04), (.62, .62, .08), stone, .03, 1),
             k.lathe('Post', [(.2, .06), (.22, .1), (.17, .2), (.15, .36), (.19, .44), (.26, .5), (.25, .56),
                              (.12, .6), (0, .61)], iron, segments=14),
             cyl(k, 'Band', (0, 0, .28), .165, .08, band, v=14, bevel=.02)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(ball(k, 'Bolt', (sx * .23, sy * .23, .09), .035, iron, 6, 4))
    loop = [(math.cos(a) * .2, math.sin(a) * .2, .3 + math.sin(a * 2) * .01) for a in
            [i / 12 * math.tau for i in range(12)]]
    parts.append(L.tube(k, 'RopeLoop', loop, .055, rope, closed=True))
    trail = [(.18, -.1, .3), (.32, -.22, .16), (.42, -.24, .05), (.62, -.18, .04), (.78, -.02, .04)]
    parts.append(L.tube(k, 'RopeTail', trail, .05, rope))
    return L.finish(k, parts, 'bollard', pivot=(0, 0, 0))


def bunting(k):
    """A sagging string of triangular flags between two striped poles at X = +-4."""
    pole = k.mat('Pole', 'white', GLOSS)
    stripe = k.mat('Stripe', 'coral', GLOSS)
    string = k.mat('String', 'cream', SATIN)
    flags = [k.mat('Flag%d' % i, c, SATIN) for i, c in enumerate(['coral', 'marigold', 'teal', 'berry', 'leaf'])]
    parts = []
    top = 3.3
    for s in (-1, 1):
        x = s * 4
        parts.append(cyl(k, 'Pole', (x, 0, top / 2), .06, top, pole, v=8, bevel=0))
        for i in range(4):
            parts.append(cyl(k, 'Stripe', (x, 0, .5 + i * .7), .066, .22, stripe, v=8, bevel=0))
        parts.append(ball(k, 'Cap', (x, 0, top + .05), .1, stripe, 8, 5))
        parts.append(cyl(k, 'Base', (x, 0, .06), .22, .12, pole, v=10, bevel=.03))
    n = 24
    pts = []
    for i in range(n + 1):
        t = i / n
        x = -4 + 8 * t
        z = top - .15 - .75 * (1 - (2 * t - 1) ** 2)
        pts.append((x, 0, z))
    parts.append(L.tube(k, 'String', pts, .015, string))
    for i in range(1, n):
        x, _, z = pts[i]
        w = .3
        parts.append(k.prism('Flag', [(-w / 2, 0), (w / 2, 0), (0, -.4)], .02, flags[i % len(flags)],
                             loc=(x, 0, z - .01), bevel=0))
    return L.finish(k, parts, 'bunting', span=8.)


def crate_stack(k):
    """Stacked wooden harbour crates with painted fish stencils and a coiled rope on top."""
    wood = k.mat('Wood', 'wood_light', SATIN)
    dark = k.mat('WoodDark', 'wood', SATIN)
    paint = k.mat('Stencil', 'teal', GLOSS)
    rope = k.mat('Rope', '#f0c27a', SATIN)
    parts = []

    def crate(cx, cy, cz, w, d, h, rz=0.):
        ps = [box(k, 'Crate', (0, 0, cz + h / 2), (w - .04, d - .04, h - .04), wood, .03, 1)]
        for sx in (-1, 1):
            ps.append(box(k, 'Corner', (sx * (w / 2 - .04), -d / 2 + .02, cz + h / 2), (.08, .06, h), dark, .015))
        for z in (cz + .06, cz + h - .06):
            ps.append(box(k, 'Rail', (0, -d / 2 + .01, z), (w, .05, .08), dark, .015))
        ps.append(ball(k, 'Fish', (-.03, -d / 2 - .01, cz + h / 2), (w * .18, .015, h * .12), paint, 8, 4))
        ps.append(k.prism('Tail', [(0, 0), (.1, .07), (.1, -.07)], .02, paint,
                          loc=(w * .17, -d / 2 - .01, cz + h / 2), bevel=0))
        return L.place(ps, (cx, cy, 0), (0, 0, rz))
    parts += crate(-.36, 0, 0, .7, .55, .45)
    parts += crate(.38, .02, 0, .7, .55, .45, .06)
    parts += crate(-.05, 0, .45, .7, .55, .45, -.08)
    ring = [(.5 + math.cos(a) * .17, .05 + math.sin(a) * .17, .47) for a in [i / 10 * math.tau for i in range(10)]]
    parts.append(L.tube(k, 'Coil', ring, .045, rope, closed=True))
    ring2 = [(.5 + math.cos(a) * .12, .05 + math.sin(a) * .12, .55) for a in [i / 8 * math.tau for i in range(8)]]
    parts.append(L.tube(k, 'Coil', ring2, .04, rope, closed=True))
    return L.finish(k, parts, 'crate_stack')


def _barrel_parts(k, wood, hoop, lid, h=1.0, r=.34):
    prof = [(r * .82, 0), (r * .94, h * .15), (r, h * .5), (r * .94, h * .85), (r * .82, h)]
    parts = [k.lathe('Barrel', prof, wood, segments=14)]
    for t in (.1, .32, .68, .9):
        rr = r * (.86 + .14 * math.sin(t * math.pi)) + .012
        parts.append(k.torus('Hoop', (0, 0, h * t), rr, .025, hoop, major_seg=14, minor_seg=4))
    parts.append(cyl(k, 'Lid', (0, 0, h - .01), r * .8, .04, lid, v=14, bevel=0))
    for i in (-1, 0, 1):
        parts.append(box(k, 'LidPlank', (i * r * .5, 0, h + .015), (.02, r * 1.3, .012), wood, 0))
    for i in range(7):
        a = i / 7 * math.tau
        parts.append(box(k, 'Stave', (math.cos(a) * r * 1.0, math.sin(a) * r * 1.0, h * .5), (.018, .018, h * .5), lid,
                         0, rot=(0, 0, a)))
    return parts


def barrel(k):
    wood = k.mat('Wood', 'wood', SATIN)
    hoop = k.mat('Iron', '#34323f', GLOSS)
    lid = k.mat('WoodDark', 'wood_dark', SATIN)
    return L.finish(k, _barrel_parts(k, wood, hoop, lid), 'barrel')


def tree_pine(k):
    """Stylised coastal pine: leaning trunk, chunky rounded tiers in two greens, a few cones."""
    bark = k.mat('Bark', '#9a5530', SATIN)
    g1 = k.mat('Leaf', '#2f9a3a', SATIN)
    g2 = k.mat('Leaf2', '#5cc639', SATIN)
    g3 = k.mat('Leaf3', '#8fdc4a', SATIN)
    cone_m = k.mat('Cone', 'wood', SATIN)
    # A windswept trunk that leans and kinks, with branches out to three chunky cloud tiers.
    spine = [(0, 0, -.05), (.06, 0, .6), (.14, 0, 1.3), (.36, 0, 2.2), (.36, 0, 2.8), (.22, 0, 3.5), (.06, 0, 4.3)]
    radii = [.3, .23, .2, .17, .15, .12, .08]
    parts = [L.sweep(k, 'Trunk', spine, radii, bark, 10)]
    for i in range(4):
        ang = i / 4 * math.tau + .4
        parts.append(L.sweep(k, 'Root', [(math.cos(ang) * .1, math.sin(ang) * .1, .35), (math.cos(ang) * .3, math.sin(ang) * .3, .1),
                                         (math.cos(ang) * .5, math.sin(ang) * .5, 0)], [.12, .08, .03], bark, 6))
    pads = [((1.05, -.05, 2.55), (1.35, 1.1, .5), (.42, 0, 2.2)), ((-.75, .1, 3.35), (1.2, 1.0, .46), (.34, 0, 3.1)),
            ((.25, 0, 4.35), (1.05, .9, .5), (.12, 0, 4.0))]
    for i, (c, r, root) in enumerate(pads):
        parts.append(L.sweep(k, 'Branch', [root, ((c[0] + root[0]) / 2, c[1], c[2] - r[2] * .3),
                                           (c[0] * .8 + root[0] * .2, c[1], c[2] - r[2] * .4)], [.09, .07, .05], bark, 6))
        # Underside (dark), main cloud (mid green) and a lighter crown of bumps on top.
        parts.append(ball(k, 'PadUnder', (c[0], c[1], c[2] - r[2] * .25), (r[0] * .92, r[1] * .9, r[2] * .7), g1, 12, 6))
        parts.append(ball(k, 'Pad', c, r, g2, 14, 7))
        for j in range(3):
            a = j / 3 * math.tau + i
            parts.append(ball(k, 'Bump', (c[0] + math.cos(a) * r[0] * .45, c[1] + math.sin(a) * r[1] * .4, c[2] + r[2] * .55),
                              (r[0] * .42, r[1] * .4, r[2] * .5), g3 if j == 0 else g2, 10, 5))
    for x, y, z in ((1.4, -.8, 2.2), (-1.0, -.7, 3.0), (.6, -.72, 4.0)):
        parts.append(ball(k, 'PineCone', (x, y, z), (.08, .08, .11), cone_m, 6, 4))
    return L.finish(k, parts, 'tree_pine', sharp=75)


def fence_warning(k):
    """Temporary construction fence: orange/white frame on weighted feet, mesh panel, chevron board,
    a warning-triangle pictogram and a blinking lamp."""
    orange = k.mat('Orange', 'orange', GLOSS)
    white = k.mat('White', 'white', GLOSS)
    mesh_m = k.mat('Mesh', '#5a5670', SATIN)
    foot = k.mat('Foot', '#ff8a1f', MATTE)
    ink = k.mat('Ink', 'ink', GLOSS)
    red = k.mat('Red', 'red', GLOSS)
    glow = L.lamp(k, '#ffb627', 2.2)
    W, H = 3.0, 1.8
    parts = []
    for s in (-1, 1):
        x = s * W / 2
        parts.append(k.tbox('Foot', (x, 0, .09), (.3, .5), (.4, .7), .18, foot, bevel=.04, segments=1))
        for i in range(4):
            parts.append(cyl(k, 'Upright', (x, 0, .18 + i * .42 + .21), .045, .42, orange if i % 2 == 0 else white,
                             v=8, bevel=0))
    for z, i in ((.3, 0), (H - .05, 1)):
        for j in range(6):
            x0 = -W / 2 + j * W / 6
            parts.append(rod(k, 'Rail', (x0, 0, z), (x0 + W / 6, 0, z), .04, orange if (j + i) % 2 == 0 else white, 8))
    for j in range(1, 12):
        x = -W / 2 + j * W / 12
        parts.append(box(k, 'Wire', (x, 0, (H + .3) / 2), (.015, .015, H - .3), mesh_m, 0))
    for j in range(1, 6):
        z = .3 + j * (H - .35) / 6
        parts.append(box(k, 'Wire', (0, 0, z), (W, .015, .015), mesh_m, 0))
    # Chevron board along the bottom.
    parts.append(box(k, 'Board', (0, -.06, .5), (W - .3, .04, .3), white, .015, 1))
    for j in range(7):
        x = -1.2 + j * .4
        parts.append(k.prism('Chevron', [(-.1, -.13), (.06, -.13), (.16, .13), (0, .13)], .02, red,
                             loc=(x, -.09, .5), bevel=0))
    # Warning sign: white plate, red triangle border, black exclamation mark.
    sz = 1.25
    parts.append(box(k, 'Plate', (0, -.06, sz), (.72, .04, .66), white, .03, 1))
    tri = [(-.3, -.24), (.3, -.24), (0, .28)]
    inner = [(-.2, -.18), (.2, -.18), (0, .17)]
    parts.append(L.frame(k, 'Triangle', [(x, z + sz) for x, z in tri], [(x, z + sz) for x, z in inner], -.08, .03, red,
                         bevel=0))
    parts.append(box(k, 'Bang', (0, -.1, sz + .02), (.05, .02, .17), ink, 0))
    parts.append(box(k, 'Dot', (0, -.1, sz - .11), (.05, .02, .05), ink, 0))
    # Blinking lamp on the left upright.
    parts.append(cyl(k, 'LampBase', (-W / 2, 0, H + .05), .07, .1, ink, v=8, bevel=0))
    parts.append(ball(k, 'LampGlass', (-W / 2, 0, H + .17), (.09, .09, .1), glow, 8, 5))
    return L.finish(k, parts, 'fence_warning')


# ============================================================================ coast furniture
def beach_hut(k):
    """Colourful beach hut: berry siding, white trim, marigold/white striped door, little deck."""
    wall = k.mat('Wall', 'berry', .4)
    trim = k.mat('Trim', 'white', GLOSS)
    roof = k.mat('Roof', 'teal', GLOSS)
    door_a = k.mat('Door', 'marigold', GLOSS)
    deck = k.mat('Deck', 'wood_light', SATIN)
    glass_m = L.glass(k)
    buoy = k.mat('Buoy', 'coral', GLOSS)
    W, D, H = 2.0, 2.0, 2.0
    parts = [box(k, 'Hut', (0, 0, .35 + H / 2), (W, D, H), wall, .05, 2)]
    for i in range(1, 6):
        x = -W / 2 + i * W / 6
        parts.append(box(k, 'Batten', (x, -D / 2 - .01, .35 + H / 2), (.05, .04, H - .05), wall, 0))
    parts.append(k.prism('Gable', [(-W / 2, 0), (W / 2, 0), (0, .8)], D, wall, loc=(0, 0, .35 + H - .01), bevel=.04))
    for s in (-1, 1):
        a = math.atan2(.8, W / 2)
        L_ = math.hypot(W / 2 + .25, .8 + .2)
        parts.append(box(k, 'RoofSide', (s * (W / 4 + .06), 0, .35 + H + .45), (L_, D + .4, .1), roof, .04, 2,
                         rot=(0, s * a, 0)))
        parts.append(box(k, 'Barge', (s * (W / 4 + .06), -D / 2 - .2, .35 + H + .42), (L_, .08, .16), trim, .03, 1,
                         rot=(0, s * a, 0)))
    parts.append(ball(k, 'Finial', (0, -D / 2 - .2, .35 + H + .95), .09, buoy, 8, 5))
    # Striped door and frame.
    dw, dh = .9, 1.7
    for i in range(5):
        x = -dw / 2 + dw / 5 * (i + .5)
        parts.append(box(k, 'DoorStripe', (x, -D / 2 - .02, .4 + dh / 2), (dw / 5 + .001, .06, dh), door_a if i % 2 == 0
                         else trim, .01, 1))
    parts.append(L.frame(k, 'DoorFrame', [(-dw / 2 - .1, .38), (dw / 2 + .1, .38), (dw / 2 + .1, .4 + dh + .1),
                                          (-dw / 2 - .1, .4 + dh + .1)],
                         [(-dw / 2, .38), (dw / 2, .38), (dw / 2, .4 + dh), (-dw / 2, .4 + dh)], -D / 2, .08, trim,
                         .02))
    parts.append(ball(k, 'Knob', (dw * .35, -D / 2 - .08, 1.2), .04, trim, 6, 4))
    # Round window in the gable.
    parts.append(k.torus('Port', (0, -D / 2 - .03, .35 + H + .35), .2, .05, trim, rot=(math.pi / 2, 0, 0), major_seg=12,
                         minor_seg=4))
    parts.append(cyl(k, 'PortGlass', (0, -D / 2, .35 + H + .35), .19, .04, glass_m, axis='Y', v=12, bevel=0))
    # Deck on stilts with a step.
    parts.append(box(k, 'Deck', (0, -.25, .3), (W + .4, D + .9, .1), deck, .03, 1))
    for i in range(6):
        x = -W / 2 - .1 + i * (W + .2) / 5
        parts.append(box(k, 'Gap', (x, -.25, .355), (.02, D + .8, .01), trim, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(k, 'Stilt', (sx * (W / 2 + .05), -.25 + sy * (D / 2 + .3), .13), (.12, .12, .26), deck,
                             .02, 1))
    parts.append(box(k, 'Step', (0, -D / 2 - .85, .12), (.9, .35, .08), deck, .02, 1))
    # Lifebuoy on the wall.
    parts.append(k.torus('Lifebuoy', (W / 2 - .02, -.4, 1.4), .24, .07, buoy, rot=(0, math.pi / 2, 0), major_seg=12,
                         minor_seg=5))
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        parts.append(box(k, 'BuoyBand', (W / 2 + .02, -.4 + math.cos(a) * .24, 1.4 + math.sin(a) * .24), (.16, .08, .08),
                         trim, 0, rot=(a, 0, 0)))
    return L.finish(k, parts, 'beach_hut')


def bus_stop(k):
    """Bus shelter: teal frame, curved marigold roof, glass back, bench and a round sign pole."""
    frame_m = k.mat('Frame', 'teal', GLOSS)
    roof = k.mat('Roof', 'marigold', GLOSS)
    glass_m = L.glass(k)
    wood = k.mat('Wood', 'wood_light', SATIN)
    white = k.mat('Sign', 'white', GLOSS)
    ink = k.mat('Ink', '#23407a', GLOSS)
    coral = k.mat('Coral', 'coral', GLOSS)
    W, D, H = 3.0, 1.3, 2.4
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(k, 'Post', (sx * (W / 2 - .06), sy * (D / 2 - .06), H / 2), (.1, .1, H), frame_m, .03, 1))
    # Curved roof (a bent slab built as segments).
    segs = 6
    for i in range(segs):
        a0 = -.5 + i / segs
        a1 = -.5 + (i + 1) / segs
        y0, y1 = a0 * (D + .4), a1 * (D + .4)
        z0 = H + .25 * math.cos(a0 * math.pi) - .05
        z1 = H + .25 * math.cos(a1 * math.pi) - .05
        ang = math.atan2(z1 - z0, y1 - y0)
        parts.append(box(k, 'Roof', (0, (y0 + y1) / 2, (z0 + z1) / 2 + .05), (W + .3, math.hypot(y1 - y0, z1 - z0) + .02,
                                                                                .08), roof, .03, 1, rot=(ang, 0, 0)))
    parts.append(box(k, 'Fascia', (0, -D / 2 - .2, H + .02), (W + .32, .06, .16), frame_m, .02, 1))
    # Glass back and side panels.
    parts.append(box(k, 'BackGlass', (0, D / 2 - .06, 1.35), (W - .2, .04, 1.7), glass_m, 0))
    parts.append(box(k, 'BackRail', (0, D / 2 - .06, .48), (W - .15, .08, .08), frame_m, .02, 1))
    parts.append(box(k, 'BackRail', (0, D / 2 - .06, 2.22), (W - .15, .08, .08), frame_m, .02, 1))
    parts.append(box(k, 'SideGlass', (W / 2 - .06, 0, 1.4), (.04, D - .2, 1.4), glass_m, 0))
    # Glints so the big panes read as glass, and a mid rail.
    for x, w in ((-.7, .22), (-.45, .1), (.8, .18)):
        parts.append(box(k, 'Glint', (x, D / 2 - .09, 1.5), (w, .01, 1.1), white, 0, rot=(0, .5, 0)))
    parts.append(box(k, 'MidRail', (0, D / 2 - .06, 1.1), (W - .15, .06, .06), frame_m, .015, 1))
    # Advert panel with a lighthouse pictogram.
    parts.append(box(k, 'Advert', (-W / 2 + .06, 0, 1.4), (.06, D - .2, 1.4), white, .02, 1))
    parts.append(k.prism('AdTower', [(-.12, -.4), (.12, -.4), (.07, .25), (-.07, .25)], .04, coral,
                         loc=(-W / 2 - .02, 0, 1.4), axis='X', bevel=0))
    parts.append(box(k, 'AdBand', (-W / 2 - .03, 0, 1.3), (.04, .2, .08), white, 0))
    parts.append(box(k, 'AdLamp', (-W / 2 - .02, 0, 1.72), (.04, .16, .14), roof, 0))
    # Bench.
    parts.append(box(k, 'Bench', (0, D / 2 - .35, .5), (W - .5, .4, .07), wood, .02, 1))
    for sx in (-1, 1):
        parts.append(box(k, 'BenchLeg', (sx * (W / 2 - .45), D / 2 - .35, .25), (.07, .35, .5), frame_m, .02, 1))
    # Sign pole with a round bus sign and timetable.
    px = W / 2 + .45
    parts.append(cyl(k, 'Pole', (px, -D / 2 + .1, 1.4), .05, 2.8, frame_m, v=8, bevel=0))
    parts.append(cyl(k, 'SignDisc', (px, -D / 2 + .1, 2.65), .32, .06, coral, axis='Y', v=16, bevel=.02))
    parts.append(cyl(k, 'SignInner', (px, -D / 2 + .06, 2.65), .25, .04, white, axis='Y', v=16, bevel=0))
    parts.append(box(k, 'Bus', (px, -D / 2 + .02, 2.68), (.3, .03, .16), ink, .02, 1))
    for s in (-1, 1):
        parts.append(cyl(k, 'Wheel', (px + s * .09, -D / 2 + .01, 2.58), .04, .03, ink, axis='Y', v=8, bevel=0))
    parts.append(box(k, 'Timetable', (px, -D / 2 + .04, 1.6), (.36, .04, .5), white, .02, 1))
    for i in range(4):
        parts.append(box(k, 'Row', (px, -D / 2 + .01, 1.72 - i * .08), (.26, .02, .03), ink, 0))
    parts.append(box(k, 'Kerb', (0, 0, .03), (W + 1.2, D + .3, .06), wood, .02, 1))
    return L.finish(k, parts, 'bus_stop')


def dune_grass(k):
    """Low clump of dune grass blades in three greens on a little sand mound (<= .6 m)."""
    sand = k.mat('Sand', 'sand', MATTE)
    greens = [k.mat('Grass', '#6fb83a', SATIN), k.mat('Grass2', '#9ccc3c', SATIN), k.mat('Grass3', '#c9a45a', SATIN)]
    parts = [k.lathe('Mound', [(.55, 0), (.45, .07), (.22, .13), (0, .14)], sand, segments=12)]
    rng = random.Random(21)
    for i in range(26):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(0, .26)
        base = Vector((math.cos(a) * r, math.sin(a) * r * .8, .06))
        out = Vector((math.cos(a), math.sin(a) * .8, 0))
        h = rng.uniform(.3, .48)
        bend = rng.uniform(.12, .3)
        mid = base + out * bend * .35 + Vector((0, 0, h * .55))
        tip = base + out * bend + Vector((0, 0, h))
        parts.append(L.sweep(k, 'Blade', [tuple(base), tuple(mid), tuple(tip)], [.05, .032, 0], greens[i % 3], 4,
                             flat=.45))
    for i in range(4):
        a = i * 1.7
        parts.append(L.sweep(k, 'Stalk', [(math.cos(a) * .1, math.sin(a) * .08, .08),
                                          (math.cos(a) * .16, math.sin(a) * .1, .44)], [.012, .01], greens[2], 4))
        parts.append(ball(k, 'Seed', (math.cos(a) * .16, math.sin(a) * .1, .47), (.035, .035, .07), greens[2], 6, 4))
    return L.finish(k, parts, 'dune_grass', sharp=75)


def signpost(k):
    """Wooden fingerpost with three painted arrow boards (coral, teal, marigold) and small pictograms."""
    wood = k.mat('Wood', 'wood', SATIN)
    boards = [k.mat('Coral', 'coral', GLOSS), k.mat('Teal', 'teal', GLOSS), k.mat('Marigold', 'marigold', GLOSS)]
    white = k.mat('White', 'white', GLOSS)
    stone = k.mat('Stone', '#c8b8dc', MATTE)
    parts = [box(k, 'Post', (0, 0, 1.2), (.14, .14, 2.4), wood, .03, 1),
             k.tbox('Cap', (0, 0, 2.48), (.04, .04), (.22, .22), .16, wood, bevel=.02, segments=1),
             k.lathe('Base', [(.3, 0), (.26, .1), (.14, .16)], stone, segments=8)]
    specs = [(2.1, 0.3, 1), (1.72, -.5, -1), (1.34, 1.1, 1)]
    for i, (z, rz, d) in enumerate(specs):
        prof = [(0, -.13), (.72, -.13), (.88, 0), (.72, .13), (0, .13)]
        if d < 0:
            prof = [(-x, zz) for x, zz in reversed(prof)]
        o = k.prism('Finger', [(x + d * .07, zz) for x, zz in prof], .05, boards[i], loc=(0, 0, z), bevel=.015)
        o.rotation_euler = (0, 0, rz)
        parts.append(o)
        o = k.prism('Mark', L.circle(.06, 8, d * .5, 0), .07, white, loc=(0, 0, z), bevel=0)
        o.rotation_euler = (0, 0, rz)
        parts.append(o)
        o = box(k, 'Line', (d * .3, 0, z), (.2, .07, .03), white, 0)
        o.rotation_euler = (0, 0, rz)
        parts.append(o)
    return L.finish(k, parts, 'signpost')


def rock_low(k):
    """Low cluster of chunky rounded rocks with moss caps (foreground-safe, < .6 m)."""
    rock = k.mat('Rock', '#9d93b8', MATTE)
    rock2 = k.mat('Rock2', '#7d7494', MATTE)
    moss = k.mat('Moss', 'leaf', SATIN)
    sand = k.mat('Sand', 'sand', MATTE)
    parts = [k.lathe('Sand', [(.95, 0), (.7, .04), (0, .05)], sand, segments=10)]
    rng = random.Random(8)
    specs = [(-.25, .05, .5, .42, .45), (.35, -.1, .38, .34, .32), (.05, -.35, .28, .24, .2), (.6, .2, .22, .2, .18)]
    for i, (x, y, rx, ry, rz) in enumerate(specs):
        o = ball(k, 'Rock', (x, y, rz * .55), (rx, ry, rz), rock if i % 2 == 0 else rock2, 10, 6,
                 rot=(rng.uniform(-.2, .2), rng.uniform(-.2, .2), rng.uniform(0, 3)))
        parts.append(o)
        if i < 2:
            parts.append(ball(k, 'Moss', (x - .05, y + .04, rz * 1.35), (rx * .6, ry * .55, rz * .22), moss, 8, 4))
    for i in range(4):
        parts.append(ball(k, 'Pebble', (rng.uniform(-.8, .8), rng.uniform(-.6, -.3), .04), (.07, .06, .04), rock2, 6, 4))
    return L.finish(k, parts, 'rock_low', sharp=80)


def ice_cream_cart(k):
    """Ice cream cart: mint body with a coral trim, striped parasol, cones and scoops."""
    body_m = k.mat('Body', '#3fd0a8', GLOSS)
    trim = k.mat('Trim', 'white', GLOSS)
    stripe = k.mat('Stripe', 'coral', GLOSS)
    rubber = k.mat('Rubber', 'rubber', MATTE)
    cone_m = k.mat('Waffle', '#e8a24f', SATIN)
    scoops = [k.mat('Scoop', 'pink', GLOSS), k.mat('Scoop2', 'sun', GLOSS), k.mat('Scoop3', 'cream', GLOSS)]
    W, D = 1.5, .8
    parts = [box(k, 'Body', (0, 0, .75), (W, D, .75), body_m, .08, 2),
             box(k, 'Top', (0, 0, 1.16), (W + .1, D + .1, .08), trim, .03, 1),
             box(k, 'Band', (0, -D / 2 - .01, .62), (W - .1, .04, .12), stripe, .015, 1),
             box(k, 'Skirt', (0, 0, .4), (W - .05, D - .05, .06), trim, .02, 1)]
    for s in (-1, 1):
        parts.append(cyl(k, 'Wheel', (s * (W / 2 - .28), -D / 2 - .02, .22), .22, .08, rubber, axis='Y', v=16, bevel=.02))
        parts.append(cyl(k, 'Hub', (s * (W / 2 - .28), -D / 2 - .07, .22), .12, .04, stripe, axis='Y', v=10, bevel=0))
        parts.append(cyl(k, 'HubCap', (s * (W / 2 - .28), -D / 2 - .1, .22), .05, .03, trim, axis='Y', v=8, bevel=0))
    parts.append(box(k, 'Leg', (-W / 2 + .12, 0, .2), (.08, .08, .4), trim, .02, 1))
    parts.append(L.tube(k, 'Handle', [(W / 2, -.3, 1.0), (W / 2 + .35, -.3, 1.05), (W / 2 + .35, .3, 1.05),
                                      (W / 2, .3, 1.0)], .03, trim))
    # Scoops in tubs on the counter.
    for i in range(3):
        x = -.45 + i * .45
        parts.append(cyl(k, 'Tub', (x, .1, 1.24), .17, .1, trim, v=12, bevel=0))
        parts.append(ball(k, 'Scoop', (x, .1, 1.32), (.15, .15, .11), scoops[i], 10, 5))
    # Cones in a holder at the front.
    for i in range(3):
        x = -.4 + i * .4
        o = cyl(k, 'Cone', (x, -.28, 1.33), .07, .3, cone_m, v=8, bevel=0, r2=.005)
        o.rotation_euler = (math.pi, 0, 0)
        parts.append(o)
        parts.append(ball(k, 'ConeScoop', (x, -.28, 1.5), .08, scoops[(i + 1) % 3], 8, 5))
    # Scooped front emblem.
    parts.append(k.prism('Emblem', [(-.1, .1), (.1, .1), (0, -.14)], .03, cone_m, loc=(0, -D / 2 - .03, .82), bevel=0))
    parts.append(ball(k, 'EmblemScoop', (0, -D / 2 - .03, .95), (.11, .03, .09), scoops[0], 8, 4))
    # Parasol.
    parts.append(cyl(k, 'Pole', (.55, .25, 1.9), .03, 1.6, trim, v=6, bevel=0))
    import characters as ch
    for i in range(8):
        parts.append(ch.fan_panel(k, 'Panel', i, 8, .95, .35, 2.75, stripe if i % 2 == 0 else trim, thickness=.03))
        parts[-1].location = (.55, .25, 0)
    parts.append(ball(k, 'Top', (.55, .25, 2.78), .06, stripe, 6, 4))
    return L.finish(k, parts, 'ice_cream_cart')


# ============================================================================ festival
def lantern_string(k):
    """Round paper lanterns (Lamp) with coloured caps on a sagging string between poles at X = +-4."""
    pole = k.mat('Pole', 'wood', SATIN)
    string = k.mat('String', 'cream', SATIN)
    glow = L.lamp(k, '#ffcf6a', 2.0)
    caps = [k.mat('Cap', 'coral', GLOSS), k.mat('Cap2', 'teal', GLOSS), k.mat('Cap3', 'berry', GLOSS)]
    parts = []
    top = 3.6
    for s in (-1, 1):
        x = s * 4
        parts.append(cyl(k, 'Pole', (x, 0, top / 2), .07, top, pole, v=8, bevel=.02))
        parts.append(ball(k, 'Knob', (x, 0, top + .06), .1, caps[0], 8, 5))
        parts.append(k.lathe('Foot', [(.25, 0), (.2, .1), (.09, .18)], pole, loc=(x, 0, 0), segments=8))
    n = 16
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((-4 + 8 * t, 0, top - .2 - .6 * (1 - (2 * t - 1) ** 2)))
    parts.append(L.tube(k, 'String', pts, .015, string))
    for j, i in enumerate(range(2, n - 1, 2)):
        x, _, z = pts[i]
        drop = .12 + .05 * (j % 2)
        r = .22 if j % 2 == 0 else .18
        cz = z - drop - r
        parts.append(rod(k, 'Cord', (x, 0, z), (x, 0, cz + r * .8), .008, string, 4))
        parts.append(ball(k, 'Lantern', (x, 0, cz), (r, r, r * .88), glow, 12, 7))
        cm = caps[j % 3]
        parts.append(cyl(k, 'CapTop', (x, 0, cz + r * .86), r * .5, .07, cm, v=10, bevel=0))
        parts.append(cyl(k, 'CapBot', (x, 0, cz - r * .86), r * .45, .06, cm, v=10, bevel=0))
        parts.append(cyl(k, 'Band', (x, 0, cz), r * 1.02, .05, cm, v=12, bevel=0))
        parts.append(rod(k, 'Tassel', (x, 0, cz - r * .9), (x, 0, cz - r * .9 - .16), .02, cm, 5))
    return L.finish(k, parts, 'lantern_string', span=8.)


def festival_stall(k):
    """Festival sweets stall: berry/cream striped canopy with scallops, bunting, jars, fruit and a lantern."""
    wood = k.mat('Wood', 'wood_light', SATIN)
    canopy_a = k.mat('Canopy', 'berry', SATIN)
    canopy_b = k.mat('Canopy2', 'cream', SATIN)
    counter = k.mat('Counter', 'teal', GLOSS)
    goods = [k.mat('Goods', 'marigold', GLOSS), k.mat('Goods2', 'coral', GLOSS)]
    glow = L.lamp(k, '#ffcf6a', 2.0)
    jar = k.mat('Jar', '#bfefff', .1)
    W, D = 3.0, 1.6
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(k, 'Post', (sx * (W / 2 - .08), sy * (D / 2 - .08), 1.3), (.12, .12, 2.6), wood, .03, 1))
    parts += L.awning(k, 0, W + .2, 2.8, D / 2 + .1, D + .3, .5, canopy_a, canopy_b, n=7)
    parts.append(k.prism('Crest', [(-W / 2 - .1, 0), (W / 2 + .1, 0), (W / 2 - .1, .25), (0, .5), (-W / 2 + .1, .25)],
                         .08, canopy_a, loc=(0, D / 2 + .08, 2.8), bevel=.02))
    parts.append(ball(k, 'Star', (0, D / 2 + .02, 3.12), .1, goods[0], 8, 5))
    # Counter with panels.
    parts.append(box(k, 'Counter', (0, -.2, .5), (W - .1, .9, 1.0), counter, .05, 2))
    parts.append(box(k, 'CounterTop', (0, -.22, 1.03), (W + .02, 1.0, .07), wood, .03, 1))
    for i in range(3):
        parts.append(box(k, 'Panel', (-1 + i, -.66, .5), (.8, .04, .7), canopy_b, .02, 1))
        parts.append(k.prism('PanelStar', L.star(.13, .06), .03, goods[i % 2], loc=(-1 + i, -.69, .5), bevel=0))
    # Goods: jars of sweets, a pyramid of oranges, candy apples.
    for i in range(4):
        x = -1.2 + i * .28
        parts.append(cyl(k, 'Jar', (x, -.1, 1.2), .1, .28, jar, v=10, bevel=.02))
        parts.append(cyl(k, 'Lid', (x, -.1, 1.36), .09, .04, goods[i % 2], v=10, bevel=0))
        parts.append(ball(k, 'Sweets', (x, -.1, 1.15), (.085, .085, .08), goods[(i + 1) % 2], 6, 4))
    rng = random.Random(6)
    for i, (x, y, z) in enumerate([(.3, -.3, 1.12), (.46, -.3, 1.12), (.62, -.3, 1.12), (.38, -.3, 1.26), (.54, -.3, 1.26),
                                   (.46, -.3, 1.39)]):
        parts.append(ball(k, 'Orange', (x, y, z), .08, goods[0], 8, 5))
    for i in range(3):
        x = 1.0 + i * .18
        parts.append(ball(k, 'Apple', (x, -.45, 1.14), .07, goods[1], 8, 5))
        parts.append(rod(k, 'Stick', (x, -.45, 1.18), (x, -.45, 1.36), .01, wood, 4))
    # Hanging lantern at the front.
    parts.append(rod(k, 'Cord', (1.1, -D / 2 - .1, 2.3), (1.1, -D / 2 - .1, 2.05), .01, wood, 4))
    parts.append(ball(k, 'Lantern', (1.1, -D / 2 - .1, 1.88), (.17, .17, .15), glow, 10, 6))
    parts.append(cyl(k, 'LanternCap', (1.1, -D / 2 - .1, 2.04), .08, .05, canopy_a, v=8, bevel=0))
    # Mini bunting along the canopy edge.
    for i in range(7):
        x = -1.35 + i * .45
        parts.append(k.prism('Pennant', [(-.12, 0), (.12, 0), (0, -.22)], .02, goods[i % 2],
                             loc=(x, -D / 2 - .26, 2.02), bevel=0))
    return L.finish(k, parts, 'festival_stall')


# ============================================================================ hazards (in-lane)
def _hazard(k, parts, name, kind):
    obj = L.finish(k, parts, name)
    obj['kind'] = kind
    return obj


def hz_puddle(k):
    """Low: a blue puddle (material Water) with ripple rings, a floating leaf and wet pebbles."""
    water_m = L.water(k)
    ripple = k.mat('Ripple', '#d9f6ff', .1)
    leaf = k.mat('Leaf', 'leaf', GLOSS)
    stone = k.mat('Pebble', '#9d93b8', MATTE)
    rng = random.Random(2)
    outline = []
    for i in range(18):
        a = i / 18 * math.tau
        r = 1 + .12 * math.sin(a * 3 + .5) + .08 * math.sin(a * 5)
        outline.append((math.cos(a) * .72 * r, math.sin(a) * .52 * r))
    rim = [(x * 1.08, y * 1.1) for x, y in outline]
    parts = [k.prism('Rim', rim, .025, stone, loc=(0, 0, .0125), axis='Y', bevel=0)]
    parts[-1].rotation_euler = (math.pi / 2, 0, 0)
    parts.append(k.prism('Water', outline, .04, water_m, loc=(0, 0, .02), axis='Y', bevel=.01))
    parts[-1].rotation_euler = (math.pi / 2, 0, 0)
    for r, (cx, cy) in ((.2, (-.18, .05)), (.12, (-.18, .05)), (.1, (.3, -.12))):
        parts.append(k.torus('Ripple', (cx, cy, .045), r, .01, ripple, major_seg=16, minor_seg=3))
    leaf_pts = [(0, -.1), (.05, -.04), (.055, .03), (0, .1), (-.055, .03), (-.05, -.04)]
    o = k.prism('Leaf', leaf_pts, .012, leaf, loc=(.25, .12, .05), axis='Y', bevel=0)
    o.rotation_euler = (math.pi / 2, 0, .6)
    parts.append(o)
    for i in range(5):
        a = rng.uniform(0, math.tau)
        parts.append(ball(k, 'Pebble', (math.cos(a) * .82, math.sin(a) * .6, .02), (.06, .05, .035), stone, 6, 4))
    return _hazard(k, parts, 'hz_puddle', 'low')


def hz_crates(k):
    """Tall: a stack of teal plastic fish crates with fish tails and ice poking out (~1.1 m)."""
    crate_m = k.mat('Crate', 'teal', GLOSS)
    crate2 = k.mat('Crate2', 'coral', GLOSS)
    ice = k.mat('Ice', '#dff6ff', .15)
    fish = k.mat('Fish', '#8fb7e6', GLOSS)
    rim = k.mat('Rim', 'white', GLOSS)
    parts = []
    specs = [(0, 0, 0, crate_m, 0), (0, 0, .36, crate2, .08), (0, 0, .72, crate_m, -.05)]
    for x, y, z, m, rz in specs:
        ps = [box(k, 'Crate', (0, 0, .17), (1.0, .7, .34), m, .05, 2),
              box(k, 'Lip', (0, 0, .33), (1.04, .74, .04), rim, .015, 1)]
        for s in (-1, 1):
            ps.append(box(k, 'Grip', (s * .51, 0, .24), (.02, .26, .07), rim, 0))
        for i in range(3):
            ps.append(box(k, 'Slot', (-.3 + i * .3, -.355, .15), (.18, .02, .07), rim, 0))
        parts += L.place(ps, (x, y, z), (0, 0, rz))
    parts.append(box(k, 'IceTop', (0, 0, 1.06), (.9, .6, .04), ice, .02, 1))
    for i, (x, rz) in enumerate(((-.25, .3), (.1, -.2), (.3, .5))):
        parts.append(ball(k, 'Fish', (x, 0, 1.1), (.08, .26, .06), fish, 8, 5, rot=(0, 0, rz)))
        parts.append(k.prism('Tail', [(0, 0), (-.09, .13), (0, .1), (.09, .13)], .03, fish,
                             loc=(x - math.sin(rz) * .22, math.cos(rz) * .22, 1.12), bevel=0,
                             rot=(-math.pi / 2, 0, rz)))
    # A crate label: white card with a teal fish pictogram on the middle crate.
    parts.append(box(k, 'Label', (-.18, -.37, .52), (.34, .02, .16), rim, 0))
    parts.append(ball(k, 'LabelFish', (-.2, -.385, .52), (.09, .01, .04), crate_m, 8, 4))
    parts.append(k.prism('LabelTail', [(0, 0), (.06, .04), (.06, -.04)], .012, crate_m, loc=(-.11, -.385, .52), bevel=0))
    return _hazard(k, parts, 'hz_crates', 'tall')


def hz_barrel(k):
    """Low: a barrel lying on its side (<= .45 m) with a wooden chock."""
    wood = k.mat('Wood', 'wood', SATIN)
    hoop = k.mat('Iron', '#34323f', GLOSS)
    lid = k.mat('WoodDark', 'wood_dark', SATIN)
    band = k.mat('Paint', 'coral', GLOSS)
    ps = _barrel_parts(k, wood, hoop, lid, h=.8, r=.2)
    ps.append(k.torus('PaintBand', (0, 0, .4), .205, .03, band, major_seg=14, minor_seg=4))
    L.place(ps, (0, 0, -.2), (0, math.pi / 2, 0), pivot=(0, 0, .4))
    for x in (-.24, .24):
        for s in (-1, 1):
            ps.append(k.prism('Chock', [(0, 0), (s * .14, 0), (0, .09)], .1, lid, loc=(x, s * .17, 0), axis='X',
                              bevel=.008))
    return _hazard(k, ps, 'hz_barrel', 'low')


def hz_cone(k):
    """Low: an orange traffic cone with white reflective bands on a square base."""
    orange = k.mat('Orange', '#ff5a1f', GLOSS)
    white = k.mat('Reflect', 'white', .15)
    base = k.mat('Base', '#2a2733', MATTE)
    parts = [box(k, 'Base', (0, 0, .035), (.46, .46, .07), base, .03, 1),
             k.lathe('Cone', [(.18, .06), (.035, .43), (.02, .45)], orange, segments=14)]
    for z0, z1 in ((.15, .23), (.29, .34)):
        r0 = .18 - (.18 - .035) * (z0 - .06) / .37 + .005
        r1 = .18 - (.18 - .035) * (z1 - .06) / .37 + .005
        parts.append(k.lathe('Band', [(r0, z0), (r1, z1)], white, segments=14))
    return _hazard(k, parts, 'hz_cone', 'low')


def hz_bin(k):
    """Tall: a green wheelie bin with lid, handle, wheels and a recycling pictogram."""
    green = k.mat('Bin', '#2f9a3a', GLOSS)
    lid = k.mat('Lid', 'leaf_dark', GLOSS)
    rubber = k.mat('Rubber', 'rubber', MATTE)
    white = k.mat('Mark', 'white', GLOSS)
    parts = [k.tbox('Body', (0, 0, .5), (.62, .72), (.52, .6), .96, green, bevel=.05, segments=2),
             box(k, 'Lid', (0, .02, 1.0), (.68, .8, .07), lid, .03, 1),
             box(k, 'LidLip', (0, -.4, .98), (.6, .06, .08), lid, .02, 1),
             rod(k, 'Handle', (-.26, .42, .92), (.26, .42, .92), .03, lid, 8)]
    for s in (-1, 1):
        parts.append(box(k, 'HandleArm', (s * .26, .39, .93), (.05, .08, .06), lid, .01))
        parts.append(cyl(k, 'Wheel', (s * .3, .28, .11), .11, .07, rubber, axis='X', v=12, bevel=.02))
    parts.append(rod(k, 'Axle', (-.3, .28, .11), (.3, .28, .11), .025, rubber, 6))
    tri = [(-.14, .5), (.14, .5), (0, .74)]
    inner = [(-.07, .54), (.07, .54), (0, .66)]
    parts.append(L.frame(k, 'Recycle', tri, inner, -.325, .025, white, bevel=0))
    for x in (-.12, .12):
        parts.append(box(k, 'Hinge', (x, .4, .98), (.1, .06, .06), lid, .015))
    parts.append(box(k, 'Rib', (0, -.34, .25), (.46, .03, .05), lid, 0))
    return _hazard(k, parts, 'hz_bin', 'tall')


def hz_sandcastle(k):
    """Low: a sandcastle with crenellated towers, a coral pennant, a teal bucket and a spade."""
    sand = k.mat('Sand', 'sand', MATTE)
    sand2 = k.mat('SandDark', '#e5a96a', MATTE)
    flag = k.mat('Flag', 'coral', SATIN)
    bucket = k.mat('Bucket', 'teal', GLOSS)
    spade = k.mat('Spade', 'marigold', GLOSS)
    stick = k.mat('Stick', 'white', GLOSS)
    parts = [k.lathe('Mound', [(.62, 0), (.5, .06), (.2, .1), (0, .1)], sand2, segments=12),
             box(k, 'Keep', (0, 0, .2), (.5, .38, .24), sand, .04, 1)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * .26, sy * .18
            parts.append(k.lathe('Tower', [(.12, .05), (.1, .3), (.12, .32), (.12, .36)], sand, loc=(x, y, 0), segments=10))
            for i in range(4):
                a = i / 4 * math.tau + .4
                parts.append(box(k, 'Merlon', (x + math.cos(a) * .09, y + math.sin(a) * .09, .39), (.05, .05, .06), sand,
                                 0))
    for i in range(3):
        parts.append(box(k, 'KeepMerlon', (-.14 + i * .14, -.18, .35), (.07, .05, .06), sand, .012))
    parts.append(box(k, 'Gate', (0, -.2, .16), (.12, .03, .14), sand2, .02))
    parts.append(rod(k, 'FlagPole', (-.26, -.18, .36), (-.26, -.18, .44), .008, stick, 4))
    parts.append(k.prism('Pennant', [(0, 0), (.1, -.03), (0, -.06)], .01, flag, loc=(-.26, -.18, .44), bevel=0))
    parts.append(k.lathe('Bucket', [(.08, .0), (.12, .2), (.105, .2), (.07, .02)], bucket, loc=(.5, -.25, 0), segments=12))
    parts.append(L.tube(k, 'Handle', [(.38, -.25, .19), (.4, -.25, .26), (.5, -.25, .29), (.6, -.25, .26), (.62, -.25, .19)],
                        .01, stick))
    parts.append(box(k, 'SpadeBlade', (-.5, -.3, .03), (.12, .16, .02), spade, .01, rot=(.2, 0, .5)))
    parts.append(rod(k, 'SpadeShaft', (-.47, -.22, .04), (-.35, .05, .14), .015, spade, 6))
    return _hazard(k, parts, 'hz_sandcastle', 'low')


def hz_deckchair(k):
    """Tall: an open deckchair with a coral/white striped sling on a wooden frame (~.95 m)."""
    wood = k.mat('Wood', 'wood_light', SATIN)
    a_m = k.mat('Canvas', 'coral', SATIN)
    b_m = k.mat('Canvas2', 'white', SATIN)
    W = .62
    parts = []
    for s in (-1, 1):
        x = s * W / 2
        parts.append(rod(k, 'BackLeg', (x, .35, 0), (x, -.05, .95), .025, wood, 6))
        parts.append(rod(k, 'FrontLeg', (x, -.45, 0), (x, .2, .55), .025, wood, 6))
        parts.append(rod(k, 'Arm', (x * 1.05, -.42, .46), (x * 1.05, .12, .5), .02, wood, 6))
    for z, y in ((.95, -.05), (.1, .3), (.05, -.42)):
        parts.append(rod(k, 'Bar', (-W / 2, y, z), (W / 2, y, z), .02, wood, 6))
    # Sagging sling from the top bar down to the front seat bar, in 5 stripes.
    top = Vector((0, -.05, .93))
    low = Vector((0, -.3, .3))
    mid = (top + low) / 2 + Vector((0, .12, -.05))
    n = 5
    for i in range(n):
        x0 = -W / 2 + .03 + (W - .06) * i / n
        x1 = -W / 2 + .03 + (W - .06) * (i + 1) / n
        bm = bmesh.new()
        rows = []
        for t in (0, .5, 1):
            p = top * (1 - t) ** 2 + mid * 2 * (1 - t) * t + low * t * t if t not in (.5,) else mid
            rows.append([bm.verts.new((x0, p.y, p.z)), bm.verts.new((x1, p.y, p.z))])
        for r in range(2):
            bm.faces.new((rows[r][0], rows[r][1], rows[r + 1][1], rows[r + 1][0]))
        o = L.mesh_object(k, 'Sling', bm, [a_m if i % 2 == 0 else b_m])
        mod = o.modifiers.new('solid', 'SOLIDIFY')
        mod.thickness = .02
        k._apply_mods(o)
        parts.append(o)
    return _hazard(k, parts, 'hz_deckchair', 'tall')


def hz_picnic(k):
    """Low: a wicker picnic basket on a gingham cloth, with an apple and a lemonade bottle."""
    cloth_a = k.mat('Gingham', '#4f7fe0', SATIN)
    cloth_b = k.mat('Gingham2', 'white', SATIN)
    wicker = k.mat('Wicker', '#d99a4a', SATIN)
    wicker2 = k.mat('WickerDark', 'wood', SATIN)
    apple = k.mat('Apple', 'red', GLOSS)
    bottle = k.mat('Bottle', '#bfefff', .1)
    lid = k.mat('BottleCap', 'coral', GLOSS)
    parts = []
    n = 6
    size = 1.2 / n
    for i in range(n):
        for j in range(n):
            if (i + j) % 2 == 0:
                continue
            parts.append(box(k, 'Check', (-.6 + size * (i + .5), -.6 + size * (j + .5), .012), (size + .002, size + .002, .012),
                             cloth_a, 0))
    parts.append(box(k, 'Cloth', (0, 0, .005), (1.2, 1.2, .012), cloth_b, 0, rot=(0, 0, 0)))
    parts.append(box(k, 'Basket', (0, .05, .14), (.56, .38, .25), wicker, .05, 2))
    for i in range(3):
        parts.append(box(k, 'Weave', (0, -.145, .06 + i * .07), (.57, .03, .03), wicker2, 0))
    parts.append(box(k, 'LidL', (-.14, .05, .285), (.29, .4, .05), wicker2, .02, 1, rot=(0, .1, 0)))
    parts.append(box(k, 'LidR', (.14, .05, .285), (.29, .4, .05), wicker2, .02, 1, rot=(0, -.1, 0)))
    parts.append(k.torus('Handle', (0, .05, .3), .12, .018, wicker2, rot=(-math.pi / 2, 0, 0), major_seg=14,
                         minor_seg=4, arc=math.pi))
    parts.append(ball(k, 'Apple', (.42, -.3, .07), .07, apple, 8, 5))
    parts.append(rod(k, 'Stem', (.42, -.3, .13), (.43, -.3, .17), .008, wicker2, 4))
    parts.append(k.lathe('Bottle', [(.05, 0), (.05, .15), (.02, .22), (.02, .26)], bottle, loc=(-.4, -.25, .012),
                         segments=8))
    parts.append(cyl(k, 'Cap', (-.4, -.25, .28), .022, .03, lid, v=8, bevel=0))
    return _hazard(k, parts, 'hz_picnic', 'low')
