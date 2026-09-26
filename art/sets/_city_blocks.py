"""Brightwater street blocks: tower_b, tower_c, the brick apartment and the three shops."""
import math

from kit import GLOSS, SATIN

import _city_parts as cp
from _city_parts import Geo, building_props, finish, glass, lamp, mat

F = 3.5


def tower_b(k):
    """Coral deco tower: arched lit entrance, a projecting central bay between marigold fins,
    a stepped crown with a sunburst, and a spire with a beacon."""
    wall = mat(k, 'Wall', 'coral', GLOSS)
    dark = mat(k, 'WallDark', 'coral_dark', SATIN)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    band = mat(k, 'Band', 'denim', GLOSS)
    metal = mat(k, 'Metal', 'navy', GLOSS)
    win = glass(k)
    lit = lamp(k)
    parts = []
    # ---------------------------------------------------------------- street level
    parts.append(k.box('Core', (0, F + 3.6, 2.0), (7.8, 5.4, 4.0), dark, bevel=.05, segments=1))
    parts.append(k.box('Glow', (0, F + .85, 1.9), (7.6, .1, 3.6), lit, bevel=0))
    for x, w in ((-3.72, .56), (-1.62, .46), (1.62, .46), (3.72, .56)):
        parts.append(k.box('Pier', (x, F + .45, 1.95), (w, 1.0, 3.9), trim, bevel=.07, segments=1))
    for sx in (-1, 1):
        parts.append(k.box('Jamb', (sx * 1.27, F + .12, 1.15), (.2, .34, 2.3), gold, bevel=.05, segments=1))
    parts += cp.arch(k, 0, F + .12, 2.3, 1.37, gold, lit, t=.22, bars=5, bar_mat=metal)
    parts += cp.windows(k, [(-.5, .02, .95, 2.26), (.5, .02, .95, 2.26)], at=F + .6, glass_mat=lit, frame_mat=metal,
                        depth=.07, t=.08, mullion='h')
    parts.append(k.box('Keystone', (0, F + .02, 3.62), (.42, .3, .5), trim, bevel=.05, segments=1))
    parts.append(k.box('Step', (0, F - .15, .06), (2.9, .5, .12), trim, bevel=.04, segments=1))
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 1.86, sx * 3.43))
        cx = (x0 + x1) / 2
        parts.append(k.box('Stall', (cx, F + .14, .34), (x1 - x0, .22, .68), band, bevel=.05, segments=1))
        parts.append(k.box('Sill', (cx, F + .06, .71), (x1 - x0 + .06, .32, .08), trim, bevel=.03, segments=1))
        g = Geo()
        for x in (x0 + .04, cx, x1 - .04):
            g.box(x - .045, x + .045, F + .06, F + .16, .74, 3.3)
        g.box(x0, x1, F + .06, F + .16, 2.45, 2.54)
        parts.append(g.obj(k, 'ShopFrame', metal))
        g = Geo()
        for i in range(3):
            x = x0 + .35 + i * .45
            g.box(x - .015, x + .015, F + .62, F + .66, .75, 1.45)
        parts.append(g.obj(k, 'HatStands', metal))
        for i, c in enumerate((gold, band, wall)):
            x = x0 + .35 + i * .45
            parts.append(k.cyl('Brim', (x, F + .64, 1.47), .2, .04, c, vertices=10, bevel=0))
            parts.append(k.cyl('Crown', (x, F + .64, 1.57), .12, .17, c, vertices=10, radius2=.1, bevel=0))
        parts += cp.awning(k, x0 - .08, x1 + .08, F, 3.62, .85, .42, gold, trim, n=4, valance=.24)
    parts.append(k.box('Belt', (0, F + .4, 4.12), (8.2, 1.1, .46), trim, bevel=.08, segments=2))
    # ---------------------------------------------------------------- shaft
    z0, z1 = 4.35, 14.2
    parts.append(k.box('Shaft', (0, F + .35 + 2.95, (z0 + z1) / 2), (7.6, 5.9, z1 - z0), wall, bevel=.14, segments=2))
    parts.append(k.box('Bay', (0, F + .25, (z0 + z1 + .3) / 2), (3.0, .5, z1 - z0 + .3), wall, bevel=.1, segments=2))
    for sx in (-1, 1):
        parts.append(k.box('Fin', (sx * 1.64, F + .2, (z0 + 16.1) / 2), (.3, .7, 16.1 - z0), gold, bevel=.1, segments=2))
        parts.append(k.ball('Finial', (sx * 1.64, F + .2, 16.3), .26, gold, 10, 6))
    vs = [z0 + .75 + i * 3.25 for i in range(3)]
    parts += cp.windows(k, cp.grid([0], vs, 2.3, 1.95), at=F, glass_mat=win, frame_mat=trim, depth=.1, t=.11,
                        mullion='double', glint_mat=trim)
    wings = [-3.05, -2.25, 2.25, 3.05]
    parts += cp.windows(k, cp.grid(wings, vs, .7, 1.95), at=F + .35, glass_mat=win, frame_mat=trim, depth=.08, t=.09,
                        mullion='h', blind_mat=gold, blind_every=4)
    g = Geo()
    for v in vs:
        g.box(-1.1, 1.1, F - .06, F + .02, v - .6, v - .1, skip=('+y',))
        for x in wings:
            g.box(x - .34, x + .34, F + .28, F + .37, v - .55, v - .12, skip=('+y',))
    parts.append(g.obj(k, 'Spandrels', band))
    side = cp.grid([F + 3.3], vs, 1.1, 1.8)
    parts += cp.windows(k, side, face='+x', at=3.8, glass_mat=win, frame_mat=trim, depth=.08, t=.1, mullion='v')
    parts += cp.windows(k, side, face='-x', at=-3.8, glass_mat=win, frame_mat=trim, depth=.08, t=.1, mullion='v')
    # ---------------------------------------------------------------- stepped crown
    parts.append(k.box('Cornice', (0, F + 3.3, z1 + .18), (8.0, 6.4, .36), trim, bevel=.1, segments=2))
    parts.append(k.box('Crown1', (0, F + 3.3, z1 + .36 + .8), (6.0, 5.0, 1.6), wall, bevel=.12, segments=2))
    parts.append(k.box('Crown1Band', (0, F + 3.3, z1 + .5), (6.1, 5.1, .24), band, bevel=.06, segments=1))
    parts.append(k.box('Crown2', (0, F + 3.3, z1 + 1.96 + .42), (4.0, 3.9, .84), gold, bevel=.12, segments=2))
    parts.append(k.box('Crown3', (0, F + 3.3, z1 + 2.8 + .36), (2.2, 2.4, .72), wall, bevel=.1, segments=2))
    fy = F + .78
    for i in range(9):
        a = math.pi * (i + .5) / 9
        rr = 1.25 if i % 2 == 0 else .95
        pts = [(math.cos(a - .12) * .25, math.sin(a - .12) * .25), (math.cos(a) * rr, math.sin(a) * rr),
               (math.cos(a + .12) * .25, math.sin(a + .12) * .25)]
        parts.append(k.prism('Ray', [(p[0], p[1] + z1 + .62) for p in pts], .08, gold if i % 2 == 0 else trim,
                             loc=(0, fy, 0), bevel=.015, segments=1))
    parts.append(k.cyl('Sun', (0, fy, z1 + .62), .32, .12, gold, axis='Y', vertices=16, bevel=.03, segments=1))
    ztop = z1 + 3.52
    parts.append(k.cyl('Spire', (0, F + 3.3, ztop + 1.2), .38, 2.4, metal, vertices=10, radius2=.04, bevel=.02,
                       segments=1))
    parts.append(k.ball('Beacon', (0, F + 3.3, ztop + 2.5), .15, lit, 10, 6))
    obj = finish(k, 'tower_b', parts, lo=-1, hi=13, shade=.72)
    return building_props(obj)


def tower_c(k):
    """Denim modern mid-rise on pilotis: a glowing lobby under the upper block, ribbon windows,
    coral balconies and a rooftop garden with a pergola and solar panels."""
    wall = mat(k, 'Wall', 'denim', GLOSS)
    dark = mat(k, 'WallDark', 'denim_dark', SATIN)
    trim = mat(k, 'Trim', 'white', GLOSS)
    accent = mat(k, 'Accent', 'coral', GLOSS)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    wood = mat(k, 'Wood', 'wood_light', SATIN)
    win = glass(k)
    lit = lamp(k)
    parts = []
    # ---------------------------------------------------------------- undercroft and lobby
    parts.append(k.box('LobbyCore', (0, F + 5.2, 2.0), (9.6, 5.8, 4.0), dark, bevel=.05, segments=1))
    parts += cp.windows(k, cp.grid(cp.spaced(-4.7, 4.7, 6), [.05], 1.5, 3.55), at=F + 2.3, glass_mat=lit,
                        frame_mat=trim, depth=.07, t=.08, mullion='h')
    for x in (-4.4, -1.5, 1.5, 4.4):
        parts.append(k.cyl('Piloti', (x, F + .7, 2.0), .24, 4.0, trim, vertices=12, bevel=.04, segments=1))
    for x in (-3.0, 3.0):
        parts.append(k.box('Bench', (x, F + 1.7, .44), (1.6, .45, .1), wood, bevel=.03, segments=1))
        parts.append(k.box('BenchBase', (x, F + 1.7, .2), (1.3, .35, .4), dark, bevel=.03, segments=1))
    parts += cp.planter(k, 0, F + 1.6, 1.2, .6, .5, dark, trim, leaf, leaf)
    for x in (-3.0, -.9, .9, 3.0):
        g = Geo()
        g.box(x - .015, x + .015, F + 1.3 - .015, F + 1.3 + .015, 3.2, 4.0, skip=('-z', '+z'))
        parts.append(g.obj(k, 'Cord', trim))
        parts.append(k.cyl('Pendant', (x, F + 1.3, 3.12), .26, .2, accent, vertices=10, radius2=.08, bevel=0))
        parts.append(k.ball('PendantBulb', (x, F + 1.3, 3.0), .11, lit, 8, 4))
    # ---------------------------------------------------------------- upper block
    z0, z1 = 4.0, 13.0
    parts.append(k.box('Block', (0, F + 4.0, (z0 + z1) / 2), (10.0, 8.0, z1 - z0), wall, bevel=.16, segments=2))
    for z in (z0, 7.0, 10.0, z1):
        parts.append(k.box('Band', (0, F + 4.0, z), (10.12, 8.12, .36), trim, bevel=.06, segments=1))
    parts.append(k.box('Logo', (-3.9, F - .06, z0 + .02), (1.4, .1, .3), accent, bevel=.03, segments=1))
    for fz in (z0 + .18, 7.18, 10.18):
        ribbon = cp.grid(cp.spaced(-4.75, .95, 4), [fz + .52], 1.32, 1.9)
        parts += cp.windows(k, ribbon, at=F, glass_mat=win, frame_mat=trim, depth=.07, t=.08, mullion=None,
                            glint_mat=trim, blind_mat=accent, blind_every=3)
        parts += cp.windows(k, [(3.0, fz + .2, 2.6, 2.3)], at=F, glass_mat=win, frame_mat=trim, depth=.07, t=.08,
                            mullion='double')
        parts.append(k.box('Balcony', (3.0, F - .45, fz + .06), (3.4, .95, .16), trim, bevel=.05, segments=1))
        g = Geo()
        g.box(1.32, 4.68, F - .91, F - .85, fz + .14, fz + .98)
        for sx in (1.32, 4.62):
            g.box(sx, sx + .06, F - .88, F, fz + .14, fz + .98, skip=('-z',))
        parts.append(g.obj(k, 'Rail', accent))
        g = Geo()
        g.box(1.28, 4.72, F - .95, F - .82, fz + .98, fz + 1.04)
        parts.append(g.obj(k, 'RailCap', trim))
        parts.append(k.cyl('Pot', (4.2, F - .45, fz + .35), .2, .38, wood, vertices=10, bevel=0))
        parts.append(k.ball('Shrub', (4.2, F - .45, fz + .8), (.3, .3, .34), leaf, 8, 5))
    side = cp.grid([F + 4.0], [z0 + .7, 7.7, 10.7], 1.5, 1.8)
    parts += cp.windows(k, side, face='+x', at=5.0, glass_mat=win, frame_mat=trim, depth=.07, t=.08, mullion=None)
    parts += cp.windows(k, side, face='-x', at=-5.0, glass_mat=win, frame_mat=trim, depth=.07, t=.08, mullion=None)
    # ---------------------------------------------------------------- roof garden
    rz = z1 + .18
    parts.append(cp.railing(k, -4.9, 4.9, F + .1, rz, .95, trim, post=.5))
    for (x, y, s) in ((-3.3, F + 2.4, 1.0), (3.7, F + 5.4, .85)):
        parts.append(k.box('TreeBox', (x, y, rz + .3), (1.1, 1.1, .6), wood, bevel=.05, segments=1))
        parts.append(k.cyl('TreeTrunk', (x, y, rz + 1.1), .09, 1.2, wood, vertices=8, radius2=.06, bevel=0))
        parts.append(k.ball('TreeTop', (x, y, rz + 2.0 * s), (.85 * s, .8 * s, .75 * s), leaf, 10, 6))
        parts.append(k.ball('TreeTop', (x + .35 * s, y - .2, rz + 1.6 * s), (.55 * s, .5 * s, .48 * s), leaf, 8, 5))
    for x in (-1.2, .4):
        parts.append(k.box('Planter', (x, F + .9, rz + .25), (1.3, .5, .5), wood, bevel=.04, segments=1))
        parts.append(k.ball('Hedge', (x, F + .9, rz + .58), (.66, .3, .26), leaf, 8, 5))
    px0, px1, py0, py1 = -.9, 2.6, F + 2.3, F + 4.6
    g = Geo()
    for x in (px0, px1):
        for y in (py0, py1):
            g.box(x - .07, x + .07, y - .07, y + .07, rz, rz + 2.4, skip=('-z',))
    for i in range(6):
        x = px0 - .2 + i * (px1 - px0 + .4) / 5
        g.box(x - .05, x + .05, py0 - .25, py1 + .25, rz + 2.4, rz + 2.52)
    for y in (py0, py1):
        g.box(px0 - .25, px1 + .25, y - .07, y + .07, rz + 2.26, rz + 2.42)
    parts.append(g.obj(k, 'Pergola', wood))
    for i in range(7):
        t = i / 6
        x = px0 + (px1 - px0) * t
        parts.append(k.ball('Bulb', (x, py0 - .05, rz + 2.12 - .3 * math.sin(t * math.pi)), .07, lit, 6, 4))
    for i in range(3):
        parts.append(k.box('Solar', (-3.6 + i * 1.5, F + 6.6, rz + .55), (1.3, 1.2, .08), dark, bevel=.02, segments=1,
                           rot=(-.5, 0, 0)))
        parts.append(k.box('SolarLeg', (-3.6 + i * 1.5, F + 6.8, rz + .25), (.08, .08, .5), trim, bevel=0))
    obj = finish(k, 'tower_c', parts, lo=-1, hi=12, shade=.72)
    return building_props(obj)


def apartment(k):
    """Five-storey warm brick walk-up: stoop and lit fan light, a fire escape, balconies with plants."""
    brick = mat(k, 'Brick', 'brick_warm', SATIN)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    accent = mat(k, 'Accent', 'teal', GLOSS)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    flower = mat(k, 'Flower', 'berry', GLOSS)
    win = glass(k)
    lit = lamp(k)
    top = 12.6
    parts = [k.box('Body', (0, F + 3.5, top / 2), (9.0, 7.0, top), brick, bevel=.12, segments=2),
             k.box('Plinth', (0, F + 3.5, .28), (9.2, 7.16, .56), trim, bevel=.06, segments=1),
             k.box('Belt', (0, F + 3.5, 3.62), (9.16, 7.16, .2), trim, bevel=.05, segments=1)]
    g = Geo()
    z = .7
    i = 0
    while z < top - .6:
        for sx in (-1, 1):
            a, b = sx * 4.53, sx * (4.53 - (.52 if i % 2 == 0 else .36))
            g.box(min(a, b), max(a, b), F - .06, F + .02, z, z + .5, skip=('+y',))
        z += .56
        i += 1
    parts.append(g.obj(k, 'Quoins', trim))
    # ---------------------------------------------------------------- ground floor
    gw = [(-3.0, 1.0, 1.3, 1.9), (-.5, 1.0, 1.3, 1.9)]
    parts += cp.windows(k, gw, at=F, glass_mat=win, frame_mat=trim, depth=.09, t=.1, glint_mat=trim)
    for (x, v, w, hh) in gw:
        parts.append(k.box('FlowerBox', (x, F - .2, .82), (w + .1, .32, .28), accent, bevel=.04, segments=1))
        parts += cp.shrub(k, (x, F - .2, .9), .28, leaf, leaf, n=2, flowers=2, flower_mat=flower, seed=x)
    dx = 2.6
    parts.append(k.box('Door', (dx, F + .02, 1.62), (1.2, .1, 2.3), accent, bevel=.03, segments=1))
    g = Geo()
    for zz in (.95, 1.95):
        for sx in (-.28, .28):
            g.box(dx + sx - .2, dx + sx + .2, F - .06, F - .02, zz - .35, zz + .35, skip=('+y',))
    parts.append(g.obj(k, 'DoorPanels', accent))
    parts.append(k.ball('Knob', (dx + .42, F - .08, 1.55), .05, trim, 6, 4))
    for sx in (-1, 1):
        parts.append(k.box('DoorPilaster', (dx + sx * .78, F - .08, 1.9), (.24, .22, 3.0), trim, bevel=.04, segments=1))
        parts += cp.wall_lamp(k, dx + sx * 1.15, F, 2.1, metal, lit)
    parts.append(k.box('DoorHead', (dx, F - .14, 3.45), (1.9, .34, .24), trim, bevel=.05, segments=1))
    parts += cp.arch(k, dx, F - .02, 2.78, .6, trim, lit, t=.12, bars=3, bar_mat=trim)
    for i in range(3):
        parts.append(k.box('Tread', (dx, F - .75 + i * .26, (i + 1) * .075), (2.0, .34, (i + 1) * .15), trim,
                           bevel=.04, segments=1))
    for sx in (-1, 1):
        parts.append(cp.rod(k, 'Handrail', [(dx + sx * 1.05, F - .85, .9), (dx + sx * 1.05, F - .15, 1.3),
                                            (dx + sx * 1.05, F - .05, 1.3)], .035, metal))
        parts.append(k.cyl('Newel', (dx + sx * 1.05, F - .85, .45), .04, .9, metal, vertices=6, bevel=0))
    # ---------------------------------------------------------------- upper floors
    floors = [3.72 + 3.0 * i for i in range(3)]
    rects = cp.grid([-3.0, 0.0], [f + .75 for f in floors], 1.25, 1.8)
    rects += [(3.0, f + .18, 1.3, 2.35) for f in floors]
    parts += cp.windows(k, rects, at=F, glass_mat=win, frame_mat=trim, depth=.09, t=.1, glint_mat=trim,
                        blind_mat=accent, blind_every=3, mullion='v')
    g = Geo()
    for (x, v, w, hh) in rects:
        g.box(x - w / 2 - .12, x + w / 2 + .12, F - .16, F + .02, v + hh + .02, v + hh + .22, skip=('+y',))
        if x < 2:
            g.box(x - w / 2 - .08, x + w / 2 + .08, F - .2, F + .02, v - .1, v + .02, skip=('+y',))
    parts.append(g.obj(k, 'Lintels', trim))
    # fire escape on the left column
    fx0, fx1 = -4.3, -1.7
    for i, f in enumerate(floors):
        pz = f + .6
        parts.append(k.box('Landing', ((fx0 + fx1) / 2, F - .55, pz), (fx1 - fx0, 1.1, .08), metal, bevel=.02,
                           segments=1))
        parts.append(cp.railing(k, fx0, fx1, F - 1.08, pz + .04, .9, metal, post=.62))
        g = Geo()
        for x in (fx0, fx1):
            g.box(x - .03, x + .03, F - 1.1, F, pz + .88, pz + .94)
            g.box(x - .025, x + .025, F - .55, F - .5, pz + .04, pz + .88, skip=('-z', '+z'))
        parts.append(g.obj(k, 'SideRails', metal))
        if i < len(floors) - 1:
            a = (fx1 - .35, F - .55, pz + .05)
            b = (fx0 + .45, F - .55, pz + 3.0)
            for sy in (-.3, .3):
                parts.append(cp.rod(k, 'Stringer', [(a[0], a[1] + sy, a[2]), (b[0], b[1] + sy, b[2])], .035, metal))
            g = Geo()
            for s_ in range(1, 7):
                t = s_ / 7
                x = a[0] + (b[0] - a[0]) * t
                zz = a[2] + (b[2] - a[2]) * t
                g.box(x - .1, x + .1, a[1] - .28, a[1] + .28, zz - .02, zz + .02, skip=('-z',))
            parts.append(g.obj(k, 'Treads', metal))
    g = Geo()
    lx = -2.1
    for sy in (-.22, .22):
        g.box(lx - .02, lx + .02, F - .55 + sy - .02, F - .55 + sy + .02, 2.0, floors[0] + .6)
    for j in range(5):
        zz = 2.2 + j * .4
        g.box(lx - .02, lx + .02, F - .77, F - .33, zz - .015, zz + .015)
    parts.append(g.obj(k, 'Ladder', metal))
    # balconies with plants on the right column
    for i, f in enumerate(floors):
        px = 3.75 if i % 2 == 0 else 2.25
        tx = 3.0 - (px - 3.0) * .5
        parts.append(k.box('Balcony', (3.0, F - .42, f + .1), (2.2, .86, .16), trim, bevel=.04, segments=1))
        parts.append(k.box('BalconyFront', (3.0, F - .8, f + .52), (2.16, .08, .7), accent, bevel=.03, segments=1))
        g = Geo()
        for x in (1.92, 4.02):
            g.box(x, x + .06, F - .78, F, f + .18, f + .86, skip=('-z',))
        g.box(1.9, 4.1, F - .86, F - .74, f + .86, f + .92)
        parts.append(g.obj(k, 'BalconyRail', trim))
        parts.append(k.cyl('Pot', (px, F - .4, f + .38), .16, .36, trim, vertices=10, bevel=0))
        parts += cp.shrub(k, (px, F - .4, f + .5), .3, leaf, leaf, n=1, flowers=2, flower_mat=flower, seed=i)
        parts.append(k.ball('Ivy', (tx, F - .86, f + .9), (.5, .1, .14), leaf, 8, 4))
    # ---------------------------------------------------------------- cornice and roof
    parts.append(k.box('CorniceBand', (0, F + 3.5, top + .12), (9.2, 7.2, .26), trim, bevel=.05, segments=1))
    g = Geo()
    for i in range(12):
        x = -4.2 + i * (8.4 / 11)
        g.box(x - .1, x + .1, F - .28, F + .02, top + .25, top + .52, skip=('+y',))
    parts.append(g.obj(k, 'Brackets', trim))
    parts.append(k.box('Cornice', (0, F + 3.5, top + .64), (9.7, 7.7, .28), trim, bevel=.1, segments=2))
    rz = top + .78
    for (x, y) in ((-3.2, F + 5.2), (2.4, F + 5.8)):
        parts.append(k.box('Chimney', (x, y, rz + .7), (.7, .7, 1.4), brick, bevel=.06, segments=1))
        parts.append(k.box('ChimneyCap', (x, y, rz + 1.45), (.86, .86, .14), trim, bevel=.04, segments=1))
        parts.append(k.cyl('ChimneyPot', (x + .15, y, rz + 1.66), .1, .3, accent, vertices=8, bevel=0))
    parts += cp.antenna(k, -1.4, F + 5.6, rz, 2.4, metal, lit)
    obj = finish(k, 'apartment', parts, lo=-1, hi=13, shade=.72)
    return building_props(obj)


def shop_cafe(k):
    """Marigold café: the upper storey shelters a terrace under a striped awning with bistro
    tables, a chalkboard and a big steaming cup on the gable."""
    wall = mat(k, 'Wall', 'marigold', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    awn = mat(k, 'Awning', 'coral', GLOSS)
    teal = mat(k, 'Accent', 'teal', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    win = glass(k)
    lit = lamp(k)
    T = 1.45           # terrace depth under the upper floor
    parts = [k.box('Body', (0, F + T + 2.8, 3.6), (8.0, 5.6, 7.2), wall, bevel=.12, segments=2),
             k.box('Upper', (0, F + .8, 5.55), (8.0, 1.6, 3.3), wall, bevel=.12, segments=2),
             k.box('Soffit', (0, F + .75, 3.86), (7.9, 1.5, .1), trim, bevel=0)]
    for sx in (-1, 1):
        parts.append(k.box('SideWall', (sx * 3.72, F + .8, 1.95), (.56, 1.6, 3.9), wall, bevel=.08, segments=1))
        parts.append(k.box('SideBase', (sx * 3.72, F + .78, .2), (.66, 1.66, .4), teal, bevel=.05, segments=1))
    CF = F + T
    for x in (-2.05, 2.05):
        parts.append(k.box('Stall', (x, CF - .08, .35), (2.3, .16, .7), teal, bevel=.04, segments=1))
    parts += cp.windows(k, [(-2.05, .7, 2.3, 2.45), (2.05, .7, 2.3, 2.45)], at=CF, glass_mat=lit, frame_mat=teal,
                        depth=.08, t=.1, mullion='v')
    parts += cp.windows(k, [(0, .02, 1.2, 2.6)], at=CF, glass_mat=lit, frame_mat=teal, depth=.08, t=.1, mullion='h')
    parts.append(k.cyl('CupIcon', (-2.55, CF - .03, 1.75), .28, .03, awn, axis='Y', vertices=12, bevel=0))
    parts.append(k.torus('CupHandle', (-2.24, CF - .03, 1.78), .1, .035, awn, rot=(math.pi / 2, 0, 0), major_seg=10,
                         minor_seg=4))
    parts += cp.awning(k, -3.42, 3.42, CF, 3.62, 1.2, .5, awn, trim, n=10, valance=.26)
    parts.append(k.box('SignBoard', (0, F - .06, 4.45), (4.2, .16, .9), teal, bevel=.06, segments=2))
    parts.append(cp.text(k, 'CAFE', .72, .1, trim, (0, F - .16, 4.45), offset=.012))
    ups = cp.grid([-2.6, 0, 2.6], [5.15], 1.2, 1.55)
    parts += cp.windows(k, ups, at=F, glass_mat=win, frame_mat=teal, depth=.08, t=.1, glint_mat=trim)
    for x in (-2.6, 0, 2.6):
        parts.append(k.box('WindowBox', (x, F - .2, 5.05), (1.35, .34, .28), awn, bevel=.04, segments=1))
        parts += cp.shrub(k, (x, F - .2, 5.12), .26, leaf, leaf, n=2, flowers=3, flower_mat=trim, seed=x)
    parts.append(k.box('Coping', (0, F + 3.6, 7.28), (8.2, 7.3, .2), trim, bevel=.06, segments=1))
    gable = [(-1.9, 7.2)] + [(-math.cos(math.pi * i / 12) * 1.9, 7.9 + math.sin(math.pi * i / 12) * .9)
                             for i in range(13)] + [(1.9, 7.2)]
    parts.append(k.prism('Gable', gable, .5, wall, loc=(0, F + .25, 0), bevel=.06, segments=2))
    cz = .65
    cup = [(.0, 8.1 + cz), (.42, 8.1 + cz), (.52, 8.9 + cz), (.56, 9.0 + cz), (.0, 9.0 + cz)]
    parts.append(k.lathe('Cup', cup, trim, loc=(0, F + .45, 0), segments=14))
    parts.append(k.cyl('Sleeve', (0, F + .45, 8.52 + cz), .5, .32, awn, vertices=14, radius2=.46, bevel=0))
    parts.append(k.torus('Handle', (.55, F + .45, 8.55 + cz), .2, .06, trim, rot=(math.pi / 2, 0, 0), major_seg=10,
                         minor_seg=4))
    parts.append(k.cyl('Coffee', (0, F + .45, 8.99 + cz), .5, .02, metal, vertices=14, bevel=0))
    for (x, z, r) in ((-.1, 9.4, .22), (.12, 9.75, .26), (-.05, 10.12, .2)):
        parts.append(k.ball('Steam', (x, F + .45, z + .65), r, trim, 8, 5))
    ty = F + .72
    for tx in (-1.95, 1.6):
        parts.append(k.cyl('TableFoot', (tx, ty, .03), .22, .06, metal, vertices=10, bevel=0))
        parts.append(k.cyl('TableLeg', (tx, ty, .38), .035, .7, metal, vertices=6, bevel=0))
        parts.append(k.cyl('TableTop', (tx, ty, .75), .36, .05, teal, vertices=16, bevel=.02, segments=1))
        parts.append(k.cyl('Cup', (tx - .1, ty - .05, .81), .05, .08, trim, vertices=8, bevel=.01, segments=1))
        for sx in (-1, 1):
            cx = tx + sx * .62
            g = Geo()
            g.box(cx - .2, cx + .2, ty - .2, ty + .2, .43, .49)
            g.box(cx + sx * .19 - .025, cx + sx * .19 + .025, ty - .19, ty + .19, .49, .99)
            parts.append(g.obj(k, 'Chair', awn))
            g = Geo()
            for lx in (-.16, .16):
                for ly in (-.16, .16):
                    g.box(cx + lx - .02, cx + lx + .02, ty + ly - .02, ty + ly + .02, 0, .44, skip=('-z', '+z'))
            parts.append(g.obj(k, 'ChairLegs', metal))
    bx, by = 3.0, F + .45
    for sy, ang in ((-1, .2), (1, -.2)):
        parts.append(k.box('Board', (bx, by + sy * .1, .5), (.62, .04, .9), metal, bevel=.015, segments=1,
                           rot=(ang, 0, 0)))
        parts.append(k.box('BoardFrame', (bx, by + sy * .12, .5), (.7, .03, .98), teal, bevel=.015, segments=1,
                           rot=(ang, 0, 0)))
    g = Geo()
    for (w, zz) in ((.4, .78), (.3, .64), (.36, .5), (.22, .36)):
        g.box(bx - w / 2, bx + w / 2, by - .2, by - .17, zz, zz + .035)
    parts.append(g.obj(k, 'Chalk', trim))
    for x in (-3.2, -.95):
        parts.append(k.cyl('BayPot', (x, F + .45, .2), .2, .4, teal, vertices=10, bevel=0))
        parts.append(k.cyl('BayStem', (x, F + .45, .6), .03, .5, metal, vertices=6, bevel=0))
        parts.append(k.ball('BayBall', (x, F + .45, 1.05), .3, leaf, 8, 6))
    obj = finish(k, 'shop_cafe', parts, lo=-.5, hi=9, shade=.72)
    return building_props(obj)


def _book(g, x, y, z, w, d, hgt):
    g.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + hgt, skip=('-z',))


def shop_books(k):
    """Plum bookshop: a bay window piled with books, a lit door, shuttered upper floor and a
    mansard roof with dormers."""
    wall = mat(k, 'Wall', 'plum', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    denim = mat(k, 'Denim', 'denim', GLOSS)
    coral = mat(k, 'Coral', 'coral', GLOSS)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    win = glass(k)
    lit = lamp(k)
    parts = [k.box('Body', (0, F + 3.25, 3.9), (7.6, 6.5, 7.8), wall, bevel=.12, segments=2)]
    for sx in (-1, 1):
        parts.append(k.box('Pilaster', (sx * 3.55, F - .06, 1.85), (.5, .3, 3.7), trim, bevel=.05, segments=1))
    parts.append(k.box('Fascia', (0, F - .12, 3.3), (7.6, .34, .8), denim, bevel=.08, segments=2))
    parts.append(cp.text(k, 'BOOKS', .56, .1, gold, (-1.15, F - .31, 3.28), offset=.012))
    parts.append(k.box('FasciaCap', (0, F - .16, 3.78), (7.8, .46, .16), trim, bevel=.05, segments=1))
    plan = [(-3.2, F), (-2.65, F - .55), (.35, F - .55), (.9, F)]
    parts.append(cp.flat_poly(k, 'BayBase', plan, denim, 0, .72))
    parts.append(cp.flat_poly(k, 'BaySill', [(x, y - (.06 if y < F else 0)) for x, y in plan], trim, .72, .8))
    parts.append(cp.flat_poly(k, 'BayTop', [(x, y - (.08 if y < F else 0)) for x, y in plan], trim, 2.78, 2.9))
    parts.append(cp.flat_poly(k, 'BayRoof', [(x, y - (.12 if y < F else 0)) for x, y in plan], denim, 2.9, 3.0))
    parts.append(k.box('BayGlow', (-1.15, F - .02, 1.8), (4.1, .04, 2.0), lit, bevel=0))
    g = Geo()
    for (x, y) in plan:
        g.box(x - .05, x + .05, y - .05, y + .05, .8, 2.78)
    g.box(-1.19, -1.11, F - .6, F - .5, .8, 2.78)
    g.box(-2.65, .35, F - .6, F - .5, 2.3, 2.37)
    parts.append(g.obj(k, 'BayFrame', denim))
    geos = (Geo(), Geo(), Geo())
    parts.append(k.box('Riser', (-1.15, F - .2, 1.05), (3.2, .3, .5), trim, bevel=.03, segments=1))
    piles = [(-2.5, .8, 5), (-1.9, .8, 3), (-.45, .8, 4), (.15, .8, 6), (-1.6, 1.3, 4), (-.8, 1.3, 5), (-2.2, 1.3, 2)]
    for pi_, (x, z, n) in enumerate(piles):
        zz = z
        for b in range(n):
            w = .34 - (b % 3) * .04
            hh = .06 + (b % 2) * .025
            _book(geos[(b + pi_) % 3], x + ((b * 37) % 5 - 2) * .015, F - (.32 if z < 1 else .2), zz, w, .24, hh)
            zz += hh
    for i in range(9):
        x = -.6 + i * .085 + (i // 3) * .1
        hh = .28 + (i * 13 % 5) * .03
        _book(geos[i % 3], x, F - .2, 1.3, .07, .2, hh)
    parts.append(geos[0].obj(k, 'Books', coral))
    parts.append(geos[1].obj(k, 'Books', gold))
    parts.append(geos[2].obj(k, 'Books', trim))
    parts.append(k.box('OpenBook', (-2.5, F - .35, 1.95), (.5, .06, .34), trim, bevel=.02, segments=1, rot=(.35, 0, 0)))
    parts.append(k.box('Stand', (-2.5, F - .3, 1.7), (.06, .06, .5), denim, bevel=0))
    parts += cp.windows(k, [(2.1, .08, 1.2, 2.55)], at=F, glass_mat=lit, frame_mat=denim, depth=.08, t=.14,
                        mullion='h')
    parts.append(k.box('DoorStep', (2.1, F - .2, .05), (1.6, .45, .1), trim, bevel=.03, segments=1))
    parts.append(k.cyl('Pot', (3.0, F - .3, .22), .2, .44, coral, vertices=10, bevel=.03, segments=1))
    parts += cp.shrub(k, (3.0, F - .3, .42), .34, leaf, leaf, n=3, flowers=3, flower_mat=gold, seed=2)
    parts += cp.wall_lamp(k, 1.2, F, 2.7, denim, lit)
    ups = [(-1.75, 4.55, 1.2, 1.9), (1.75, 4.55, 1.2, 1.9)]
    parts += cp.windows(k, ups, at=F, glass_mat=win, frame_mat=trim, depth=.09, t=.1, glint_mat=trim)
    g = Geo()
    lv = Geo()
    for (x, v, w, hh) in ups:
        for sx in (-1, 1):
            cx = x + sx * (w / 2 + .3)
            g.box(cx - .26, cx + .26, F - .08, F + .02, v, v + hh, skip=('+y',))
            for j in range(5):
                zz = v + .2 + j * .33
                lv.box(cx - .2, cx + .2, F - .11, F - .07, zz, zz + .05, skip=('+y',))
    parts.append(g.obj(k, 'Shutters', denim))
    parts.append(lv.obj(k, 'Louvres', trim))
    for (x, v, w, hh) in ups:
        parts.append(k.box('WindowBox', (x, F - .2, v - .1), (w + .2, .32, .26), coral, bevel=.04, segments=1))
        parts += cp.shrub(k, (x, F - .2, v - .05), .24, leaf, leaf, n=2, flowers=3, flower_mat=gold, seed=x)
    parts.append(k.box('Cornice', (0, F + 3.25, 7.9), (8.0, 6.9, .26), trim, bevel=.08, segments=2))
    prof = [(F + .1, 8.0), (F + .1, 8.15), (F + .9, 10.2), (F + 5.6, 10.2), (F + 6.4, 8.15), (F + 6.4, 8.0)]
    parts.append(k.prism('Mansard', prof, 7.5, denim, axis='X', bevel=.08, segments=2))
    parts.append(k.box('RoofCap', (0, F + 3.25, 10.25), (7.6, 4.9, .12), trim, bevel=.04, segments=1))
    for x in (-1.75, 1.75):
        parts.append(k.box('Dormer', (x, F + .9, 8.95), (1.3, 1.2, 1.5), wall, bevel=.06, segments=1))
        roof = [(-.8, 9.7), (.8, 9.7), (0, 10.3)]
        parts.append(k.prism('DormerRoof', [(p[0] + x, p[1]) for p in roof], 1.4, coral, loc=(0, F + .95, 0),
                             bevel=.04, segments=1))
        parts += cp.windows(k, [(x, 8.4, .8, 1.1)], at=F + .3, glass_mat=win, frame_mat=trim, depth=.07, t=.09)
    parts.append(k.box('Chimney', (2.8, F + 4.2, 10.8), (.7, .7, 1.4), wall, bevel=.06, segments=1))
    parts.append(k.box('ChimneyCap', (2.8, F + 4.2, 11.55), (.86, .86, .14), trim, bevel=.04, segments=1))
    obj = finish(k, 'shop_books', parts, lo=-.5, hi=10, shade=.72)
    return building_props(obj)


def shop_laundry(k):
    """Azure laundromat: a row of round-windowed machines glowing through the big window,
    a coral LAUNDRY sign with soap bubbles, washing on a line and a steaming roof vent."""
    wall = mat(k, 'Wall', '#23a6e0', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    sign = mat(k, 'Accent', 'coral', GLOSS)
    white = mat(k, 'Machine', 'white', GLOSS)
    metal = mat(k, 'Metal', 'steel', .3, metal=.4)
    gold = mat(k, 'Gold', 'marigold', GLOSS)
    win = glass(k)
    lit = lamp(k)
    parts = [k.box('Body', (0, F + 1.05 + 2.75, 1.9), (7.6, 5.5, 3.8), wall, bevel=.1, segments=1),
             k.box('Upper', (0, F + 3.25, 3.8 + 2.2), (7.6, 6.5, 4.4), wall, bevel=.12, segments=2)]
    for x0, x1 in ((-3.8, -3.38), (1.42, 1.86), (3.38, 3.8)):
        parts.append(k.box('Pier', ((x0 + x1) / 2, F + .55, 1.9), (x1 - x0, 1.1, 3.8), wall, bevel=.06, segments=1))
    parts.append(k.box('DoorWall', (2.62, F + .72, 1.9), (1.56, .1, 3.8), wall, bevel=0))
    parts.append(k.box('Glow', (-1.0, F + 1.02, 1.9), (4.8, .06, 3.6), lit, bevel=0))
    parts.append(k.box('Floor', (-1.0, F + .55, .03), (4.8, 1.1, .06), trim, bevel=0))
    for i in range(5):
        x = -3.0 + i * .95
        for row, z in ((0, .0), (1, .95)):
            parts.append(k.box('Machine', (x, F + .62, z + .45), (.88, .7, .9), white, bevel=.06, segments=1))
            parts.append(k.torus('Porthole', (x, F + .27, z + .42), .25, .05, metal, rot=(math.pi / 2, 0, 0),
                                 major_seg=12, minor_seg=3))
            parts.append(k.cyl('Door', (x, F + .28, z + .42), .23, .04, win, axis='Y', vertices=12, bevel=0))
            parts.append(k.box('Panel', (x, F + .27, z + .8), (.7, .02, .12), gold if row == 0 else sign, bevel=0))
    parts.append(k.box('Sill', (-1.0, F - .02, .36), (5.0, .3, .12), trim, bevel=.04, segments=1))
    g = Geo()
    for x in (-3.38, -1.0, 1.42):
        g.box(x - .05, x + .05, F - .02, F + .08, .42, 3.1)
    g.box(-3.38, 1.42, F - .02, F + .08, 3.02, 3.12)
    parts.append(g.obj(k, 'Mullions', trim))
    parts.append(k.box('SignBoard', (-.6, F - .14, 3.52), (5.4, .26, .78), sign, bevel=.08, segments=2))
    parts.append(cp.text(k, 'LAUNDRY', .5, .1, trim, (-.6, F - .3, 3.5), offset=.012))
    for (x, z, r) in ((2.35, 3.9, .22), (2.75, 3.55, .14), (-3.55, 4.05, .18), (-3.25, 4.35, .11), (2.6, 4.25, .1)):
        parts.append(k.ball('Bubble', (x, F - .25, z), r, white, 8, 5))
    parts += cp.windows(k, [(2.62, .06, 1.1, 2.55)], at=F + .67, glass_mat=lit, frame_mat=sign, depth=.08, t=.12,
                        mullion='h')
    parts.append(k.box('OpenSign', (2.62, F + .55, 2.3), (.6, .04, .22), gold, bevel=.02, segments=1))
    parts.append(k.box('Canopy', (2.62, F + .2, 2.95), (1.7, .95, .12), sign, bevel=.04, segments=1))
    ups = [(-2.0, 4.7, 1.3, 1.8), (1.9, 4.7, 1.3, 1.8)]
    parts += cp.windows(k, ups, at=F, glass_mat=win, frame_mat=gold, depth=.09, t=.1, glint_mat=trim)
    for (x, v, w, hh) in ups:
        parts.append(k.box('Sill', (x, F - .1, v - .06), (w + .2, .26, .1), trim, bevel=.03, segments=1))
    parts.append(k.box('AC', (1.9, F - .3, 4.25), (.9, .5, .55), metal, bevel=.05, segments=1))
    line = [(-3.4, F - .35, 7.05), (-1.0, F - .35, 6.72), (1.2, F - .35, 6.72), (3.4, F - .35, 7.05)]
    parts.append(cp.rod(k, 'Line', line, .015, metal))
    shirt = [(-.3, .0), (.3, .0), (.3, .38), (.45, .3), (.55, .45), (.3, .62), (-.3, .62), (-.55, .45), (-.45, .3),
             (-.3, .38)]
    for i, (x, c) in enumerate(((-2.6, sign), (-1.6, gold), (-.5, trim), (.6, white), (1.7, sign), (2.7, gold))):
        z = 6.2 - (.15 if 0 < i < 5 else 0)
        if i % 2 == 0:
            parts.append(k.prism('Shirt', [(p[0] * .7 + x, p[1] * .9 + z) for p in shirt], .05, c, loc=(0, F - .35, 0),
                                 bevel=.012, segments=1))
        else:
            parts.append(k.box('Towel', (x, F - .35, z + .28), (.5, .04, .6), c, bevel=.015, segments=1))
        parts.append(k.box('Peg', (x, F - .37, z + .58), (.05, .06, .1), metal, bevel=0))
    parts.append(k.box('Coping', (0, F + 3.25, 8.28), (7.8, 6.7, .2), trim, bevel=.06, segments=1))
    parts.append(k.cyl('Vent', (-2.4, F + 3.0, 8.9), .28, 1.2, metal, vertices=12, bevel=.03, segments=1))
    parts.append(k.cyl('VentCap', (-2.4, F + 3.0, 9.55), .42, .2, metal, vertices=12, radius2=.1, bevel=.02, segments=1))
    for (x, z, r) in ((-2.4, 10.05, .34), (-2.0, 10.35, .28), (-2.6, 10.6, .24)):
        parts.append(k.ball('Steam', (x, F + 3.0, z), r, white, 8, 5))
    obj = finish(k, 'shop_laundry', parts, lo=-.5, hi=9, shade=.72)
    return building_props(obj)
