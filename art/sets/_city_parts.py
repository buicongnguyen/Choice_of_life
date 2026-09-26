"""Shared building blocks for the Brightwater city kit (art/sets/city.py).

Cheap custom geometry (window frames, glass, paving slabs, railings) is written
straight into bmesh so a building can carry dozens of framed windows inside the
5,000-triangle budget; chunky masses use the kit's soft-bevelled primitives.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from kit import SATIN

# Brightwater colour script: saturated teal, coral, marigold, plum, denim blue,
# cream trims, glassy blue windows and warm brick.
HEX = dict(
    teal='#12a5b8', teal_dark='#0a7d92', teal_light='#3cc4cf', coral='#ff6b4a', coral_dark='#d9442c',
    marigold='#ffb627', sun='#ffd84a', plum='#6b3fa0', plum_light='#8a5cc4', denim='#3a6fc4',
    denim_dark='#2a4f96', navy='#23407a', cream='#fff1d6', white='#fffaf0', brick='#c9523a',
    brick_warm='#d8633f', glass='#56b6ec', lamp='#ffbe4d', leaf='#5cc639', leaf_dark='#2f9a3a',
    charcoal='#34323f', ink='#1d1a2b', steel='#9fb3c8', mint='#5fe0b0', berry='#e8416f', wood='#b86b35',
    wood_dark='#7a4221', asphalt='#4a4658', stone='#a891bb', stone_dark='#9d92ab', sand='#f4c983',
    red='#f03a3a', rubber='#2a2733',
)


def h(name):
    return HEX.get(name, name)


def mat(k, name, colour, rough=SATIN, **kw):
    return k.mat(name, h(colour), rough, **kw)


def glass(k, colour='glass'):
    return k.mat('Window', h(colour), .1)


def lamp(k, colour='lamp', emit=1.0):
    return k.mat('Lamp', h(colour), .3, emit=emit)


def finish(k, name, parts, props=None, lo=None, hi=None, shade=.7, sharp=40):
    """Join the parts into one object pivoted at the base centre, paint it, set extras."""
    obj = k.join(name, parts, pivot=(0, 0, 0), sharp_angle=sharp)
    k.paint([obj], lo=lo, hi=hi, shade=shade)
    for key, value in (props or {}).items():
        obj[key] = value
    return obj


def extent(obj):
    """World-space bounds of a joined object: (x0, x1, y0, y1, z0, z1)."""
    mw = obj.matrix_world
    pts = [mw @ v.co for v in obj.data.vertices]
    return (min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts),
            min(p.z for p in pts), max(p.z for p in pts))


def measure(obj, height=True):
    """Record the measured footprint and height as root extras (metres, Blender axes)."""
    x0, x1, y0, y1, z0, z1 = extent(obj)
    obj['width'] = round(x1 - x0, 3)
    obj['depth'] = round(y1 - y0, 3)
    if height:
        obj['height'] = round(z1, 3)
    return obj


def building_props(obj, front=3.5):
    """Backdrop building extras: measured width/depth/height, the facade line and the nearest
    protrusion (awnings, steps, canopies) so the runtime can keep lanes clear."""
    measure(obj)
    x0, x1, y0, y1, z0, z1 = extent(obj)
    obj['front_y'] = float(front)
    obj['min_y'] = round(y0, 3)
    obj['band'] = 'backdrop'
    return obj


# --------------------------------------------------------------------------- bmesh geometry
class Geo:
    """Accumulates convex pieces in one bmesh; `obj()` turns it into a kit object."""

    def __init__(self):
        self.bm = bmesh.new()

    def poly(self, pts, want):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(Vector(want)) < 0:
            f.normal_flip()
        return f

    def hull(self, faces):
        """faces: list of point lists of one convex solid; normals point away from its centre."""
        pts = [Vector(p) for f in faces for p in f]
        c = sum(pts, Vector()) / len(pts)
        for f in faces:
            fc = sum((Vector(p) for p in f), Vector()) / len(f)
            self.poly(f, fc - c)

    def box(self, x0, x1, y0, y1, z0, z1, skip=()):
        """Axis-aligned box; `skip` drops hidden faces ('-y', '+y', '-z', ...)."""
        c = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        faces = {'-z': (0, 1, 2, 3), '+z': (4, 5, 6, 7), '-y': (0, 1, 5, 4), '+y': (3, 2, 6, 7),
                 '-x': (0, 3, 7, 4), '+x': (1, 2, 6, 5)}
        centre = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        for key, idx in faces.items():
            if key in skip:
                continue
            pts = [c[i] for i in idx]
            fc = sum((Vector(p) for p in pts), Vector()) / 4
            self.poly(pts, fc - centre)

    def pbox(self, P, u0, u1, v0, v1, d0, d1, skip_back=True):
        """Box in a facade basis P(u, v, d)."""
        c = [P(u0, v0, d0), P(u1, v0, d0), P(u1, v1, d0), P(u0, v1, d0),
             P(u0, v0, d1), P(u1, v0, d1), P(u1, v1, d1), P(u0, v1, d1)]
        idx = [(4, 5, 6, 7), (0, 1, 5, 4), (3, 2, 6, 7), (0, 3, 7, 4), (1, 2, 6, 5)]
        if not skip_back:
            idx.append((0, 1, 2, 3))
        centre = sum(c, Vector()) / 8
        for f in idx:
            pts = [c[i] for i in f]
            fc = sum(pts, Vector()) / 4
            self.poly(pts, fc - centre)

    def tube(self, points, r, sides=6, caps=False):
        """Polygonal rod through a polyline: `sides`*2 triangles per segment."""
        pts = [Vector(p) for p in points]
        for a, b in zip(pts, pts[1:]):
            d = (b - a).normalized()
            up = Vector((0, 0, 1)) if abs(d.z) < .9 else Vector((1, 0, 0))
            u = d.cross(up).normalized()
            v = d.cross(u).normalized()
            ra = [a + (u * math.cos(t) + v * math.sin(t)) * r for t in [i * math.tau / sides for i in range(sides)]]
            rb = [p + (b - a) for p in ra]
            for i in range(sides):
                j = (i + 1) % sides
                mid = (ra[i] + ra[j]) / 2
                self.poly([ra[i], ra[j], rb[j], rb[i]], mid - a - d * (mid - a).dot(d))
            if caps:
                self.poly(ra, -d)
                self.poly(rb, d)

    def slab(self, x0, x1, y0, y1, top, depth=.12, c=.03, cl=None, cr=None):
        """Paving slab with a chamfered top edge (18 triangles). cl/cr override the X-end chamfers."""
        cl = c if cl is None else cl
        cr = c if cr is None else cr
        b = top - depth
        t = [(x0 + cl, y0 + c, top), (x1 - cr, y0 + c, top), (x1 - cr, y1 - c, top), (x0 + cl, y1 - c, top)]
        m = [(x0, y0, top - c), (x1, y0, top - c), (x1, y1, top - c), (x0, y1, top - c)]
        lo = [(x0, y0, b), (x1, y0, b), (x1, y1, b), (x0, y1, b)]
        faces = [t]
        for i in range(4):
            j = (i + 1) % 4
            faces.append([m[i], m[j], t[j], t[i]])
            faces.append([lo[i], lo[j], m[j], m[i]])
        self.hull(faces)

    def obj(self, k, name, material, weld=True):
        if weld:
            bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=1e-5)
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(o)
        mesh.materials.append(material)
        k.current.append(o)
        return o


def rod(k, name, points, r, material, sides=6, caps=True):
    """Cheap polygonal tube (kit.tube always uses a 16-sided profile)."""
    g = Geo()
    g.tube(points, r, sides, caps)
    return g.obj(k, name, material, weld=False)


def basis(face, at):
    """Facade basis P(u, v, d): u is the world coordinate along the wall (X for the front/back,
    Y for the sides), v is Z and d is outward from the wall plane.
    face: '-y' (front, plane y=at), '+x' (right side, plane x=at), '-x' (left side), '+y' (back)."""
    if face == '-y':
        return lambda u, v, d: Vector((u, at - d, v))
    if face == '+x':
        return lambda u, v, d: Vector((at + d, u, v))
    if face == '-x':
        return lambda u, v, d: Vector((at - d, u, v))
    if face == '+y':
        return lambda u, v, d: Vector((u, at + d, v))
    raise ValueError(face)


def windows(k, rects, face='-y', at=3.5, glass_mat=None, frame_mat=None, depth=.09, t=.1, mullion='cross',
            mull_mat=None, glint_mat=None, inset=.0, blind_mat=None, blind_every=3):
    """Framed window panes on a wall plane.

    rects: [(u_centre, v_bottom, width, height)]. The frame is a raised ring with a
    chamfered outer edge; glass sits just proud of the wall (inset moves it back).
    Returns the created objects (frames, glass, mullions, glints)."""
    P = basis(face, at)
    fr, gl, mu, gt, bl = Geo(), Geo(), Geo(), Geo(), Geo()
    c = min(t * .45, depth * .6)
    for index, (uc, v0, w, hgt) in enumerate(rects):
        u0, u1, v1 = uc - w / 2, uc + w / 2, v0 + hgt
        i0, i1, j0, j1 = u0 + t, u1 - t, v0 + t, v1 - t
        L0 = [P(u0, v0, 0), P(u1, v0, 0), P(u1, v1, 0), P(u0, v1, 0)]
        L1 = [P(u0 + c, v0 + c, depth), P(u1 - c, v0 + c, depth), P(u1 - c, v1 - c, depth), P(u0 + c, v1 - c, depth)]
        L2 = [P(i0, j0, depth), P(i1, j0, depth), P(i1, j1, depth), P(i0, j1, depth)]
        L3 = [P(i0, j0, -inset), P(i1, j0, -inset), P(i1, j1, -inset), P(i0, j1, -inset)]
        centre = P(uc, v0 + hgt / 2, 0)
        n = P(uc, v0, 1) - P(uc, v0, 0)
        for s in range(4):
            e = (s + 1) % 4
            mid = (L0[s] + L0[e]) / 2
            out = (mid - centre)
            out = out - n * out.dot(n)
            fr.poly([L0[s], L0[e], L1[e], L1[s]], out.normalized() + n)
            fr.poly([L1[s], L1[e], L2[e], L2[s]], n)
            fr.poly([L2[s], L2[e], L3[e], L3[s]], -out)
        g = .02
        gl.poly([P(i0 - g, j0 - g, .012 - inset), P(i1 + g, j0 - g, .012 - inset), P(i1 + g, j1 + g, .012 - inset),
                 P(i0 - g, j1 + g, .012 - inset)], n)
        if blind_mat is not None and (index * 7 + 3) % blind_every == 0:
            # a roller blind pulled part way down behind the glass line
            f = (.3, .55, .42, .7)[index % 4]
            bl.poly([P(i0, j1 - (j1 - j0) * f, .016 - inset), P(i1, j1 - (j1 - j0) * f, .016 - inset), P(i1, j1, .016 - inset),
                     P(i0, j1, .016 - inset)], n)
        mw = t * .55
        md = depth * .55
        if mullion in ('cross', 'v', 'double'):
            xs = [uc] if mullion != 'double' else [i0 + (i1 - i0) / 3, i0 + 2 * (i1 - i0) / 3]
            for x in xs:
                mu.pbox(P, x - mw / 2, x + mw / 2, j0, j1, -inset, md - inset)
        if mullion in ('cross', 'h', 'double'):
            z = j0 + (j1 - j0) * (.62 if mullion != 'h' else .5)
            mu.pbox(P, i0, i1, z - mw / 2, z + mw / 2, -inset, md - inset)
        if glint_mat is not None and (i1 - i0) > .5:
            # Two painted highlight streaks: the toy-glass read.
            a = (i1 - i0)
            b = (j1 - j0)
            for (s0, s1) in ((.12, .3), (.36, .44)):
                p0 = (i0 + a * s0, j1 - b * .02)
                gt.poly([P(p0[0], p0[1], .02 - inset), P(p0[0] + a * (s1 - s0), p0[1], .02 - inset),
                         P(i0 + a * .02, j1 - b * (s1 + .1), .02 - inset),
                         P(i0 + a * .02, j1 - b * (s0 + .1), .02 - inset)], n)
    out = [fr.obj(k, 'Frames', frame_mat), gl.obj(k, 'Glass', glass_mat)]
    out.append(mu.obj(k, 'Mullions', mull_mat or frame_mat))
    if glint_mat is not None:
        out.append(gt.obj(k, 'Glints', glint_mat))
    if blind_mat is not None:
        out.append(bl.obj(k, 'Blinds', blind_mat))
    return out


def grid(us, vs, w, hgt):
    return [(u, v, w, hgt) for v in vs for u in us]


def spaced(a, b, n):
    """n centres evenly spread between a and b."""
    step = (b - a) / n
    return [a + step * (i + .5) for i in range(n)]


def railing(k, x0, x1, y, z, height, material, post=.45, r=.035, face='-y', skip_ends=False):
    """Toy railing along X (or along Y for face='+x'): top rail, mid rail and balusters (unbevelled bars)."""
    g = Geo()
    length = x1 - x0
    n = max(1, int(round(length / post)))
    for i in range(n + 1):
        if skip_ends and i in (0, n):
            continue
        x = x0 + length * i / n
        if face in ('-y', '+y'):
            g.box(x - r * .6, x + r * .6, y - r * .6, y + r * .6, z, z + height - r, skip=('-z', '+z'))
        else:
            g.box(y - r * .6, y + r * .6, x - r * .6, x + r * .6, z, z + height - r, skip=('-z', '+z'))
    for zz, rr in ((z + height - r, r * 1.3), (z + height * .45, r * .8)):
        if face in ('-y', '+y'):
            g.box(x0 - r, x1 + r, y - rr, y + rr, zz - rr, zz + rr)
        else:
            g.box(y - rr, y + rr, x0 - r, x1 + r, zz - rr, zz + rr)
    return g.obj(k, 'Railing', material)


# --------------------------------------------------------------------------- dressing pieces
def awning(k, x0, x1, y, z, depth, drop, c1, c2, n=None, valance=.28, cheeks=True, th=.07):
    """Striped sloping awning hinged on the wall at (y, z), with a scalloped valance.
    Built as two bmesh objects (one per stripe colour) so it stays cheap."""
    w = x1 - x0
    n = n or max(3, int(round(w / .45)))
    sw = w / n
    geos = (Geo(), Geo())
    yf, zf = y - depth, z - drop
    for i in range(n):
        g = geos[i % 2]
        xa, xb = x0 + sw * i, x0 + sw * (i + 1)
        top = [(xa, y, z), (xb, y, z), (xb, yf, zf), (xa, yf, zf)]
        bot = [(p[0], p[1], p[2] - th) for p in top]
        g.hull([top, bot[::-1], [top[0], top[1], bot[1], bot[0]], [top[1], top[2], bot[2], bot[1]],
                [top[2], top[3], bot[3], bot[2]], [top[3], top[0], bot[0], bot[3]]])
        g.box(xa, xb, yf - .035, yf + .015, zf - valance + .03, zf + .01, skip=('+z',))
        cx, r = (xa + xb) / 2, sw / 2
        zc = zf - valance + .035
        segs = 6
        front = [(cx + math.cos(math.pi + math.pi * j / segs) * r, yf - .035,
                  zc + math.sin(math.pi + math.pi * j / segs) * r * .8) for j in range(segs + 1)]
        back = [(p[0], yf + .015, p[2]) for p in front]
        faces = [front, back[::-1]]
        for j in range(segs):
            faces.append([front[j], front[j + 1], back[j + 1], back[j]])
        g.hull(faces)
    parts = [geos[0].obj(k, 'Awning', c1), geos[1].obj(k, 'Awning', c2)]
    if cheeks:
        for sx in (x0 - .02, x1 + .02):
            prof = [(0, 0), (-depth, -drop), (-depth, -drop - valance * .6), (0, -drop * .35)]
            parts.append(k.prism('Cheek', [(p[0] + y, p[1] + z) for p in prof], .05, c1, loc=(sx, 0, 0), axis='X',
                                 bevel=.012, segments=1))
    parts.append(k.cyl('Rod', (x0 + w / 2, yf, zf), .035, w + .12, c2, axis='X', vertices=8, bevel=0))
    return parts


def shrub(k, loc, r, leaf, leaf_dark, n=3, seg=(7, 4), flowers=None, flower_mat=None, seed=0):
    """A chunky clump of leaf balls, optionally dotted with flowers."""
    parts = []
    x, y, z = loc
    for i in range(n):
        a = seed * 1.7 + i * math.tau / n
        rr = r * (.72 if n > 1 else 1) * (1 + .12 * math.sin(i * 2.3 + seed))
        off = r * .45 if n > 1 else 0
        parts.append(k.ball('Leaf', (x + math.cos(a) * off, y + math.sin(a) * off * .6, z + rr * .6 + (i % 2) * r * .15),
                            (rr, rr * .9, rr * .85), leaf if i % 2 == 0 else leaf_dark, *seg))
    if n > 1:
        parts.append(k.ball('Leaf', (x, y - r * .1, z + r * .95), (r * .6, r * .55, r * .55), leaf, *seg))
    for j in range(flowers or 0):
        a = j * 2.4 + seed
        parts.append(k.ball('Flower', (x + math.cos(a) * r * .75, y - r * .55 + math.sin(a) * r * .15,
                                       z + r * (.55 + .35 * ((j * 7) % 3) / 2)), r * .16, flower_mat, 6, 4))
    return parts


def planter(k, x, y, w, d, hgt, box_mat, rim_mat, leaf, leaf_dark, flower_mat=None, flowers=0):
    parts = [k.box('Planter', (x, y, hgt / 2), (w, d, hgt), box_mat, bevel=.06, segments=1),
             k.box('Rim', (x, y, hgt - .03), (w + .08, d + .08, .08), rim_mat, bevel=.03, segments=1)]
    parts += shrub(k, (x, y, hgt - .05), min(w, d) * .55, leaf, leaf_dark, n=2 if w < 1.2 else 3,
                   flowers=flowers, flower_mat=flower_mat, seed=x)
    return parts


def water_tank(k, x, y, z, r, hgt, wood, band, leg):
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(k.box('Leg', (x + sx * r * .6, y + sy * r * .6, z + .45), (.12, .12, .9), leg, bevel=0))
    parts.append(k.box('Deck', (x, y, z + .92), (r * 1.9, r * 1.9, .1), leg, bevel=.03, segments=1))
    parts.append(k.cyl('Barrel', (x, y, z + .97 + hgt / 2), r, hgt, wood, vertices=14, bevel=.05, segments=1))
    for f in (.22, .78):
        parts.append(k.cyl('Hoop', (x, y, z + .97 + hgt * f), r + .035, .08, band, vertices=14, bevel=0))
    parts.append(k.cyl('Cap', (x, y, z + .97 + hgt + .3), r + .12, .62, wood, vertices=14, radius2=.05, bevel=.02,
                       segments=1))
    parts.append(k.ball('Finial', (x, y, z + .97 + hgt + .66), .09, band, 8, 6))
    return parts


def ac_unit(k, x, y, z, body, grille):
    return [k.box('AC', (x, y, z + .3), (.9, .7, .6), body, bevel=.05, segments=1),
            k.cyl('Fan', (x, y, z + .61), .24, .04, grille, vertices=12, bevel=0)]


def antenna(k, x, y, z, hgt, metal, light):
    parts = [k.cyl('Mast', (x, y, z + hgt / 2), .06, hgt, metal, vertices=8, bevel=0)]
    for f, w in ((.45, .7), (.7, .5)):
        parts.append(k.box('Bar', (x, y, z + hgt * f), (w, .05, .05), metal, bevel=0))
    parts.append(k.ball('Beacon', (x, y, z + hgt + .08), .12, light, 8, 5))
    return parts


def wall_lamp(k, x, y, z, metal, light):
    return [k.box('Bracket', (x, y - .12, z + .22), (.05, .24, .05), metal, bevel=0),
            k.cyl('Shade', (x, y - .26, z + .18), .13, .14, metal, vertices=10, radius2=.05, bevel=0),
            k.ball('Bulb', (x, y - .26, z + .08), .08, light, 8, 4)]


def text(k, body, size, depth, material, loc, align='CENTER', offset=.0, bevel=.0, res=2, face='-y'):
    """Chunky 3D lettering standing up and facing -Y (face='+x' turns it to the right side)."""
    cu = bpy.data.curves.new('Text', 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = depth / 2
    cu.offset = offset
    cu.bevel_depth = bevel
    cu.bevel_resolution = 1
    cu.resolution_u = res
    cu.align_x = align
    cu.align_y = 'CENTER'
    o = bpy.data.objects.new('Text', cu)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object
    o.select_set(False)
    o.data.materials.clear()
    o.data.materials.append(material)
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0, 0) if face == '-y' else (math.pi / 2, 0, math.pi / 2)
    k.current.append(o)
    return o


def wheel(k, x, y, z, r, width, tyre, hub, side=-1, vertices=16):
    """Chunky toy wheel with its axle along Y; `side` says which way the hub faces."""
    parts = [k.cyl('Tyre', (x, y, z), r, width, tyre, axis='Y', vertices=vertices, bevel=r * .3, segments=2),
             k.cyl('Hub', (x, y + side * width * .42, z), r * .55, width * .3, hub, axis='Y', vertices=12,
                   bevel=r * .08, segments=1)]
    parts.append(k.cyl('Cap', (x, y + side * width * .56, z), r * .2, width * .12, tyre, axis='Y', vertices=8,
                       bevel=0))
    return parts


def arch(k, x, y, z, r, frame_mat, glass_mat, t=.12, depth=.1, bars=3, bar_mat=None):
    """Half-round fan light on top of an opening at height z (faces -Y)."""
    n = 10
    pts = [(x + math.cos(math.pi * i / n) * (r - t * .5), z + math.sin(math.pi * i / n) * (r - t * .5)) for i in range(n + 1)]
    parts = [k.prism('FanLight', pts, .04, glass_mat, loc=(0, y - .01, 0), bevel=0),
             k.torus('ArchFrame', (x, y - depth * .3, z), r - t * .2, t * .55, frame_mat, rot=(-math.pi / 2, 0, 0),
                     major_seg=20, minor_seg=4, arc=math.pi)]
    g = Geo()
    for i in range(bars):
        a = math.pi * (i + 1) / (bars + 1)
        # thin radial bar as an oriented box
        dx, dz = math.cos(a), math.sin(a)
        px, pz = -dz * .025, dx * .025
        p0 = (x + px, y - .04, z + pz)
        p1 = (x - px, y - .04, z - pz)
        q0 = (x + dx * r * .95 + px, y - .04, z + dz * r * .95 + pz)
        q1 = (x + dx * r * .95 - px, y - .04, z + dz * r * .95 - pz)
        g.poly([p1, p0, q0, q1], (0, -1, 0))
    parts.append(g.obj(k, 'FanBars', bar_mat or frame_mat))
    return parts


def clock(k, x, y, z, r, face_mat, rim_mat, hand_mat, hour=10, minute=10):
    """Big round station clock facing -Y centred at (x, y, z)."""
    parts = [k.cyl('ClockFace', (x, y, z), r, .12, face_mat, axis='Y', vertices=24, bevel=0),
             k.torus('ClockRim', (x, y - .06, z), r, r * .1, rim_mat, rot=(math.pi / 2, 0, 0), major_seg=20,
                     minor_seg=4)]
    g = Geo()
    for i in range(12):
        a = i * math.tau / 12
        big = i % 3 == 0
        w, hh = (.05, .16) if big else (.03, .09)
        cx, cz = x + math.sin(a) * r * .78, z + math.cos(a) * r * .78
        ca, sa = math.cos(a), math.sin(a)
        corners = []
        for (u, v) in ((-w, -hh), (w, -hh), (w, hh), (-w, hh)):
            corners.append((cx + u * ca + v * sa, y - .075, cz - u * sa + v * ca))
        g.poly(corners, (0, -1, 0))
    parts.append(g.obj(k, 'Ticks', hand_mat))
    for ang, length, width in ((math.tau * (hour % 12 + minute / 60) / 12, r * .5, .07),
                               (math.tau * minute / 60, r * .75, .05)):
        cx, cz = x + math.sin(ang) * length / 2, z + math.cos(ang) * length / 2
        parts.append(k.box('Hand', (cx, y - .1, cz), (width, .03, length), hand_mat, bevel=.012, segments=1,
                           rot=(0, ang, 0)))
    parts.append(k.cyl('Pin', (x, y - .12, z), r * .07, .05, rim_mat, axis='Y', vertices=10, bevel=0))
    return parts


def loft(k, name, sections, material, cap_start=True, cap_end=True):
    """Skin a list of equal-length point rings (open U profiles or closed loops) into one mesh."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in sec] for sec in sections]
    n = len(sections[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(n - 1):
            try:
                bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
            except ValueError:
                pass
    if cap_start:
        bm.faces.new(rings[0][::-1])
    if cap_end:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    mesh.materials.append(material)
    k.current.append(o)
    return o


def hull_sections(x0, x1, beam, z_keel, z_deck, n=10, pts=9, bow=.38, stern=.1, yc=0., sheer=.35):
    """Cross-sections (U rings, port to starboard) of a toy boat hull with the bow at +X."""
    out = []
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        if t > 1 - bow:
            f = math.cos((t - (1 - bow)) / bow * math.pi / 2) ** .7
        elif t < stern:
            f = .85 + .15 * t / stern
        else:
            f = 1.
        hb = max(beam / 2 * f, .02)
        zd = z_deck + sheer * max(0., t - .55) / .45
        keel = z_keel + (zd - z_keel) * .5 * max(0., t - .75) / .25
        ring = []
        for j in range(pts):
            a = math.pi * j / (pts - 1)
            ring.append((x, yc - math.cos(a) * hb, zd - (zd - keel) * math.sin(a) ** .55))
        out.append(ring)
    return out


def split_z(k, o, z, lower_mat, name='Lower'):
    """Cut a mesh at height z: `o` keeps the part above, a new object (lower_mat) the part below."""
    me2 = o.data.copy()
    o2 = bpy.data.objects.new(name, me2)
    bpy.context.collection.objects.link(o2)
    o2.matrix_world = o.matrix_world.copy()
    k.current.append(o2)
    for obj, keep_above in ((o, True), (o2, False)):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z),
                               plane_no=(0, 0, 1), clear_inner=keep_above, clear_outer=not keep_above)
        bm.to_mesh(obj.data)
        bm.free()
    o2.data.materials.clear()
    o2.data.materials.append(lower_mat)
    return o2


def flat_poly(k, name, pts, material, z0, z1):
    """Extrude a closed XY outline between z0 and z1 (puddles, plates, decals)."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in pts]
    hi = [bm.verts.new((x, y, z1)) for x, y in pts]
    bm.faces.new(hi)
    bm.faces.new(lo[::-1])
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    mesh.materials.append(material)
    k.current.append(o)
    return o


def blob(cx, cy, rx, ry, n=20, wobble=.18, seed=0.):
    """A soft irregular outline (puddles, spills)."""
    pts = []
    for i in range(n):
        a = i * math.tau / n
        r = 1 + wobble * (math.sin(a * 3 + seed) * .6 + math.sin(a * 5 + seed * 2.3) * .4)
        pts.append((cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r))
    return pts
