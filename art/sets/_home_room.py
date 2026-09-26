"""Cottage on Gull Lane: floor, back walls and the round rug.

Tiles are authored in world space: X -4..4 (seamless), the floor top at Z = 0 and
the wall's front face at Y = +3.5. Elements that would cross a tile edge are built
with +-8 m copies and the joined mesh is clipped to exactly -4..4.
"""
import math
import random

import bmesh

import _home_util as U
from kit import GLOSS, SATIN

WALL_Y = 3.5
WALL_T = .3
WALL_H = 3.4
FLOOR_FRONT = -6.


# ----------------------------------------------------------------------------- floor
def build_floor(k):
    rnd = random.Random(11)
    tones = [k.mat('Honey', U.HONEY, SATIN), k.mat('HoneyLight', U.HONEY_LIGHT, SATIN),
             k.mat('HoneyDeep', U.HONEY_DEEP, SATIN)]
    seam = k.mat('WoodSeam', '#b0642c', SATIN)
    rows = 22
    width = (WALL_Y - FLOOR_FRONT) / rows
    c, cz, dz = .016, .012, .012
    bm = bmesh.new()

    def plank(x0, x1, y0, y1, tone):
        t = [bm.verts.new(p) for p in ((x0 + c, y0 + c, 0), (x1 - c, y0 + c, 0), (x1 - c, y1 - c, 0),
                                       (x0 + c, y1 - c, 0))]
        b = [bm.verts.new(p) for p in ((x0, y0, -dz), (x1, y0, -dz), (x1, y1, -dz), (x0, y1, -dz))]
        top = bm.faces.new(t)
        top.material_index = tone
        for i in range(4):
            j = (i + 1) % 4
            f = bm.faces.new((b[i], b[j], t[j], t[i]))
            f.material_index = 3
    for r in range(rows):
        y0 = FLOOR_FRONT + r * width
        count = 4
        lens = [rnd.uniform(1.5, 2.5) for _ in range(count)]
        total = sum(lens)
        lens = [v * 8 / total for v in lens]
        x = -4 + rnd.uniform(0, 8)
        prev = -1
        for length in lens:
            tone = rnd.choice([i for i in range(3) if i != prev])
            prev = tone
            for dx in (0., -8.):
                a, b = x + dx, x + length + dx
                if b > -4.05 and a < 4.05:
                    plank(a, b, y0, y0 + width, tone)
            x += length
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    planks = U.link(k, 'Planks', bm, tones + [seam], recalc=False)
    parts = [planks]
    base = k.mat('FloorBase', U.WOOD_SEAM, SATIN)
    # Knots: a few darker ovals so close-ups read as wood.
    for i in range(10):
        x = rnd.uniform(-3.6, 3.6)
        row = rnd.randrange(rows)
        y = FLOOR_FRONT + (row + .5) * width + rnd.uniform(-.04, .04)
        parts.append(U.disc(k, 'Knot', U.circle(1, 10), .0015, base, dome=.003, rings=2))
        parts[-1].scale = (rnd.uniform(.05, .09), rnd.uniform(.025, .035), 1)
        parts[-1].location = (x, y, 0)
    # The diorama base: a chunky rounded lip at the front, flat under the planks.
    prof = U.rounded_rect(FLOOR_FRONT - .02, WALL_Y + .1, -.2, -dz + .001, .06, 3,
                          corners=(True, False, False, True))
    parts.append(U.rail(k, 'Base', prof, -4.2, 4.2, base))
    floor = k.join('home_floor', parts, pivot=(0, 0, 0))
    U.clip_x(floor)
    floor['tile'] = 8.0
    floor['height'] = 0.0
    k.paint([floor], lo=-.2, hi=0., shade=.8)
    return floor


# ----------------------------------------------------------------------------- walls
def _wall_mats(k):
    m = dict(paper=k.mat('Paper', U.CREAM_WARM, SATIN), stripe=k.mat('Stripe', U.CORAL_SOFT, SATIN),
             teal=k.mat('Wainscot', 'teal', SATIN), trim=k.mat('Trim', 'white', SATIN),
             dot=k.mat('Marigold', 'marigold', GLOSS))
    m['panel'] = m['teal']
    return m


def _core(k, m, hole=None):
    """Wall body, optionally with a rectangular opening (x0, x1, z0, z1)."""
    y0, y1 = WALL_Y, WALL_Y + WALL_T
    if hole is None:
        return [U.rail(k, 'Core', [(y0, 0), (y1, 0), (y1, WALL_H), (y0, WALL_H)], -4.3, 4.3, m['paper'])]
    x0, x1, z0, z1 = hole
    parts = [U.rail(k, 'Core', [(y0, 0), (y1, 0), (y1, WALL_H), (y0, WALL_H)], -4.3, x0, m['paper']),
             U.rail(k, 'Core', [(y0, 0), (y1, 0), (y1, WALL_H), (y0, WALL_H)], x1, 4.3, m['paper']),
             U.rail(k, 'Core', [(y0, z1), (y1, z1), (y1, WALL_H), (y0, WALL_H)], x0, x1, m['paper'])]
    if z0 > 0:
        parts.append(U.rail(k, 'Core', [(y0, 0), (y1, 0), (y1, z0), (y0, z0)], x0, x1, m['paper']))
    return parts


def _spans(gaps):
    """X spans of -4.3..4.3 minus the given (x0, x1) gaps."""
    spans, x = [], -4.3
    for g0, g1 in sorted(gaps):
        if g0 > x:
            spans.append((x, g0))
        x = max(x, g1)
    if x < 4.3:
        spans.append((x, 4.3))
    return spans


def _trims(k, m, gaps_low=(), gaps_high=()):
    """Skirting, wainscot, chair rail (interrupted by gaps_low) and crown (by gaps_high)."""
    parts = []
    y = WALL_Y
    skirting = U.rounded_rect(y - .05, y + .01, 0, .17, .035, 3, corners=(False, False, False, True))
    board = [(y - .012, .15), (y + .01, .15), (y + .01, 1.0), (y - .012, 1.0)]
    chair = U.rounded_rect(y - .055, y + .01, .97, 1.08, .03, 3, corners=(True, False, False, True))
    chair_bead = U.rounded_rect(y - .03, y + .01, .94, .975, .016, 2, corners=(True, False, False, True))
    for x0, x1 in _spans(gaps_low):
        parts.append(U.rail(k, 'Skirting', skirting, x0, x1, m['trim']))
        parts.append(U.rail(k, 'Wainscot', board, x0, x1, m['teal']))
        parts.append(U.rail(k, 'ChairRail', chair, x0, x1, m['trim']))
        parts.append(U.rail(k, 'ChairBead', chair_bead, x0, x1, m['trim']))
    crown = U.rounded_rect(y - .09, y + .01, 3.2, WALL_H, .07, 3, corners=(True, False, False, False))
    crown_cap = U.rounded_rect(y - .11, y + .01, WALL_H - .06, WALL_H, .025, 2, corners=(True, False, False, True))
    crown_step = U.rounded_rect(y - .04, y + .01, 3.13, 3.2, .02, 2, corners=(True, False, False, True))
    bead = U.rounded_rect(y - .025, y + .01, 3.075, 3.115, .018, 2, corners=(True, False, False, True))
    for x0, x1 in _spans(gaps_high):
        parts.append(U.rail(k, 'Crown', crown, x0, x1, m['trim']))
        parts.append(U.rail(k, 'CrownCap', crown_cap, x0, x1, m['trim']))
        parts.append(U.rail(k, 'CrownStep', crown_step, x0, x1, m['trim']))
        parts.append(U.rail(k, 'Bead', bead, x0, x1, m['stripe']))
    return parts


def _panels(k, m, skip=()):
    parts = []
    for i, xc in enumerate((-3.2, -1.6, 0., 1.6, 3.2)):
        if any(a < xc + .7 and b > xc - .7 for a, b in skip):
            continue
        parts.append(k.box('Panel', (xc, WALL_Y - .026, .575), (1.28, .032, .6), m['panel'], bevel=.022, segments=2))
        parts.append(k.box('Inset', (xc, WALL_Y - .044, .575), (1.0, .02, .36), m['teal'], bevel=.012, segments=1))
    return parts


def _paper(k, m, skip=None):
    """Raised coral stripes with cream stars; marigold dots on the cream gaps.

    `skip(x0, x1, z0, z1)` returns True for areas hidden by windows or doors.
    """
    parts = []
    z_lo, z_hi = 1.08, 3.075
    star = U.star(.062, .03, 5)
    dot = U.circle(.032, 6)
    for i in range(16):
        xc = -3.75 + i * .5
        runs = [(z_lo, z_hi)]
        if skip and skip(xc - .15, xc + .15, z_lo, z_hi):
            runs = [(a, b) for a, b in skip.free(xc - .15, xc + .15) if b - a > .12] if hasattr(skip, 'free') else []
        for a, b in runs:
            parts.append(k.box('Stripe', (xc, WALL_Y - .004, (a + b) / 2), (.3, .012, b - a), m['stripe'],
                               bevel=0))
            for j in range(5):
                z = 1.36 + j * .42 + (.21 if i % 2 else 0)
                if a + .08 < z < b - .08 and z < 2.98:
                    parts.append(U.relief(k, 'Star', star, .016, m['trim'], loc=(xc, WALL_Y - .01, z),
                                          rot=(0, (i * 7 + j * 3) % 5 * .12, 0), rings=1))
    for i in range(17):
        xg = -4. + i * .5
        for xc in U.wrap_copies([xg], margin=.05):
            for j in range(5):
                z = 1.36 + j * .42 + (0 if i % 2 else .21)
                if z > 2.98:
                    continue
                if skip and skip(xc - .05, xc + .05, z - .05, z + .05):
                    continue
                parts.append(U.relief(k, 'Dot', dot, .014, m['dot'], loc=(xc, WALL_Y - .002, z), rings=1))
    return parts


class _Hole:
    """Rectangles hidden by openings; answers overlap queries and the free vertical runs."""

    def __init__(self, rects):
        self.rects = rects

    def __call__(self, x0, x1, z0, z1):
        return any(x0 < b and x1 > a and z0 < d and z1 > c for a, b, c, d in self.rects)

    def free(self, x0, x1, z_lo=1.08, z_hi=3.075):
        blocked = sorted((c, d) for a, b, c, d in self.rects if x0 < b and x1 > a)
        runs, z = [], z_lo
        for c, d in blocked:
            if c > z:
                runs.append((z, min(c, z_hi)))
            z = max(z, d)
        if z < z_hi:
            runs.append((z, z_hi))
        return runs


def build_wall(k, kind='plain'):
    m = _wall_mats(k)
    parts = []
    if kind == 'plain':
        parts += _core(k, m)
        parts += _trims(k, m)
        parts += _panels(k, m)
        parts += _paper(k, m)
    elif kind == 'window':
        parts += _window(k, m)
    elif kind == 'door':
        parts += _door(k, m)
    wall = k.join('home_wall' if kind == 'plain' else 'home_wall_' + kind, parts, pivot=(0, 0, 0))
    U.clip_x(wall)
    wall['tile'] = 8.0
    wall['height'] = WALL_H
    wall['front'] = WALL_Y
    k.paint([wall], lo=0, hi=WALL_H, shade=.72)
    return wall


def _window(k, m):
    m['curtain'] = k.mat('Curtain', 'coral', SATIN)
    m['glass'] = k.mat('Window', '#8fd8ff', .12)
    m['leaf'] = k.mat('Leaf', 'leaf', SATIN)
    x0, x1, z0, z1 = -1.0, 1.0, 1.25, 2.8
    y = WALL_Y
    parts = _core(k, m, (x0, x1, z0, z1))
    parts += _trims(k, m)
    parts += _panels(k, m)
    hide = _Hole([(-1.75, 1.75, 1.0, 3.2)])
    parts += _paper(k, m, hide)
    # Reveal lining, glass and glazing bars.
    parts.append(k.box('Jamb', (x0 + .03, y + .15, (z0 + z1) / 2), (.06, .3, z1 - z0), m['trim'], bevel=.01, segments=1))
    parts.append(k.box('Jamb', (x1 - .03, y + .15, (z0 + z1) / 2), (.06, .3, z1 - z0), m['trim'], bevel=.01, segments=1))
    parts.append(k.box('Head', (0, y + .15, z1 - .03), (x1 - x0, .3, .06), m['trim'], bevel=.01, segments=1))
    parts.append(k.box('Glass', (0, y + .17, (z0 + z1) / 2), (x1 - x0, .02, z1 - z0), m['glass'], bevel=0))
    parts.append(k.box('BarV', (0, y + .13, (z0 + z1) / 2), (.07, .07, z1 - z0), m['trim'], bevel=.02, segments=2))
    parts.append(k.box('BarH', (0, y + .13, 2.08), (x1 - x0, .07, .07), m['trim'], bevel=.02, segments=2))
    # Chunky casing proud of the wall, with a little cornice.
    for s in (-1, 1):
        parts.append(k.box('Casing', (s * (x1 + .07), y - .035, (z0 + z1) / 2 + .04), (.16, .08, z1 - z0 + .2),
                           m['trim'], bevel=.025, segments=2))
    parts.append(k.box('CasingTop', (0, y - .035, z1 + .1), (x1 - x0 + .34, .08, .16), m['trim'], bevel=.025, segments=2))
    parts.append(k.box('Cornice', (0, y - .06, z1 + .2), (x1 - x0 + .46, .13, .06), m['trim'], bevel=.025, segments=1))
    parts.append(k.box('Sill', (0, y - .095, z0 - .03), (x1 - x0 + .5, .25, .075), m['trim'], bevel=.03, segments=2))
    parts.append(k.box('Apron', (0, y - .025, z0 - .12), (x1 - x0 + .1, .06, .12), m['trim'], bevel=.02, segments=1))
    # Scalloped valance and coral curtains gathered with marigold tie-backs.
    parts += _valance(k, m, -1.66, 1.66, 3.08, y - .24)
    for s in (-1, 1):
        parts.append(_curtain(k, m['curtain'], s, y - .15))
        tie = k.torus('TieBack', (s * 1.46, y - .15, 1.88), .18, .03, m['dot'], major_seg=12, minor_seg=4)
        tie.scale = (1, .55, 1)
        parts.append(tie)
        parts.append(k.ball('TieKnot', (s * 1.33, y - .25, 1.88), .05, m['dot'], 8, 5))
    # Sill dressing: a pot plant and a little striped lighthouse.
    parts += _sill_plant(k, m, .55, y - .1, z0 + .01)
    parts += _toy_lighthouse(k, m, -.55, y - .1, z0 + .01)
    # Sun-catcher star hanging in the glass.
    parts.append(k.cyl('String', (-.45, y + .09, 2.62), .006, .36, m['trim'], vertices=6, bevel=0))
    parts.append(U.puff(k, 'Catcher', U.star(.1, .05, 5), .05, m['dot'], rings=2, loc=(-.45, y + .09, 2.4)))
    return parts


def _valance(k, m, x0, x1, z_top, y):
    n = 7
    w = (x1 - x0) / n
    pts = [(x0, z_top + .12)]
    pts.append((x0, z_top - .2))
    for i in range(n):
        a = x0 + i * w
        for j in range(1, 5):
            t = j / 4
            pts.append((a + w * t, z_top - .2 - math.sin(t * math.pi) * .07))
    pts.append((x1, z_top + .12))
    pts = pts[::-1] if U._area(pts) < 0 else pts
    parts = [k.prism('Valance', pts, .1, m['curtain'], loc=(0, y, 0), bevel=.015, segments=1)]
    parts.append(k.box('ValanceTop', ((x0 + x1) / 2, y + .1, z_top + .15), (x1 - x0 + .08, .34, .05), m['trim'],
                       bevel=.015, segments=1))
    parts.append(k.box('ValanceTrim', ((x0 + x1) / 2, y - .055, z_top + .08), (x1 - x0 + .04, .04, .05), m['dot'],
                       bevel=.015, segments=1))
    return parts


def _curtain(k, mat, side, y):
    """A gathered curtain: wavy cross-sections lofted from the rod down to the sill."""
    levels = [(3.02, 1.0), (2.6, .92), (2.2, .66), (1.95, .4), (1.8, .44), (1.55, .62), (1.3, .74)]
    x_out = side * 1.62
    loops = []
    folds, n = 4, 10
    for z, frac in levels:
        w = .78 * frac
        # Gathered toward the outer edge, as a tie-back pulls it.
        xa = x_out - side * w
        front, back = [], []
        for i in range(n + 1):
            t = i / n
            x = xa + (x_out - xa) * t
            wave = math.sin(t * folds * math.pi) * (.035 + .03 * (1 - frac))
            front.append((x, y - .02 + wave, z))
            back.append((x, y + .02 + wave, z))
        loops.append(front + back[::-1])
    return U.loft(k, 'Curtain', loops, mat)


def _sill_plant(k, m, x, y, z):
    pot = k.lathe('Pot', [(.0, z), (.075, z), (.1, z + .13), (.115, z + .14), (.115, z + .17), (.0, z + .17)],
                  m['dot'], loc=(x, y, 0), segments=10)
    parts = [pot]
    rnd = random.Random(3)
    for i in range(6):
        a = i * math.tau / 6 + .3
        parts.append(k.ball('Leaf', (x + math.cos(a) * .07, y + math.sin(a) * .05, z + .24 + (i % 2) * .05),
                            (.075, .06, .06), m['leaf'], 7, 5))
    parts.append(k.ball('Leaf', (x, y, z + .32), .08, m['leaf'], 8, 5))
    for dx, dz in ((-.05, .36), (.06, .31)):
        parts.append(k.ball('Bloom', (x + dx, y - .06, z + dz), .035, m['curtain'], 6, 4))
    return parts


def _toy_lighthouse(k, m, x, y, z):
    parts = [k.cyl('Base', (x, y, z + .02), .08, .04, m['teal'], vertices=10, bevel=.012, segments=1)]
    for i in range(3):
        r0 = .06 - i * .008
        parts.append(k.cyl('Band', (x, y, z + .065 + i * .07), r0, .07, m['curtain'] if i % 2 == 0 else m['trim'],
                           vertices=10, bevel=0, radius2=r0 - .008))
    parts.append(k.cyl('Gallery', (x, y, z + .27), .055, .02, m['teal'], vertices=10, bevel=0))
    parts.append(k.cyl('Lantern', (x, y, z + .31), .034, .06, m['dot'], vertices=8, bevel=0))
    parts.append(k.cyl('Cap', (x, y, z + .36), .045, .05, m['curtain'], vertices=8, bevel=0, radius2=.005))
    return parts


def _door(k, m):
    m['door'] = m['dot']
    m['brass'] = k.mat('Brass', 'brass', .28, metal=.6)
    m['glass'] = k.mat('Window', '#8fd8ff', .12)
    m['wood'] = m['trim']
    x0, x1, zt = -.56, .56, 2.2
    y = WALL_Y
    parts = _core(k, m, (x0, x1, 0, zt))
    parts += _trims(k, m, gaps_low=[(-.72, .72)])
    parts += _panels(k, m, skip=[(-.8, .8)])
    parts += _paper(k, m, _Hole([(-.82, .82, 0, 2.47)]))
    # Jamb lining and the leaf, recessed into the wall.
    for s in (-1, 1):
        parts.append(k.box('Jamb', (s * (x1 - .025), y + .15, zt / 2), (.05, .3, zt), m['trim'], bevel=.01, segments=1))
    parts.append(k.box('JambHead', (0, y + .15, zt - .025), (x1 - x0, .3, .05), m['trim'], bevel=.01, segments=1))
    dy = y + .09
    parts.append(k.box('Leaf', (0, dy, (zt - .02) / 2 + .01), (x1 - x0 - .06, .07, zt - .04), m['door'], bevel=.025,
                       segments=2))
    for s in (-1, 1):
        parts.append(k.box('Panel', (s * .22, dy - .045, .62), (.34, .03, .66), m['door'], bevel=.02, segments=2))
    parts.append(k.box('Rail', (0, dy - .04, 1.12), (.86, .02, .06), m['door'], bevel=.008, segments=1))
    # Porthole window with a brass ring.
    parts.append(k.cyl('Porthole', (0, dy - .03, 1.62), .2, .03, m['glass'], axis='Y', vertices=20, bevel=0))
    parts.append(k.torus('Ring', (0, dy - .05, 1.62), .21, .04, m['brass'], rot=(math.pi / 2, 0, 0), major_seg=16,
                         minor_seg=5))
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        parts.append(k.ball('Rivet', (math.cos(a) * .21, dy - .09, 1.62 + math.sin(a) * .21), .016, m['brass'], 6, 4))
    # Knob, rosette, letter slot, kick plate and hinges.
    parts.append(k.cyl('Rosette', (.38, dy - .045, 1.0), .05, .02, m['brass'], axis='Y', vertices=14, bevel=.006,
                       segments=1))
    parts.append(k.cyl('Stem', (.38, dy - .07, 1.0), .018, .05, m['brass'], axis='Y', vertices=8, bevel=0))
    parts.append(k.ball('Knob', (.38, dy - .12, 1.0), .055, m['brass'], 10, 6))
    parts.append(k.box('Slot', (0, dy - .045, 1.25), (.3, .02, .07), m['brass'], bevel=.01, segments=1))
    parts.append(k.box('Kick', (0, dy - .04, .1), (.9, .015, .14), m['brass'], bevel=.006, segments=1))
    for z in (.35, 1.85):
        parts.append(k.cyl('Hinge', (x0 + .045, dy - .04, z), .018, .14, m['brass'], vertices=8, bevel=0))
    # Casing with a cornice and a honey threshold.
    for s in (-1, 1):
        parts.append(k.box('Casing', (s * (x1 + .08), y - .035, (zt + .1) / 2), (.16, .08, zt + .1), m['trim'],
                           bevel=.025, segments=2))
        parts.append(k.box('Plinth', (s * (x1 + .08), y - .045, .1), (.2, .1, .2), m['trim'], bevel=.02, segments=1))
    parts.append(k.box('Head', (0, y - .035, zt + .1), (x1 - x0 + .36, .08, .18), m['trim'], bevel=.025, segments=2))
    parts.append(k.box('Cornice', (0, y - .065, zt + .22), (x1 - x0 + .5, .14, .07), m['trim'], bevel=.025, segments=2))
    parts.append(U.relief(k, 'HeadStar', U.star(.075, .036, 5), .02, m['door'], loc=(0, y - .076, zt + .1)))
    parts.append(k.box('Threshold', (0, y - .02, .015), (x1 - x0 + .1, .16, .03), m['brass'], bevel=.01, segments=1))
    # Coat pegs with a marigold sou'wester and a little teal bucket bag.
    parts.append(k.box('PegRail', (1.45, y - .025, 1.72), (.8, .05, .12), m['trim'], bevel=.02, segments=2))
    for px in (1.18, 1.45, 1.72):
        parts.append(k.cyl('Peg', (px, y - .08, 1.7), .02, .09, m['brass'], axis='Y', vertices=8, bevel=0))
        parts.append(k.ball('PegEnd', (px, y - .125, 1.7), .03, m['brass'], 6, 4))
    # Sou'wester: domed crown with a brim that sweeps down at the back.
    parts.append(k.ball('HatCrown', (1.18, y - .15, 1.6), (.12, .1, .1), m['door'], 12, 6))
    brim = k.ball('HatBrim', (1.18, y - .15, 1.54), (.21, .17, .03), m['door'], 14, 5)
    brim.rotation_euler = (math.radians(-18), 0, 0)
    parts.append(brim)
    parts.append(k.torus('HatBand', (1.18, y - .15, 1.57), .115, .014, m['stripe'], major_seg=14, minor_seg=4))
    # A knitted coral scarf looped over the last peg, with fringe.
    for s, dz in ((-1, .0), (1, .06)):
        parts.append(k.box('Scarf', (1.72 + s * .045, y - .1, 1.43 + dz), (.09, .03, .5), m['stripe'], bevel=.014,
                           segments=1, rot=(0, s * .08, 0)))
        for i in range(3):
            parts.append(k.cyl('Fringe', (1.72 + s * .045 + s * .02 + (i - 1) * .026, y - .1, 1.15 + dz), .007, .07,
                               m['dot'], vertices=5, bevel=0))
        for zb in (1.4,):
            parts.append(k.box('ScarfBand', (1.72 + s * .045, y - .117, zb + dz), (.094, .01, .035), m['dot'],
                               bevel=.004, segments=1, rot=(0, s * .08, 0)))
    return parts


# ----------------------------------------------------------------------------- rug
def build_rug(k):
    """Round rag rug: a solid lathe whose top carries concentric colour bands."""
    sun = k.mat('RugSun', 'marigold', .62)
    cream = k.mat('RugCream', U.CREAM_WARM, .62)
    coral = k.mat('RugCoral', 'coral', .62)
    teal = k.mat('RugTeal', 'teal', .62)
    berry = k.mat('RugCoil', 'berry', .6)
    h = .016
    # (r, z) from the centre outward along the top, down the braided rim and back under.
    prof = [(0, h + .002), (.3, h), (.5, h), (.78, h), (.92, h), (1.1, h), (1.15, h + .003), (1.18, .011),
            (1.19, .005), (1.16, 0), (0, 0)]
    seg = [0, 1, 2, 1, 3, 3, 3, 3, 3, 3]
    parts = [U.lathe(k, 'Rug', prof, [sun, cream, coral, teal], seg, segments=56)]
    for r in (.3, .78):
        coil = k.torus('Coil', (0, 0, h), r, .013, berry, major_seg=56, minor_seg=5)
        coil.scale = (1, 1, .6)
        parts.append(coil)
    for r in (.5, .92):
        coil = k.torus('Coil', (0, 0, h), r, .01, cream if r > .6 else coral, major_seg=56, minor_seg=4)
        coil.scale = (1, 1, .6)
        parts.append(coil)
    # Tufted flower in the sun centre.
    for i in range(6):
        a = i * math.tau / 6
        parts.append(U.disc(k, 'Tuft', U.circle(.045, 8), h + .001, coral, loc=(math.cos(a) * .15, math.sin(a) * .15, 0),
                            dome=.006, rings=1))
    parts.append(U.disc(k, 'Tuft', U.circle(.07, 10), h + .002, berry, dome=.008, rings=1))
    rug = k.join('rug_round', parts, pivot=(0, 0, 0))
    rug['height'] = .026
    k.paint([rug], lo=0, hi=.03, shade=.85)
    return rug
