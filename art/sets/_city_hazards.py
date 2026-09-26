"""Brightwater in-lane hazards. obj['height'] <= .45 can be jumped; .8–1.2 must be dodged.
Footprints stay inside one lane (<= 1.6 m across Y); pivots at the base centre."""
import math

from kit import GLOSS, MATTE, SATIN

import _city_parts as cp
from _city_parts import Geo, finish, lamp, mat


def _hazard(obj, height, kind):
    """Lane hazard extras. The height is measured from the geometry; `height` is the design
    intent and the class limits (low <= .45, tall .8-1.2) are enforced at build time."""
    cp.measure(obj)
    h = obj['height']
    if kind == 'low' and h > .45 or kind == 'tall' and not (.8 <= h <= 1.2):
        raise ValueError('%s: %s hazard is %.3f m tall (designed %.2f)' % (obj.name, kind, h, height))
    obj['kind'] = kind
    obj['band'] = 'lane'
    return obj


def hz_suitcase(k):
    """A teal hard-shell suitcase lying flat, covered in travel stickers, with a luggage tag."""
    shell = mat(k, 'Shell', 'teal', GLOSS)
    rubber = mat(k, 'Rubber', 'charcoal', GLOSS)
    s1 = mat(k, 'Sticker', 'coral', GLOSS)
    s2 = mat(k, 'Sticker2', 'marigold', GLOSS)
    s3 = mat(k, 'Sticker3', 'cream', GLOSS)
    s4 = mat(k, 'Sticker4', 'plum', GLOSS)
    L, W, H = .95, .64, .3
    parts = [k.box('Shell', (0, 0, H / 2 + .01), (L, W, H), shell, bevel=.09, segments=3),
             k.box('Zip', (0, 0, H / 2 + .01), (L + .012, W + .012, .035), rubber, bevel=.012, segments=1)]
    g = Geo()
    for y in (-.18, 0, .18):
        g.box(-.38, .38, y - .025, y + .025, H, H + .018, skip=('-z',))
    parts.append(g.obj(k, 'Ribs', shell))
    for sy in (-.2, .2):
        for sz in (.08, .24):
            parts.append(k.cyl('Wheel', (-L / 2 - .02, sy, sz), .045, .05, rubber, axis='Y', vertices=10, bevel=0))
    parts.append(k.box('HandleBase', (-L / 2 - .01, 0, .16), (.04, .36, .08), rubber, bevel=.015, segments=1))
    parts.append(cp.rod(k, 'Handle', [(-.14, -W / 2 - .005, .12), (-.14, -W / 2 - .06, .16), (.14, -W / 2 - .06, .16),
                                      (.14, -W / 2 - .005, .12)], .02, rubber, sides=6))
    # stickers on the lid
    zt = H + .012
    parts.append(k.cyl('Dot', (-.26, -.12, zt), .1, .012, s1, vertices=16, bevel=0))
    parts.append(k.cyl('DotInner', (-.26, -.12, zt + .008), .05, .01, s3, vertices=12, bevel=0))
    parts.append(k.box('Label', (.18, .14, zt), (.26, .16, .012), s3, bevel=.005, segments=1, rot=(0, 0, .25)))
    parts.append(k.box('LabelStripe', (.18, .14, zt + .008), (.22, .04, .01), s1, bevel=0, rot=(0, 0, .25)))
    star = [(math.cos(math.pi / 2 + i * math.pi / 5) * (.1 if i % 2 == 0 else .045),
             math.sin(math.pi / 2 + i * math.pi / 5) * (.1 if i % 2 == 0 else .045)) for i in range(10)]
    st = cp.flat_poly(k, 'Star', [(x + .25, y - .16) for x, y in star], s2, zt - .004, zt + .008)
    parts.append(st)
    parts.append(k.cyl('Badge', (-.02, .18, zt), .075, .012, s4, vertices=6, bevel=0))
    parts.append(k.box('Heart', (-.05, -.16, zt), (.09, .09, .012), s1, bevel=.02, segments=1, rot=(0, 0, .785)))
    # luggage tag
    parts.append(cp.rod(k, 'Strap', [(.1, -W / 2 - .06, .16), (.16, -W / 2 - .14, .06)], .01, rubber, sides=4))
    parts.append(k.box('Tag', (.17, -W / 2 - .16, .04), (.14, .02, .09), s2, bevel=.008, segments=1, rot=(.2, 0, .3)))
    obj = finish(k, 'hz_suitcase', parts, shade=.72)
    return _hazard(obj, H + .03, 'low')


def hz_wet_sign(k):
    """A yellow A-frame wet-floor sign with a slipping-figure pictogram and a CAUTION band."""
    yellow = mat(k, 'Sign', '#ffc81f', GLOSS)
    ink = mat(k, 'Ink', 'charcoal', GLOSS)
    blue = mat(k, 'Wave', 'denim', GLOSS)
    cream = mat(k, 'Text', 'cream', GLOSS)
    H, B = 1.0, .3               # height and half the footprint depth
    th = math.atan2(B, H)
    parts = []

    def on_panel(u, v, off=.03, sy=-1):
        # point on a panel's outer face: u across X, v up the panel (0..1); sy=-1 is the front panel
        return (u, sy * (B - B * v + math.cos(th) * off), H * v + math.sin(th) * off)
    for sy in (-1, 1):
        parts.append(k.box('Panel', on_panel(0, .5, 0, sy), (.6, .035, H / math.cos(th)), yellow, bevel=.03,
                           segments=2, rot=(sy * th, 0, 0)))
        parts.append(k.box('Band', on_panel(0, .86, .02, sy), (.6, .02, .17), ink, bevel=.01, segments=1,
                           rot=(sy * th, 0, 0)))
    parts.append(k.cyl('Hinge', (0, 0, H - .015), .03, .62, ink, axis='X', vertices=8, bevel=0))
    parts.append(k.box('Grip', (0, 0, H + .03), (.3, .08, .07), ink, bevel=.03, segments=1))
    t = cp.text(k, 'CAUTION', .085, .012, cream, on_panel(0, .86, .036), offset=.004, res=1)
    t.rotation_euler = (math.pi / 2 - th, 0, 0)
    parts.append(t)
    # warning triangle and the slipping figure
    tri = [on_panel(-.2, .3, .025), on_panel(.2, .3, .025), on_panel(0, .68, .025)]
    g = Geo()
    g.tube(tri + [tri[0]], .018, 4)
    parts.append(g.obj(k, 'Triangle', ink, weld=False))
    head = on_panel(.05, .56, .04)
    parts.append(k.ball('Head', head, .035, ink, 8, 5))
    g = Geo()
    hip = on_panel(-.01, .43, .035)
    neck = on_panel(.03, .52, .035)
    g.tube([neck, hip], .018, 5, caps=True)
    g.tube([on_panel(.02, .5, .035), on_panel(-.07, .56, .035), on_panel(-.12, .52, .035)], .013, 4, caps=True)
    g.tube([on_panel(.03, .5, .035), on_panel(.1, .47, .035)], .013, 4, caps=True)
    g.tube([hip, on_panel(.08, .38, .035), on_panel(.14, .41, .035)], .015, 4, caps=True)
    g.tube([hip, on_panel(-.08, .36, .035), on_panel(-.12, .33, .035)], .015, 4, caps=True)
    parts.append(g.obj(k, 'Figure', ink, weld=False))
    g = Geo()
    for j in range(2):
        v = .2 - j * .06
        pts = [on_panel(-.16 + i * .04, v + .015 * math.sin(i * 1.6), .03) for i in range(9)]
        g.tube(pts, .012, 4)
    parts.append(g.obj(k, 'Waves', blue, weld=False))
    for sy in (-1, 1):
        parts.append(k.box('Foot', (0, sy * (B - .02), .015), (.62, .08, .03), ink, bevel=.01, segments=1))
    obj = finish(k, 'hz_wet_sign', parts, shade=.75)
    return _hazard(obj, H + .07, 'tall')


def hz_paper_stack(k):
    """A wobbly tower of reams and coloured folders with binder clips and a red DEADLINE tag."""
    paper = mat(k, 'Paper', 'white', SATIN)
    f1 = mat(k, 'Folder', 'coral', GLOSS)
    f2 = mat(k, 'Folder2', 'teal', GLOSS)
    f3 = mat(k, 'Folder3', 'marigold', GLOSS)
    f4 = mat(k, 'Folder4', 'denim', GLOSS)
    tag = mat(k, 'Tag', 'red', GLOSS)
    ink = mat(k, 'Clip', 'charcoal', GLOSS)
    layers = [(paper, .1), (f1, .04), (paper, .09), (f2, .035), (paper, .1), (f3, .04), (paper, .08), (f4, .04),
              (paper, .1), (f1, .035), (paper, .09), (f3, .04), (paper, .08), (f2, .035), (paper, .09), (f4, .04)]
    parts = []
    z = 0.
    lean = 0.
    for i, (m, hgt) in enumerate(layers):
        folder = m is not paper
        w, d = (.72, .54) if folder else (.64, .48)
        lean += .012 + .006 * math.sin(i * 1.3)
        dx = lean + .03 * math.sin(i * 2.1)
        rot = .12 * math.sin(i * 1.7 + .4)
        parts.append(k.box('Layer', (dx, .02 * math.sin(i * 2.7), z + hgt / 2), (w, d, hgt), m,
                           bevel=min(.012, hgt * .3), segments=1, rot=(0, 0, rot)))
        if i in (2, 6, 10):
            parts.append(k.box('Clip', (dx + .12, -d / 2 - .01, z + hgt * .6), (.1, .03, hgt + .04), ink, bevel=.008,
                               segments=1))
        if i in (4, 8):
            parts.append(k.box('Sheet', (dx - .1, -.06, z + hgt - .005), (.5, .38, .01), paper, bevel=0,
                               rot=(0, 0, rot + .35)))
        z += hgt
    top = z
    parts.append(k.box('Note', (lean - .08, .05, top + .006), (.14, .14, .012), f3, bevel=.004, segments=1,
                       rot=(0, 0, .3)))
    # DEADLINE tag hanging off the front
    tx, ty = lean + .15, -.3
    parts.append(cp.rod(k, 'String', [(tx - .05, -.2, top - .01), (tx, ty, top - .12), (tx + .02, ty - .005, top - .22)],
                        .008, ink, sides=4))
    parts.append(k.box('Tag', (tx + .02, ty - .01, top - .36), (.34, .025, .26), tag, bevel=.02, segments=1,
                       rot=(0, .12, 0)))
    parts.append(k.cyl('Eyelet', (tx + .0, ty - .025, top - .26), .02, .02, paper, axis='Y', vertices=8, bevel=0))
    t = cp.text(k, 'DEADLINE', .06, .01, paper, (tx + .02, ty - .03, top - .4), offset=.004, res=1)
    t.rotation_euler = (math.pi / 2, .12, 0)
    parts.append(t)
    parts.append(k.cyl('Clock', (tx + .02, ty - .03, top - .31), .045, .01, paper, axis='Y', vertices=12, bevel=0))
    parts.append(k.box('ClockHand', (tx + .02, ty - .037, top - .3), (.008, .004, .035), tag, bevel=0))
    # stray sheets on the ground
    for (x, y, r) in ((-.45, -.3, .5), (.4, -.35, -.3), (-.2, .45, 1.1)):
        parts.append(k.box('Loose', (x, y, .006), (.3, .4, .008), paper, bevel=0, rot=(0, 0, r)))
    obj = finish(k, 'hz_paper_stack', parts, shade=.74)
    return _hazard(obj, top + .02, 'tall')


def hz_coffee_spill(k):
    """A tipped takeaway coffee cup, its lid rolled away and a glossy brown spill."""
    cup = mat(k, 'Cup', 'white', GLOSS)
    sleeve = mat(k, 'Sleeve', 'coral', GLOSS)
    lid = mat(k, 'Lid', 'plum', GLOSS)
    coffee = mat(k, 'Coffee', '#8f4a1e', .22)
    foam = mat(k, 'Foam', '#f0c890', .2)
    parts = []
    r0, r1, L = .15, .2, .48
    tilt = math.atan2(r1 - r0, L)          # a tapered cup lies with its mouth raised
    zc = r0 + .005
    ax = (math.cos(tilt), math.sin(tilt))  # cup axis in XZ

    def along(t):
        return (-.45 + ax[0] * L * t, 0, zc + ax[1] * L * t)
    prof = [(0, 0), (r0, 0), (r0 + .005, .02), (r1, L - .02), (r1 + .02, L), (r1 - .01, L + .01), (r1 - .03, L - .005)]
    body = k.lathe('Cup', prof, cup, segments=18)
    body.rotation_euler = (0, math.pi / 2 - tilt, 0)
    body.location = along(0)
    parts.append(body)
    band = k.cyl('Sleeve', (0, 0, 0), .182, .16, sleeve, vertices=18, radius2=.193, bevel=0)
    band.rotation_euler = (0, math.pi / 2 - tilt, 0)
    band.location = along(.45)
    parts.append(band)
    mouth = k.cyl('Mouth', (0, 0, 0), r1 - .035, .012, coffee, vertices=18, bevel=0)
    mouth.rotation_euler = (0, math.pi / 2 - tilt, 0)
    mouth.location = along(1.006)
    parts.append(mouth)
    heart = [(math.sin(t) ** 3 * .045, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
              / 16 * .045) for t in [i * math.tau / 16 for i in range(16)]]
    hx, _, hz = along(.45)
    parts.append(k.prism('Heart', [(x + hx, z + hz) for x, z in heart], .02, cup, loc=(0, -.196, 0), bevel=0))
    parts.append(k.cyl('Lid', (-.72, .42, .025), .22, .05, lid, vertices=18, bevel=.015, segments=1,
                       rot=(.12, .05, 0)))
    parts.append(k.cyl('LidRim', (-.72, .42, .06), .14, .03, lid, vertices=14, bevel=0, rot=(.12, .05, 0)))
    spill = cp.blob(.35, 0, .62, .42, n=22, wobble=.2, seed=1.3)
    parts.append(cp.flat_poly(k, 'Spill', spill, coffee, .004, .02))
    parts.append(cp.flat_poly(k, 'Swirl', cp.blob(.3, .05, .2, .12, n=12, wobble=.25, seed=2.2), foam, .02, .026))
    parts.append(cp.flat_poly(k, 'Trail', cp.blob(.02, 0, .14, .12, n=10, wobble=.1), coffee, .004, .02))
    for (x, y, r) in ((1.08, .25, .06), (1.15, -.2, .045), (.95, -.42, .05), (-.2, .38, .04)):
        parts.append(k.ball('Drop', (x, y, .012), (r, r, r * .35), coffee, 8, 4))
    obj = finish(k, 'hz_coffee_spill', parts, shade=.75)
    return _hazard(obj, .43, 'low')


def hz_scooter(k):
    """A parked teal e-scooter on its kickstand: chunky wheels, coral grips, a headlight."""
    frame = mat(k, 'Frame', 'teal', GLOSS)
    deck = mat(k, 'Deck', 'charcoal', GLOSS)
    tyre = mat(k, 'Tyre', 'rubber', MATTE)
    grip = mat(k, 'Grip', 'coral', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    lit = lamp(k, '#fff3c4', 1.4)
    r = .16
    parts = [k.box('Deck', (-.05, 0, .22), (.86, .26, .09), frame, bevel=.04, segments=2),
             k.box('GripTape', (-.08, 0, .27), (.7, .2, .02), deck, bevel=.008, segments=1),
             k.box('Battery', (-.05, 0, .15), (.66, .19, .07), deck, bevel=.025, segments=1)]
    for x in (-.52, .5):
        parts.append(k.cyl('Tyre', (x, 0, r), r, .1, tyre, axis='Y', vertices=16, bevel=.03, segments=1))
        parts.append(k.cyl('Hub', (x, 0, r), r * .55, .11, frame, axis='Y', vertices=12, bevel=0))
        parts.append(k.cyl('Axle', (x, 0, r), r * .2, .13, gold, axis='Y', vertices=8, bevel=0))
    parts.append(k.box('Fender', (-.49, 0, r * 2 + .03), (.38, .13, .04), frame, bevel=.015, segments=1,
                       rot=(0, .25, 0)))
    parts.append(cp.rod(k, 'RearArm', [(-.35, 0, .2), (-.52, 0, r)], .04, deck, sides=6))
    stem = [(.5, 0, r), (.45, 0, .5), (.38, 0, 1.0)]
    parts.append(cp.rod(k, 'Stem', stem, .06, frame, sides=8))
    parts.append(cp.rod(k, 'Neck', [(.3, 0, .24), (.45, 0, .45)], .055, frame, sides=8))
    parts.append(cp.rod(k, 'Bars', [(.38, -.28, 1.03), (.38, .28, 1.03)], .032, deck, sides=6))
    for sy in (-1, 1):
        parts.append(k.cyl('Grip', (.38, sy * .24, 1.03), .045, .12, grip, axis='Y', vertices=10, bevel=.01,
                           segments=1))
    parts.append(k.box('Display', (.38, 0, 1.075), (.1, .13, .05), deck, bevel=.012, segments=1))
    parts.append(k.cyl('LampHousing', (.44, 0, .84), .075, .08, deck, axis='X', vertices=12, bevel=0))
    parts.append(k.cyl('Headlight', (.485, 0, .84), .06, .03, lit, axis='X', vertices=12, bevel=0))
    parts.append(k.ball('Bell', (.36, .14, 1.07), .035, gold, 8, 5))
    parts.append(cp.rod(k, 'Kickstand', [(-.05, -.1, .17), (-.16, -.24, .01)], .02, deck, sides=4))
    parts.append(k.box('Reflector', (-.69, 0, .24), (.03, .1, .05), grip, bevel=0))
    obj = finish(k, 'hz_scooter', parts, shade=.72)
    return _hazard(obj, 1.1, 'tall')


def hz_branch(k):
    """A fallen leafy branch torn down by the storm, splintered end and all."""
    bark = mat(k, 'Bark', 'wood_dark', SATIN)
    split = mat(k, 'Splinter', 'wood_light', SATIN)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    leaf2 = mat(k, 'LeafDark', 'leaf_dark', GLOSS)
    lime = mat(k, 'LeafLight', 'lime', GLOSS)
    parts = []
    spine = [(-.9, -.05, .09), (-.35, .02, .13), (.2, -.03, .16), (.8, .06, .2)]
    g = Geo()
    for (a, b, ra) in ((spine[0], spine[1], .085), (spine[1], spine[2], .07), (spine[2], spine[3], .05)):
        g.tube([a, b], ra, 7)
    for a, b in (((-.3, .02, .13), (-.05, .4, .2)), ((.1, -.02, .16), (.35, -.42, .22)),
                 ((.45, .02, .18), (.75, .38, .24)), ((-.55, 0, .11), (-.45, -.38, .14))):
        g.tube([a, b], .03, 5)
    parts.append(g.obj(k, 'Limbs', bark, weld=False))
    for c, r in ((spine[1], .075), (spine[2], .06), (spine[3], .05)):
        parts.append(k.ball('Knot', c, r, bark, 7, 4))
    parts.append(k.cyl('Break', (-.96, -.05, .09), .09, .1, split, axis='X', vertices=8, radius2=.03, bevel=0,
                       rot=(0, -math.pi / 2, 0)))
    clusters = [((-.05, .42, .24), (.26, .2, .14), leaf), ((.36, -.44, .25), (.28, .22, .14), leaf2),
                ((.78, .4, .27), (.26, .22, .15), lime), ((.95, .05, .26), (.3, .24, .16), leaf),
                ((-.45, -.4, .17), (.22, .18, .12), leaf2), ((.55, -.05, .3), (.26, .22, .14), leaf2),
                ((.15, .2, .3), (.22, .18, .13), lime), ((-.2, -.18, .22), (.2, .18, .12), leaf)]
    for c, rad, m in clusters:
        parts.append(k.ball('Leaves', c, rad, m, 10, 6))
    for (x, y, rr) in ((1.15, .3, .5), (-.75, .35, 2.0), (.3, .6, -.7)):
        parts.append(k.ball('Leaf', (x, y, .015), (.09, .045, .012), lime, 6, 3, rot=(0, 0, rr)))
    obj = finish(k, 'hz_branch', parts, shade=.72)
    return _hazard(obj, .42, 'low')


def hz_storm_puddle(k):
    """A wide storm puddle ('Water' surface) with a dark wet rim, rain rings and splashes."""
    water = mat(k, 'Water', '#2f86a8', .06)
    rim = mat(k, 'WetRim', '#3a4658', .3)
    ripple = mat(k, 'Ripple', '#c8f0ff', .15)
    leaf = mat(k, 'Leaf', 'marigold', GLOSS)
    parts = [cp.flat_poly(k, 'Rim', cp.blob(0, 0, 1.12, .74, n=24, wobble=.16, seed=.7), rim, .0, .012),
             cp.flat_poly(k, 'Water', cp.blob(0, 0, 1.0, .64, n=24, wobble=.16, seed=.7), water, .004, .02)]
    for (x, y, r) in ((-.45, .1, .22), (-.45, .1, .12), (.35, -.2, .28), (.35, -.2, .16), (.6, .3, .14),
                      (-.1, -.35, .1), (.05, .32, .18)):
        parts.append(k.torus('RainRing', (x, y, .022), r, .012, ripple, major_seg=16, minor_seg=3))
    for (x, y, z) in ((-.45, .1, .07), (.35, -.2, .1), (.6, .3, .06)):
        parts.append(k.ball('Splash', (x, y, z), .025, ripple, 6, 4))
        parts.append(k.cyl('Spike', (x, y, .045), .018, .05, ripple, vertices=6, radius2=.004, bevel=0))
    parts.append(k.ball('FloatLeaf', (-.1, .05, .025), (.1, .05, .012), leaf, 8, 3, rot=(0, 0, .6)))
    obj = finish(k, 'hz_storm_puddle', parts, shade=.85)
    return _hazard(obj, .05, 'low')


def hz_bin_tipped(k):
    """A galvanised bin knocked over by the wind, its lid rolled off and rubbish spilling out."""
    metal = mat(k, 'Bin', '#86aab8', .3, metal=.45)
    dark = mat(k, 'Dark', 'charcoal', GLOSS)
    paper = mat(k, 'Paper', 'cream', SATIN)
    peel = mat(k, 'Peel', 'sun', GLOSS)
    can = mat(k, 'Can', 'coral', GLOSS)
    bag = mat(k, 'Bag', 'wood_light', SATIN)
    apple = mat(k, 'Apple', 'leaf', GLOSS)
    R, L = .4, .92
    cx = -.2
    parts = [k.cyl('Body', (cx, 0, R), R, L, metal, axis='X', vertices=16, radius2=R * .9, bevel=0,
                   rot=(0, -math.pi / 2, 0))]
    for f in (-.3, .05, .34):
        parts.append(k.torus('Ridge', (cx + f * L, 0, R), R * (.95 + .1 * f) + .008, .025, metal,
                             rot=(0, math.pi / 2, 0), major_seg=14, minor_seg=3))
    parts.append(k.torus('Rim', (cx + L / 2, 0, R), R + .01, .035, metal, rot=(0, math.pi / 2, 0), major_seg=16,
                         minor_seg=4))
    parts.append(k.cyl('Inside', (cx + L / 2 - .02, 0, R), R * .96, .02, dark, axis='X', vertices=16, bevel=0))
    for sy in (-1, 1):
        parts.append(cp.rod(k, 'Handle', [(cx - .1, sy * .3, R + .3), (cx - .12, sy * .38, R + .28),
                                          (cx + .1, sy * .38, R + .28), (cx + .08, sy * .3, R + .3)], .018, metal))
    # the lid standing on edge, leaning back
    lid = k.cyl('Lid', (cx - .75, .25, R + .02), R + .03, .05, metal, vertices=16, bevel=0)
    lid.rotation_euler = (math.pi / 2 - .35, 0, .5)
    parts.append(lid)
    knob = k.box('LidHandle', (cx - .75, .25, R + .02), (.18, .04, .06), dark, bevel=.01, segments=1)
    knob.rotation_euler = (math.pi / 2 - .35, 0, .5)
    knob.location = (cx - .75 - .05, .25 - .08, R + .05)
    parts.append(knob)
    # spilled rubbish fanning out of the mouth
    for (x, y, r) in ((.45, .1, .12), (.62, -.22, .1), (.8, .18, .09), (.35, -.3, .08), (.95, -.05, .08)):
        parts.append(k.ball('Paper', (x, y, r * .85), (r, r * .9, r * .8), paper, 7, 4))
    parts.append(k.cyl('Can', (.7, .38, .06), .06, .22, can, axis='X', vertices=10, bevel=0,
                       rot=(0, math.pi / 2, .6)))
    parts.append(k.box('Bag', (.42, .38, .12), (.3, .22, .24), bag, bevel=.06, segments=1, rot=(.1, .2, .4)))
    for a in (-.7, 0, .7):
        parts.append(k.capsule('Peel', (1.0, -.3, .035), (1.0 + math.cos(a) * .17, -.3 + math.sin(a) * .17, .025), .03,
                               peel, vertices=8))
    parts.append(k.ball('PeelTop', (.98, -.3, .05), (.05, .045, .04), peel, 8, 4))
    parts.append(k.ball('Apple', (.2, -.45, .07), .07, apple, 8, 5))
    obj = finish(k, 'hz_bin_tipped', parts, shade=.72)
    return _hazard(obj, 2 * R + .06, 'tall')


def sandbags(k):
    """A low wall of stacked sandbags (two tones) with rope ties and a strip of hazard tape."""
    sand = mat(k, 'Sand', '#e9b36a', SATIN)
    sand2 = mat(k, 'Sand2', '#c98f4c', SATIN)
    rope = mat(k, 'Rope', 'wood_dark', SATIN)
    tape = mat(k, 'Tape', 'marigold', GLOSS)
    ink = mat(k, 'TapeInk', 'charcoal', GLOSS)
    parts = []
    rows = [(4, .1), (3, .28), (2, .46)]
    i = 0
    for n, z in rows:
        for j in range(n):
            x = (j - (n - 1) / 2) * .6
            m = sand if (i % 3) else sand2
            parts.append(k.box('Bag', (x, 0, z), (.6, .42, .21), m, bevel=.09, segments=2,
                               rot=(0, .06 * math.sin(i * 1.9), .05 * math.sin(i * 2.7))))
            parts.append(k.ball('Tie', (x + .3, 0, z + .01), (.04, .07, .05), rope, 6, 4))
            i += 1
    g1, g2 = Geo(), Geo()
    for s in range(8):
        x = -.62 + s * .155
        (g1 if s % 2 == 0 else g2).poly([(x, -.215, .3), (x + .155, -.215, .3), (x + .155, -.215, .37),
                                         (x, -.215, .37)], (0, -1, 0))
    parts.append(g1.obj(k, 'HazardTape', tape))
    parts.append(g2.obj(k, 'HazardTape', ink))
    obj = finish(k, 'sandbags', parts, shade=.72)
    cp.measure(obj)
    obj['kind'] = 'dressing'
    obj['band'] = 'foreground'
    return obj
