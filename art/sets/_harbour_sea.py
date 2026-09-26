"""Marigold Bay waterfront and landscape: coast tiles, seawall, pier, boats, the lighthouse, the headland and hills.

Tiles span exactly X -4..4 (seamless) over the Y band they cover. Boats float with their waterline
at Z = 0 (root extra 'draft'). The lighthouse is the hero landmark (root extra 'light_z').
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import _harbour_lib as L
from _harbour_lib import FRONT, GLOSS, MATTE, SATIN, box, cyl, ball, rod


# ============================================================================ coast tiles
def road_tile(k):
    """Coast road: violet asphalt, marigold bike-lane stripe, white dashes, back kerb, sandy verge."""
    asphalt = k.mat('Asphalt', '#4a4466', MATTE)
    patch = k.mat('Asphalt2', '#57507a', MATTE)
    paint = k.mat('Paint', 'white', SATIN)
    stripe = k.mat('BikeLine', 'marigold', SATIN)
    kerb = k.mat('Kerb', '#fff4e2', SATIN)
    sand = k.mat('Sand', 'sand', MATTE)
    grass = k.mat('Grass', 'grass', SATIN)
    pebble = k.mat('Pebble', '#b8a7cf', MATTE)
    parts = [box(k, 'Asphalt', (0, 0, -.1), (8, 6.0, .2), asphalt, 0)]
    # Worn patches and a tar seam for texture (kept inside the tile).
    for x, y, w, d in ((-2.2, 1.6, 1.6, .9), (2.4, -.4, 1.1, .7), (.6, 2.3, .9, .5)):
        parts.append(k.prism('Patch', L.rounded([(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)], .2, 2),
                             .01, patch, loc=(x, y, .002), axis='Y', bevel=0, rot=(math.pi / 2, 0, 0)))
    parts.append(box(k, 'EdgeLine', (0, -2.78, .005), (8, .14, .012), paint, 0))
    parts.append(box(k, 'BikeLine', (0, -.95, .005), (8, .16, .012), stripe, 0))
    for x in (-2, 2):
        parts.append(box(k, 'Dash', (x, .95, .005), (2.0, .13, .012), paint, 0))
    for x in (-3, -1, 1, 3):
        parts.append(box(k, 'Stud', (x, -.95, .02), (.12, .08, .04), paint, .015, 1))
    # Bike pictogram painted in the front lane.
    bx, by = -1.2, -1.9
    for s in (-1, 1):
        parts.append(k.torus('PictoWheel', (bx + s * .38, by, .008), .24, .035, paint, major_seg=14, minor_seg=3))
        parts[-1].scale = (1, 1, .25)
    for a, b in (((-.38, 0), (-.05, .02)), ((-.05, .02), (.2, .22)), ((-.2, .25), (.25, .25)), ((.2, .22), (.38, 0)),
                 ((-.05, .02), (-.16, .24))):
        parts.append(rod(k, 'PictoBar', (bx + a[0], by + a[1] * .9, .01), (bx + b[0], by + b[1] * .9, .01), .03, paint, 4))
    # Back kerb and grass verge (the guardrail stands here).
    for i in range(8):
        parts.append(box(k, 'Kerb', (-3.5 + i, 3.08, .05), (.985, .3, .3), kerb, .05, 2))
    parts.append(box(k, 'Verge', (0, 3.37, .02), (8, .3, .2), grass, 0))
    # Low front edge and sandy verge with pebbles and tufts.
    for i in range(4):
        parts.append(box(k, 'Edge', (-3 + i * 2, -3.06, -.02), (1.98, .16, .1), kerb, .03, 1))
    parts.append(box(k, 'SandBed', (0, -4.6, -.14), (8, 2.8, .2), sand, 0))
    rng = random.Random(14)
    bm = bmesh.new()
    for i in range(9):
        x = -3.6 + i * .9 + rng.uniform(-.2, .2)
        y = rng.uniform(-5.7, -3.5)
        w = rng.uniform(.7, 1.6)
        L.add_pillow(bm, Matrix.Translation((x, y, -.06)), w, w * rng.uniform(.5, .8), rng.uniform(.08, .14), 0,
                     inset=.3, corner=.45, crown=.55, corner_seg=2)
    dunes = L.mesh_object(k, 'Dunes', bm, [sand])
    L.clip_x(dunes)
    parts.append(dunes)
    for i in range(7):
        parts.append(ball(k, 'Pebble', (rng.uniform(-3.8, 3.8), rng.uniform(-5.8, -3.4), -.02),
                          (rng.uniform(.06, .12), rng.uniform(.05, .09), .05), pebble, 6, 4))
    for i in range(3):
        cx, cy = -3 + i * 3 + rng.uniform(-.4, .4), rng.uniform(-5.4, -3.6)
        for j in range(5):
            a = j / 5 * math.tau
            tip = (cx + math.cos(a) * .12, cy + math.sin(a) * .08, .3 + rng.uniform(0, .12))
            parts.append(k.cyl('Tuft', (0, 0, 0), .035, 1, grass, vertices=4, bevel=0, radius2=.004))
            o = parts[-1]
            d = Vector(tip) - Vector((cx, cy, -.02))
            o.scale = (1, .5, d.length)
            o.location = (Vector(tip) + Vector((cx, cy, -.02))) / 2
            o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    obj = L.finish(k, parts, 'road_tile', paint=dict(lo=-.3, hi=.3, shade=.74), sharp=65)
    obj['tile'] = 8.
    obj['surface'] = 0.
    return obj


def boardwalk_tile(k):
    """Promenade boardwalk: planks running across the walk in three warm woods, fascia beam on posts, sand below."""
    tones = [k.mat('Plank', '#dd9a57', SATIN), k.mat('Plank2', '#c9803f', SATIN), k.mat('Plank3', '#e9b06a', SATIN)]
    beam = k.mat('Beam', 'wood_dark', SATIN)
    sand = k.mat('Sand', 'sand', MATTE)
    nail = k.mat('Nail', '#6b5a7a', GLOSS)
    shell = k.mat('Shell', 'pink', GLOSS)
    rng = random.Random(4)
    parts = []
    y0, y1 = -4.2, 3.5
    n = 20
    pw = 8 / n
    for i in range(n):
        x = -4 + pw * (i + .5)
        parts.append(box(k, 'Plank', (x, (y0 + y1) / 2, -.05), (pw - .035, y1 - y0 - .02, .1), rng.choice(tones), .025,
                         1))
        for yy in (-3.6, -.3, 2.9):
            parts.append(box(k, 'Nail', (x, yy, .003), (.05, .05, .01), nail, 0))
    parts.append(box(k, 'Fascia', (0, y0 - .06, -.16), (8, .12, .3), beam, 0))
    parts.append(box(k, 'Joist', (0, y0 + .3, -.2), (8, .2, .2), beam, 0))
    for x in (-3, -1, 1, 3):
        parts.append(box(k, 'Post', (x, y0 + .05, -.55), (.18, .18, .9), beam, .03, 1))
    parts.append(box(k, 'SandBed', (0, -5.1, -.62), (8, 1.9, .2), sand, 0))
    bm = bmesh.new()
    for i in range(8):
        x = -3.5 + i + rng.uniform(-.2, .2)
        L.add_pillow(bm, Matrix.Translation((x, rng.uniform(-5.7, -4.9), -.54)), rng.uniform(.8, 1.4),
                     rng.uniform(.4, .7), rng.uniform(.08, .16), 0, inset=.2, crown=.5)
    dunes = L.mesh_object(k, 'Dunes', bm, [sand])
    L.clip_x(dunes)
    parts.append(dunes)
    for i in range(3):
        x, y = rng.uniform(-3.5, 3.5), rng.uniform(-5.8, -4.8)
        parts.append(k.lathe('Shell', [(.09, 0), (.07, .04), (0, .06)], shell, loc=(x, y, -.5), segments=6))
    obj = L.finish(k, parts, 'boardwalk_tile', paint=dict(lo=-.9, hi=.1, shade=.7), sharp=60)
    obj['tile'] = 8.
    obj['surface'] = 0.
    return obj


def cliff_path_tile(k):
    """Grassy cliff-top path: a dirt track across the lanes, wildflowers at the edges, rocks on the sea edge."""
    grass = k.mat('Grass', '#63c43d', SATIN)
    grass2 = k.mat('Grass2', '#4fae35', SATIN)
    dirt = k.mat('Dirt', '#d9955a', MATTE)
    dirt2 = k.mat('Dirt2', '#c07a45', MATTE)
    rock = k.mat('Rock', '#a597c4', MATTE)
    blooms = [k.mat('Flower', 'sun', GLOSS), k.mat('Flower2', 'berry', GLOSS)]
    rng = random.Random(31)
    parts = [box(k, 'Ground', (0, -1.25, -.3), (8, 9.5, .6), grass, 0)]

    def edge(y, amp, phase):
        return [(x, y + amp * math.sin((x + 4) / 8 * math.tau * 2 + phase) + amp * .5 * math.sin((x + 4) / 8 * math.tau * 3))
                for x in [-4 + i * .5 for i in range(17)]]
    front = edge(-2.75, .12, .4)
    back = edge(2.7, .1, 1.3)
    outline = front + list(reversed(back))
    parts.append(k.prism('Track', outline, .03, dirt, loc=(0, 0, .0), axis='Y', bevel=0, rot=(math.pi / 2, 0, 0)))
    # Worn wheel ruts and stones on the track.
    for y in (-1.2, 1.1):
        parts.append(box(k, 'Rut', (0, y, .02), (8, .45, .01), dirt2, 0))
    bm = bmesh.new()
    for i in range(14):
        x = rng.uniform(-3.9, 3.9)
        y = rng.uniform(-2.4, 2.4)
        s = rng.uniform(.1, .2)
        L.add_pillow(bm, Matrix.Translation((x, y, .01)) @ Matrix.Rotation(rng.uniform(0, 3), 4, 'Z'), s * 1.3, s,
                     s * .45, 0, inset=.03, crown=.5)
    stones = L.mesh_object(k, 'Stones', bm, [rock])
    parts.append(stones)
    # Soft grass mounds (seamless) and lighter clover patches for tone variation.
    bm = bmesh.new()
    for band_y, n in ((-4.5, 5), (-5.6, 4), (3.1, 4)):
        for i in range(n):
            x = -4 + 8 * (i + rng.uniform(.1, .9)) / n
            w = rng.uniform(1.0, 1.7)
            L.add_pillow(bm, Matrix.Translation((x, band_y + rng.uniform(-.3, .3), -.02)), w, w * rng.uniform(.5, .7),
                         rng.uniform(.12, .2), 0, inset=.3, corner=.45, crown=.55, corner_seg=2)
    mounds = L.mesh_object(k, 'Mounds', bm, [grass2])
    L.clip_x(mounds)
    parts.append(mounds)
    clover = k.mat('Clover', '#9be05a', SATIN)
    for i in range(7):
        x, y = rng.uniform(-3.6, 3.6), rng.choice((rng.uniform(-5.6, -3.3), rng.uniform(2.95, 3.3)))
        parts.append(cyl(k, 'Clover', (x, y, .005), rng.uniform(.25, .45), .02, clover, v=10, bevel=0))
    # Tussocks and wildflowers along both edges.
    for band_y, n in ((-3.55, 7), (-4.9, 5), (3.15, 7)):
        for i in range(n):
            x = -3.6 + (7.2 * i / (n - 1)) + rng.uniform(-.25, .25)
            y = band_y + rng.uniform(-.25, .25)
            parts.append(ball(k, 'Tussock', (x, y, .02), (.3, .24, .2), grass2, 8, 5))
            for j in range(3):
                a = rng.uniform(0, math.tau)
                h = .22 + rng.uniform(0, .14)
                p = (x + math.cos(a) * .2, y + math.sin(a) * .15)
                if j == 0:
                    parts.append(rod(k, 'Stem', (p[0], p[1], .05), (p[0], p[1], h), .012, grass2, 4))
                parts.append(ball(k, 'Bloom', (p[0], p[1], h), (.08, .08, .045), blooms[(i + j) % 2], 6, 3))
    # Sea-edge rocks along the back (seamless).
    bm = bmesh.new()
    x = -4.4
    while x < 4.4:
        w = rng.uniform(.6, 1.1)
        L.add_pillow(bm, Matrix.Translation((x + w / 2, 3.45, -.35)), w, .5, rng.uniform(.35, .55), 0, inset=.12, crown=.5)
        x += w
    edge_rocks = L.mesh_object(k, 'EdgeRocks', bm, [rock])
    L.clip_x(edge_rocks)
    parts.append(edge_rocks)
    obj = L.finish(k, parts, 'cliff_path_tile', paint=dict(lo=-.6, hi=.3, shade=.72), sharp=70)
    obj['tile'] = 8.
    obj['surface'] = 0.
    return obj


def guardrail(k):
    """Coastal guardrail for the back edge: white posts with coral reflectors and a steel W-beam rail."""
    white = k.mat('Post', 'white', GLOSS)
    steel = k.mat('Rail', '#dfe8f2', .28, metal=.3)
    groove = k.mat('Groove', '#9fb3c8', .3, metal=.3)
    red = k.mat('Reflector', 'coral', .2)
    base = k.mat('Base', '#c8b8dc', MATTE)
    y = FRONT - .2
    parts = []
    for x in (-3, -1, 1, 3):
        parts.append(box(k, 'Post', (x, y + .1, .45), (.14, .14, .9), white, .03, 1))
        parts.append(box(k, 'Cap', (x, y + .1, .92), (.18, .18, .05), white, .02, 1))
        parts.append(box(k, 'Reflector', (x, y + .02, .82), (.09, .02, .12), red, 0))
        parts.append(box(k, 'Foot', (x, y + .1, .03), (.3, .3, .06), base, .02, 1))
        parts.append(box(k, 'Spacer', (x, y - .02, .62), (.1, .12, .16), white, .02, 1))
    parts.append(box(k, 'Beam', (0, y - .1, .62), (8, .08, .34), steel, 0))
    for z in (.55, .69):
        parts.append(box(k, 'Groove', (0, y - .145, z), (8, .02, .05), groove, 0))
    parts.append(box(k, 'Lip', (0, y - .12, .8), (8, .12, .03), steel, 0))
    obj = L.finish(k, parts, 'guardrail', front=y - .15)
    return obj


# ============================================================================ seawall and pier
def seawall(k):
    """Stone seawall at the back edge: pillow-stone courses in three stone tones, chunky cream capstones,
    mooring rings and a band of seaweed."""
    tones = [k.mat('Stone', '#b6a4d4', MATTE), k.mat('Stone2', '#d9b08a', MATTE), k.mat('Stone3', '#9c8cc0', MATTE)]
    cap = k.mat('Capstone', '#fff1d6', MATTE)
    mortar = k.mat('Mortar', '#6d5f86', MATTE)
    iron = k.mat('Iron', '#34323f', GLOSS)
    weed = k.mat('Seaweed', '#2f9a6a', SATIN)
    rng = random.Random(12)
    y0, depth, H = FRONT, .9, 1.2
    parts = [box(k, 'Core', (0, y0 + depth / 2 + .02, H / 2 - .1), (8, depth, H - .2), mortar, 0)]
    bm = bmesh.new()
    rows = 3
    rh = (H - .25) / rows
    for r in range(rows):
        z = .02 + rh * (r + .5)
        for a, b in L.periodic(L.wrap_rows(rng, -4, 4, .6, 1.05)):
            w = b - a - .06
            L.add_pillow(bm, L.stone_face((a + b) / 2, y0 + .06, z), w, rh - .06, rng.uniform(.1, .15),
                         rng.choice((0, 0, 1, 2)), inset=.07, crown=.4)
    face = L.mesh_object(k, 'Face', bm, tones)
    L.clip_x(face)
    parts.append(face)
    for i in range(4):
        parts.append(box(k, 'Capstone', (-3 + i * 2, y0 + depth / 2 - .05, H - .08), (1.97, depth + .25, .28), cap, .07, 2))
    for x in (-2, 2):
        parts.append(box(k, 'RingPlate', (x, y0 - .07, .7), (.16, .04, .16), iron, .02, 1))
        parts.append(k.torus('Ring', (x, y0 - .12, .56), .13, .025, iron, rot=(math.pi / 2, 0, 0), major_seg=12,
                             minor_seg=4))
    for i in range(10):
        x = -3.8 + i * .82 + rng.uniform(-.15, .15)
        parts.append(ball(k, 'Weed', (x, y0 - .02, .08), (rng.uniform(.2, .35), .08, rng.uniform(.1, .18)), weed, 8, 4))
    obj = L.finish(k, parts, 'seawall', front=y0, sharp=60)
    obj['tile'] = 8.
    return obj


def pier(k):
    """8 m wooden pier segment: plank deck at Z ~1 on posts down to -2 with algae bands, a rope rail,
    a cleat and a lifebuoy."""
    tones = [k.mat('Plank', '#dd9a57', SATIN), k.mat('Plank2', '#c9803f', SATIN)]
    beam = k.mat('Beam', 'wood_dark', SATIN)
    algae = k.mat('Algae', '#2f9a6a', SATIN)
    rope = k.mat('Rope', '#f0c27a', SATIN)
    iron = k.mat('Iron', '#34323f', GLOSS)
    buoy = k.mat('Buoy', 'coral', GLOSS)
    white = k.mat('White', 'white', GLOSS)
    rng = random.Random(3)
    D = 3.0
    top = 1.0
    parts = []
    n = 20
    pw = 8 / n
    for i in range(n):
        x = -4 + pw * (i + .5)
        parts.append(box(k, 'Plank', (x, 0, top - .05), (pw - .035, D, .1), tones[rng.randint(0, 1)], .02, 1))
    for y in (-D / 2 + .15, 0, D / 2 - .15):
        parts.append(box(k, 'Stringer', (0, y, top - .2), (8, .16, .2), beam, 0))
    for x in (-3, -1, 1, 3):
        for y in (-D / 2 + .1, D / 2 - .1):
            parts.append(cyl(k, 'Pile', (x, y, (top - .1 - 2) / 2), .13, top - .1 + 2, beam, v=8, bevel=0))
            parts.append(cyl(k, 'Algae', (x, y, -.1), .145, .45, algae, v=8, bevel=0))
        parts.append(box(k, 'Cap', (x, 0, top - .32), (.18, D + .1, .16), beam, 0))
    for x in (-2, 2):
        parts.append(rod(k, 'Brace', (x - 1, -D / 2 + .1, top - .35), (x + 1, -D / 2 + .1, -.4), .06, beam, 6))
    # Rope rail on the far side.
    for x in (-3, -1, 1, 3):
        parts.append(cyl(k, 'RailPost', (x, D / 2 - .1, top + .45), .07, .9, beam, v=8, bevel=.02))
        parts.append(ball(k, 'PostTop', (x, D / 2 - .1, top + .92), .08, white, 6, 4))
    pts = []
    for i in range(33):
        x = -4 + i * .25
        sag = .12 * (1 - (((x + 4) % 2) - 1) ** 2)
        pts.append((x, D / 2 - .1, top + .78 - sag))
    parts.append(L.tube(k, 'RopeRail', pts, .025, rope))
    # Cleat and lifebuoy.
    parts.append(box(k, 'CleatBase', (0, -D / 2 + .2, top + .03), (.1, .12, .08), iron, .02, 1))
    parts.append(box(k, 'Cleat', (0, -D / 2 + .2, top + .08), (.36, .08, .05), iron, .02, 1))
    parts.append(k.torus('Lifebuoy', (1, D / 2 - .18, top + .5), .26, .075, buoy, rot=(math.pi / 2, 0, 0), major_seg=14,
                         minor_seg=5))
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        parts.append(box(k, 'BuoyBand', (1 + math.cos(a) * .26, D / 2 - .18, top + .5 + math.sin(a) * .26),
                         (.08, .17, .08), white, 0, rot=(0, -a, 0)))
    obj = L.finish(k, parts, 'pier', paint=dict(lo=-2, hi=top + .9, shade=.6), sharp=55)
    obj['tile'] = 8.
    obj['deck'] = top
    return obj


# ============================================================================ boats
def hull(k, name, length, beam, keel, sheer, mats, n=12, transom=.55, bow_rise=.25, thickness=.06):
    """Lofted hull shell: waterline at Z = 0, bow at +X. mats = [topsides, bottom, inside, rim]."""
    bm = bmesh.new()
    rings = []
    for i in range(n + 1):
        t = i / n
        x = -length / 2 + length * t
        c = .42
        u = (t - c) / (1 - c) if t > c else (c - t) / c
        w = beam / 2 * math.sqrt(max(0., 1 - u ** 2.2))
        if t < c:
            w = max(w, beam / 2 * transom)
        zs = sheer + bow_rise * t ** 3 + .06 * (1 - t) ** 3
        zb = keel * (1 - .75 * max(0., (t - .62) / .38) ** 1.6)
        levels = [zs, zs * .5, 0., zb * .5, zb * .88]
        pts = []
        for z in levels:
            q = (zs - z) / (zs - zb)
            y = w * max(0., 1 - q ** 2.4) ** (1 / 2.4)
            pts.append((y, z))
        prof = [(-y, z) for y, z in pts] + [(0, zb)] + [(y, z) for y, z in reversed(pts)]
        rings.append([bm.verts.new((x, py, pz)) for py, pz in prof])
    m = len(rings[0])
    for i in range(n):
        a, b = rings[i], rings[i + 1]
        for j in range(m - 1):
            f = bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
            zc = (a[j].co.z + a[j + 1].co.z) / 2
            f.material_index = 0 if zc > -.01 else 1
    f = bm.faces.new(list(reversed(rings[0])))
    f.material_index = 0
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = L.mesh_object(k, name, bm, [mats[0], mats[1], mats[2]])
    mod = o.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = -1
    k._apply_mods(o)
    # Faces facing into the hull (the solidified inner skin) get the inside material. (Unique material
    # slots only: kit.join's slot de-duplication would reset face indices.)
    zcore = (keel + sheer) * .5
    for poly in o.data.polygons:
        c, nrm = poly.center, poly.normal
        if abs(nrm.x) > .75 and c.x < 0:
            inner = nrm.x > 0
        else:
            inner = nrm.dot(Vector((0, c.y, c.z - zcore))) < 0
        if inner:
            poly.material_index = 2
    return o


def _sheer_line(length, beam, sheer, n=12, transom=.55, bow_rise=.25, inset=0.):
    pts = []
    for i in range(n + 1):
        t = i / n
        c = .42
        u = (t - c) / (1 - c) if t > c else (c - t) / c
        w = beam / 2 * math.sqrt(max(0., 1 - u ** 2.2))
        if t < c:
            w = max(w, beam / 2 * transom)
        zs = sheer + bow_rise * t ** 3 + .06 * (1 - t) ** 3
        pts.append((-length / 2 + length * t, max(w - inset, 0), zs))
    return pts


def boat_small(k):
    """Rowboat: teal clinker hull, coral bottom, white gunwale, wooden thwarts and a pair of oars."""
    top = k.mat('Hull', 'teal', GLOSS)
    bottom = k.mat('Bottom', 'coral', GLOSS)
    inside = k.mat('Wood', 'wood_light', SATIN)
    trim = k.mat('Trim', 'white', GLOSS)
    oar = k.mat('Oar', 'marigold', GLOSS)
    rope = k.mat('Rope', '#f0c27a', SATIN)
    Lh, B, keel, sheer = 3.2, 1.3, -.28, .36
    parts = [hull(k, 'Hull', Lh, B, keel, sheer, [top, bottom, inside, trim], transom=.6, bow_rise=.18)]
    for side in (-1, 1):
        pts = [(x, side * y, z) for x, y, z in _sheer_line(Lh, B, sheer, transom=.6, bow_rise=.18)]
        parts.append(L.tube(k, 'Gunwale', pts[:-1], .04, trim))
        pts2 = [(x, side * y * .97, z - .14) for x, y, z in _sheer_line(Lh, B, sheer, transom=.6, bow_rise=.18)]
        parts.append(L.tube(k, 'Strake', pts2[1:-2], .018, trim))
    for x, w in ((-.55, 1.12), (.45, 1.05)):
        parts.append(box(k, 'Thwart', (x, 0, sheer - .12), (.26, w, .05), inside, .02, 1))
    parts.append(box(k, 'SternSeat', (-1.3, 0, sheer - .1), (.4, .7, .05), inside, .02, 1))
    parts.append(box(k, 'Floor', (0, 0, keel + .12), (2.0, .5, .03), inside, 0))
    for s in (-1, 1):
        parts.append(rod(k, 'Loom', (-.9, s * .25, sheer + .05), (1.1, s * .42, sheer + .02), .03, oar, 6))
        parts.append(box(k, 'Blade', (1.35, s * .46, sheer + .02), (.5, .16, .03), oar, .015, 1,
                         rot=(0, 0, s * .08)))
        parts.append(cyl(k, 'Oarlock', (-.2, s * .62, sheer + .06), .04, .1, trim, v=6, bevel=0))
    ring = [(Lh / 2 - .15 + math.cos(a) * .1, math.sin(a) * .1, sheer + .2) for a in [i / 8 * math.tau for i in range(8)]]
    parts.append(L.tube(k, 'Painter', ring, .02, rope, closed=True))
    obj = L.finish(k, parts, 'boat_small', paint=dict(lo=keel, hi=sheer + .3, shade=.7), sharp=50)
    obj['draft'] = -keel
    obj['length'] = Lh
    return obj


def boat_fishing(k):
    """Small fishing boat: marigold hull with navy bottom and white stripe, wheelhouse, mast light,
    net pile, coral floats and tyre fenders."""
    top = k.mat('Hull', 'marigold', GLOSS)
    bottom = k.mat('Bottom', 'navy', GLOSS)
    deck = k.mat('Deck', 'wood_light', SATIN)
    white = k.mat('Trim', 'white', GLOSS)
    roof = k.mat('Roof', 'teal', GLOSS)
    glass_m = L.glass(k)
    float_m = k.mat('Float', 'coral', GLOSS)
    glow = L.lamp(k, '#fff0a8', 2.0)
    Lh, B, keel, sheer = 6.0, 2.2, -.55, .75
    parts = [hull(k, 'Hull', Lh, B, keel, sheer, [top, bottom, deck, white], transom=.62, bow_rise=.4, thickness=.08)]
    for side in (-1, 1):
        pts = [(x, side * y, z) for x, y, z in _sheer_line(Lh, B, sheer, transom=.62, bow_rise=.4)]
        parts.append(L.tube(k, 'Rail', pts[:-1], .055, white))
        pts2 = [(x, side * (y * .985 + .01), z * .55) for x, y, z in _sheer_line(Lh, B, sheer, transom=.62, bow_rise=.4)]
        parts.append(L.tube(k, 'Stripe', pts2[1:-1], .05, white))
        for x in (-1.2, .6):
            yy = next(y for xx, y, z in _sheer_line(Lh, B, sheer, n=24, transom=.62, bow_rise=.4) if xx >= x)
            parts.append(k.torus('Fender', (x, side * (yy + .08), .35), .15, .07, bottom, rot=(math.pi / 2, 0, 0),
                                 major_seg=10, minor_seg=4))
    parts.append(box(k, 'DeckBoard', (-.2, 0, sheer - .25), (Lh * .78, B * .82, .06), deck, 0))
    # Wheelhouse.
    wx = -.9
    parts.append(box(k, 'Cabin', (wx, 0, sheer + .6), (1.5, 1.35, 1.3), white, .08, 2))
    parts.append(box(k, 'CabinRoof', (wx, 0, sheer + 1.32), (1.8, 1.6, .14), roof, .06, 2))
    for s in (-1, 1):
        parts.append(box(k, 'SideWindow', (wx, s * .69, sheer + .82), (.9, .03, .42), glass_m, 0))
    parts.append(box(k, 'FrontWindow', (wx + .76, 0, sheer + .82), (.03, 1.0, .42), glass_m, 0, rot=(0, -.15, 0)))
    parts.append(box(k, 'Door', (wx - .76, 0, sheer + .5), (.03, .6, 1.0), roof, .01, 1))
    parts.append(k.torus('Buoy', (wx, -.7, sheer + .45), .2, .06, float_m, rot=(math.pi / 2, 0, 0), major_seg=12,
                         minor_seg=4))
    # Mast with a light and a pennant.
    parts.append(cyl(k, 'Mast', (wx + .2, 0, sheer + 2.2), .05, 1.9, white, v=8, bevel=0))
    parts.append(rod(k, 'Yard', (wx + .2, -.5, sheer + 2.6), (wx + .2, .5, sheer + 2.6), .03, white, 6))
    parts.append(ball(k, 'MastLight', (wx + .2, 0, sheer + 3.2), .1, glow, 8, 5))
    parts.append(k.prism('Pennant', [(0, 0), (.5, -.08), (0, -.18)], .02, float_m, loc=(wx + .22, 0, sheer + 3.05),
                         bevel=0))
    # Aft net pile, floats and a fish box.
    parts.append(ball(k, 'Nets', (-2.1, 0, sheer - .05), (.55, .6, .3), roof, 10, 6))
    for i in range(5):
        a = i / 5 * math.tau
        parts.append(ball(k, 'Float', (-2.1 + math.cos(a) * .4, math.sin(a) * .42, sheer + .15), .1, float_m, 6, 4))
    parts.append(box(k, 'FishBox', (.9, .3, sheer - .05), (.7, .5, .35), roof, .03, 1))
    parts.append(k.prism('Stem', [(0, 0), (.1, 0), (.1, .5), (0, .45)], .1, white, loc=(Lh / 2 - .1, 0, sheer), bevel=.02))
    obj = L.finish(k, parts, 'boat_fishing', paint=dict(lo=keel, hi=sheer + 3.2, shade=.7), sharp=50)
    obj['draft'] = -keel
    obj['length'] = Lh
    return obj


def _sail(k, name, pts, mat, bulge=.25, thick=.03):
    """A billowed sail from a triangle (luff bottom, luff top, clew) in the XZ plane, bulging toward -Y."""
    a, b, c = (Vector(p) for p in pts)
    bm = bmesh.new()
    rows = 5
    grid = []
    for i in range(rows + 1):
        u = i / rows
        row = []
        left = a + (b - a) * u
        right = c + (b - c) * u
        for j in range(4):
            v = j / 3
            p = left + (right - left) * v
            p = p + Vector((0, -bulge * math.sin(v * math.pi) * (1 - u * .8), 0))
            row.append(bm.verts.new(p))
        grid.append(row)
    for i in range(rows):
        for j in range(3):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    o = L.mesh_object(k, name, bm, [mat])
    mod = o.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thick
    k._apply_mods(o)
    return o


def sailboat(k):
    """Small sailboat: white hull, coral stripe, navy bottom, tall mast with a white main and a coral jib."""
    top = k.mat('Hull', 'white', GLOSS)
    bottom = k.mat('Bottom', 'navy', GLOSS)
    deck = k.mat('Deck', 'wood_light', SATIN)
    stripe = k.mat('Stripe', 'coral', GLOSS)
    sail_w = k.mat('Sail', '#fffaf0', SATIN)
    sail_c = k.mat('Jib', 'coral', SATIN)
    metal = k.mat('Metal', 'steel', .3, metal=.5)
    glass_m = L.glass(k)
    Lh, B, keel, sheer = 5.0, 1.8, -.45, .5
    parts = [hull(k, 'Hull', Lh, B, keel, sheer, [top, bottom, deck, stripe], transom=.6, bow_rise=.22)]
    for side in (-1, 1):
        pts = [(x, side * (y * .99 + .012), z * .6) for x, y, z in _sheer_line(Lh, B, sheer, transom=.6, bow_rise=.22)]
        parts.append(L.tube(k, 'Stripe', pts[1:-1], .05, stripe))
        pts = [(x, side * y, z) for x, y, z in _sheer_line(Lh, B, sheer, transom=.6, bow_rise=.22)]
        parts.append(L.tube(k, 'Rail', pts[:-1], .03, metal))
    parts.append(box(k, 'CabinTop', (-.2, 0, sheer + .15), (1.6, 1.0, .35), top, .1, 2))
    for s in (-1, 1):
        parts.append(box(k, 'Port', (-.2, s * .5, sheer + .17), (.8, .03, .14), glass_m, .02, 1))
    parts.append(box(k, 'Cockpit', (-1.5, 0, sheer - .1), (1.0, .9, .1), deck, 0))
    # Mast, boom and sails.
    mx = .35
    mh = 6.2
    parts.append(cyl(k, 'Mast', (mx, 0, sheer + mh / 2), .06, mh, metal, v=8, bevel=0))
    parts.append(rod(k, 'Boom', (mx, 0, sheer + .75), (mx - 2.2, 0, sheer + .8), .045, metal, 6))
    parts.append(_sail(k, 'Main', [(mx - .06, 0, sheer + .82), (mx - .06, 0, sheer + mh - .2), (mx - 2.15, 0, sheer + .86)],
                       sail_w, bulge=.3))
    parts.append(_sail(k, 'Jib', [(Lh / 2 - .2, 0, sheer + .35), (mx + .08, 0, sheer + mh * .82), (mx + .35, 0, sheer + .6)],
                       sail_c, bulge=.22))
    parts.append(rod(k, 'Forestay', (Lh / 2 - .15, 0, sheer + .3), (mx, 0, sheer + mh * .84), .012, metal, 4))
    parts.append(k.prism('Flag', [(0, 0), (.45, -.1), (0, -.22)], .02, sail_c, loc=(mx + .02, 0, sheer + mh + .02),
                         bevel=0))
    parts.append(k.prism('Rudder', [(0, 0), (.3, 0), (.2, -.7), (0, -.6)], .06, stripe, loc=(-Lh / 2 - .05, 0, .2),
                         bevel=.02, rot=(0, 0, math.pi)))
    obj = L.finish(k, parts, 'sailboat', paint=dict(lo=keel, hi=sheer + mh, shade=.72), sharp=50)
    obj['draft'] = -keel
    obj['length'] = Lh
    return obj


# ============================================================================ lighthouse
def lighthouse(k):
    """Hero lighthouse: coral-red/white banded tapered tower on a rocky base, gallery with railing,
    teal lantern room with glowing glass, and a keeper's cottage at its foot."""
    red = k.mat('Red', '#f0463a', GLOSS)
    white = k.mat('White', 'white', GLOSS)
    teal = k.mat('Teal', '#0b5f78', GLOSS)
    rock = k.mat('Rock', '#a597c4', MATTE)
    roof = k.mat('Roof', 'coral', GLOSS)
    glow = L.lamp(k, '#fff0a8', 2.4)
    glass_m = L.glass(k)
    grass = k.mat('Grass', '#5cc639', SATIN)
    rng = random.Random(70)
    parts = []
    # Rocky base: a ring of chunky boulders with a grassy cap and a white stone plinth.
    for i in range(11):
        a = i / 11 * math.tau + rng.uniform(-.15, .15)
        r = rng.uniform(2.4, 3.0)
        s = rng.uniform(.9, 1.3)
        parts.append(ball(k, 'Boulder', (math.cos(a) * r, math.sin(a) * r * .9, .35), (s, s * .85, s * .75), rock, 14, 8,
                          rot=(0, 0, a)))
    parts.append(k.lathe('Mound', [(3.3, 0), (3.2, .6), (2.8, 1.05), (2.2, 1.2), (0, 1.25)], rock, segments=16))
    parts.append(k.lathe('GrassCap', [(2.9, .98), (2.7, 1.2), (2.2, 1.3), (0, 1.32)], grass, segments=16))
    parts.append(k.lathe('Plinth', [(2.15, 1.2), (2.15, 1.55), (2.05, 1.65), (1.95, 1.65)], white, segments=24))
    # Tower bands (tapered), alternating red and white, with slim ridges between.
    z0, z1 = 1.6, 12.2
    r0, r1 = 1.85, 1.25
    bands = 7
    bh = (z1 - z0) / bands
    for i in range(bands):
        za, zb = z0 + i * bh, z0 + (i + 1) * bh
        ra = r0 + (r1 - r0) * (za - z0) / (z1 - z0)
        rb = r0 + (r1 - r0) * (zb - z0) / (z1 - z0)
        parts.append(k.lathe('Band', [(ra, za), (rb, zb)], red if i % 2 == 0 else white, segments=28))
        if i:
            parts.append(k.torus('Ridge', (0, 0, za), ra + .02, .045, white if i % 2 == 0 else red, major_seg=28,
                                 minor_seg=4))
    # Gallery: flared corbel, deck, railing.
    zg = z1
    parts.append(k.lathe('Corbel', [(r1, zg - .5), (r1 + .15, zg - .3), (r1 + .55, zg - .05), (r1 + .75, zg)], white,
                         segments=28))
    parts.append(cyl(k, 'Deck', (0, 0, zg + .07), r1 + .85, .16, teal, v=28, bevel=.04))
    for i in range(16):
        a = i / 16 * math.tau
        rr = r1 + .72
        parts.append(rod(k, 'Baluster', (math.cos(a) * rr, math.sin(a) * rr, zg + .15),
                         (math.cos(a) * rr, math.sin(a) * rr, zg + .95), .03, teal, 5))
    parts.append(k.torus('Handrail', (0, 0, zg + .95), r1 + .72, .045, teal, major_seg=28, minor_seg=4))
    parts.append(k.torus('MidRail', (0, 0, zg + .55), r1 + .72, .025, teal, major_seg=28, minor_seg=3))
    # Lantern room.
    zl = zg + .15
    parts.append(cyl(k, 'LanternBase', (0, 0, zl + .3), 1.05, .6, white, v=20, bevel=.04))
    parts.append(cyl(k, 'LanternGlass', (0, 0, zl + 1.25), .9, 1.3, glow, v=16, bevel=0))
    for i in range(8):
        a = i / 8 * math.tau + math.pi / 8
        parts.append(rod(k, 'Mullion', (math.cos(a) * .92, math.sin(a) * .92, zl + .58),
                         (math.cos(a) * .92, math.sin(a) * .92, zl + 1.92), .04, teal, 5))
    parts.append(k.torus('GlassRing', (0, 0, zl + 1.25), .92, .03, teal, major_seg=16, minor_seg=3))
    parts.append(cyl(k, 'LanternTop', (0, 0, zl + 1.97), 1.02, .12, teal, v=20, bevel=.03))
    parts.append(k.lathe('Dome', [(1.08, zl + 2.02), (1.0, zl + 2.3), (.7, zl + 2.62), (.3, zl + 2.8), (0, zl + 2.84)], teal,
                         segments=20))
    parts.append(cyl(k, 'Vent', (0, 0, zl + 2.92), .16, .2, teal, v=10, bevel=.03))
    parts.append(ball(k, 'Finial', (0, 0, zl + 3.12), .14, red, 10, 6))
    parts.append(rod(k, 'Rod', (0, 0, zl + 3.2), (0, 0, zl + 3.75), .025, teal, 5))
    parts.append(k.prism('VaneArrow', [(-.35, -.03), (.2, -.03), (.2, -.08), (.35, 0), (.2, .08), (.2, .03), (-.35, .03)],
                         .02, red, loc=(0, 0, zl + 3.55), bevel=0))
    # Door and windows on the -Y face.
    face_y = -r0 - .02
    door_parts = []
    door_parts.append(L.frame(k, 'DoorFrame', L.arch_outline(-.62, 1.6, .62, 3.95), L.arch_outline(-.46, 1.6, .46, 3.8),
                              face_y + .12, .22, white, .03))
    door_parts.append(box(k, 'Door', (0, face_y + .08, 2.55), (.92, .1, 1.9), teal, .03, 1))
    door_parts.append(L.plate(k, 'Fanlight', L.arch_outline(-.46, 3.3, .46, 3.8), face_y + .07, .04, glass_m))
    door_parts.append(ball(k, 'Knob', (.28, face_y - .02, 2.5), .05, white, 6, 4))
    door_parts.append(k.prism('DoorCanopy', [(-.8, 0), (.8, 0), (0, .45)], .7, red, loc=(0, face_y - .2, 4.05), bevel=.04))
    for i in range(3):
        door_parts.append(box(k, 'Step', (0, face_y - .3 - i * .28, 1.52 - i * .17), (1.3 - i * .1, .32, .17), white,
                              .03, 1))
    parts += door_parts
    # Stair windows sit in the red bands with crisp white frames and sills, stepping round the tower.
    for band, ang in ((2, 0.), (4, .5), (6, -.35)):
        zc = z0 + (band + .5) * bh - (.1 if band == 6 else 0)
        rr = r0 + (r1 - r0) * (zc - z0) / (z1 - z0)
        wp = [L.frame(k, 'WinFrame', L.arch_outline(-.3, zc - .45, .3, zc + .45),
                      L.arch_outline(-.19, zc - .34, .19, zc + .34), -rr + .1, .2, white, .03),
              L.plate(k, 'WinGlass', L.arch_outline(-.19, zc - .34, .19, zc + .34), -rr + .12, .06, glass_m),
              box(k, 'WinSill', (0, -rr - .12, zc - .47), (.66, .2, .08), white, .02, 1)]
        parts += L.place(wp, rot=(0, 0, ang))
    # Keeper's cottage attached on the +X side.
    cx, cy = 3.2, .2
    cw, cd, ch = 3.2, 2.6, 2.2
    cz = 1.2
    parts.append(box(k, 'Cottage', (cx, cy, cz + ch / 2), (cw, cd, ch), white, .08, 2))
    parts.append(box(k, 'CottagePlinth', (cx, cy, cz + .15), (cw + .1, cd + .1, .3), rock, .05, 1))
    ang = math.atan2(1.1, cd / 2)
    Ls = math.hypot(cd / 2 + .3, 1.1 + .22)
    for s in (-1, 1):
        parts.append(box(k, 'CottageRoof', (cx, cy + s * (cd / 4 + .05), cz + ch + .58), (cw + .4, Ls, .16), roof, .05, 2,
                         rot=(s * -ang, 0, 0)))
    parts.append(k.prism('CottageGable', [(-cd / 2, 0), (cd / 2, 0), (0, 1.1)], .1, white, loc=(cx + cw / 2 - .05, cy, cz + ch),
                         axis='X', bevel=.02))
    parts.append(box(k, 'Chimney', (cx + .9, cy + .6, cz + ch + 1.1), (.4, .4, 1.2), red, .04, 1))
    parts.append(box(k, 'ChimneyCap', (cx + .9, cy + .6, cz + ch + 1.75), (.5, .5, .1), white, .02, 1))
    cm = dict(trim=red, glass=glass_m, accent=teal, stone=white, roof=roof)
    parts += L.window(k, cm, cx + .75, cz + 1.3, .7, .75, y=cy - cd / 2, style='cross', border=.09, sill=True)
    parts += L.door(k, cm, cx - .55, .78, 1.75, y=cy - cd / 2, z0=cz, steps=1, glass_top=False, panels=False)
    # Picket fence and a bench to sell scale on the clifftop.
    for i in range(7):
        x = -3.4 + i * .3
        parts.append(k.prism('Picket', [(-.06, 0), (.06, 0), (.06, .55), (0, .65), (-.06, .55)], .04, white,
                             loc=(x, -2.6, 1.2), bevel=0))
    parts.append(box(k, 'FenceRail', (-2.5, -2.6, 1.55), (2.1, .04, .07), white, 0))
    obj = L.finish(k, parts, 'lighthouse', paint=dict(lo=0, hi=16, shade=.66), sharp=45)
    obj['light_z'] = round(zl + 1.25, 3)
    obj['door_y'] = round(face_y, 3)
    return obj


# ============================================================================ far silhouettes
def _superblob(rng, cx, cy, rx, ry, n=18, p=2.6, jitter=.05):
    """A rounded-rectangle-ish plan outline (x, y) with a little jitter, counter-clockwise from above."""
    pts = []
    for i in range(n):
        a = i / n * math.tau
        c, s = math.cos(a), math.sin(a)
        j = 1 + rng.uniform(-jitter, jitter)
        pts.append((cx + math.copysign(abs(c) ** (2 / p), c) * rx * j, cy + math.copysign(abs(s) ** (2 / p), s) * ry * j))
    return pts


def _plan_slab(k, name, outline, z0, z1, mat, bevel, seg=2):
    """Extrude a plan outline (x, y) vertically from z0 to z1 with soft bevels."""
    return k.prism(name, outline, z1 - z0, mat, loc=(0, 0, (z0 + z1) / 2), axis='Y', bevel=bevel, segments=seg,
                   rot=(-math.pi / 2, 0, 0))


def cliff_big(k):
    """Far headland: chunky rounded rock strata in three stone tones stepping up to a thick grass cap,
    a grassy shoulder rolling down to the left shore, boulders and foam at the foot.
    The flat top at Z = obj['top'] spans roughly X -9..16 (the lighthouse stands around X = 4)."""
    tones = [k.mat('Rock', '#a597c4', MATTE), k.mat('Rock2', '#eaa77a', MATTE), k.mat('Rock3', '#8a7cad', MATTE)]
    grass = k.mat('Grass', '#5cc639', SATIN)
    grass2 = k.mat('Grass2', '#43a83a', SATIN)
    foam = k.mat('Foam', '#e8f8ff', .3)
    rng = random.Random(40)
    top = 12.
    parts = []
    # Horizontal strata, each a running bond of long soft rock slabs with its own tone (reads as layered
    # rock, not a wall); the face steps back a little per layer and each slab juts in or out.
    bands = [(0., 2.7, 2, -13.5, 19.6), (2.7, 5.1, 1, -12.5, 18.4), (5.1, 7.5, 0, -11., 18.9), (7.5, 9.6, 1, -9.8, 17.6),
             (9.6, top - .7, 0, -9., 16.8)]
    ledges = []
    for i, (za, zb, tone, xl, xr) in enumerate(bands):
        x = xl - rng.uniform(0, 2)
        while x < xr - .3:
            w = min(rng.uniform(5., 8.5), xr - x)
            if xr - (x + w) < 2.5:
                w = xr - x
            cx = x + w / 2
            fy = -8.3 + i * .45 + rng.uniform(-.55, .55)
            depth = 15. - i * .6
            m = tones[tone] if rng.random() > .25 else tones[(tone + 2) % 3]
            parts.append(box(k, 'Slab', (cx, fy + depth / 2, (za + zb) / 2 + .05), (w + .3, depth, zb - za + .25), m, .8,
                             2, rot=(0, rng.uniform(-.025, .025), rng.uniform(-.03, .03))))
            ledges.append((cx, fy, zb, w))
            x += w
    cap = _superblob(rng, 3.6, .9, 14.3, 7.9, jitter=.015)
    parts.append(_plan_slab(k, 'Cap', cap, top - 1.3, top, grass, .65, 3))
    parts.append(_plan_slab(k, 'CapTop', _superblob(rng, 3.4, 1.4, 12.5, 6.2, jitter=.01), top - .2, top + .15, grass,
                            .15, 2))
    # Grassy shoulder down to the left shore.
    for x, y, rx, ry, h in ((-12.5, .4, 7.5, 8.2, 11.2), (-18, 0, 5.5, 7.4, 6.8), (-21.5, -.6, 3.6, 5.5, 3.4)):
        o = k.lathe('Shoulder', [(1, 0), (.95, .3), (.8, .6), (.55, .86), (.25, .98), (0, 1)], grass2, loc=(x, y, 0),
                    segments=20)
        o.scale = (rx, ry, h)
        parts.append(o)
    # Grass runs along a few ledges.
    for cx, fy, z, w in ledges[2::4]:
        if z < top - 1.5:
            parts.append(ball(k, 'Ledge', (cx, fy + .45, z + .02), (w * .35, .8, .32), grass2, 10, 5))
    # Boulders and foam at the foot.
    for i in range(7):
        x = -13 + i * 4.8 + rng.uniform(-1, 1)
        s = rng.uniform(1.2, 2.0)
        parts.append(ball(k, 'Boulder', (x, -9.4, s * .3), (s * 1.2, s, s * .8), tones[i % 3], 9, 5))
        parts.append(ball(k, 'Foam', (x + s, -10.1, .05), (s * .9, .4, .12), foam, 8, 4))
    obj = L.finish(k, parts, 'cliff_big', paint=dict(lo=0, hi=top, shade=.6), sharp=60)
    obj['top'] = top
    obj['top_x'] = 4.
    obj['top_y'] = 1.
    return obj


def hill_far(k):
    """Far rolling hills: overlapping soft domes in two greens with hedgerows and round tree clumps."""
    g1 = k.mat('Grass', '#6fd04a', SATIN)
    g2 = k.mat('Grass2', '#4fb33a', SATIN)
    tree = k.mat('Tree', '#2f8f3a', SATIN)
    trunk = k.mat('Trunk', 'wood_dark', SATIN)
    field = k.mat('Field', '#c6e05a', SATIN)
    rng = random.Random(55)
    parts = []
    domes = [(-19, 0, 15, 9, 6.6, g1), (0, 2, 18, 10, 8.4, g2), (18, -.5, 14, 9, 6.0, g1), (-7, -3, 10, 6, 4.0, g2),
             (9, -3.5, 11, 6, 3.8, g1)]
    for x, y, rx, ry, h, m in domes:
        prof = [(1, 0), (.96, .25), (.84, .52), (.64, .78), (.36, .95), (0, 1)]
        o = k.lathe('Dome', [(r, z) for r, z in prof], m, loc=(x, y, 0), segments=20)
        o.scale = (rx, ry, h)
        parts.append(o)
    # Patchwork field on the big hill (a flattened cap).
    o = k.lathe('FieldPatch', [(.52, .875), (.3, .975), (0, 1.02)], field, loc=(0, 2, .06), segments=14)
    o.scale = (18, 10, 8.4)
    parts.append(o)
    # Tree clumps.
    for cx, cy, n in ((-24, -4.5, 4), (-13, -3, 3), (5, -5.5, 5), (22, -4.5, 3), (-4, -6, 2)):
        for i in range(n):
            x = cx + i * 1.3 + rng.uniform(-.3, .3)
            y = cy + rng.uniform(-.5, .5)
            ground = 0.
            for dx, dy, rx, ry, h, m in domes:
                u = ((x - dx) / rx) ** 2 + ((y - dy) / ry) ** 2
                if u < 1:
                    ground = max(ground, h * math.sqrt(1 - u) ** .9)
            s = rng.uniform(1.0, 1.5)
            parts.append(cyl(k, 'Trunk', (x, y, ground + .5), .18, 1.2, trunk, v=6, bevel=0))
            parts.append(ball(k, 'Crown', (x, y, ground + 1.1 + s), (s, s * .9, s * 1.1), tree, 10, 6))
    obj = L.finish(k, parts, 'hill_far', paint=dict(lo=0, hi=11, shade=.7), sharp=75)
    return obj
