"""Brightwater workplaces: backdrop set pieces for the career chapters (fronts at Y = +3.5)."""
import math

from kit import GLOSS, MATTE, SATIN

import _city_parts as cp
from _city_parts import Geo, building_props, finish, glass, lamp, mat

F = 3.5


def shipyard(k):
    """Dry dock with a ship taking shape on keel blocks, a marigold gantry crane straddling the
    basin (lifting a hull block), stacked containers and a site cabin."""
    conc = mat(k, 'Concrete', '#b9abc9', MATTE)
    crane = mat(k, 'Crane', 'marigold', GLOSS)
    hullm = mat(k, 'Hull', 'navy', GLOSS)
    red = mat(k, 'Red', 'coral_dark', GLOSS)
    cream = mat(k, 'Cream', 'cream', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    win = glass(k)
    lit = lamp(k)
    bx0, bx1 = -4.6, 5.6
    parts = [k.box('FrontQuay', (0, F + .45, -.2), (14.0, .9, .4), conc, bevel=.05, segments=1),
             k.box('FrontWall', ((bx0 + bx1) / 2, F + .7, -1.4), (bx1 - bx0, .4, 2.0), conc, bevel=0),
             k.box('BasinFloor', ((bx0 + bx1) / 2, F + 4.1, -2.5), (bx1 - bx0, 6.4, .2), metal, bevel=0),
             k.box('BackWall', ((bx0 + bx1) / 2, F + 7.5, -1.2), (bx1 - bx0 + .2, .6, 2.4), conc, bevel=.05, segments=1),
             k.box('LeftQuay', (-5.8, F + 3.9, -1.2), (2.4, 7.8, 2.4), conc, bevel=.05, segments=1),
             k.box('RightQuay', (6.3, F + 3.9, -1.2), (1.4, 7.8, 2.4), conc, bevel=.05, segments=1)]
    g1, g2 = Geo(), Geo()
    for i in range(28):
        x = -7 + i * .5
        (g1 if i % 2 == 0 else g2).box(x, x + .5, F + .78, F + .92, 0, .02, skip=('-z', '+y'))
    parts.append(g1.obj(k, 'EdgeStripe', crane))
    parts.append(g2.obj(k, 'EdgeStripe', metal))
    for x in (-3.5, 0, 3.5):
        parts.append(k.cyl('Bollard', (x, F + .45, .2), .13, .4, metal, vertices=10, bevel=0))
        parts.append(k.cyl('BollardCap', (x, F + .45, .42), .17, .06, metal, vertices=10, bevel=0))
    parts.append(k.torus('Lifebuoy', (-5.2, F + .3, .75), .26, .08, red, rot=(math.pi / 2, 0, 0), major_seg=14,
                         minor_seg=5))
    parts.append(k.box('BuoyPost', (-5.2, F + .38, .45), (.08, .08, .9), metal, bevel=0))
    # the ship on keel blocks
    yc = F + 4.1
    for x in (-3.2, -1.2, .8, 2.8):
        parts.append(k.box('KeelBlock', (x, yc, -2.1), (.5, .9, .6), conc, bevel=0))
    secs = cp.hull_sections(-3.9, 5.0, 3.3, -1.8, 2.3, n=12, pts=9, yc=yc, sheer=.3)
    upper = cp.loft(k, 'Hull', secs, hullm, cap_start=True, cap_end=False)
    lower = cp.split_z(k, upper, -.25, red, name='HullBottom')
    boot = cp.split_z(k, upper, .1, crane, name='BootTop')
    parts += [upper, lower, boot]
    outline = [(s[0][0], s[0][1]) for s in secs] + [(s[-1][0], s[-1][1]) for s in secs][::-1]
    parts.append(cp.flat_poly(k, 'Deck', outline, cream, 2.15, 2.3))
    g = Geo()
    for i in range(6):
        x = -2.2 + i * 1.0
        g.poly([(x - .16, yc - 1.66, 1.2), (x + .16, yc - 1.66, 1.2), (x + .16, yc - 1.66, 1.52),
                (x - .16, yc - 1.66, 1.52)], (0, -1, 0))
    parts.append(g.obj(k, 'Portholes', win))
    parts.append(k.box('Bridge', (-2.4, yc, 3.1), (2.3, 2.4, 1.6), cream, bevel=.1, segments=2))
    parts.append(k.box('Wheelhouse', (-2.3, yc, 4.3), (1.7, 2.1, .9), cream, bevel=.08, segments=1))
    parts.append(k.box('WheelhouseRoof', (-2.3, yc, 4.8), (2.0, 2.4, .12), red, bevel=.04, segments=1))
    parts.append(k.box('BridgeWindows', (-2.3, yc - 1.06, 4.35), (1.4, .04, .4), win, bevel=0))
    parts.append(k.box('BridgeWindowsF', (-1.44, yc, 4.35), (.04, 1.7, .4), win, bevel=0))
    parts.append(k.cyl('Funnel', (-3.3, yc, 4.6), .38, 1.6, red, vertices=12, radius2=.34, bevel=.04, segments=1))
    parts.append(k.cyl('FunnelBand', (-3.3, yc, 5.0), .38, .22, crane, vertices=12, bevel=0))
    parts.append(k.cyl('Mast', (1.6, yc, 3.6), .06, 2.6, metal, vertices=6, bevel=0))
    parts.append(k.ball('MastLamp', (1.6, yc, 4.95), .1, lit, 6, 4))
    for x in (.4, 2.8):
        parts.append(k.box('Hatch', (x, yc, 2.45), (1.5, 1.8, .3), crane if x > 1 else red, bevel=.06, segments=1))
    # scaffold at the bow and a gangway to the quay
    g = Geo()
    sx0, sx1, sy = 3.3, 5.0, yc - 2.1
    for x in (sx0, sx1):
        g.box(x - .04, x + .04, sy - .04, sy + .04, -2.4, 2.9, skip=('-z',))
    for z in (-1.4, -.2, 1.0, 2.2):
        g.box(sx0, sx1, sy - .03, sy + .03, z, z + .06)
        g.box(sx0, sx1, sy - .3, sy + .03, z + .06, z + .1)
    g.tube([(sx0, sy, -1.4), (sx1, sy, -.2)], .03, 4)
    g.tube([(sx1, sy, -.2), (sx0, sy, 1.0)], .03, 4)
    g.tube([(sx0, sy, 1.0), (sx1, sy, 2.2)], .03, 4)
    parts.append(g.obj(k, 'Scaffold', metal, weld=False))
    ga = math.atan2(2.3, 2.0)
    parts.append(k.box('Gangway', (-.6, F + 1.55, 1.15), (.8, 3.05, .07), crane, bevel=.02, segments=1,
                       rot=(ga, 0, 0)))
    g = Geo()
    for sx in (-.4, .4):
        g.tube([(-.6 + sx, F + .5, .9), (-.6 + sx, F + 2.5, 3.2)], .025, 4)
    parts.append(g.obj(k, 'GangRail', metal, weld=False))
    # gantry crane
    for lx in (-6.4, 6.4):
        for ly in (F + 1.4, F + 6.8):
            parts.append(k.box('Leg', (lx, ly, 7.5), (.6, .6, 15.0), crane, bevel=.1, segments=1))
            parts.append(k.box('Bogie', (lx, ly, .25), (1.2, .8, .5), metal, bevel=.06, segments=1))
        parts.append(k.box('Sill', (lx, F + 4.1, 1.0), (.5, 5.8, .5), crane, bevel=.08, segments=1))
        parts.append(k.box('Tie', (lx, F + 4.1, 14.6), (.6, 6.0, .7), crane, bevel=.1, segments=1))
        g = Geo()
        g.tube([(lx, F + 1.6, 1.3), (lx, F + 6.6, 14.2)], .1, 6)
        g.tube([(lx, F + 6.6, 1.3), (lx, F + 1.6, 14.2)], .1, 6)
        parts.append(g.obj(k, 'Brace', crane, weld=False))
    parts.append(k.box('Girder', (0, F + 4.1, 15.8), (14.2, 1.8, 1.6), crane, bevel=.14, segments=2))
    parts.append(k.box('GirderBand', (0, F + 3.18, 15.8), (13.4, .06, .5), red, bevel=.02, segments=1))
    parts.append(cp.text(k, 'BRIGHTWATER YARD', .42, .06, cream, (0, F + 3.12, 15.8), offset=.01, res=1))
    parts.append(k.box('Walkway', (0, F + 3.05, 16.65), (14.2, .5, .06), metal, bevel=0))
    parts.append(cp.railing(k, -7.0, 7.0, F + 2.82, 16.68, .7, metal, post=.9))
    tx = 1.0
    parts.append(k.box('Trolley', (tx, F + 4.1, 17.1), (1.8, 2.2, 1.0), red, bevel=.1, segments=2))
    parts.append(k.box('TrolleyRoof', (tx, F + 4.1, 17.66), (2.0, 2.4, .12), crane, bevel=.04, segments=1))
    parts.append(k.box('Cab', (-5.6, F + 2.9, 14.1), (1.3, 1.2, 1.2), cream, bevel=.08, segments=1))
    parts.append(k.box('CabGlass', (-5.6, F + 2.28, 14.2), (1.0, .04, .6), win, bevel=0))
    for sx in (-.3, .3):
        parts.append(k.box('Cable', (tx + sx, F + 4.1, 11.6), (.04, .04, 10.4), metal, bevel=0))
    parts.append(k.box('HookBlock', (tx, F + 4.1, 6.2), (.8, .5, .7), crane, bevel=.08, segments=1))
    parts.append(k.torus('Hook', (tx, F + 4.1, 5.55), .22, .07, red, rot=(math.pi / 2, 0, 0), major_seg=12,
                         minor_seg=4, arc=math.pi * 1.4))
    for sx in (-1, 1):
        parts.append(k.box('Sling', (tx + sx * .7, F + 4.1, 5.0), (.03, .03, 1.2), metal, bevel=0, rot=(0, sx * .6, 0)))
    parts.append(k.box('HullBlock', (tx, F + 4.1, 3.95), (2.6, 1.6, .9), hullm, bevel=.1, segments=1))
    parts.append(k.box('HullBlockRed', (tx, F + 4.1, 3.4), (2.62, 1.62, .25), red, bevel=.06, segments=1))
    for sx in (-6.1, 6.1):
        parts.append(k.box('Flood', (sx, F + 3.4, 15.0), (.4, .3, .25), metal, bevel=.03, segments=1))
        parts.append(k.box('FloodGlass', (sx, F + 3.24, 14.95), (.32, .04, .18), lit, bevel=0))
    parts.append(k.ball('Beacon', (0, F + 4.1, 16.75), .16, lit, 8, 5))
    # containers on the left quay and a site cabin on the right
    for i, (z, m) in enumerate(((0.0, red), (1.3, hullm))):
        cz = z + .65
        parts.append(k.box('Container', (-5.7, F + 4.1, cz), (1.5, 4.0, 1.28), m, bevel=.05, segments=1))
        g = Geo()
        for j in range(9):
            y = F + 2.4 + j * .42
            g.box(-6.47, -6.43, y - .06, y + .06, cz - .55, cz + .55, skip=('+x',))
        parts.append(g.obj(k, 'Ribs', m))
    parts.append(k.box('ContainerTop', (-5.7, F + 4.1, 2.67), (1.2, 3.6, 1.28), crane, bevel=.05, segments=1))
    parts.append(k.box('Cabin', (5.1, F + 1.3, 1.15), (2.2, 1.3, 2.3), cream, bevel=.08, segments=1))
    parts.append(k.box('CabinRoof', (5.1, F + 1.3, 2.36), (2.4, 1.5, .12), red, bevel=.04, segments=1))
    parts += cp.windows(k, [(4.7, 1.0, .9, .8)], at=F + .65, glass_mat=win, frame_mat=red, depth=.05, t=.07,
                        mullion='v')
    parts.append(k.box('CabinDoor', (5.75, F + .63, .95), (.6, .06, 1.8), crane, bevel=.02, segments=1))
    parts.append(k.box('CabinBase', (5.1, F + 1.3, .05), (2.3, 1.4, .1), metal, bevel=0))
    obj = finish(k, 'shipyard', parts, lo=-2.6, hi=12, shade=.72)
    obj = building_props(obj)
    obj['dock_floor_z'] = -2.4
    return obj


def newsroom(k):
    """Navy media house: lit lobby, an LED news ticker, a window full of paper rolls, vending
    boxes, and a rooftop gantry of chunky NEWS letters beside a folded-paper icon."""
    wall = mat(k, 'Wall', '#2d4f96', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    sign = mat(k, 'Sign', 'coral', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    paper = mat(k, 'Paper', 'white', SATIN)
    win = glass(k)
    lit = lamp(k)
    parts = [k.box('Body', (0, F + 4.2, 5.25), (12.0, 8.0, 10.5), wall, bevel=.14, segments=2),
             k.box('Plinth', (0, F + 4.2, .3), (12.2, 8.2, .6), trim, bevel=.05, segments=1)]
    # lobby, ticker, press window
    parts += cp.windows(k, cp.grid(cp.spaced(-5.4, .6, 3), [.62], 1.85, 2.65), at=F, glass_mat=lit, frame_mat=trim,
                        depth=.08, t=.1, mullion='h')
    parts.append(k.box('Canopy', (-2.4, F - .7, 3.3), (2.4, 1.5, .18), sign, bevel=.06, segments=1))
    parts.append(k.box('Ticker', (0, F - .1, 3.85), (11.4, .22, .56), metal, bevel=.05, segments=1))
    g = Geo()
    x = -5.4
    i = 0
    while x < 5.3:
        w = (.12, .3, .18, .45, .12)[i % 5]
        g.box(x, x + w, F - .23, F - .2, 3.72 + (i % 2) * .08, 3.9 + (i % 3) * .03)
        x += w + .09
        i += 1
    parts.append(g.obj(k, 'TickerLeds', lit))
    parts += cp.windows(k, [(3.6, .45, 3.9, 2.75)], at=F, glass_mat=lit, frame_mat=trim, depth=.1, t=.14,
                        mullion=None)
    for i, x in enumerate((2.4, 3.6, 4.8)):
        parts.append(k.cyl('PaperRoll', (x, F - .45, .95), .42, .7, paper, axis='Y', vertices=14, bevel=.04,
                           segments=1))
        parts.append(k.cyl('RollCore', (x, F - .81, .95), .12, .04, gold, axis='Y', vertices=10, bevel=0))
    parts.append(k.box('Cradle', (3.6, F - .45, .3), (3.5, .6, .6), metal, bevel=.05, segments=1))
    g = Geo()
    g.poly([(1.9, F - .2, 1.55), (5.3, F - .2, 2.25), (5.3, F - .2, 2.35), (1.9, F - .2, 1.65)], (0, -1, 0))
    parts.append(g.obj(k, 'Web', paper))
    for x, m in ((-5.2, sign), (-4.6, gold), (.4, sign)):
        parts.append(k.box('Vendor', (x, F - .35, .72), (.5, .42, .7), m, bevel=.05, segments=1))
        parts.append(k.box('VendorWindow', (x, F - .57, .8), (.36, .02, .3), paper, bevel=0))
        parts.append(k.box('VendorLegs', (x, F - .35, .19), (.36, .3, .38), metal, bevel=0))
    # upper floors
    ups = cp.grid(cp.spaced(-6, 6, 3), [4.9, 7.95], 2.7, 2.1)
    parts += cp.windows(k, ups, at=F, glass_mat=win, frame_mat=trim, depth=.1, t=.12, mullion='double',
                        glint_mat=trim, blind_mat=gold, blind_every=4)
    g = Geo()
    for (x, v, w, hh) in ups:
        g.box(x - w / 2 - .1, x + w / 2 + .1, F - .18, F + .02, v - .14, v, skip=('+y',))
    for z in (4.4, 7.45):
        g.box(-6.05, 6.05, F - .06, F + .02, z, z + .16, skip=('+y',))
    parts.append(g.obj(k, 'Sills', trim))
    parts.append(k.box('Cornice', (0, F + 4.2, 10.6), (12.4, 8.4, .36), trim, bevel=.1, segments=2))
    # rooftop sign gantry
    rz = 10.78
    g = Geo()
    for x in (-4.4, -1.4, 1.6):
        g.box(x - .07, x + .07, F + 1.3, F + 1.44, rz, rz + 3.0, skip=('-z',))
        g.tube([(x, F + 1.37, rz), (x, F + 2.6, rz)], .05, 4)
    g.box(-4.9, 2.1, F + 1.3, F + 1.44, rz + 1.0, rz + 1.1)
    g.box(-4.9, 2.1, F + 1.3, F + 1.44, rz + 2.6, rz + 2.7)
    parts.append(g.obj(k, 'Gantry', metal, weld=False))
    parts.append(cp.text(k, 'NEWS', 1.6, .3, sign, (-1.4, F + 1.1, rz + 1.85), offset=.03, bevel=.03, res=2))
    for i in range(9):
        x = -4.4 + i * .75
        parts.append(k.ball('Bulb', (x, F + 1.0, rz + .78), .09, lit, 6, 4))
    # folded newspaper icon
    px, pz = 4.1, rz + 1.9
    parts.append(k.box('PaperBack', (px + .15, F + 1.4, pz), (1.8, .08, 2.2), paper, bevel=.04, segments=1,
                       rot=(0, 0, .0)))
    parts.append(k.box('PaperFront', (px - .05, F + 1.15, pz - .1), (1.8, .08, 2.2), paper, bevel=.04, segments=1,
                       rot=(0, -.12, 0)))
    g = Geo()
    fy = F + 1.1
    g.box(px - .75, px + .55, fy - .02, fy, pz + .6, pz + .9)
    for j in range(6):
        z = pz + .35 - j * .22
        g.box(px - .75, px + (.1 if j % 2 else .55), fy - .02, fy, z, z + .08)
    parts.append(g.obj(k, 'Print', metal))
    parts.append(k.box('Photo', (px + .2, fy - .02, pz - .55), (.5, .02, .45), gold, bevel=0))
    g = Geo()
    g.box(px - .08, px + .08, F + 1.3, F + 1.5, rz, pz - 1.0, skip=('-z',))
    parts.append(g.obj(k, 'PaperPost', metal))
    parts += cp.antenna(k, 4.6, F + 5.5, rz, 3.2, metal, lit)
    parts.append(k.ball('Dish', (-3.5, F + 5.6, rz + .7), (.6, .25, .6), trim, 10, 6, rot=(.4, 0, 0)))
    parts.append(k.box('DishStand', (-3.5, F + 5.8, rz + .3), (.1, .1, .6), metal, bevel=0))
    obj = finish(k, 'newsroom', parts, lo=-.5, hi=11, shade=.72)
    return building_props(obj)


def _fish(k, c, length, body, fin, eye, pupil, parts, facing=1):
    """A chunky stylised fish along X centred at c (nose at +X when facing=1)."""
    x, y, z = c
    L = length
    parts.append(k.ball('FishBody', (x, y, z), (L * .5, L * .2, L * .32), body, 16, 10))
    for f in (-.12, .12):
        parts.append(k.ball('Stripe', (x + f * L * facing, y, z), (L * .05, L * .205, L * .31), fin, 12, 8))
    parts.append(k.prism('Tail', [(x - facing * L * .42, z), (x - facing * L * .72, z + L * .26),
                                  (x - facing * L * .64, z), (x - facing * L * .72, z - L * .26)], L * .08, fin,
                         loc=(0, y, 0), bevel=L * .02, segments=1))
    parts.append(k.prism('Dorsal', [(x - facing * L * .18, z + L * .26), (x + facing * L * .1, z + L * .3),
                                    (x - facing * L * .12, z + L * .46)], L * .05, fin, loc=(0, y, 0), bevel=L * .015,
                         segments=1))
    for sy in (-1, 1):
        ex, ey, ez = x + facing * L * .3, y + sy * L * .14, z + L * .07
        parts.append(k.ball('Eye', (ex, ey, ez), L * .075, eye, 10, 6))
        parts.append(k.ball('Pupil', (ex + facing * L * .02, ey + sy * L * .045, ez), L * .04, pupil, 8, 5))
    parts.append(k.torus('Mouth', (x + facing * L * .48, y, z - L * .05), L * .05, L * .015, pupil,
                         rot=(0, math.pi / 2, 0), major_seg=10, minor_seg=3))


def aquarium_lab(k):
    """Marine research centre: a wave-shaped ocean roof with a foam edge, a big round tank window
    with fish, a glassy front with a lit entrance, and a chunky coral fish on the roof."""
    wall = mat(k, 'Wall', 'white', GLOSS)
    teal = mat(k, 'Teal', 'teal', GLOSS)
    ocean = mat(k, 'Ocean', 'ocean', GLOSS)
    fish = mat(k, 'Fish', 'coral', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    ink = mat(k, 'Ink', 'ink', GLOSS)
    win = glass(k)
    lit = lamp(k)
    parts = [k.box('Body', (0, F + 4.0, 3.3), (13.0, 8.0, 6.6), wall, bevel=.14, segments=2),
             k.box('Base', (0, F + 4.0, .35), (13.16, 8.16, .7), teal, bevel=.06, segments=1)]
    # wave roof
    top = []
    n = 26
    for i in range(n + 1):
        x = -7.0 + 14.0 * i / n
        top.append((x, 7.5 + .85 * math.sin(x * .72 + .6)))
    prof = top + [(x, z - .55) for x, z in reversed(top)]
    parts.append(k.prism('WaveRoof', prof, 8.8, ocean, loc=(0, F + 4.0, 0), bevel=.08, segments=2))
    foam = [(x, z + .02) for x, z in top] + [(x, z - .2) for x, z in reversed(top)]
    parts.append(k.prism('Foam', foam, .16, wall, loc=(0, F - .42, 0), bevel=.04, segments=1))
    g = Geo()
    for x, z in top[1:-1:2]:
        g.box(x - .06, x + .06, F + .2, F + .4, 6.55, z - .5, skip=('-z',))
    parts.append(g.obj(k, 'RoofPosts', teal))
    # glass front and lit entrance
    fr = cp.grid([-.6, 1.4, 3.4, 5.4], [.9], 1.8, 3.6)
    parts += cp.windows(k, fr, at=F, glass_mat=win, frame_mat=teal, depth=.08, t=.1, mullion='h', glint_mat=wall)
    parts += cp.windows(k, [(1.4, .72, 1.5, 2.6)], at=F - .02, glass_mat=lit, frame_mat=gold, depth=.1, t=.12,
                        mullion='v')
    parts.append(k.box('EntranceCanopy', (1.4, F - .55, 3.5), (2.4, 1.2, .16), gold, bevel=.05, segments=1))
    parts.append(k.box('SignBand', (2.4, F - .08, 5.35), (7.4, .2, .7), teal, bevel=.06, segments=1))
    parts.append(cp.text(k, 'MARINE LAB', .5, .08, wall, (2.4, F - .22, 5.34), offset=.01, res=1))
    # round tank window with fish and bubbles
    tx, tz = -4.1, 3.2
    parts.append(k.cyl('TankGlass', (tx, F - .03, tz), 1.55, .06, win, axis='Y', vertices=24, bevel=0))
    parts.append(k.torus('TankRim', (tx, F - .08, tz), 1.6, .16, teal, rot=(math.pi / 2, 0, 0), major_seg=24,
                         minor_seg=5))
    parts.append(k.ball('Rivet', (tx, F - .2, tz + 1.62), .1, gold, 6, 4))
    for (fx, fz, s, m, face) in ((tx - .5, tz + .45, .7, fish, 1), (tx + .55, tz - .35, .55, gold, -1),
                                 (tx - .2, tz - .75, .4, fish, 1)):
        parts.append(k.ball('SmallFish', (fx, F - .1, fz), (s * .5, .06, s * .3), m, 10, 6))
        parts.append(k.prism('SmallTail', [(fx - face * s * .45, fz), (fx - face * s * .72, fz + s * .2),
                                           (fx - face * s * .72, fz - s * .2)], .05, m, loc=(0, F - .1, 0), bevel=0))
        parts.append(k.ball('SmallEye', (fx + face * s * .25, F - .16, fz + s * .06), s * .06, ink, 6, 4))
    for (bx_, bz, r) in ((tx + .9, tz + .7, .1), (tx + 1.0, tz + 1.05, .07), (tx + .75, tz + 1.3, .05)):
        parts.append(k.ball('Bubble', (bx_, F - .12, bz), r, wall, 6, 4))
    # the big fish on a pole
    parts.append(k.cyl('Pole', (-1.4, F + 1.2, 8.3), .12, 2.2, ink, vertices=8, bevel=0))
    _fish(k, (-1.4, F + 1.2, 10.3), 3.4, fish, gold, wall, ink, parts)
    for (bx_, bz, r) in ((.7, 11.3, .22), (1.1, 11.8, .15), (.9, 12.2, .1)):
        parts.append(k.ball('Bubble', (bx_, F + 1.2, bz), r, wall, 8, 5))
    parts += cp.antenna(k, 5.2, F + 6.0, 7.8, 2.0, ink, lit)
    obj = finish(k, 'aquarium_lab', parts, lo=-.5, hi=11, shade=.72)
    return building_props(obj)


def workshop(k):
    """Boat workshop: teal board-and-batten shed under a denim gable, big coral sliding doors
    pushed aside, a lit timber interior with a hull on trestles, tools and a workbench."""
    wall = mat(k, 'Wall', 'teal', GLOSS)
    roof = mat(k, 'Roof', 'denim', GLOSS)
    door = mat(k, 'Door', 'coral', GLOSS)
    wood = mat(k, 'Wood', 'wood_light', SATIN)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    win = glass(k)
    lit = lamp(k)
    ox0, ox1, oh = -4.4, 2.2, 4.4
    parts = [k.box('Back', (0, F + 5.6, 2.6), (12.0, 4.8, 5.2), wall, bevel=.1, segments=1),
             k.box('LeftWing', (-5.2, F + 1.6, 2.6), (1.6, 3.2, 5.2), wall, bevel=.1, segments=1),
             k.box('RightWing', (4.1, F + 1.6, 2.6), (3.8, 3.2, 5.2), wall, bevel=.1, segments=1),
             k.box('Lintel', ((ox0 + ox1) / 2, F + 1.6, (oh + 5.2) / 2), (ox1 - ox0 + .2, 3.2, 5.2 - oh), wall,
                   bevel=.06, segments=1)]
    # interior: timber walls, ceiling, lamps
    parts.append(k.box('InBack', ((ox0 + ox1) / 2, F + 3.18, oh / 2), (ox1 - ox0, .06, oh), wood, bevel=0))
    for x in (ox0 + .03, ox1 - .03):
        parts.append(k.box('InSide', (x, F + 1.6, oh / 2), (.06, 3.2, oh), wood, bevel=0))
    parts.append(k.box('InCeil', ((ox0 + ox1) / 2, F + 1.6, oh - .03), (ox1 - ox0, 3.2, .06), wood, bevel=0))
    parts.append(k.box('InFloor', ((ox0 + ox1) / 2, F + 1.6, .02), (ox1 - ox0, 3.2, .04), metal, bevel=0))
    for x in (-2.6, .5):
        parts.append(k.box('Cord', (x, F + 1.9, oh - .45), (.02, .02, .9), metal, bevel=0))
        parts.append(k.cyl('Shade', (x, F + 1.9, oh - .95), .3, .22, metal, vertices=10, radius2=.08, bevel=0))
        parts.append(k.ball('Bulb', (x, F + 1.9, oh - 1.08), .12, lit, 8, 5))
    # hull on trestles
    secs = cp.hull_sections(-3.6, 1.4, 1.7, .95, 2.15, n=9, pts=7, yc=F + 1.8, sheer=.22)
    hull = cp.loft(k, 'Hull', secs, trim, cap_start=True, cap_end=False)
    bottom = cp.split_z(k, hull, 1.45, wall, name='HullBottom')
    band = cp.split_z(k, hull, 1.62, door, name='HullBand')
    parts += [hull, bottom, band]
    outline = [(s[0][0], s[0][1]) for s in secs] + [(s[-1][0], s[-1][1]) for s in secs][::-1]
    parts.append(cp.flat_poly(k, 'Gunwale', outline, wood, 2.05, 2.15))
    g = Geo()
    for tx in (-2.6, .3):
        for sy in (-1, 1):
            g.tube([(tx - .45, F + 1.8 + sy * .45, 0), (tx, F + 1.8 + sy * .45, 1.0), (tx + .45, F + 1.8 + sy * .45, 0)],
                   .05, 4, caps=True)
        g.box(tx - .08, tx + .08, F + 1.15, F + 2.45, .95, 1.05)
    parts.append(g.obj(k, 'Trestles', wood, weld=False))
    # tools on a pegboard and a workbench
    parts.append(k.box('Pegboard', (-3.1, F + 3.12, 2.8), (1.9, .04, 1.1), trim, bevel=0))
    g = Geo()
    for (x, z, w, h_) in ((-3.8, 2.6, .08, .6), (-3.5, 2.85, .5, .08), (-3.1, 2.5, .06, .5), (-2.75, 2.7, .36, .1),
                          (-2.4, 2.55, .08, .7)):
        g.box(x - w / 2, x + w / 2, F + 3.06, F + 3.1, z, z + h_)
    parts.append(g.obj(k, 'Tools', metal))
    parts.append(k.torus('Coil', (-2.2, F + 3.05, 3.05), .18, .04, door, rot=(math.pi / 2, 0, 0), major_seg=10,
                         minor_seg=3))
    parts.append(k.box('Bench', (1.4, F + 2.7, .9), (1.2, .7, .1), wood, bevel=.02, segments=1))
    parts.append(k.box('BenchLegs', (1.4, F + 2.7, .43), (1.0, .56, .86), metal, bevel=0))
    parts.append(k.box('Vise', (1.0, F + 2.45, 1.02), (.2, .16, .16), door, bevel=.02, segments=1))
    # sliding doors pushed right, their rail and braces
    parts.append(k.box('DoorRail', (.9, F - .12, oh + .12), (10.4, .12, .12), metal, bevel=.02, segments=1))
    for i, x in enumerate((3.05, 4.8)):
        parts.append(k.box('SlideDoor', (x, F - .2 - i * .12, oh / 2), (1.7, .1, oh - .1), door, bevel=.04,
                           segments=1))
        g = Geo()
        y = F - .27 - i * .12
        g.box(x - .8, x + .8, y - .02, y + .02, .15, .35)
        g.box(x - .8, x + .8, y - .02, y + .02, oh - .45, oh - .25)
        g.box(x - .8, x + .8, y - .02, y + .02, oh / 2 - .1, oh / 2 + .1)
        g.tube([(x - .72, y - .02, .35), (x + .72, y - .02, oh / 2 - .1)], .06, 4)
        g.tube([(x - .72, y - .02, oh / 2 + .1), (x + .72, y - .02, oh - .45)], .06, 4)
        parts.append(g.obj(k, 'Brace', trim, weld=False))
    # board-and-batten cladding
    g = Geo()
    x = -5.9
    while x < 5.95:
        z0 = oh + .02 if ox0 - .05 < x < ox1 + .05 else 0.
        g.box(x - .03, x + .03, F - .04, F + .01, z0, 5.1, skip=('+y', '-z'))
        x += .45
    parts.append(g.obj(k, 'Battens', wall))
    # gable roof, fascia, sign and gable window
    parts.append(k.prism('Gable', [(-6.0, 5.1), (6.0, 5.1), (0, 7.7)], 8.0, wall, loc=(0, F + 4.0, 0), bevel=.06,
                         segments=1))
    ang = math.atan2(2.9, 6.6)
    L = math.hypot(6.6, 2.9)
    for sx in (-1, 1):
        parts.append(k.box('RoofSlope', (sx * 3.3, F + 4.0, 6.55), (L + .2, 8.8, .2), roof, bevel=.08, segments=2,
                           rot=(0, sx * ang, 0)))
        parts.append(k.box('Fascia', (sx * 3.2, F - .45, 6.28), (L, .14, .3), trim, bevel=.04, segments=1,
                           rot=(0, sx * ang, 0)))
    parts.append(k.box('Ridge', (0, F + 4.0, 8.0), (.5, 8.9, .3), metal, bevel=.08, segments=1))
    for sx in (-1, 1):
        parts.append(k.box('Skylight', (sx * 2.4, F + 5.2, 6.8 - 0.0), (1.2, 1.8, .1), win, bevel=.02, segments=1,
                           rot=(0, sx * ang, 0)))
    parts.append(k.torus('GableRim', (0, F - .06, 6.2), .55, .09, trim, rot=(math.pi / 2, 0, 0), major_seg=16,
                         minor_seg=4))
    parts.append(k.cyl('GableGlass', (0, F - .02, 6.2), .52, .04, win, axis='Y', vertices=16, bevel=0))
    parts.append(k.box('SignBoard', (-1.1, F - .12, 4.8), (4.6, .16, .62), door, bevel=.06, segments=1))
    parts.append(cp.text(k, 'BOATWORKS', .44, .06, trim, (-1.1, F - .24, 4.79), offset=.01, res=1))
    # yard dressing: oars, a lifebuoy, planks and a lantern
    for i, x in enumerate((-5.5, -5.25)):
        parts.append(k.box('Oar', (x, F - .25, 1.4), (.07, .07, 2.6), wood, bevel=0, rot=(-.18, .08 * (i * 2 - 1), 0)))
        parts.append(k.box('Blade', (x, F - .02, 2.55), (.22, .05, .6), door, bevel=.02, segments=1,
                           rot=(-.18, .08 * (i * 2 - 1), 0)))
    parts.append(k.torus('Lifebuoy', (-5.1, F - .06, 3.4), .32, .09, door, rot=(math.pi / 2, 0, 0), major_seg=14,
                         minor_seg=5))
    for j, z in enumerate((.08, .24, .4)):
        parts.append(k.box('Plank', (-5.2 + j * .05, F - .5, z), (1.3, .3, .14), wood, bevel=.02, segments=1,
                           rot=(0, 0, (j - 1) * .05)))
    parts += cp.wall_lamp(k, 2.55, F - .3, 3.1, metal, lit)
    obj = finish(k, 'workshop', parts, lo=-.5, hi=8, shade=.72)
    return building_props(obj)
