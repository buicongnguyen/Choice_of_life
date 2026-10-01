"""Tiny scatter: the little things along the verges (grass tufts, flowers, weeds, pebbles, shells,
starfish, fallen leaves, petals, gull feathers).

They are drawn hundreds at a time as instances (game/src/render/scatter.ts), so each is a
handful of flat-coloured parts and stays inside a small triangle budget (extras 'budget').
Origin on the ground at the object's centre; the runtime adds random yaw, scale and tint.
Leaves and petals are authored light so per-instance tints can push them warmer or paler.
"""
import math
import random

from _harbour_lib import GLOSS, MATTE, SATIN, ball, cyl, finish, rod, star

# Triangle budgets (on screen these are 6-30 px tall on a phone).
BUDGET = {'tiny_tuft': 60, 'tiny_flowers': 260, 'tiny_weeds': 160, 'tiny_pebbles': 160, 'tiny_shell': 90,
          'tiny_starfish': 130, 'tiny_leaf': 40, 'tiny_petals': 120, 'tiny_feather': 50}


def _blade(k, name, base, lean, height, mat, width=.022):
    """A three-sided tapering grass blade leaning out from `base`."""
    x, y = base
    tip = (x + math.cos(lean) * height * .35, y + math.sin(lean) * height * .35, height)
    o = rod(k, name, (x, y, 0), tip, width, mat, v=3)
    # A cone, not a rod: squeeze the top so the blade comes to a point.
    for v in o.data.vertices:
        if v.co.z > 0:
            v.co.x *= .12
            v.co.y *= .12
    return o


def tiny_tuft(k):
    """Five blades in two greens."""
    dark = k.mat('Grass', '#3fa34a', SATIN)
    light = k.mat('GrassLight', '#8fd35a', SATIN)
    rng = random.Random(11)
    parts = []
    for i in range(5):
        a = i / 5 * math.tau + rng.uniform(-.3, .3)
        r = rng.uniform(.01, .04)
        parts.append(_blade(k, 'Blade', (math.cos(a) * r, math.sin(a) * r), a, rng.uniform(.13, .2), dark if i % 2 else light))
    return finish(k, parts, 'tiny_tuft', paint=dict(shade=.7), budget=BUDGET['tiny_tuft'])


def _flower(k, at, height, petal, centre, stem):
    x, y = at
    parts = [rod(k, 'Stem', (x, y, 0), (x, y, height), .008, stem, v=4)]
    parts.append(cyl(k, 'Petals', (x, y, height), .042, .016, petal, v=6, bevel=0))
    parts.append(ball(k, 'Centre', (x, y, height + .01), .016, centre, 5, 3))
    return parts


def tiny_flowers(k):
    """Four little flowers on stems, in mixed colours, with two leaves."""
    stem = k.mat('Stem', '#3fa34a', SATIN)
    centre = k.mat('FlowerCentre', 'sun', GLOSS)
    petals = [k.mat('PetalPink', '#ff8fc4', SATIN), k.mat('PetalSun', '#ffd84a', SATIN),
              k.mat('PetalWhite', '#fffaf0', SATIN), k.mat('PetalLilac', '#b38cff', SATIN)]
    spots = [(-.06, .02, .17), (.05, .05, .13), (.01, -.06, .2), (.08, -.03, .1)]
    parts = []
    for (x, y, h), p in zip(spots, petals):
        parts += _flower(k, (x, y), h, p, centre, stem)
    for s in (-1, 1):
        parts.append(ball(k, 'Leaf', (s * .05, 0, .02), (.05, .018, .012), stem, 5, 3, rot=(0, 0, s * .6)))
    return finish(k, parts, 'tiny_flowers', paint=dict(shade=.75), budget=BUDGET['tiny_flowers'])


def tiny_weeds(k):
    """A dandelion rosette that grows between cobbles."""
    leaf = k.mat('Weed', '#4fb848', SATIN)
    head = k.mat('Dandelion', 'sun', SATIN)
    parts = []
    for i in range(5):
        a = i / 5 * math.tau
        parts.append(ball(k, 'Leaf', (math.cos(a) * .05, math.sin(a) * .05, .012), (.055, .016, .01), leaf, 5, 3,
                          rot=(0, 0, a)))
    parts.append(rod(k, 'Stalk', (0, 0, 0), (.01, 0, .12), .006, leaf, v=4))
    parts.append(ball(k, 'Head', (.01, 0, .13), (.032, .032, .022), head, 6, 4))
    return finish(k, parts, 'tiny_weeds', paint=dict(shade=.75), budget=BUDGET['tiny_weeds'])


def tiny_pebbles(k):
    """Three smooth pebbles."""
    mats = [k.mat('Pebble', '#c9c2d6', MATTE), k.mat('PebbleWarm', '#d8c3a5', MATTE),
            k.mat('PebbleDark', '#8f88a3', MATTE)]
    spots = [(0, 0, .06, .045), (.08, .03, .04, .03), (-.05, .06, .035, .028)]
    parts = [ball(k, 'Pebble', (x, y, h * .45), (r * 1.3, r, h * .5), m, 7, 4) for (x, y, r, h), m in zip(spots, mats)]
    return finish(k, parts, 'tiny_pebbles', paint=dict(shade=.65), budget=BUDGET['tiny_pebbles'])


def tiny_shell(k):
    """A scallop shell: a ribbed fan with a little hinge."""
    shell = k.mat('Shell', '#ffd6c2', GLOSS)
    rib = k.mat('ShellRib', '#ff9f8a', GLOSS)
    fan = cyl(k, 'Fan', (0, 0, .012), .07, .024, shell, v=7, bevel=0, r2=.012)
    fan.scale = (1, .8, .6)
    parts = [fan, cyl(k, 'Hinge', (0, -.055, .006), .02, .012, rib, v=4, bevel=0)]
    for i in range(3):
        a = -.6 + i * .6
        parts.append(rod(k, 'Rib', (0, -.03, .02), (math.sin(a) * .06, math.cos(a) * .045, .012), .005, rib, v=3))
    return finish(k, parts, 'tiny_shell', paint=dict(shade=.8), budget=BUDGET['tiny_shell'])


def tiny_starfish(k):
    """A chunky five-armed starfish lying flat."""
    body = k.mat('Starfish', '#ff8a4c', SATIN)
    dots = k.mat('StarfishDot', '#ffd8a8', SATIN)
    s = k.prism('Star', star(.085, .035), .022, body, axis='Y', bevel=0, rot=(math.pi / 2, 0, 0), loc=(0, 0, .011))
    parts = [s] + [ball(k, 'Dot', (math.cos(a) * .045, math.sin(a) * .045, .022), .008, dots, 4, 3)
                   for a in [math.pi / 2 + i * math.tau / 5 for i in range(5)]]
    return finish(k, parts, 'tiny_starfish', paint=dict(shade=.8), budget=BUDGET['tiny_starfish'])


def _leaf_outline(length, width, n=4):
    """A pointed oval, as (x, z) pairs for prism()."""
    left = [(-math.sin(i / n * math.pi) * width, -length / 2 + i / n * length) for i in range(n + 1)]
    right = [(math.sin(i / n * math.pi) * width, length / 2 - i / n * length) for i in range(1, n)]
    return left + right


def tiny_leaf(k):
    """A fallen leaf with a midrib (tinted per instance: orange, red, gold)."""
    leaf = k.mat('FallenLeaf', '#ffc27a', SATIN)
    vein = k.mat('LeafVein', '#c9824a', SATIN)
    parts = [k.prism('Leaf', _leaf_outline(.13, .045), .008, leaf, axis='Y', bevel=0, rot=(math.pi / 2, 0, 0),
                     loc=(0, 0, .006)),
             rod(k, 'Vein', (0, -.075, .011), (0, .06, .011), .004, vein, v=3)]
    return finish(k, parts, 'tiny_leaf', paint=dict(shade=.85), budget=BUDGET['tiny_leaf'])


def tiny_petals(k):
    """A few fallen blossom petals (festival bunting rains them down)."""
    petal = k.mat('FallenPetal', '#ffd0e6', SATIN)
    rng = random.Random(5)
    parts = []
    for i in range(4):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(.02, .09)
        parts.append(ball(k, 'Petal', (math.cos(a) * r, math.sin(a) * r, .006), (.026, .017, .005), petal, 6, 3,
                          rot=(0, 0, rng.uniform(0, math.pi))))
    return finish(k, parts, 'tiny_petals', paint=dict(shade=.85), budget=BUDGET['tiny_petals'])


def tiny_feather(k):
    """A gull's feather: white with a grey tip."""
    white = k.mat('Feather', 'white', SATIN)
    grey = k.mat('FeatherTip', '#aab4cc', SATIN)
    parts = [k.prism('Vane', _leaf_outline(.12, .022, 3), .006, white, axis='Y', bevel=0, rot=(math.pi / 2, 0, 0),
                     loc=(0, 0, .005)),
             k.prism('Tip', _leaf_outline(.04, .016, 2), .007, grey, axis='Y', bevel=0, rot=(math.pi / 2, 0, 0),
                     loc=(0, .045, .006)),
             rod(k, 'Quill', (0, -.085, .008), (0, .05, .008), .003, grey, v=3)]
    return finish(k, parts, 'tiny_feather', paint=dict(shade=.9), budget=BUDGET['tiny_feather'])


def registry():
    return {name: ('tiny', globals()[name]) for name in BUDGET}
