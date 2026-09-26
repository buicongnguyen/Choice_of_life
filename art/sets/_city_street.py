"""Brightwater street furniture, vehicles and far silhouettes."""
import math
import random

from kit import GLOSS, MATTE, SATIN

import _city_parts as cp
from _city_parts import Geo, finish, glass, lamp, mat


# =========================================================================== street furniture
def traffic_light(k):
    """Navy pole with a marigold signal head (green lamp lit), a pedestrian signal, a push
    button and a teal street-name blade."""
    pole = mat(k, 'Pole', 'navy', GLOSS)
    house = mat(k, 'Housing', 'marigold', GLOSS)
    back = mat(k, 'Back', 'charcoal', GLOSS)
    green = lamp(k, '#5dffa0', 1.3)
    red = mat(k, 'LensRed', '#c8262e', .15)
    amber = mat(k, 'LensAmber', '#e08a12', .15)
    sign = mat(k, 'Sign', 'teal', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    parts = [k.cyl('Foot', (0, 0, .12), .22, .24, pole, vertices=12, bevel=.04, segments=1),
             k.cyl('Pole', (0, 0, 1.95), .075, 3.7, pole, vertices=10, bevel=0),
             k.cyl('Collar', (0, 0, .5), .1, .1, house, vertices=10, bevel=0)]
    # signal head facing -Y
    hz = 3.45
    parts.append(k.box('Backplate', (0, .06, hz), (.62, .05, 1.34), back, bevel=.04, segments=1))
    parts.append(k.box('BackRim', (0, .09, hz), (.7, .03, 1.42), trim, bevel=.03, segments=1))
    parts.append(k.box('Head', (0, -.08, hz), (.42, .3, 1.16), house, bevel=.08, segments=1))
    for i, (m, z) in enumerate(((red, hz + .36), (amber, hz), (green, hz - .36))):
        parts.append(k.cyl('Lens', (0, -.24, z), .13, .04, m, axis='Y', vertices=14, bevel=0))
        parts.append(k.torus('LensRim', (0, -.24, z), .14, .025, back, rot=(math.pi / 2, 0, 0), major_seg=12,
                             minor_seg=3))
        parts.append(k.box('Visor', (0, -.36, z + .15), (.34, .26, .03), house, bevel=0, rot=(-.25, 0, 0)))
    parts.append(k.box('HeadCap', (0, -.05, hz + .62), (.46, .36, .08), house, bevel=.03, segments=1))
    # pedestrian signal with a lit walking figure
    pz = 2.35
    parts.append(k.box('PedHead', (.26, -.05, pz), (.36, .26, .42), house, bevel=.05, segments=1))
    parts.append(k.box('PedFace', (.26, -.18, pz), (.28, .02, .34), back, bevel=0))
    g = Geo()
    fx, fy = .26, -.2
    g.box(fx - .02, fx + .02, fy - .01, fy + .005, pz - .02, pz + .08)
    g.box(fx - .065, fx - .025, fy - .01, fy + .005, pz - .12, pz - .02)
    g.box(fx + .025, fx + .065, fy - .01, fy + .005, pz - .12, pz - .02)
    g.box(fx - .06, fx - .02, fy - .01, fy + .005, pz + .01, pz + .06)
    g.box(fx + .02, fx + .06, fy - .01, fy + .005, pz + .03, pz + .08)
    parts.append(g.obj(k, 'Walker', green))
    parts.append(k.ball('WalkerHead', (fx, fy - .003, pz + .12), .03, green, 6, 4))
    parts.append(k.box('PedArm', (.13, 0, pz), (.12, .08, .08), pole, bevel=0))
    # push button box
    parts.append(k.box('Button', (0, -.12, 1.15), (.16, .12, .26), house, bevel=.03, segments=1))
    parts.append(k.cyl('ButtonDisc', (0, -.19, 1.18), .045, .03, trim, axis='Y', vertices=10, bevel=0))
    parts.append(k.prism('Arrow', [(-.04, 1.06), (.04, 1.06), (0, 1.1)], .02, back, loc=(0, -.19, 0), bevel=0))
    # street-name blade
    parts.append(k.box('Blade', (.55, 0, 4.35), (1.2, .05, .3), sign, bevel=.03, segments=1))
    parts.append(k.box('BladeRim', (.55, 0, 4.35), (1.26, .03, .36), trim, bevel=.02, segments=1))
    parts.append(cp.text(k, 'BRIGHT AV', .17, .02, trim, (.55, -.035, 4.35), offset=.004, res=1))
    parts.append(k.cyl('Finial', (0, 0, 4.2), .1, .12, pole, vertices=10, radius2=.05, bevel=0))
    obj = finish(k, 'traffic_light', parts, shade=.7)
    return cp.measure(obj)


def newsstand(k):
    """Teal kiosk with a marigold roof and NEWS sign, a lit window full of magazines,
    newspapers on the counter and a striped awning."""
    body = mat(k, 'Body', 'teal', GLOSS)
    roof = mat(k, 'Roof', 'marigold', GLOSS)
    awn = mat(k, 'Awning', 'coral', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    mag = mat(k, 'Magazine', 'berry', GLOSS)
    mag2 = mat(k, 'Magazine2', 'denim', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    lit = lamp(k)
    parts = [k.box('Back', (0, .45, 1.2), (2.4, .5, 2.4), body, bevel=.08, segments=2),
             k.box('Counter', (0, -.25, .5), (2.4, .9, 1.0), body, bevel=.08, segments=2),
             k.box('CounterTop', (0, -.27, 1.03), (2.5, 1.0, .08), trim, bevel=.03, segments=1),
             k.box('Plinth', (0, 0, .06), (2.5, 1.6, .12), metal, bevel=.03, segments=1)]
    for sx in (-1, 1):
        parts.append(k.box('Side', (sx * 1.14, -.1, 1.7), (.14, 1.2, 1.4), body, bevel=.04, segments=1))
    parts.append(k.box('Glow', (0, .19, 1.7), (2.1, .04, 1.3), lit, bevel=0))
    # racks of magazines inside the window
    g1, g2, g3 = Geo(), Geo(), Geo()
    geos = (g1, g2, g3)
    for row, z in enumerate((1.22, 1.62, 2.0)):
        parts.append(k.box('Rack', (0, .08, z - .03), (2.1, .2, .04), metal, bevel=0))
        for i in range(8):
            x = -.9 + i * .26
            hgt = .3 + (i * 7 % 3) * .02
            geos[(i + row) % 3].box(x - .1, x + .1, .02, .06, z, z + hgt)
    parts.append(g1.obj(k, 'Mags', mag))
    parts.append(g2.obj(k, 'Mags', mag2))
    parts.append(g3.obj(k, 'Mags', roof))
    # newspapers on the counter and on the side rack
    for i, x in enumerate((-.8, -.35, .6)):
        for j in range(3):
            parts.append(k.box('Paper', (x + j * .015, -.4, 1.1 + j * .045), (.38, .28, .04), trim, bevel=0,
                               rot=(0, 0, (j - 1) * .08)))
    g = Geo()
    for i, x in enumerate((-.8, -.35, .6)):
        g.box(x - .16, x + .16, -.55, -.54, 1.2, 1.215)
        g.box(x - .16, x + .06, -.55, -.54, 1.17, 1.18)
    parts.append(g.obj(k, 'Headlines', metal))
    for i in range(3):
        z = .3 + i * .28
        parts.append(k.box('SideRack', (1.23, -.2, z), (.06, .9, .03), metal, bevel=0))
        for j in range(3):
            parts.append(k.box('SideMag', (1.25, -.5 + j * .3, z + .13), (.03, .24, .28),
                               (mag, mag2, awn)[(i + j) % 3], bevel=0))
    # roof, sign and awning
    parts.append(k.box('Roof', (0, .02, 2.52), (2.9, 1.9, .2), roof, bevel=.08, segments=2))
    parts.append(k.box('RoofTop', (0, .1, 2.7), (2.5, 1.5, .16), roof, bevel=.06, segments=1))
    parts.append(k.box('SignBoard', (0, .1, 3.08), (1.7, .16, .6), awn, bevel=.06, segments=2))
    parts.append(cp.text(k, 'NEWS', .42, .06, trim, (0, -.0, 3.08), offset=.01))
    parts += cp.awning(k, -1.2, 1.2, -.08, 2.38, .55, .3, awn, trim, n=6, valance=.16, cheeks=False)
    parts.append(k.cyl('Bulb', (0, -.1, 2.25), .07, .1, lit, vertices=8, bevel=0))
    obj = finish(k, 'newsstand', parts, shade=.7)
    return cp.measure(obj)


def bench_city(k):
    """Modern bench: sculpted coral steel frames, warm wooden slats and a brass plaque."""
    frame = mat(k, 'Frame', 'coral', GLOSS)
    wood = mat(k, 'Wood', 'wood_light', SATIN)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    brass = mat(k, 'Plaque', 'marigold', .3, metal=.4)
    parts = []
    side = [(-.3, 0), (-.18, 0), (-.14, .38), (.2, .38), (.24, 0), (.36, 0), (.33, .44), (.3, .5), (.36, .95),
            (.3, 1.0), (.24, .96), (.2, .5), (-.28, .48), (-.32, .44)]
    for x in (-.82, .82):
        parts.append(k.prism('Side', side, .1, frame, loc=(x, 0, 0), axis='X', bevel=.03, segments=2))
        parts.append(k.box('Foot', (x, -.24, .015), (.16, .14, .03), metal, bevel=0))
        parts.append(k.box('Foot', (x, .3, .015), (.16, .14, .03), metal, bevel=0))
    for i in range(4):
        y = -.24 + i * .135
        parts.append(k.box('Slat', (0, y, .5), (1.95, .11, .06), wood, bevel=.025, segments=1))
    for i in range(3):
        z = .62 + i * .13
        parts.append(k.box('BackSlat', (0, .3 + (z - .62) * .15, z), (1.95, .05, .1), wood, bevel=.02, segments=1,
                           rot=(-.15, 0, 0)))
    parts.append(k.box('Plaque', (0, .29, .6), (.3, .02, .06), brass, bevel=.008, segments=1, rot=(-.15, 0, 0)))
    parts.append(k.box('Rail', (0, .08, .38), (1.64, .06, .05), metal, bevel=0))
    obj = finish(k, 'bench_city', parts, shade=.7)
    return cp.measure(obj)


def bike_rack(k):
    """Two steel hoops on a plate with a teal city bike (basket of flowers) leaning on one."""
    steel = mat(k, 'Steel', 'steel', .3, metal=.5)
    frame = mat(k, 'Frame', 'teal', GLOSS)
    rubber = mat(k, 'Rubber', 'rubber', MATTE)
    saddle = mat(k, 'Saddle', 'wood_dark', SATIN)
    basket = mat(k, 'Basket', 'marigold', GLOSS)
    flower = mat(k, 'Flower', 'berry', GLOSS)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    parts = [k.box('Plate', (0, 0, .02), (1.9, .55, .04), steel, bevel=.015, segments=1)]
    for x in (-.55, .55):
        pts = [(x - .3, .12, .04)] + [(x - .3 * math.cos(a), .12, .55 + .3 * math.sin(a))
                                      for a in [i * math.pi / 6 for i in range(7)]] + [(x + .3, .12, .04)]
        parts.append(cp.rod(k, 'Hoop', pts, .035, steel, sides=6))
    # bike parallel to X on the -Y side of the hoops
    y = -.12
    r = .33
    wa, wb = (-.55, y, r), (.52, y, r)
    for c in (wa, wb):
        parts.append(k.torus('Tyre', c, r, .045, rubber, rot=(math.pi / 2, 0, 0), major_seg=16, minor_seg=4))
        parts.append(k.cyl('Hub', c, .05, .08, steel, axis='Y', vertices=6, bevel=0))
        g = Geo()
        for i in range(4):
            a = i * math.pi / 4
            g.tube([(c[0] + math.cos(a) * r * .95, y, c[2] + math.sin(a) * r * .95),
                    (c[0] - math.cos(a) * r * .95, y, c[2] - math.sin(a) * r * .95)], .008, 4)
        parts.append(g.obj(k, 'Spokes', steel, weld=False))
    crank = (-.05, y, .33)
    seat = (-.2, y, .82)
    head = (.36, y, .8)
    g = Geo()
    for a, b in ((wa, crank), (crank, seat), (wa, (seat[0] + .03, y, seat[2] - .12)), (crank, (head[0] - .02, y, head[2] - .16)),
                 ((seat[0] + .02, y, seat[2] - .1), (head[0], y, head[2] - .05)), (head, wb)):
        g.tube([a, b], .028, 6, caps=True)
    parts.append(g.obj(k, 'BikeFrame', frame, weld=False))
    parts.append(cp.rod(k, 'Seatpost', [seat, (seat[0] - .02, y, seat[2] + .1)], .018, steel))
    parts.append(k.ball('Saddle', (seat[0] - .04, y, seat[2] + .13), (.12, .06, .04), saddle, 8, 4))
    bar = (head[0] - .04, y, head[2] + .14)
    parts.append(cp.rod(k, 'Stem', [head, bar], .02, steel))
    parts.append(cp.rod(k, 'Bars', [(bar[0] - .05, y - .22, bar[2]), (bar[0], y, bar[2] + .02),
                                    (bar[0] - .05, y + .22, bar[2])], .018, steel))
    for sy in (-.22, .22):
        parts.append(k.cyl('Grip', (bar[0] - .05, y + sy, bar[2]), .026, .09, rubber, axis='Y', vertices=8, bevel=0))
    parts.append(k.cyl('Crank', crank, .06, .06, steel, axis='Y', vertices=10, bevel=0))
    parts.append(k.box('Pedal', (crank[0] + .08, y - .1, crank[2] - .1), (.1, .06, .03), rubber, bevel=0))
    parts.append(k.box('Basket', (head[0] + .16, y, head[2] - .02), (.26, .32, .22), basket, bevel=.03, segments=1))
    parts.append(k.box('BasketRim', (head[0] + .16, y, head[2] + .09), (.3, .36, .03), basket, bevel=.01, segments=1))
    parts.append(k.ball('Bouquet', (head[0] + .16, y, head[2] + .12), (.12, .14, .08), leaf, 8, 4))
    for i in range(3):
        parts.append(k.ball('Bloom', (head[0] + .1 + i * .06, y - .08 + i * .07, head[2] + .18), .045, flower, 6, 4))
    parts.append(k.box('Fender', (wb[0] - .02, y, wb[2] + r + .06), (.32, .07, .025), frame, bevel=.01, segments=1,
                       rot=(0, .25, 0)))
    parts.append(k.box('Fender', (wa[0] + .02, y, wa[2] + r + .06), (.32, .07, .025), frame, bevel=.01, segments=1,
                       rot=(0, -.25, 0)))
    obj = finish(k, 'bike_rack', parts, shade=.7)
    return cp.measure(obj)


# =========================================================================== vehicles
def _car_body(k, pts, width, body, bevel=.16):
    return k.prism('Body', pts, width, body, axis='Y', bevel=bevel, segments=3)


def _side_glass(k, pts, width, win, name='SideGlass'):
    parts = []
    for sy in (-1, 1):
        parts.append(k.prism(name, pts, .03, win, loc=(0, sy * (width / 2 + .005), 0), axis='Y', bevel=0))
    return parts


def _slanted(k, name, a, b, width, material, thick=.05):
    """A thin panel spanning from point a to b in the XZ plane (windscreens)."""
    ax, az = a
    bx, bz = b
    L = math.hypot(bx - ax, bz - az)
    ang = math.atan2(bx - ax, bz - az)
    return k.box(name, ((ax + bx) / 2, 0, (az + bz) / 2), (thick, width, L), material, bevel=.02, segments=1,
                 rot=(0, ang, 0))


def _wheels(k, xs, half, r, width, tyre, hub, parts, arch_mat=None):
    for x in xs:
        for sy in (-1, 1):
            parts += cp.wheel(k, x, sy * half, r, r, width, tyre, hub, side=sy)
            if arch_mat is not None:
                parts.append(k.torus('Arch', (x, sy * (half + .01), r + .02), r + .08, .05, arch_mat,
                                     rot=(-math.pi / 2, 0, 0), major_seg=14, minor_seg=4, arc=math.pi * .9))


def car(k):
    """Small chunky hatchback in teal with a cream roof stripe, front at +X."""
    body = mat(k, 'Body', 'teal', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    rubber = mat(k, 'Rubber', 'rubber', MATTE)
    hub = mat(k, 'Hub', 'white', GLOSS)
    tail = mat(k, 'TailLight', 'coral_dark', .2)
    win = mat(k, 'CarGlass', '#5fb4e0', .1)
    lit = lamp(k, '#fff3c4', 1.3)
    W = 1.62
    pts = [(-1.78, .26), (1.78, .26), (1.9, .42), (1.88, .72), (1.3, .88), (.6, .96), (.02, 1.46), (-1.3, 1.5),
           (-1.74, 1.1), (-1.9, .74), (-1.88, .42)]
    parts = [_car_body(k, pts, W, body)]
    parts.append(k.box('RoofStripe', (-.64, 0, 1.51), (1.2, 1.1, .04), trim, bevel=.02, segments=1))
    parts += _side_glass(k, [(.5, 1.0), (.02, 1.4), (-1.26, 1.43), (-1.6, 1.06)], W, win)
    for sy in (-1, 1):
        parts.append(k.box('Pillar', (-.55, sy * (W / 2 + .02), 1.22), (.1, .02, .44), body, bevel=0))
        parts.append(k.box('Handle', (-.2, sy * (W / 2 + .025), .88), (.16, .02, .04), trim, bevel=0))
        parts.append(k.box('Mirror', (.55, sy * (W / 2 + .08), 1.02), (.12, .14, .1), body, bevel=.03, segments=1))
    parts.append(_slanted(k, 'Windscreen', (.63, 1.0), (.07, 1.44), W - .22, win))
    parts.append(_slanted(k, 'RearWindow', (-1.34, 1.46), (-1.76, 1.1), W - .3, win))
    parts.append(k.box('Grille', (1.92, 0, .52), (.06, .8, .16), rubber, bevel=.02, segments=1))
    for sy in (-1, 1):
        parts.append(k.cyl('Headlight', (1.9, sy * .56, .66), .11, .06, lit, axis='X', vertices=12, bevel=0))
        parts.append(k.box('Tail', (-1.92, sy * .6, .8), (.05, .2, .14), tail, bevel=.02, segments=1))
    parts.append(k.box('BumperF', (1.86, 0, .33), (.2, W + .02, .14), rubber, bevel=.06, segments=1))
    parts.append(k.box('BumperR', (-1.86, 0, .33), (.2, W + .02, .14), rubber, bevel=.06, segments=1))
    parts.append(k.box('Plate', (-1.99, 0, .56), (.02, .44, .14), trim, bevel=0))
    _wheels(k, (1.2, -1.2), W / 2, .34, .26, rubber, hub, parts, arch_mat=rubber)
    obj = finish(k, 'car', parts, lo=0, hi=1.5, shade=.72)
    cp.measure(obj)
    obj['length'] = obj['width']
    obj['wheel_radius'] = .34
    obj['band'] = 'road'
    return obj


def taxi(k):
    """Marigold taxi sedan with a checker band and a lit TAXI roof sign, front at +X."""
    body = mat(k, 'Body', 'marigold', GLOSS)
    check = mat(k, 'Checker', 'ink', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    rubber = mat(k, 'Rubber', 'rubber', MATTE)
    tail = mat(k, 'TailLight', 'coral_dark', .2)
    win = mat(k, 'CarGlass', '#5fb4e0', .1)
    lit = lamp(k, '#fff3c4', 1.3)
    W = 1.72
    pts = [(-2.2, .26), (2.2, .26), (2.3, .42), (2.26, .74), (1.35, .88), (.72, .96), (.18, 1.42), (-.95, 1.45),
           (-1.5, .98), (-2.18, .92), (-2.3, .72), (-2.28, .42)]
    parts = [_car_body(k, pts, W, body)]
    parts += _side_glass(k, [(.62, 1.0), (.18, 1.36), (-.92, 1.39), (-1.36, 1.0)], W, win)
    g1, g2 = Geo(), Geo()
    for sy in (-1, 1):
        y0, y1 = (sy * W / 2 - .02, sy * W / 2 + .02)
        for i in range(14):
            x = -1.7 + i * .25
            for row in range(2):
                (g1 if (i + row) % 2 == 0 else g2).box(x, x + .25, min(y0, y1), max(y0, y1), .64 + row * .1,
                                                      .74 + row * .1)
        parts.append(k.box('Pillar', (-.35, sy * (W / 2 + .02), 1.2), (.12, .02, .4), body, bevel=0))
        parts.append(k.box('Mirror', (.62, sy * (W / 2 + .08), 1.02), (.12, .14, .1), body, bevel=.03, segments=1))
    parts.append(g1.obj(k, 'Checks', check))
    parts.append(g2.obj(k, 'Checks', trim))
    parts.append(_slanted(k, 'Windscreen', (.76, 1.0), (.22, 1.4), W - .22, win))
    parts.append(_slanted(k, 'RearWindow', (-1.0, 1.42), (-1.46, 1.02), W - .28, win))
    # roof sign
    parts.append(k.box('SignBase', (-.35, 0, 1.49), (.5, .9, .05), check, bevel=.015, segments=1))
    parts.append(k.box('Sign', (-.35, 0, 1.64), (.4, .8, .26), lit, bevel=.06, segments=2))
    for sy in (-1, 1):
        t = cp.text(k, 'TAXI', .17, .02, check, (-.35, sy * .41, 1.63), offset=.006, res=1)
        t.rotation_euler = (math.pi / 2, 0, 0 if sy < 0 else math.pi)
        parts.append(t)
    parts.append(k.box('Grille', (2.32, 0, .52), (.06, .9, .16), check, bevel=.02, segments=1))
    for sy in (-1, 1):
        parts.append(k.cyl('Headlight', (2.29, sy * .6, .66), .11, .06, lit, axis='X', vertices=12, bevel=0))
        parts.append(k.box('Tail', (-2.3, sy * .62, .78), (.05, .24, .14), tail, bevel=.02, segments=1))
    parts.append(k.box('BumperF', (2.26, 0, .33), (.2, W + .02, .14), rubber, bevel=.06, segments=1))
    parts.append(k.box('BumperR', (-2.26, 0, .33), (.2, W + .02, .14), rubber, bevel=.06, segments=1))
    _wheels(k, (1.45, -1.45), W / 2, .35, .26, rubber, trim, parts, arch_mat=rubber)
    obj = finish(k, 'taxi', parts, lo=0, hi=1.8, shade=.72)
    cp.measure(obj)
    obj['length'] = obj['width']
    obj['wheel_radius'] = .35
    obj['band'] = 'road'
    return obj


def bus(k):
    """City bus: coral body, cream upper, denim stripe, a long window band, two door sets,
    a lit destination sign and big chunky wheels. Front at +X."""
    body = mat(k, 'Body', 'coral', GLOSS)
    upper = mat(k, 'Upper', 'cream', GLOSS)
    stripe = mat(k, 'Stripe', 'denim', GLOSS)
    rubber = mat(k, 'Rubber', 'rubber', MATTE)
    hub = mat(k, 'Hub', 'white', GLOSS)
    win = glass(k)
    lit = lamp(k, '#ffb627', 1.2)
    L0, L1, W = -5.4, 5.4, 2.5
    parts = [k.box('Lower', (0, 0, 1.0), (L1 - L0, W, 1.5), body, bevel=.3, segments=3),
             k.box('Upper', (0, 0, 2.3), (L1 - L0 - .1, W - .04, 1.3), upper, bevel=.3, segments=3),
             k.box('RoofPod', (-1.2, 0, 3.05), (3.6, 1.6, .3), upper, bevel=.12, segments=2),
             k.box('Skirt', (0, 0, .38), (L1 - L0 + .04, W + .04, .22), rubber, bevel=.08, segments=1)]
    for sy in (-1, 1):
        at = sy * W / 2
        g = Geo()
        g.box(L0 + .3, L1 - .3, at - .02, at + .02, 1.62, 1.76)
        parts.append(g.obj(k, 'StripeBand', stripe))
        face = '-y' if sy < 0 else '+y'
        xs = [-4.6, -3.55, -2.5, -1.45, 1.55, 2.6]
        parts += cp.windows(k, [(x, 1.85, .95, .95) for x in xs], face=face, at=at + sy * .02, glass_mat=win,
                            frame_mat=rubber, depth=.04, t=.06, mullion=None, glint_mat=upper)
        for dx in (.1, 4.25):
            parts += cp.windows(k, [(dx - .34, .35, .66, 2.35), (dx + .34, .35, .66, 2.35)], face=face,
                                at=at + sy * .03, glass_mat=win, frame_mat=rubber, depth=.05, t=.08, mullion='h')
    # front: windscreen, destination sign, lights, bumper, mirrors
    parts.append(k.box('Windscreen', (L1 + .02, 0, 2.0), (.08, W - .3, 1.3), win, bevel=.04, segments=1,
                       rot=(0, -.1, 0)))
    parts.append(k.box('DestSign', (L1 + .03, 0, 2.86), (.06, 1.5, .3), lit, bevel=.02, segments=1))
    parts.append(k.box('DestFrame', (L1 + .01, 0, 2.86), (.06, 1.7, .42), rubber, bevel=.03, segments=1))
    parts.append(cp.text(k, '42', .26, .02, rubber, (L1 + .07, 0, 2.86), offset=.008, res=1))
    parts[-1].rotation_euler = (math.pi / 2, 0, math.pi / 2)
    for sy in (-1, 1):
        parts.append(k.cyl('Headlight', (L1 + .02, sy * .9, .85), .14, .06, lit, axis='X', vertices=12, bevel=0))
        parts.append(k.box('Tail', (L0 - .02, sy * .95, .95), (.05, .22, .3), body, bevel=.02, segments=1))
        parts.append(cp.rod(k, 'MirrorArm', [(L1 - .1, sy * 1.2, 2.5), (L1 + .35, sy * 1.35, 2.55),
                                              (L1 + .45, sy * 1.3, 2.3)], .025, rubber))
        parts.append(k.box('Mirror', (L1 + .45, sy * 1.3, 2.15), (.08, .16, .3), rubber, bevel=.03, segments=1))
    parts.append(k.box('Bumper', (L1 + .08, 0, .5), (.2, W + .06, .3), rubber, bevel=.08, segments=1))
    parts.append(k.box('BumperR', (L0 - .08, 0, .5), (.2, W + .06, .3), rubber, bevel=.08, segments=1))
    parts.append(k.box('RearWindow', (L0 - .01, 0, 2.2), (.05, W - .5, .8), win, bevel=.02, segments=1))
    _wheels(k, (3.3, -3.1), W / 2 - .05, .5, .36, rubber, hub, parts, arch_mat=rubber)
    obj = finish(k, 'bus', parts, lo=0, hi=3.2, shade=.72)
    cp.measure(obj)
    obj['length'] = obj['width']
    obj['wheel_radius'] = .5
    obj['band'] = 'road'
    return obj


# =========================================================================== far silhouettes
def skyline_far(k):
    """Layered downtown skyline ~80 m wide: blocky towers with setbacks, crowns, spires and
    dotted windows. A cooler tint than the street so it sits back in the haze."""
    rnd = random.Random(7)
    cols = [mat(k, 'TowerTeal', '#2f98b4', GLOSS), mat(k, 'TowerDenim', '#4a6cc2', GLOSS),
            mat(k, 'TowerPlum', '#7458b0', GLOSS), mat(k, 'TowerCoral', '#e6735e', GLOSS),
            mat(k, 'TowerBack', '#5b79c9', SATIN)]
    trim = mat(k, 'Trim', '#e8f1ff', GLOSS)
    win = glass(k, '#bfe6ff')
    lit = lamp(k, '#ff7a5c', 1.4)
    geos = {i: Geo() for i in range(len(cols))}
    tg, wg, lg = Geo(), Geo(), Geo()
    parts = []

    def tower(x, w, hgt, d, y0, ci, crown, windows=True):
        g = geos[ci]
        tiers = [(w, hgt * .62), (w * .78, hgt * .86), (w * .56, hgt)] if hgt > 22 else [(w, hgt * .8), (w * .7, hgt)]
        z = 0
        for i, (tw, tz) in enumerate(tiers):
            inset = (w - tw) / 2
            yy0 = y0 + inset * .6
            g.box(x - tw / 2, x + tw / 2, yy0, yy0 + d - inset, z, tz, skip=('-z',))
            tg.box(x - tw / 2 - .25, x + tw / 2 + .25, yy0 - .25, yy0 + d - inset + .25, tz - .05, tz + .35,
                   skip=('-z',))
            if windows:
                ncol = max(2, int(tw / 1.6))
                rows = int((tz - z - 1.2) / 2.2)
                for c in range(ncol):
                    wx = x - tw / 2 + tw * (c + .5) / ncol
                    for r in range(rows):
                        if rnd.random() < .18:
                            continue
                        wz = z + 1.0 + r * 2.2
                        wg.poly([(wx - .32, yy0 - .03, wz), (wx + .32, yy0 - .03, wz), (wx + .32, yy0 - .03, wz + 1.1),
                                 (wx - .32, yy0 - .03, wz + 1.1)], (0, -1, 0))
            z = tz
        top = tiers[-1]
        tw = top[0]
        yc = y0 + (w - tw) / 2 * .6 + (d - (w - tw) / 2) / 2
        if crown == 'spire':
            parts.append(k.cyl('Spire', (x, yc, z + 3.5), tw * .28, 7.0, cols[ci], vertices=8, radius2=.05, bevel=0))
            lg.box(x - .2, x + .2, yc - .2, yc + .2, z + 6.8, z + 7.3)
        elif crown == 'mast':
            parts.append(k.cyl('Mast', (x, yc, z + 2.5), .15, 5.0, trim, vertices=6, bevel=0))
            lg.box(x - .22, x + .22, yc - .22, yc + .22, z + 5.0, z + 5.45)
        elif crown == 'dome':
            parts.append(k.ball('Dome', (x, yc, z), (tw * .42, tw * .42, tw * .36), cols[ci], 12, 6))
        elif crown == 'step':
            g.box(x - tw * .3, x + tw * .3, yc - 1.2, yc + 1.2, z, z + 2.2, skip=('-z',))
            g.box(x - tw * .15, x + tw * .15, yc - .6, yc + .6, z + 2.2, z + 3.6, skip=('-z',))
        elif crown == 'tank':
            parts.append(k.cyl('Tank', (x + tw * .2, yc, z + 1.2), 1.0, 1.8, trim, vertices=8, bevel=0))
    # back layer: tall cool towers
    x = -38.
    while x < 38:
        w = rnd.uniform(6, 9)
        tower(x + w / 2, w, rnd.uniform(26, 34), 6, 12, 4, rnd.choice(['spire', 'mast', 'step', None]),
              windows=rnd.random() < .6)
        x += w + rnd.uniform(1.0, 3.5)
    # front layer: mid towers in the city colours
    x = -40.
    i = 0
    while x < 38:
        w = rnd.uniform(5.5, 9)
        tower(x + w / 2, w, rnd.uniform(15, 27), 5, 0, i % 4, rnd.choice(['dome', 'tank', 'mast', None, 'step']))
        x += w + rnd.uniform(.4, 2.2)
        i += 1
    for ci, g in geos.items():
        parts.append(g.obj(k, 'Towers', cols[ci]))
    parts.append(tg.obj(k, 'Cornices', trim))
    parts.append(wg.obj(k, 'Windows', win))
    parts.append(lg.obj(k, 'Beacons', lit))
    obj = finish(k, 'skyline_far', parts, lo=0, hi=40, shade=.78)
    cp.measure(obj)
    obj['band'] = 'far'
    obj['suggest_y'] = 60.
    return obj


def bridge_far(k):
    """Suspension bridge silhouette ~80 m: coral towers with portal beams, sagging main cables,
    suspenders, a navy deck girder and a necklace of lamps."""
    steel = mat(k, 'Steel', 'coral', GLOSS)
    deck = mat(k, 'Deck', 'navy', GLOSS)
    stone = mat(k, 'Concrete', '#c9bfd6', MATTE)
    cable = mat(k, 'Cable', 'coral_dark', GLOSS)
    lit = lamp(k, '#ffd27a', 1.6)
    parts = []
    dz = 10.
    parts.append(k.box('Deck', (0, 0, dz), (80, 5.4, 1.2), deck, bevel=.2, segments=1))
    parts.append(k.box('DeckEdge', (0, 0, dz + .7), (80, 5.8, .25), steel, bevel=.06, segments=1))
    g = Geo()
    for i in range(40):
        x = -39.5 + i * 2
        g.poly([(x, -2.75, dz - .5), (x + 1, -2.75, dz + .5), (x + 1.25, -2.75, dz + .5), (x + .25, -2.75, dz - .5)],
               (0, -1, 0))
    parts.append(g.obj(k, 'Truss', steel))
    for tx in (-20, 20):
        parts.append(k.box('Pier', (tx, 0, dz / 2 - .5), (4.0, 7.5, dz - 1), stone, bevel=.3, segments=1))
        for sy in (-2.6, 2.6):
            parts.append(k.tbox('Leg', (tx, sy, 30 / 2 + dz / 2 - .5), (1.1, 1.1), (1.7, 1.7), 30 - dz + 1, steel,
                                bevel=.15, segments=1))
        for z, hgt in ((dz + 7, 1.0), (dz + 14, 1.0), (29.2, 1.4)):
            parts.append(k.box('Portal', (tx, 0, z), (1.3, 6.4, hgt), steel, bevel=.15, segments=1))
        parts.append(k.ball('Beacon', (tx, -2.6, 30.4), .35, lit, 8, 5))
        parts.append(k.ball('Beacon', (tx, 2.6, 30.4), .35, lit, 8, 5))
    for tx in (-39, 39):
        parts.append(k.box('Anchor', (tx, 0, dz / 2 + .2), (3.0, 7.0, dz + .4), stone, bevel=.3, segments=1))
    for tx in (-30, 30):
        parts.append(k.box('ApproachPier', (tx, 0, dz / 2 - .5), (1.6, 4.5, dz - 1), stone, bevel=.2, segments=1))
    sus = Geo()
    lamps = Geo()
    for sy in (-2.6, 2.6):
        pts = []
        for i in range(17):
            x = -20 + i * 2.5
            z = dz + 2.0 + (29.6 - dz - 2.0) * (x / 20) ** 2
            pts.append((x, sy, z))
            if 0 < i < 16:
                sus.box(x - .06, x + .06, sy - .06, sy + .06, dz + .8, z, skip=('-z', '+z'))
        parts.append(cp.rod(k, 'Cable', pts, .22, cable, sides=6, caps=False))
        for side in (-1, 1):
            spts = []
            for i in range(7):
                t = i / 6
                x = side * (20 + 19 * t)
                z = 29.6 - (29.6 - dz - 1.0) * (1 - (1 - t) ** 2)
                spts.append((x, sy, z))
                if 0 < i < 6:
                    sus.box(x - .06, x + .06, sy - .06, sy + .06, dz + .8, z, skip=('-z', '+z'))
            parts.append(cp.rod(k, 'Cable', spts, .22, cable, sides=6, caps=False))
    for i in range(27):
        x = -39 + i * 3
        lamps.box(x - .12, x + .12, -3.0, -2.8, dz + .9, dz + 1.25)
    parts.append(sus.obj(k, 'Suspenders', cable))
    parts.append(lamps.obj(k, 'DeckLamps', lit))
    obj = finish(k, 'bridge_far', parts, lo=0, hi=31, shade=.75)
    cp.measure(obj)
    obj['deck_z'] = dz
    obj['band'] = 'far'
    obj['suggest_y'] = 70.
    return obj
