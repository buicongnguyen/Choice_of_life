"""Brightwater civic buildings: station, campus, hospital, office, and the commuter train."""
import math

from kit import GLOSS, SATIN

import _city_parts as cp
from _city_parts import Geo, building_props, finish, glass, lamp, mat

F = 3.5


def _column(k, x, y, z0, z1, r, shaft, cap, parts, vertices=12):
    parts.append(k.cyl('Shaft', (x, y, (z0 + z1) / 2 - .05), r, z1 - z0 - .3, shaft, vertices=vertices, bevel=0))
    g = Geo()
    g.box(x - r * 1.35, x + r * 1.35, y - r * 1.35, y + r * 1.35, z0, z0 + .2, skip=('-z',))
    g.box(x - r * 1.15, x + r * 1.15, y - r * 1.15, y + r * 1.15, z0 + .2, z0 + .3, skip=('-z',))
    g.box(x - r * 1.4, x + r * 1.4, y - r * 1.4, y + r * 1.4, z1 - .2, z1)
    g.box(x - r * 1.15, x + r * 1.15, y - r * 1.15, y + r * 1.15, z1 - .32, z1 - .2)
    parts.append(g.obj(k, 'Capital', cap))


def station(k):
    """Brightwater Central: brick wings under a coral roof, a stone pavilion with columns,
    a big round clock, lit arched doors and cast-iron canopies with hanging lamps."""
    brick = mat(k, 'Brick', 'brick_warm', SATIN)
    stone = mat(k, 'Stone', 'cream', GLOSS)
    steel = mat(k, 'Steel', 'teal', GLOSS)
    roof = mat(k, 'Roof', '#7b4fb8', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    metal = mat(k, 'Metal', 'navy', GLOSS)
    win = glass(k)
    lit = lamp(k)
    parts = [k.box('Wings', (0, F + .3 + 3.85, 3.6), (12.0, 7.7, 7.2), brick, bevel=.12, segments=2),
             k.box('Plinth', (0, F + 4.1, .25), (12.2, 7.9, .5), stone, bevel=.05, segments=1),
             k.box('Pavilion', (0, F + 4.1, 4.1), (5.6, 8.2, 8.2), brick, bevel=.12, segments=2),
             k.box('WingCornice', (0, F + 4.1, 7.3), (12.3, 7.95, .3), stone, bevel=.08, segments=1)]
    # coral roof over the wings and a gabled roof behind the pediment
    prof = [(F + .1, 7.4), (F + 1.7, 9.0), (F + 6.6, 9.0), (F + 8.2, 7.4)]
    parts.append(k.prism('WingRoof', prof, 12.1, roof, axis='X', bevel=.08, segments=2))
    parts.append(k.prism('PavRoof', [(-3.05, 8.4), (3.05, 8.4), (0, 10.6)], 7.6, roof, loc=(0, F + 4.4, 0),
                         bevel=.08, segments=2))
    # pediment with an emblem, cornice and the big clock
    parts.append(k.box('Entablature', (0, F - .1, 8.35), (6.1, .6, .5), stone, bevel=.08, segments=1))
    parts.append(k.prism('Pediment', [(-3.1, 8.55), (3.1, 8.55), (0, 10.55)], .5, stone, loc=(0, F + .05, 0),
                         bevel=.06, segments=1))
    parts.append(k.prism('Tympanum', [(-2.4, 8.72), (2.4, 8.72), (0, 10.2)], .1, brick, loc=(0, F - .22, 0),
                         bevel=.02, segments=1))
    parts.append(k.cyl('Emblem', (0, F - .3, 9.25), .38, .1, gold, axis='Y', vertices=14, bevel=0))
    parts.append(k.box('EmblemBar', (0, F - .37, 9.25), (.5, .04, .12), metal, bevel=.01, segments=1))
    parts += cp.clock(k, 0, F - .12, 6.45, 1.05, stone, gold, metal)
    parts.append(k.box('ClockBack', (0, F - .02, 6.45), (2.6, .12, 2.5), stone, bevel=.08, segments=2))
    # name band over the entrance
    parts.append(k.box('NameBand', (0, F - .16, 4.95), (5.5, .3, .6), steel, bevel=.06, segments=1))
    parts.append(cp.text(k, 'BRIGHTWATER', .46, .08, stone, (0, F - .34, 4.94), offset=.01))
    # entrance: three lit doors under a fan light, flanked by stone columns
    parts += cp.windows(k, [(-.9, .5, .85, 2.3), (0, .5, .85, 2.3), (.9, .5, .85, 2.3)], at=F, glass_mat=lit,
                        frame_mat=metal, depth=.07, t=.09, mullion='h')
    parts += cp.arch(k, 0, F - .02, 2.85, 1.35, stone, lit, t=.2, bars=5, bar_mat=metal)
    for sx in (-1, 1):
        parts.append(k.box('Jamb', (sx * 1.42, F - .05, 1.7), (.22, .3, 2.4), stone, bevel=.04, segments=1))
    for x in (-2.45, -1.85, 1.85, 2.45):
        _column(k, x, F - .35, .5, 4.6, .19, stone, stone, parts)
    parts.append(k.box('ColumnHead', (0, F - .3, 4.66), (5.6, .7, .16), stone, bevel=.04, segments=1))
    for i in range(3):
        parts.append(k.box('Step', (0, F - .3 - i * .22, .5 - (i + 1) * .16 + .08), (3.4 + i * .5, .3, .16), stone,
                           bevel=.04, segments=1))
    # wings: tall arched windows, round upper windows, cast-iron pillars and canopies
    for sx in (-1, 1):
        xs = [sx * 3.75, sx * 5.2]
        rects = [(x, .95, 1.05, 2.1) for x in xs]
        parts += cp.windows(k, rects, at=F + .3, glass_mat=win, frame_mat=stone, depth=.08, t=.1, mullion='v',
                            glint_mat=stone)
        for x in xs:
            parts += cp.arch(k, x, F + .28, 3.05, .52, stone, win, t=.12, bars=1)
        ox = sx * 4.47
        parts.append(k.torus('Oculus', (ox, F + .22, 5.6), .5, .1, stone, rot=(math.pi / 2, 0, 0), major_seg=14,
                             minor_seg=4))
        parts.append(k.cyl('OculusGlass', (ox, F + .27, 5.6), .46, .04, win, axis='Y', vertices=14, bevel=0))
        g = Geo()
        for x in (sx * 3.05, sx * 4.47, sx * 5.9):
            g.box(x - .07, x + .07, F + .1, F + .3, .5, 3.7, skip=('+y',))
            g.box(x - .13, x + .13, F, F + .3, 3.65, 3.79)
        parts.append(g.obj(k, 'Pillars', steel))
        for x in (sx * 3.05, sx * 4.47, sx * 5.9):
            parts.append(cp.rod(k, 'Bracket', [(x, F + .25, 3.2), (x, F - .3, 3.62), (x, F - 1.1, 3.78)], .04, steel))
        x0, x1 = sorted((sx * 2.95, sx * 6.05))
        parts.append(k.box('Canopy', ((x0 + x1) / 2, F - .55, 3.86), (x1 - x0, 1.75, .1), steel, bevel=.02, segments=1,
                           rot=(-.12, 0, 0)))
        parts.append(k.box('CanopyEdge', ((x0 + x1) / 2, F - 1.4, 3.76), (x1 - x0 + .06, .1, .24), steel, bevel=.03,
                           segments=1))
        g = Geo()
        n = 9
        for i in range(n):
            cx = x0 + (x1 - x0) * (i + .5) / n
            r = (x1 - x0) / n / 2
            front = [(cx + math.cos(math.pi + math.pi * j / 4) * r, F - 1.46, 3.64 + math.sin(math.pi + math.pi * j / 4) * r * .7)
                     for j in range(5)]
            back = [(p[0], F - 1.38, p[2]) for p in front]
            faces = [front, back[::-1]] + [[front[j], front[j + 1], back[j + 1], back[j]] for j in range(4)]
            g.hull(faces)
        parts.append(g.obj(k, 'Valance', steel))
        for x in (x0 + (x1 - x0) * .25, x0 + (x1 - x0) * .75):
            parts.append(k.cyl('LampRod', (x, F - .7, 3.5), .015, .5, metal, vertices=5, bevel=0))
            parts.append(k.cyl('LampShade', (x, F - .7, 3.22), .16, .14, steel, vertices=8, radius2=.06, bevel=0))
            parts.append(k.ball('LampGlobe', (x, F - .7, 3.08), .12, lit, 6, 4))
    # roof lantern with a flag
    parts.append(k.box('Lantern', (0, F + 5.5, 10.1), (1.3, 1.3, 1.3), stone, bevel=.06, segments=1))
    parts += cp.windows(k, [(0, 9.8, .7, .8)], at=F + 4.85, glass_mat=win, frame_mat=gold, depth=.05, t=.07,
                        mullion='v')
    parts.append(k.cyl('LanternRoof', (0, F + 5.5, 11.2), 1.0, .9, roof, vertices=4, radius2=.05, bevel=.02,
                       segments=1, rot=(0, 0, math.pi / 4)))
    parts.append(k.cyl('Flagpole', (0, F + 5.5, 12.3), .04, 1.6, metal, vertices=6, bevel=0))
    parts.append(k.prism('Flag', [(0, 12.55), (.9, 12.8), (0, 13.05)], .04, gold, loc=(.04, F + 5.5, 0), bevel=.01,
                         segments=1))
    obj = finish(k, 'station', parts, lo=-.5, hi=10, shade=.72)
    return building_props(obj)


def campus(k):
    """University hall: warm brick wings, a stone portico of six columns on broad steps,
    a pediment with a crest, hanging banners and a verdigris dome with a lantern."""
    brick = mat(k, 'Brick', 'brick', SATIN)
    stone = mat(k, 'Stone', 'cream', GLOSS)
    dome = mat(k, 'Dome', '#20b2a6', GLOSS)
    plum = mat(k, 'Plum', 'plum', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    win = glass(k)
    lit = lamp(k)
    parts = []
    # wings (front at F) and the recessed centre behind the portico
    for sx in (-1, 1):
        cx = sx * 5.2
        parts.append(k.box('Wing', (cx, F + 4.5, 4.25), (3.6, 9.0, 8.5), brick, bevel=.12, segments=2))
        parts.append(k.box('WingPlinth', (cx, F + 4.5, .35), (3.76, 9.16, .7), stone, bevel=.05, segments=1))
        parts.append(k.box('WingCornice', (cx, F + 4.5, 8.55), (3.9, 9.3, .34), stone, bevel=.08, segments=1))
        parts.append(k.box('Quoin', (sx * 6.95, F - .02, 4.3), (.3, .1, 7.6), stone, bevel=.03, segments=1))
        parts.append(cp.railing(k, cx - 1.8, cx + 1.8, F - .05, 8.72, .7, stone, post=.4, r=.05))
        rects = [(cx - .8, 1.1, 1.05, 2.2), (cx + .8, 1.1, 1.05, 2.2), (cx - .8, 4.7, 1.05, 2.2), (cx + .8, 4.7, 1.05, 2.2)]
        parts += cp.windows(k, rects, at=F, glass_mat=win, frame_mat=stone, depth=.09, t=.1, mullion='cross',
                            glint_mat=stone, blind_mat=plum, blind_every=4)
        g = Geo()
        for (x, v, w, hh) in rects:
            g.box(x - w / 2 - .12, x + w / 2 + .12, F - .18, F + .02, v + hh, v + hh + .22, skip=('+y',))
            g.box(x - .13, x + .13, F - .22, F + .02, v + hh, v + hh + .34, skip=('+y',))
            g.box(x - w / 2 - .06, x + w / 2 + .06, F - .2, F + .02, v - .12, v, skip=('+y',))
        parts.append(g.obj(k, 'Dressings', stone))
        parts += [k.ball('Hedge', (cx + dx, F - .45, .45), (.62, .42, .45), leaf, 7, 4) for dx in (-1.1, 0, 1.1)]
    parts.append(k.box('Centre', (0, F + 6.0, 4.25), (6.8, 6.0, 8.5), brick, bevel=.1, segments=1))
    # the portico: steps, podium, six columns, entablature and pediment
    for i in range(4):
        parts.append(k.box('Step', (0, F - .1 + i * .32, (i + 1) * .1), (6.6 - i * .1, .5 + (3 - i) * .0,
                                                                           (i + 1) * .2), stone, bevel=.04,
                           segments=1))
    parts.append(k.box('Podium', (0, F + 1.9, .4), (6.8, 1.6, .8), stone, bevel=.05, segments=1))
    for x in (-2.75, -1.65, -.55, .55, 1.65, 2.75):
        _column(k, x, F + 1.55, .8, 6.9, .26, stone, stone, parts)
    parts.append(k.box('Entablature', (0, F + 1.9, 7.35), (7.0, 1.7, .9), stone, bevel=.08, segments=2))
    parts.append(k.box('Frieze', (0, F + 1.03, 7.35), (6.2, .06, .34), plum, bevel=.02, segments=1))
    parts.append(k.prism('Pediment', [(-3.65, 7.8), (3.65, 7.8), (0, 9.6)], 1.7, stone, loc=(0, F + 1.9, 0),
                         bevel=.08, segments=2))
    parts.append(k.prism('Tympanum', [(-2.8, 7.98), (2.8, 7.98), (0, 9.28)], .1, plum, loc=(0, F + 1.02, 0),
                         bevel=.02, segments=1))
    parts.append(k.cyl('Crest', (0, F + .94, 8.5), .42, .12, gold, axis='Y', vertices=16, bevel=.03, segments=1))
    parts.append(k.prism('CrestBook', [(-.26, 8.38), (0, 8.44), (.26, 8.38), (.26, 8.64), (0, 8.7), (-.26, 8.64)], .06,
                         stone, loc=(0, F + .86, 0), bevel=.01, segments=1))
    # entrance wall behind the columns
    parts += cp.windows(k, [(0, .85, 1.5, 2.6)], at=F + 3.0, glass_mat=lit, frame_mat=plum, depth=.1, t=.16,
                        mullion='v')
    parts += cp.arch(k, 0, F + 2.98, 3.45, .75, stone, lit, t=.14, bars=3, bar_mat=plum)
    parts += cp.windows(k, [(-2.0, 1.4, 1.0, 2.0), (2.0, 1.4, 1.0, 2.0), (-2.0, 4.6, 1.0, 1.7), (2.0, 4.6, 1.0, 1.7)],
                        at=F + 3.0, glass_mat=win, frame_mat=stone, depth=.08, t=.1)
    for x in (-1.1, 1.1):
        parts.append(k.box('Banner', (x, F + 1.2, 5.3), (.62, .05, 2.6), plum, bevel=.02, segments=1))
        parts.append(k.prism('BannerTail', [(x - .31, 4.02), (x + .31, 4.02), (x, 3.7)], .05, plum, loc=(0, F + 1.2, 0),
                             bevel=.01, segments=1))
        parts.append(k.cyl('BannerBadge', (x, F + 1.16, 5.9), .2, .04, gold, axis='Y', vertices=12, bevel=0))
        g = Geo()
        g.box(x - .4, x + .4, F + 1.16, F + 1.24, 6.59, 6.65)
        parts.append(g.obj(k, 'BannerRod', gold))
    for sx in (-1, 1):
        x = sx * 3.55
        parts.append(k.cyl('LampPost', (x, F - .3, 1.1), .06, 2.2, plum, vertices=8, bevel=0))
        parts.append(k.cyl('LampFoot', (x, F - .3, .15), .16, .3, plum, vertices=8, bevel=0))
        parts.append(k.ball('LampGlobe', (x, F - .3, 2.35), .22, lit, 8, 5))
        parts.append(k.cyl('LampCap', (x, F - .3, 2.56), .16, .1, gold, vertices=8, bevel=0))
    # drum, dome and lantern
    dz = 8.7
    parts.append(k.cyl('Drum', (0, F + 6.2, dz + .9), 2.35, 1.8, stone, vertices=24, bevel=.05, segments=1))
    for a in (-.55, 0, .55):
        x, y = math.sin(a) * 2.36, F + 6.2 - math.cos(a) * 2.36
        parts.append(k.box('DrumWindow', (x, y, dz + .9), (.55, .06, 1.0), win, bevel=0, rot=(0, 0, a)))
        parts.append(k.box('DrumFrame', (x, y + .02, dz + .9), (.7, .05, 1.15), gold, bevel=0, rot=(0, 0, a)))
    prof = [(2.55, dz + 1.8), (2.5, dz + 2.3)] + [(math.cos(t) * 2.45, dz + 2.3 + math.sin(t) * 2.3)
                                                    for t in [i * math.pi / 2 / 6 for i in range(1, 7)]]
    prof[-1] = (0.0, prof[-1][1])
    parts.append(k.lathe('Dome', prof, dome, loc=(0, F + 6.2, 0), segments=20))
    parts.append(k.cyl('DomeRing', (0, F + 6.2, dz + 1.86), 2.6, .14, gold, vertices=20, bevel=0))
    for i in range(8):
        a = i * math.tau / 8 + math.pi / 8
        if math.sin(a) > .5:
            continue
        pts = [(math.cos(t) * 2.47 * math.cos(a), F + 6.2 + math.cos(t) * 2.47 * math.sin(a),
                dz + 2.3 + math.sin(t) * 2.32) for t in [j * math.pi / 2 / 4 for j in range(4)]]
        parts.append(cp.rod(k, 'Rib', pts, .05, gold))
    lz = dz + 4.55
    parts.append(k.cyl('Lantern', (0, F + 6.2, lz + .4), .45, .8, stone, vertices=10, bevel=0))
    parts.append(k.ball('LanternDome', (0, F + 6.2, lz + .8), (.5, .5, .4), dome, 10, 6))
    parts.append(k.cyl('Spike', (0, F + 6.2, lz + 1.45), .05, .6, gold, vertices=6, radius2=.01, bevel=0))
    parts.append(k.ball('Finial', (0, F + 6.2, lz + 1.25), .12, gold, 8, 5))
    obj = finish(k, 'campus', parts, lo=-.5, hi=11, shade=.72)
    return building_props(obj)


def hospital(k):
    """Clean white hospital with teal bands, a lit glass entrance under a teal canopy with a
    coral cross, an ambulance bay with a coral roller door and a big rooftop cross sign."""
    wall = mat(k, 'Wall', 'white', GLOSS)
    band = mat(k, 'Band', 'teal', GLOSS)
    cross = mat(k, 'Cross', 'coral', GLOSS)
    frame = mat(k, 'Frame', 'teal_dark', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    win = glass(k)
    lit = lamp(k)
    parts = [k.box('Block', (0, F + 4.5, 7.45), (12.0, 9.0, 7.5), wall, bevel=.16, segments=2),
             k.box('Ground', (0, F + 5.1, 1.9), (11.8, 7.8, 3.8), wall, bevel=.06, segments=1)]
    g = Geo()
    for x0, x1 in ((-6.0, -5.1), (-.5, .9), (5.1, 6.0)):
        g.box(x0, x1, F, F + 1.3, 0, 3.72)
    parts.append(g.obj(k, 'GroundPiers', wall))
    for z in (3.9, 7.55):
        parts.append(k.box('Band', (0, F + 4.5, z), (12.14, 9.14, .42), band, bevel=.08, segments=1))
    parts.append(k.box('Parapet', (0, F + 4.5, 11.3), (12.2, 9.2, .4), band, bevel=.1, segments=2))
    # upper floors: window rows with frames and coloured blinds
    xs = cp.spaced(-5.6, 5.6, 6)
    rects = cp.grid(xs, [4.75, 8.4], 1.35, 1.9)
    parts += cp.windows(k, rects, at=F, glass_mat=win, frame_mat=frame, depth=.08, t=.09, mullion='v',
                        glint_mat=wall, blind_mat=gold, blind_every=4)
    g = Geo()
    for (x, v, w, hh) in rects:
        g.box(x - w / 2 - .06, x + w / 2 + .06, F - .16, F + .02, v - .1, v + .02, skip=('+y',))
    parts.append(g.obj(k, 'Sills', band))
    side = cp.grid([F + 2.4, F + 4.9, F + 7.4], [4.75, 8.4], 1.3, 1.9)
    parts += cp.windows(k, side, face='+x', at=6.0, glass_mat=win, frame_mat=frame, depth=.08, t=.09, mullion='v')
    parts += cp.windows(k, side, face='-x', at=-6.0, glass_mat=win, frame_mat=frame, depth=.08, t=.09, mullion='v')
    # entrance: recessed lit glazing under a teal canopy with a coral cross
    parts += cp.windows(k, cp.grid(cp.spaced(-5.05, -.55, 4), [.05], 1.1, 3.1), at=F + 1.2, glass_mat=lit,
                        frame_mat=frame, depth=.07, t=.08, mullion='h')
    g = Geo()
    g.box(-5.1, -.5, F + 1.1, F + 1.2, 3.18, 3.72)
    parts.append(g.obj(k, 'EntranceHead', frame))
    parts.append(k.box('Canopy', (-2.7, F - .6, 3.45), (5.4, 2.2, .3), band, bevel=.1, segments=2))
    parts.append(k.box('CanopyLight', (-2.7, F - .6, 3.28), (4.8, 1.6, .04), lit, bevel=0))
    parts.append(k.box('CrossPlate', (-2.7, F - 1.73, 3.45), (1.0, .06, .9), wall, bevel=.03, segments=1))
    for sz in ((.24, .7), (.7, .24)):
        parts.append(k.box('CanopyCross', (-2.7, F - 1.79, 3.45), (sz[0], .08, sz[1]), cross, bevel=.03, segments=1))
    for x in (-4.6, -.8):
        parts += cp.planter(k, x, F - .25, .9, .45, .5, wall, band, leaf, leaf)
    # ambulance bay with a half-raised roller door, bollards and ground markings
    parts.append(k.box('BayGlow', (3.0, F + 1.16, 1.0), (4.2, .06, 1.95), lit, bevel=0))
    parts.append(k.box('BayFloor', (3.0, F + .6, .02), (4.2, 1.2, .04), frame, bevel=0))
    parts.append(k.box('RollerDoor', (3.0, F + .7, 2.7), (4.2, .1, 1.5), cross, bevel=.02, segments=1))
    g = Geo()
    for i in range(6):
        z = 2.0 + i * .24
        g.box(.9, 5.1, F + .6, F + .65, z, z + .06, skip=('+y',))
    parts.append(g.obj(k, 'DoorRibs', wall))
    parts.append(k.box('BayHead', (3.0, F - .05, 3.55), (4.6, .3, .5), cross, bevel=.06, segments=1))
    parts.append(cp.text(k, 'AMBULANCE', .3, .06, wall, (3.0, F - .22, 3.55), offset=.008))
    g = Geo()
    for i in range(6):
        x = 1.3 + i * .68
        g.box(x, x + .3, F - 1.1, F - .02, 0, .012)
    g.box(1.1, 4.95, F - 1.18, F - 1.08, 0, .012)
    parts.append(g.obj(k, 'Hatching', gold))
    for x in (.55, 5.45):
        parts.append(k.cyl('Bollard', (x, F - .3, .45), .12, .9, gold, vertices=10, bevel=.04, segments=1))
        parts.append(k.cyl('BollardBand', (x, F - .3, .62), .125, .12, frame, vertices=10, bevel=0))
    # rooftop cross sign, plant and a mast
    rz = 11.5
    parts.append(k.cyl('SignDisc', (2.6, F + 1.2, rz + 1.9), 1.35, .2, wall, axis='Y', vertices=24, bevel=.05,
                       segments=1))
    parts.append(k.torus('SignRim', (2.6, F + 1.08, rz + 1.9), 1.35, .1, band, rot=(math.pi / 2, 0, 0), major_seg=24,
                         minor_seg=4))
    for sz in ((.55, 1.7), (1.7, .55)):
        parts.append(k.box('RoofCross', (2.6, F + 1.0, rz + 1.9), (sz[0], .2, sz[1]), cross, bevel=.08, segments=2))
    g = Geo()
    for x in (1.9, 3.3):
        g.box(x - .06, x + .06, F + 1.25, F + 1.4, rz - .1, rz + .7)
    parts.append(g.obj(k, 'SignLegs', frame))
    parts += cp.ac_unit(k, -3.5, F + 4.0, rz - .2, wall, frame)
    parts += cp.ac_unit(k, -2.2, F + 5.5, rz - .2, wall, frame)
    parts += cp.antenna(k, -4.8, F + 6.0, rz - .2, 2.2, frame, lit)
    obj = finish(k, 'hospital', parts, lo=-.5, hi=11, shade=.74)
    return building_props(obj)


def office(k):
    """Glassy office block: a navy-framed curtain wall with coral fins, a lit lobby behind a
    revolving door under a coral canopy, and concrete planters."""
    frame = mat(k, 'Frame', 'navy', GLOSS)
    fin = mat(k, 'Fin', 'coral', GLOSS)
    trim = mat(k, 'Trim', 'cream', GLOSS)
    gold = mat(k, 'Accent', 'marigold', GLOSS)
    plum = mat(k, 'Plum', 'plum', GLOSS)
    leaf = mat(k, 'Leaf', 'leaf', GLOSS)
    win = glass(k)
    lit = lamp(k)
    parts = [k.box('Core', (0, F + 4.9, 2.1), (9.6, 6.2, 4.2), frame, bevel=.05, segments=1),
             k.box('Body', (0, F + 4.0, 8.3), (10.0, 8.0, 8.2), frame, bevel=.14, segments=2)]
    # lobby glazing (lit) and piers
    parts += cp.windows(k, cp.grid([-3.9, -2.4, 2.4, 3.9], [.05], 1.45, 3.75), at=F + 1.8, glass_mat=lit,
                        frame_mat=trim, depth=.06, t=.07, mullion='h')
    parts += cp.windows(k, [(0, 2.6, 3.3, 1.2)], at=F + 1.8, glass_mat=lit, frame_mat=trim, depth=.06, t=.07,
                        mullion='double')
    parts.append(k.box('LobbyBack', (0, F + 1.76, 1.3), (3.3, .06, 2.6), lit, bevel=0))
    for sx in (-1, 1):
        parts.append(k.box('Pier', (sx * 4.85, F + .95, 2.1), (.3, 1.9, 4.2), frame, bevel=.05, segments=1))
    # revolving door
    ry = F + .75
    parts.append(k.cyl('DrumTop', (0, ry, 2.62), 1.1, .3, frame, vertices=20, bevel=.06, segments=1))
    parts.append(k.cyl('DrumBase', (0, ry, .03), 1.1, .06, trim, vertices=20, bevel=0))
    parts.append(k.cyl('Post', (0, ry, 1.25), .06, 2.4, trim, vertices=8, bevel=0))
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 5
        parts.append(k.box('Wing', (math.cos(a) * .47, ry + math.sin(a) * .47, 1.25), (.9, .05, 2.3), win,
                           bevel=.015, segments=1, rot=(0, 0, a)))
    parts.append(k.torus('DrumRing', (0, ry, 2.44), 1.05, .05, trim, major_seg=20, minor_seg=4))
    # canopy with logo
    parts.append(k.box('Canopy', (0, F - .15, 3.75), (5.4, 2.6, .28), fin, bevel=.1, segments=2))
    parts.append(k.box('CanopySoffit', (0, F - .15, 3.6), (5.0, 2.2, .04), lit, bevel=0))
    parts.append(k.torus('LogoRing', (-1.9, F - 1.5, 3.76), .26, .07, gold, rot=(math.pi / 2, 0, 0), major_seg=16,
                         minor_seg=5))
    parts.append(k.ball('LogoDot', (-1.9, F - 1.5, 3.76), .13, plum, 10, 6))
    # curtain wall: navy frames, cream spandrels, coral fins and a marigold crown
    cols = cp.spaced(-4.8, 4.8, 6)
    floors = [4.5, 7.2, 9.9]
    parts += cp.windows(k, cp.grid(cols, [z + .45 for z in floors], 1.5, 2.1), at=F, glass_mat=win, frame_mat=trim,
                        depth=.06, t=.08, mullion='h', glint_mat=trim, blind_mat=gold, blind_every=5)
    g = Geo()
    for z in floors:
        g.box(-5.02, 5.02, F - .08, F + .02, z + .02, z + .38, skip=('+y',))
    parts.append(g.obj(k, 'Spandrels', trim))
    for x in (-5.0, -1.6, 1.6, 5.0):
        parts.append(k.box('Fin', (x, F - .2, 8.35), (.26, .62, 8.3), fin, bevel=.08, segments=1))
    parts.append(k.box('Crown', (0, F + 4.0, 12.55), (10.3, 8.3, .5), gold, bevel=.1, segments=2))
    parts.append(k.box('Rooftop', (1.5, F + 5.0, 13.4), (3.0, 3.0, 1.3), trim, bevel=.08, segments=1))
    parts += cp.antenna(k, -3.0, F + 5.5, 12.8, 2.4, frame, lit)
    side = cp.grid([F + 2.5, F + 5.5], [z + .45 for z in floors], 1.8, 2.1)
    parts += cp.windows(k, side, face='+x', at=5.0, glass_mat=win, frame_mat=trim, depth=.06, t=.08, mullion=None)
    parts += cp.windows(k, side, face='-x', at=-5.0, glass_mat=win, frame_mat=trim, depth=.06, t=.08, mullion=None)
    # planters
    for sx in (-1, 1):
        x = sx * 3.55
        parts.append(k.box('Planter', (x, F - .25, .32), (2.2, .6, .64), trim, bevel=.06, segments=1))
        parts += cp.shrub(k, (x - .5, F - .25, .58), .36, leaf, leaf, n=2, flowers=2, flower_mat=gold, seed=x)
        parts += cp.shrub(k, (x + .5, F - .25, .58), .32, leaf, leaf, n=2, flowers=2, flower_mat=plum, seed=x + 1)
    obj = finish(k, 'office', parts, lo=-.5, hi=11, shade=.74)
    return building_props(obj)


def train(k):
    """Commuter carriage with a rounded driving cab at +X: teal body, coral livery stripe,
    marigold doors, cream roof, a window band both sides, bogies and a pantograph.
    Base (wheel bottoms) at rail height Z=0; centred on Y=0."""
    body = mat(k, 'Body', 'teal', GLOSS)
    stripe = mat(k, 'Stripe', 'coral', GLOSS)
    roof = mat(k, 'Roof', 'white', GLOSS)
    door = mat(k, 'Door', 'marigold', GLOSS)
    metal = mat(k, 'Metal', 'charcoal', GLOSS)
    win = glass(k)
    lit = lamp(k, '#fff0b8', 1.4)
    L0, L1 = -6.0, 5.1
    W = 2.8
    parts = [k.box('Underframe', ((L0 + L1) / 2 + .3, 0, .98), (L1 - L0 + .4, W - .5, .36), metal, bevel=.06,
                   segments=1),
             k.box('Body', ((L0 + L1) / 2, 0, 2.35), (L1 - L0, W, 2.5), body, bevel=.28, segments=3),
             k.box('Roof', ((L0 + L1) / 2 - .1, 0, 3.62), (L1 - L0 - .1, W - .1, .4), roof, bevel=.18, segments=3)]
    # cab nose
    nose = [(L1 - .3, 1.1), (L1 + .9, 1.1), (L1 + 1.18, 1.55), (L1 + 1.15, 2.45), (L1 + .7, 3.45), (L1 - .3, 3.65)]
    parts.append(k.prism('Nose', nose, W, body, axis='Y', bevel=.26, segments=3))
    parts.append(k.box('Windscreen', (L1 + .93, 0, 2.95), (.08, W - .5, 1.05), win, bevel=.04, segments=1,
                       rot=(0, -.46, 0)))
    parts.append(k.box('NoseStripe', (L1 + 1.12, 0, 1.72), (.12, W - .2, .28), stripe, bevel=.05, segments=1))
    for sy in (-.85, .85):
        parts.append(k.cyl('Headlight', (L1 + 1.14, sy, 2.02), .15, .08, lit, axis='X', vertices=12, bevel=0))
        parts.append(k.torus('HeadRim', (L1 + 1.16, sy, 2.02), .15, .035, metal, rot=(0, math.pi / 2, 0),
                             major_seg=12, minor_seg=4))
    parts.append(k.box('Coupler', (L1 + 1.25, 0, 1.12), (.3, .3, .2), metal, bevel=.05, segments=1))
    # rear end: gangway and tail lights
    parts.append(k.box('Gangway', (L0 - .12, 0, 2.2), (.3, 1.3, 2.3), metal, bevel=.08, segments=1))
    for sy in (-1.0, 1.0):
        parts.append(k.cyl('TailLight', (L0 - .02, sy, 1.55), .1, .06, stripe, axis='X', vertices=10, bevel=0))
    # livery, window band, doors
    doors = [-3.1, 1.3]
    for face, at in (('-y', -W / 2), ('+y', W / 2)):
        sgn = -1 if face == '-y' else 1
        g = Geo()
        g.box(L0 + .2, L1 + .3, at - .025, at + .025, 1.42, 1.66)
        parts.append(g.obj(k, 'Livery', stripe))
        g = Geo()
        g.box(L0 + .2, L1 + .3, at - .03, at + .03, 1.7, 1.76)
        parts.append(g.obj(k, 'Pinstripe', door))
        g = Geo()
        g.box(L0 + .25, L1 - .1, at - .02, at + .02, 2.02, 3.2)
        parts.append(g.obj(k, 'WindowBand', metal))
        xs = [-5.25, -4.2, -2.0, -.95, .1, 2.45, 3.5, 4.5]
        parts += cp.windows(k, [(x, 2.12, .88, 1.0) for x in xs], face=face, at=at + sgn * .03, glass_mat=win,
                            frame_mat=roof, depth=.04, t=.07, mullion=None, glint_mat=roof)
        for x in doors:
            parts += cp.windows(k, [(x - .36, 1.2, .72, 2.1), (x + .36, 1.2, .72, 2.1)], face=face, at=at + sgn * .03,
                                glass_mat=win, frame_mat=door, depth=.05, t=.14, mullion=None)
            g = Geo()
            g.box(x - .74, x + .74, at - .05, at + .05, 1.16, 1.36)
            g.box(x - .74, x + .74, at - .05, at + .05, 3.18, 3.3)
            parts.append(g.obj(k, 'DoorPanel', door))
    # bogies and wheels
    for bx in (-3.9, 3.3):
        parts.append(k.box('Bogie', (bx, 0, .62), (2.5, W - .3, .36), metal, bevel=.08, segments=1))
        for sy in (-1, 1):
            parts.append(k.box('Spring', (bx, sy * 1.18, .7), (.9, .16, .28), stripe, bevel=.05, segments=1))
            for dx in (-.8, .8):
                parts.append(k.cyl('Wheel', (bx + dx, sy * 1.2, .42), .42, .16, metal, axis='Y', vertices=16, bevel=.04,
                                   segments=1))
                parts.append(k.cyl('Hub', (bx + dx, sy * 1.29, .42), .2, .04, stripe, axis='Y', vertices=10, bevel=0))
    # roof: AC pods and a pantograph
    for x in (-3.6, -1.0):
        parts.append(k.box('ACPod', (x, 0, 3.92), (1.6, 1.4, .34), roof, bevel=.12, segments=2))
    px = 2.6
    for sy in (-.45, .45):
        parts.append(k.cyl('Insulator', (px - .6, sy, 3.95), .09, .3, stripe, vertices=8, bevel=0))
        parts.append(k.cyl('Insulator', (px + .6, sy, 3.95), .09, .3, stripe, vertices=8, bevel=0))
    parts.append(k.box('PantoBase', (px, 0, 4.12), (1.5, 1.1, .08), metal, bevel=.02, segments=1))
    for sy in (-.35, .35):
        parts.append(cp.rod(k, 'LowerArm', [(px - .5, sy, 4.15), (px + .45, sy * .6, 4.75)], .04, metal))
        parts.append(cp.rod(k, 'UpperArm', [(px + .45, sy * .6, 4.75), (px - .2, sy * .2, 5.25)], .035, metal))
    parts.append(k.box('PanHead', (px - .2, 0, 5.3), (.16, 1.7, .07), metal, bevel=.02, segments=1))
    parts.append(k.box('PanHorn', (px - .2, 0, 5.24), (.1, 1.95, .04), stripe, bevel=.01, segments=1))
    obj = finish(k, 'train', parts, lo=0, hi=3.9, shade=.7)
    cp.measure(obj)
    obj['length'] = obj['width']
    obj['floor_z'] = 1.16
    obj['wheel_radius'] = .42
    obj['band'] = 'backdrop'
    return obj
