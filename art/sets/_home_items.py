"""Chapter 1 pickups and toddler hazards.

Pickups float in the lanes and spin about Z: glossy, bold and readable at 13 m.
Their origin is at the base centre (base near Z = 0); extras.center is the height of
their visual centre for hover/spin. Hazards set extras.height (low <= .45 m can be
jumped, tall ones must be dodged) and extras.kind ('low' / 'tall').
"""
import math
import random

from mathutils import Vector

import _home_util as U
from kit import GLOSS, MATTE, SATIN


def _finish(k, name, parts, **extras):
    obj = k.join(name, parts, pivot=(0, 0, 0))
    zs = [v.co.z for v in obj.data.vertices]
    obj['height'] = round(max(zs), 3)
    for key, value in extras.items():
        obj[key] = round(float(value), 3) if isinstance(value, float) else value
    if extras.get('stat') or name in PICKUP_NAMES:
        k.paint([obj], lo=0, hi=max(zs), shade=.84, tint=(.97, .96, 1.0), warm=(1.03, 1.0, .96))
    else:
        k.paint([obj], lo=0, hi=max(zs), shade=.74)
    return obj


PICKUP_NAMES = ('pickup_heart', 'pickup_star', 'pickup_coin', 'keepsake', 'tin')


def _shine(k):
    return k.mat('Shine', '#ffffff', .15, emit=.8)


# ----------------------------------------------------------------------------- pickups
def build_heart(k):
    red = k.mat('Heart', '#ff4d5e', .22)
    rim = k.mat('HeartRim', 'coral_dark', .3)
    shine = _shine(k)
    size = .56
    outline = U.heart(size, 40)
    zc = .27
    parts = [U.puff(k, 'Heart', outline, .26, red, rings=5, n=2.3, loc=(0, 0, zc))]
    # A slightly larger, flatter rim behind the heart gives a bold outline.
    parts.append(U.puff(k, 'Rim', [(x * 1.07, y * 1.07 - .01) for x, y in outline], .15, rim, rings=3, n=2.6,
                        loc=(0, .01, zc)))
    lobe = U.puff(k, 'Highlight', U.circle(1, 14), .03, shine, rings=2, n=2.4, loc=(-.13, -.118, zc + .085),
                  rot=(math.radians(-10), math.radians(-30), 0))
    lobe.scale = (.06, 1, .035)
    parts.append(lobe)
    parts.append(k.ball('Sparkle', (-.19, -.1, zc + .02), .016, shine, 8, 4))
    obj = _finish(k, 'pickup_heart', parts, center=zc, stat='health')
    return obj


def build_star(k):
    sun = k.mat('Star', '#ffbe1a', .22)
    rim = k.mat('StarRim', 'orange', .3)
    shine = _shine(k)
    outline = U.star(.29, .145, 5, tip_round=.22, steps=2)
    zc = .28
    parts = [U.puff(k, 'Star', outline, .24, sun, rings=5, n=2.3, loc=(0, 0, zc))]
    parts.append(U.puff(k, 'Rim', [(x * 1.08, y * 1.08) for x, y in outline], .13, rim, rings=3, n=2.6,
                        loc=(0, .012, zc)))
    lobe = U.puff(k, 'Highlight', U.circle(1, 14), .03, shine, rings=2, n=2.4, loc=(-.07, -.115, zc + .08),
                  rot=(math.radians(-15), math.radians(-30), 0))
    lobe.scale = (.05, 1, .028)
    parts.append(lobe)
    parts.append(k.ball('Sparkle', (.1, -.1, zc + .12), .016, shine, 8, 4))
    return _finish(k, 'pickup_star', parts, center=zc, stat='happiness')


def build_coin(k):
    body = k.mat('Coin', '#10a85c', .25, metal=.2)
    mint = k.mat('CoinMint', '#7ef5c0', .22, metal=.15)
    shine = _shine(k)
    R = .25
    t = .07
    # Profile (r, z) around the coin axis: raised rim both faces, rounded edge.
    prof = [(0, t * .62), (R * .7, t * .62), (R * .74, t * .95), (R * .84, t * 1.05), (R * .94, t * .92), (R, t * .5),
            (R, -t * .5), (R * .94, -t * .92), (R * .84, -t * 1.05), (R * .74, -t * .95), (R * .7, -t * .62), (0, -t * .62)]
    seg = [0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0]
    zc = R + .02
    coin = U.lathe(k, 'Coin', prof, [body, mint], seg, segments=26)
    coin.rotation_euler = (math.pi / 2, 0, 0)
    coin.location = (0, 0, zc)
    parts = [coin]
    # A bright bead around the edge.
    bead = k.torus('Bead', (0, 0, zc), R + .004, .022, mint, rot=(math.pi / 2, 0, 0), major_seg=26, minor_seg=4)
    parts.append(bead)
    # Embossed scallop shell on both faces.
    shell = []
    lobes = 7
    for i in range(lobes * 3 + 1):
        a = math.radians(15) + math.radians(150) * i / (lobes * 3)
        bump = 1 + .07 * abs(math.cos(i / 3 * math.pi))
        shell.append((math.cos(a) * .125 * bump, math.sin(a) * .125 * bump - .03))
    shell += [(-.05, -.06), (-.075, -.1), (.075, -.1), (.05, -.06)]
    shell = shell[::-1] if U._area(shell) < 0 else shell
    for side in (-1, 1):
        s = U.puff(k, 'Shell', shell, .05, mint, rings=2, n=2.6, back='flat', loc=(0, side * t * .6, zc),
                   rot=(0, 0, 0 if side < 0 else math.pi))
        parts.append(s)
        for j in range(4):
            a = math.radians(40 + j * 33)
            p0 = (math.cos(a) * .03, side * (t * .6 + .025), zc - .03 + math.sin(a) * .03)
            p1 = (math.cos(a) * .115, side * (t * .6 + .022), zc - .03 + math.sin(a) * .115)
            mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2)
            parts.append(k.box('Rib', mid, (.085, .006, .012), body, bevel=0, rot=(0, -a, 0)))
    parts.append(k.ball('Sparkle', (-.12, -t - .03, zc + .12), .02, shine, 8, 4))
    return _finish(k, 'pickup_coin', parts, center=zc, stat='money')


def build_keepsake(k):
    pearl = k.mat('Pearl', '#f6c6f2', .08)
    swirl_a = k.mat('SwirlCoral', 'coral', .15)
    swirl_b = k.mat('SwirlTeal', 'teal', .15)
    glow = k.mat('Lamp', '#ffd766', .3, emit=1.4)
    star_m = k.mat('StarGold', 'marigold', .2)
    shine = _shine(k)
    r = .225
    c = Vector((0, 0, r + .01))
    parts = [k.ball('Marble', c, r, pearl, 20, 12)]
    band = k.torus('GlowBand', c, r * .965, .02, glow, major_seg=28, minor_seg=5)
    band.rotation_euler = (math.radians(20), math.radians(-12), 0)
    parts.append(band)
    # Two painted swirl lines inlaid in the glass (half-sunk, so they read as colour, not wire).
    for mat, phase in ((swirl_a, 0.), (swirl_b, math.pi)):
        pts = []
        for i in range(10):
            t = i / 9
            a = phase + .9 + t * math.pi * 1.1
            el = -.95 + t * 1.9
            d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
            pts.append(tuple(c + d * (r - .004)))
        parts.append(k.tube('Swirl', pts, .014, mat))
    # A glowing star 'inside', sitting just under the front of the glass.
    star = U.puff(k, 'InnerStar', U.star(.105, .05, 5, tip_round=.2, steps=1), .036, star_m, rings=2, back='flat')

    def wrap(v):
        # Lay the star onto the sphere's front: its depth becomes height above the surface.
        d = Vector((v.x, -r, v.z + .005)).normalized()
        return c + d * (r - .004 + max(0., -v.y))
    U.deform(star, wrap)
    parts.append(star)
    lobe = U.puff(k, 'Highlight', U.circle(1, 12), .02, shine, rings=2, loc=(-.08, -.19, c.z + .1),
                  rot=(math.radians(-30), math.radians(-30), 0))
    lobe.scale = (.05, 1, .03)
    parts.append(lobe)
    return _finish(k, 'keepsake', parts, center=c.z, kind='memory')


def build_letter(k):
    paper = k.mat('Paper', '#ffe8c2', SATIN)
    fold = k.mat('PaperFold', '#ffd49a', SATIN)
    seal = k.mat('Seal', 'coral_dark', .25)
    stamp = k.mat('Stamp', 'teal', GLOSS)
    ink = k.mat('Ink', 'marigold', GLOSS)
    w, h = .5, .34
    z0 = .03
    parts = [U.puff(k, 'Envelope', U.rounded_rect(-w / 2, w / 2, z0, z0 + h, .025, 2), .035, paper, rings=2, n=4)]
    # Flap on the front (-Y) face, with the heart wax seal at its tip.
    flap = [(-w / 2 + .02, z0 + h - .02), (w / 2 - .02, z0 + h - .02), (0, z0 + h * .38)]
    parts.append(k.prism('Flap', flap, .012, fold, loc=(0, -.02, 0), bevel=.006, segments=1))
    for s in (-1, 1):
        parts.append(k.prism('Fold', [(s * (w / 2 - .02), z0 + .02), (s * .02, z0 + h * .4), (s * .06, z0 + h * .4)],
                             .006, fold, loc=(0, -.019, 0), bevel=.002, segments=1))
    parts.append(k.cyl('SealDisc', (0, -.033, z0 + h * .4), .06, .018, seal, axis='Y', vertices=16, bevel=.006,
                       segments=1))
    parts.append(U.puff(k, 'SealHeart', U.heart(.075, 20), .02, k.mat('SealHeart', 'coral', .25), rings=2,
                        back='flat', loc=(0, -.043, z0 + h * .4)))
    # Stamp and address lines on the back (+Y).
    parts.append(k.box('Stamp', (.16, .021, z0 + h - .07), (.09, .008, .1), stamp, bevel=.004, segments=1))
    parts.append(k.box('StampInner', (.16, .026, z0 + h - .07), (.06, .004, .07), ink, bevel=.002, segments=1))
    for i, lw in enumerate((.24, .2, .16)):
        parts.append(k.box('Line', (-.02, .02, z0 + .08 + i * .05), (lw, .006, .014), ink, bevel=.003, segments=1))
    env = k.join('letter', parts, pivot=(0, 0, 0))
    U.deform(env, lambda v: Vector((v.x, v.y + .06 * (v.x / (w / 2)) ** 2 - .02, v.z)))
    zs = [v.co.z for v in env.data.vertices]
    env['height'] = round(max(zs), 3)
    env['center'] = z0 + h / 2
    k.paint([env], lo=0, hi=max(zs), shade=.78)
    return env


def build_tin(k):
    rnd = random.Random(61)
    teal = k.mat('Tin', 'teal', .35, metal=.3)
    band = k.mat('TinBand', 'cream', .4)
    rust = k.mat('Rust', '#a65a2a', MATTE)
    coral = k.mat('Coral', 'coral', GLOSS)
    white = k.mat('White', 'white', GLOSS)
    gold = k.mat('Lamp', '#ffd766', .3, emit=1.0)
    sea = k.mat('Sea', 'ocean', GLOSS)
    R, H = .19, .24
    body = U.lathe(k, 'Body', [(0, 0), (R - .02, 0), (R, .015), (R, H - .01), (R - .012, H), (0, H)], teal, segments=28)
    # Dents: a couple of soft pushes into the side.
    for a, z, depth in ((-1.2, .12, .02), (2.3, .08, .015)):
        d = Vector((math.cos(a), math.sin(a), 0))

        def dent(v, d=d, z=z, depth=depth):
            radial = Vector((v.x, v.y, 0))
            if radial.length < 1e-4:
                return v
            k_ = max(0., radial.normalized().dot(d)) ** 8 * math.exp(-((v.z - z) / .06) ** 2)
            return v - radial.normalized() * depth * k_
        U.deform(body, dent)
    parts = [body]
    parts.append(U.lathe(k, 'Band', [(R + .003, .07), (R + .008, .08), (R + .008, .14), (R + .003, .15)], band,
                         segments=28, caps=False))
    lid_z = H - .015
    parts.append(U.lathe(k, 'Lid', [(0, lid_z + .07), (R - .01, lid_z + .07), (R + .01, lid_z + .06), (R + .014, lid_z + .03),
                                    (R + .014, lid_z), (R + .006, lid_z - .005), (0, lid_z)], teal, segments=28))
    lid_top = lid_z + .07
    parts.append(k.torus('LidBead', (0, 0, lid_top - .004), R - .03, .008, band, major_seg=28, minor_seg=4))
    # Painted lighthouse on the lid: sea, striped tower, glowing lamp.
    parts.append(U.relief(k, 'SeaPaint', [(x, y * .55 - .09) for x, y in U.circle(.13, 14)], .004, sea, plane='XY',
                          loc=(0, 0, lid_top), rings=1))
    for i, (w0, w1, z0, z1, m) in enumerate(((.04, .034, -.07, -.02, coral), (.034, .029, -.02, .025, white),
                                             (.029, .025, .025, .065, coral))):
        parts.append(U.relief(k, 'Tower', [(-w0, z0), (w0, z0), (w1, z1), (-w1, z1)], .006, m, plane='XY',
                              loc=(0, 0, lid_top), rings=1))
    parts.append(U.relief(k, 'Lantern', U.circle(.028, 10, 0, .09), .01, gold, plane='XY', loc=(0, 0, lid_top),
                          rings=1))
    for s in (-1, 1):
        parts.append(U.relief(k, 'Beam', [(0, .09), (s * .13, .12), (s * .13, .06)], .003, band, plane='XY',
                              loc=(0, 0, lid_top), rings=1))
    # The same little lighthouse painted on the front band, so it reads side-on.
    fy = -R - .009
    parts.append(k.box('SideTower', (0, fy, .11), (.05, .01, .07), coral, bevel=.004, segments=1))
    parts.append(k.box('SideStripe', (0, fy - .003, .11), (.052, .01, .02), white, bevel=.003, segments=1))
    parts.append(k.ball('SideLamp', (0, fy - .002, .155), (.022, .008, .018), gold, 8, 4))
    for s in (-1, 1):
        parts.append(k.ball('Wave', (s * .07, fy + .002, .085), (.05, .008, .018), sea, 8, 4))
    # Weathering: rust freckles and a scuffed lid edge.
    for i in range(6):
        a = rnd.uniform(0, math.tau)
        z = rnd.uniform(.03, .2)
        parts.append(U.decal(k, 'RustSpot', (0, 0, z), (R, R, 1), (math.cos(a), math.sin(a), 0),
                             (rnd.uniform(.012, .022), .004, rnd.uniform(.01, .018)), rust, seg=6, rings=3))
    return _finish(k, 'tin', parts, center=.15, kind='time_capsule')


# ----------------------------------------------------------------------------- hazards
def build_milk_puddle(k):
    milk = k.mat('Milk', 'white', .12)
    bottle = k.mat('Bottle', '#bfe9ff', .15)
    collar = k.mat('Collar', 'coral', GLOSS)
    teat = k.mat('Teat', '#ffc46b', .3)
    marks = k.mat('Marks', 'teal', GLOSS)
    parts = [U.puff(k, 'Puddle', U.blob(.42, 26, .12, 7, sx=1.45, sy=.9), .045, milk, rings=3, n=2.8, plane='XY',
                    back='flat', loc=(.05, -.02, 0))]
    for (x, y, r) in ((-.62, .22, .06), (.66, -.25, .05), (.55, .3, .035), (-.4, -.42, .04)):
        parts.append(U.puff(k, 'Drop', U.circle(r, 10), .03, milk, rings=2, plane='XY', back='flat', loc=(x, y, 0)))
    # Tipped bottle lying across the puddle's back edge, teat toward the spill.
    prof = [(0, 0), (.065, 0), (.075, .02), (.075, .2), (.068, .22), (.06, .235), (0, .235)]
    b = U.lathe(k, 'Body', prof, bottle, segments=16)
    parts_b = [b]
    parts_b.append(U.lathe(k, 'Collar', [(0, .225), (.07, .225), (.074, .235), (.074, .27), (.06, .28), (0, .28)], collar,
                           segments=16))
    parts_b.append(U.lathe(k, 'Teat', [(0, .275), (.035, .275), (.03, .3), (.018, .33), (.022, .35), (.012, .365), (0, .368)],
                           teat, segments=12))
    for i in range(4):
        parts_b.append(k.box('Mark', (0, -.074, .05 + i * .04), (.04 if i % 2 else .06, .006, .01), marks, bevel=0))
    parts_b.append(k.ball('Heart', (0, -.075, .19), (.022, .008, .02), collar, 8, 4))
    bot = k.join('BottlePart', parts_b, pivot=(0, 0, 0))
    bot.scale = (1.45, 1.45, 1.45)
    bot.rotation_euler = (0, math.radians(-92), math.radians(20))
    bot.location = (.42, .14, .114)
    parts.append(bot)
    return _finish(k, 'hz_milk_puddle', parts, kind='low', score='health')


def _letter_bars(ch):
    """Chunky letter strokes as boxes in a unit cell (x, z in -.5..5): (cx, cz, w, h, angle)."""
    return {
        'A': [(-.17, 0, .15, .92, .36), (.17, 0, .15, .92, -.36), (0, -.12, .36, .13, 0)],
        'B': [(-.22, 0, .15, .9, 0), (.05, .3, .45, .14, 0), (.05, -.3, .45, .14, 0), (.05, 0, .38, .12, 0),
              (.25, .15, .13, .32, 0), (.27, -.15, .13, .32, 0)],
        'C': None,
    }[ch]


def _block(k, name, loc, size, rot_z, body, face_mat, symbol, tilt=(0, 0)):
    parts = [k.box(name, (0, 0, 0), (size,) * 3, body, bevel=size * .14, segments=2)]
    front = -size / 2 - .003
    s = size * .62
    if symbol in ('A', 'B'):
        for cx, cz, w, h, ang in _letter_bars(symbol):
            parts.append(k.box('Stroke', (cx * s, front, cz * s), (w * s, .03, h * s), face_mat, bevel=.012, segments=1,
                               rot=(0, ang, 0)))
    elif symbol == 'C':
        c = k.torus('C', (0, front, 0), s * .34, s * .09, face_mat, major_seg=16, minor_seg=5, arc=math.pi * 1.45)
        c.rotation_euler = (math.pi / 2, math.pi / 2, 0)
        parts.append(c)
    elif symbol == 'heart':
        parts.append(U.puff(k, 'Heart', U.heart(s * .85, 20), .035, face_mat, rings=2, back='flat', loc=(0, front, -s * .05)))
    elif symbol == 'star':
        parts.append(U.puff(k, 'Star', U.star(s * .5, s * .24, 5), .035, face_mat, rings=2, back='flat', loc=(0, front, 0)))
    blk = k.join(name + 'Part', parts, pivot=(0, 0, 0))
    blk.rotation_euler = (tilt[0], tilt[1], rot_z)
    blk.location = loc
    return blk


def build_blocks(k):
    cols = {'coral': k.mat('Coral', 'coral', GLOSS), 'teal': k.mat('Teal', 'teal', GLOSS),
            'gold': k.mat('Marigold', 'marigold', GLOSS), 'leaf': k.mat('Leaf', 'leaf', GLOSS),
            'berry': k.mat('Berry', 'berry', GLOSS), 'white': k.mat('Cream', 'white', GLOSS)}
    stack = [(.34, 'coral', 'white', 'A', .08, .0, (0, 0)), (.31, 'teal', 'gold', 'star', -.18, .04, (0, 0)),
             (.29, 'gold', 'coral', 'B', .22, -.03, (0, .03)), (.26, 'leaf', 'white', 'heart', -.26, .07, (.04, -.05))]
    parts = []
    z = 0
    for i, (size, body, face, sym, rz, dx, tilt) in enumerate(stack):
        parts.append(_block(k, 'Block', (dx, 0, z + size / 2), size, rz, cols[body], cols[face], sym, tilt))
        z += size - .004
    # One block has already tumbled off.
    parts.append(_block(k, 'Fallen', (.34, -.12, .13), .26, .5, cols['berry'], cols['white'], 'C',
                        tilt=(0, math.radians(-12))))
    return _finish(k, 'hz_blocks', parts, kind='tall', score='money')


def build_laundry(k):
    rnd = random.Random(71)
    wicker = k.mat('Wicker', '#e9a94f', SATIN)
    teal = k.mat('Teal', 'teal', SATIN)
    coral = k.mat('Coral', 'coral', SATIN)
    denim = k.mat('Denim', 'denim', SATIN)
    cream = k.mat('Cream', 'white', SATIN)
    berry = k.mat('Berry', 'berry', SATIN)
    gold = k.mat('Marigold', 'marigold', SATIN)
    prof = [(0, 0), (.24, 0)]
    for i in range(5):
        z = .03 + i * .09
        r = .25 + i * .015
        prof += [(r, z), (r + .016, z + .045)]
    prof += [(.33, .47), (.34, .5), (.3, .5), (0, .5)]
    parts = [U.lathe(k, 'Basket', prof, wicker, segments=11)]
    parts.append(k.torus('Rim', (0, 0, .5), .325, .034, wicker, major_seg=12, minor_seg=4))
    for s in (-1, 1):
        parts.append(k.torus('Handle', (s * .33, 0, .4), .07, .022, wicker, rot=(0, math.pi / 2, 0), major_seg=8,
                             minor_seg=3))
    # Heaped laundry: folded garments piled high, one tee hanging over the rim.
    heap = [((-.06, -.04, .6), (.28, .22, .08), teal, .4),
            ((.07, .03, .71), (.23, .19, .07), coral, -.3), ((-.03, -.02, .79), (.19, .16, .06), gold, .9),
            ]
    parts.append(k.ball('Bundle', (.03, .03, .86), (.12, .1, .06), berry, 7, 4))
    for (x, y, z), radii, mat, rz in heap:
        parts.append(k.box('Fold', (x, y, z), (radii[0] * 2, radii[1] * 2, radii[2] * 2), mat, bevel=radii[2] * .9,
                           segments=2, rot=(0, 0, rz)))
    # A striped tee draped over the front rim.
    path = U.bezier((-.05, -.05, .6), (-.05, -.25, .62), (-.05, -.34, .55), (-.05, -.35, .3), 5)
    loops = []
    for p in path:
        loops.append([(p[0] + dx, p[1] + dy, p[2]) for dx, dy in ((-.14, -.02), (.14, -.02), (.14, .02), (-.14, .02))])
    parts.append(U.loft(k, 'Tee', loops, teal))
    parts.append(k.box('TeeStripe', (-.05, -.372, .42), (.29, .012, .05), cream, bevel=0))
    parts.append(k.capsule('TeeSleeve', (.1, -.32, .52), (.2, -.36, .36), .05, teal, 6))
    # Socks spilled on the floor: leg, heel, foot, with a contrasting cuff and toe.
    for (x, y, a, mat, cuff) in ((.46, -.28, .3, berry, cream), (-.5, -.3, 2.6, gold, teal)):
        d = Vector((math.cos(a), math.sin(a), 0))
        n = Vector((-d.y, d.x, 0))
        p0 = Vector((x, y, .045))
        p1 = p0 + d * .18
        p2 = p1 + n * .12
        parts.append(k.capsule('SockLeg', tuple(p0 + d * .03), tuple(p1), .05, mat, 6))
        parts.append(k.capsule('SockFoot', tuple(p1), tuple(p2), .047, mat, 6))
        parts.append(k.ball('Toe', tuple(p2 + n * .02), (.05, .05, .045), cuff, 6, 4))
        parts.append(k.ball('Cuff', tuple(p0), (.055, .055, .055), cuff, 6, 4))
    return _finish(k, 'hz_laundry', parts, kind='tall', score='happiness')


def build_cat(k):
    fur = k.mat('Fur', '#ff9a3c', .5)
    stripe = k.mat('FurStripe', '#d9601c', .5)
    cream = k.mat('FurLight', '#fff0dc', .55)
    pink = k.mat('Pink', 'pink', .35)
    eye = k.mat('Eye', '#1b1426', .2)
    cushion = k.mat('Cushion', 'plum', SATIN)
    button = k.mat('Button', 'marigold', GLOSS)
    parts = [U.puff(k, 'Cushion', U.scallop_circle(.34, 8, .08, 3), .14, cushion, rings=2, n=2.6, plane='XY',
                    loc=(0, 0, .07))]
    parts.append(k.ball('CushionButton', (0, 0, .14), (.03, .03, .012), button, 8, 4))
    for i in range(5):
        a = i * math.tau / 5 + .3
        parts.append(k.ball('Tuft', (math.cos(a) * .34, math.sin(a) * .34, .07), .027, button, 6, 4))
    # Curled body, head resting on its front paws.
    body_c = Vector((.04, .03, .23))
    parts.append(k.ball('Body', body_c, (.25, .2, .12), fur, 12, 8))
    parts.append(k.ball('Chest', (-.1, -.08, .21), (.1, .08, .08), cream, 8, 5))
    head_c = Vector((-.16, -.1, .3))
    parts.append(k.ball('Head', head_c, (.12, .11, .1), fur, 12, 8))
    for s in (-1, 1):
        ear_b = head_c + Vector((s * .065, .02, .07))
        parts.append(k.cyl('Ear', tuple(ear_b + Vector((0, 0, .03))), .045, .07, fur, vertices=6, bevel=0, radius2=.006,
                           rot=(math.radians(-10), s * math.radians(22), 0)))
        parts.append(k.cyl('EarIn', tuple(ear_b + Vector((0, -.012, .026))), .026, .045, pink, vertices=6, bevel=0,
                           radius2=.004, rot=(math.radians(-10), s * math.radians(22), 0)))
        # Closed eyes: little smile arcs.
        eye_c = head_c + Vector((s * .05, -.098, .015))
        arc = k.torus('EyeArc', tuple(eye_c), .022, .006, eye, major_seg=10, minor_seg=4, arc=math.radians(150))
        arc.rotation_euler = (math.pi / 2 + .25, 0, 0)
        parts.append(arc)
        parts.append(k.ball('Cheek', tuple(head_c + Vector((s * .04, -.09, -.035))), (.04, .03, .03), cream, 6, 4))
        parts.append(k.ball('Paw', (-.08 + s * .06, -.2, .19), (.045, .05, .03), cream, 6, 4))
    parts.append(k.ball('Nose', tuple(head_c + Vector((0, -.113, -.01))), (.014, .01, .01), pink, 6, 4))
    # Tail curling round the front of the cushion.
    tail = []
    for i in range(6):
        t = i / 5
        a = -.2 - t * 2.4
        tail.append((.05 + math.cos(a) * .3, .02 + math.sin(a) * .26, .16 + .02 * math.sin(t * math.pi)))
    parts.append(k.tube('Tail', tail, .04, fur))
    parts.append(k.ball('TailTip', tail[-1], .045, stripe, 8, 5))
    # Tabby stripes over the back and head.
    for i, (dx, dir_) in enumerate(((-.08, (.0, .3, 1)), (.02, (.2, .4, 1)), (.12, (.5, .3, 1)), (.2, (.8, .1, 1)))):
        parts.append(U.decal(k, 'Stripe', body_c, (.25, .2, .12), dir_, (.028, .004, .09), stripe, lift=-.003,
                             seg=8, rings=3))
    for s in (-1, 0, 1):
        parts.append(U.decal(k, 'HeadStripe', head_c, (.12, .11, .1), (s * .3, -.3, 1), (.012, .003, .035), stripe,
                             lift=-.002, seg=6, rings=3))
    return _finish(k, 'hz_cat', parts, kind='low', score='happiness')


BUILDERS = {
    'pickup_heart': ('pickups', build_heart),
    'pickup_star': ('pickups', build_star),
    'pickup_coin': ('pickups', build_coin),
    'keepsake': ('pickups', build_keepsake),
    'letter': ('pickups', build_letter),
    'tin': ('pickups', build_tin),
    'hz_milk_puddle': ('hazards_home', build_milk_puddle),
    'hz_blocks': ('hazards_home', build_blocks),
    'hz_laundry': ('hazards_home', build_laundry),
    'hz_cat': ('hazards_home', build_cat),
}
