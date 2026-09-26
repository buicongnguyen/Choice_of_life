"""Shared helpers for the Marigold Bay harbour kit (see art/sets/harbour.py).

Cheap custom geometry (pillow stones, window frames, awnings, roof courses)
built on top of art/kit.py so every harbour asset shares one toy vocabulary.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

from kit import GLOSS, MATTE, SATIN  # noqa: F401  (re-exported for the builders)

GLASS = '#4fb8ec'
FRONT = 3.5  # building fronts sit on the back edge of the street band


# ----------------------------------------------------------------------------- materials
def glass(k):
    """Runtime 'Window' glass (glows warm at dusk)."""
    return k.mat('Window', GLASS, .06)


def lamp(k, colour='lamp', emit=1.6):
    """Runtime 'Lamp' glass (always emissive)."""
    return k.mat('Lamp', colour, .2, emit=emit)


def water(k):
    return k.mat('Water', '#2cb5ea', .04)


def mats(k, **spec):
    """Build a dict of named materials: key=(name, colour, roughness[, metal])."""
    out = {}
    for key, value in spec.items():
        name, col, rough = value[:3]
        metal = value[3] if len(value) > 3 else 0.
        out[key] = k.mat(name, col, rough, metal=metal)
    return out


# ----------------------------------------------------------------------------- finishing
def finish(k, parts, name, pivot=(0, 0, 0), sharp=40, paint=None, **extras):
    """Join a static prop, paint it and store root extras (always includes 'height')."""
    obj = k.join(name, parts, pivot=pivot, sharp_angle=sharp)
    k.paint([obj], **(paint or {}))
    bpy.context.view_layer.update()
    zs = [(obj.matrix_world @ v.co).z for v in obj.data.vertices]
    obj['height'] = round(float(max(zs)), 3)
    for key, value in extras.items():
        obj[key] = value
    return obj


def mesh_object(k, name, bm, materials):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    for m in materials:
        mesh.materials.append(m)
    k.current.append(o)
    return o


# ----------------------------------------------------------------------------- cheap primitives
def box(k, name, loc, size, mat, bevel=.04, seg=1, rot=None):
    return k.box(name, loc, size, mat, bevel=bevel, segments=seg, rot=rot)


def cyl(k, name, loc, r, depth, mat, axis='Z', v=12, bevel=.015, seg=1, r2=None, rot=None):
    return k.cyl(name, loc, r, depth, mat, axis=axis, vertices=v, bevel=bevel, segments=seg, radius2=r2, rot=rot)


def ball(k, name, loc, radii, mat, seg=10, rings=6, rot=None):
    return k.ball(name, loc, radii, mat, seg, rings, rot=rot)


def rod(k, name, a, b, r, mat, v=8):
    """Straight round bar from a to b (open-ended cylinder with flat caps)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = k.cyl(name, (a + b) / 2, r, d.length, mat, vertices=v, bevel=0)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


def rounded(points, radius, seg=3):
    """Round the corners of a 2D polygon. `radius` is a float or a per-corner list."""
    out = []
    n = len(points)
    for i in range(n):
        p = Vector(points[i])
        a = Vector(points[i - 1])
        b = Vector(points[(i + 1) % n])
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        if r <= 0:
            out.append((p.x, p.y))
            continue
        da, db = a - p, b - p
        r = min(r, da.length * .49, db.length * .49)
        pa = p + da.normalized() * r
        pb = p + db.normalized() * r
        for s in range(seg + 1):
            t = s / seg
            q = pa * (1 - t) ** 2 + p * 2 * (1 - t) * t + pb * t * t
            out.append((q.x, q.y))
    return out


def arch_outline(x0, z0, x1, z1, seg=4):
    """Rectangle whose top is a round arch (x0..x1, z0..z1 overall)."""
    r = (x1 - x0) * .495
    return rounded([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], [0, 0, r, r], seg)


# ----------------------------------------------------------------------------- frames and windows
def frame(k, name, outer, inner, y, depth, mat, bevel=.02):
    """A picture-frame ring from matching outer/inner (x, z) outlines (counter-clockwise seen from the
    front), sitting on a wall at `y` and protruding toward -Y by `depth`, with a built-in front chamfer."""
    bm = bmesh.new()
    n = len(outer)
    assert n == len(inner), (n, len(inner))
    yf = y - depth

    def lerp(a, b, t):
        return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t

    def ring(points, yy):
        return [bm.verts.new((px, yy, pz)) for px, pz in points]
    rings = [ring(outer, y)]
    if bevel:
        c = min(bevel, depth * .45)
        width = min((Vector(o) - Vector(i)).length for o, i in zip(outer, inner))
        f = min(.35, c * 1.4 / max(width, 1e-4))
        rings += [ring(outer, yf + c), ring([lerp(o, i, f) for o, i in zip(outer, inner)], yf),
                  ring([lerp(i, o, f) for o, i in zip(outer, inner)], yf), ring(inner, yf + c)]
    else:
        rings += [ring(outer, yf), ring(inner, yf)]
    rings.append(ring(inner, y))
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    return mesh_object(k, name, bm, [mat])


def plate(k, name, outline, y, depth, mat, bevel=0.):
    """A flat panel from an (x, z) outline, from y - depth to y."""
    return k.prism(name, outline, depth, mat, loc=(0, y - depth / 2, 0), axis='Y', bevel=bevel, segments=1)


def window(k, m, x, z, w, h, y=FRONT, style='cross', arch=False, border=.11, depth=.1, sill=True,
           shutters=False, flowers=False, lintel=False, lite=False):
    """A framed window centred at (x, z) on a wall face at `y`. Returns parts.

    m needs 'trim' and 'glass'; shutters/flowers use 'accent', 'flower', 'leaf'.
    """
    parts = []
    hw, hh = w / 2, h / 2
    if arch:
        outer = arch_outline(x - hw - border, z - hh - border, x + hw + border, z + hh + border)
        inner = arch_outline(x - hw, z - hh, x + hw, z + hh)
    else:
        outer = [(x - hw - border, z - hh - border), (x + hw + border, z - hh - border),
                 (x + hw + border, z + hh + border), (x - hw - border, z + hh + border)]
        inner = [(x - hw, z - hh), (x + hw, z - hh), (x + hw, z + hh), (x - hw, z + hh)]
    parts.append(frame(k, 'Frame', outer, inner, y, depth, m['trim'], bevel=.018))
    parts.append(plate(k, 'Glass', inner, y + .01, .04, m['glass']))
    bar = .055
    if style in ('cross', 'sash', 'grid'):
        parts.append(box(k, 'Mullion', (x, y - .035, z), (bar, .05, h), m['trim'], 0))
        hz = z + h * (.12 if style == 'sash' else .05)
        if arch:
            hz = z + hh - hw
        parts.append(box(k, 'Transom', (x, y - .035, hz), (w, .05, bar), m['trim'], 0))
        if style == 'grid':
            for s in (-1, 1):
                parts.append(box(k, 'Mullion', (x + s * w / 4, y - .03, z), (bar * .8, .04, h), m['trim'], 0))
    if sill:
        parts.append(box(k, 'Sill', (x, y - depth - .03, z - hh - border - .02), (w + 2 * border + .16, .22, .1),
                         m['trim'], 0 if lite else .03))
    if lintel:
        parts.append(box(k, 'Lintel', (x, y - depth - .01, z + hh + border + .06), (w + 2 * border + .12, .16, .16),
                         m['trim'], 0 if lite else .04))
        parts.append(box(k, 'Keystone', (x, y - depth - .05, z + hh + border + .06), (.2, .12, .26), m['trim'],
                         0 if lite else .04))
    if shutters:
        sw = w * .48
        for s in (-1, 1):
            cx = x + s * (hw + border + sw / 2 + .02)
            parts.append(box(k, 'Shutter', (cx, y - .04, z), (sw, .07, h + border * 1.6), m['accent'], .025))
            for i in range(3):
                parts.append(box(k, 'Slat', (cx, y - .085, z - h * .3 + i * h * .3), (sw * .74, .03, h * .07),
                                 m['trim'] if 'slat' not in m else m['slat'], 0))
    if flowers:
        parts += flower_box(k, m, x, z - hh - border - .18, w + 2 * border + .2, y - depth - .05)
    return parts


def flower_box(k, m, x, z, w, y):
    """A window box whose top is at z, front at y, with trailing leaves and blooms."""
    parts = [box(k, 'FlowerBox', (x, y - .12, z - .14), (w, .3, .28), m['accent'], .05, 1),
             box(k, 'BoxRim', (x, y - .27, z - .04), (w + .04, .05, .06), m['trim'], 0)]
    parts.append(ball(k, 'Leaves', (x, y - .14, z + .06), (w * .48, .2, .16), m['leaf'], 10, 5))
    rng = random.Random(int(abs(x * 100 + z * 10)))
    n = max(3, int(w / .36))
    for i in range(n):
        fx = x - w * .4 + w * .8 * i / (n - 1)
        parts.append(ball(k, 'Bloom', (fx, y - .27 + rng.uniform(-.03, .05), z + .12 + rng.uniform(-.04, .06)),
                          .095, m['flower'], 6, 4))
    for s in (-1, 1):
        parts.append(ball(k, 'Trail', (x + s * w * .3, y - .3, z - .2), (.09, .07, .16), m['leaf'], 6, 4))
    return parts


def door(k, m, x, w=1.0, h=2.15, y=FRONT, z0=0., arch=False, glass_top=True, steps=2, step_mat=None, panels=True,
         canopy=False):
    """Front door with frame, panels, knob, fanlight and steps. Base at z0 (top step height)."""
    parts = []
    hw = w / 2
    border = .13
    zd = z0 + steps * .16
    if arch:
        outer = arch_outline(x - hw - border, zd, x + hw + border, zd + h + border)
        inner = arch_outline(x - hw, zd, x + hw, zd + h)
    else:
        outer = [(x - hw - border, zd), (x + hw + border, zd), (x + hw + border, zd + h + border),
                 (x - hw - border, zd + h + border)]
        outer = rounded(outer, [0, 0, .06, .06], 1)
        inner = rounded([(x - hw, zd), (x + hw, zd), (x + hw, zd + h), (x - hw, zd + h)], [0, 0, .03, .03], 1)
    parts.append(frame(k, 'DoorFrame', outer, inner, y, .12, m['trim'], bevel=.02))
    leaf_h = h * (.76 if glass_top else 1)
    parts.append(box(k, 'Door', (x, y + .01, zd + leaf_h / 2), (w, .1, leaf_h), m['accent'], .03))
    if glass_top:
        if arch:
            fan = arch_outline(x - hw, zd + leaf_h + .06, x + hw, zd + h)
        else:
            fan = rounded([(x - hw, zd + leaf_h + .06), (x + hw, zd + leaf_h + .06), (x + hw, zd + h), (x - hw, zd + h)],
                          .02, 1)
        parts.append(plate(k, 'Fanlight', fan, y + .02, .04, m['glass']))
        parts.append(box(k, 'DoorHead', (x, y - .02, zd + leaf_h + .03), (w, .08, .07), m['trim'], .02))
    if panels:
        for i, (pz, ph) in enumerate(((.26, .34), (.68, .38))):
            for s in (-1, 1):
                parts.append(box(k, 'Panel', (x + s * w * .21, y - .055, zd + leaf_h * pz), (w * .3, .04, leaf_h * ph),
                                 m['accent'], 0))
    parts.append(ball(k, 'Knob', (x + hw * .7, y - .08, zd + leaf_h * .5), .05, m['trim'], 6, 4))
    parts.append(box(k, 'Letterbox', (x, y - .06, zd + leaf_h * .47), (w * .34, .03, .06), m['trim'], .012))
    smat = step_mat or m['stone']
    for i in range(steps):
        sd = .34 * (steps - i)
        parts.append(box(k, 'Step', (x, y - sd / 2 + .02, z0 + i * .16 + .08), (w + .5 - i * .12, sd + .04, .16),
                         smat, .035, 1))
    if canopy:
        cz = zd + h + border + .12
        parts.append(k.prism('Canopy', [(-hw - .35, 0), (hw + .35, 0), (0, .5)], .7, m['roof'],
                             loc=(x, y - .35, cz), bevel=.04))
        for s in (-1, 1):
            parts.append(box(k, 'Bracket', (x + s * (hw + .2), y - .18, cz - .12), (.08, .32, .28), m['trim'], .02))
    return parts


# ----------------------------------------------------------------------------- stones
def add_pillow(bm, m4, w, d, h, mi, inset=.08, corner=.28, crown=.35, corner_seg=1):
    """A soft cushion stone: base ring (w x d) at z=0, inset top ring and a domed apex at z=h.
    corner_seg=1 gives an 8-sided (chamfered) ring, 2 a rounder 12-sided ring."""
    c = min(w, d) * corner

    def ring(hw, hd, cc, z):
        pts = rounded([(hw, -hd), (hw, hd), (-hw, hd), (-hw, -hd)], cc, corner_seg)
        return [bm.verts.new(m4 @ Vector((px, py, z))) for px, py in pts]
    ins = min(inset, w * .3, d * .3)
    base = ring(w / 2, d / 2, c, 0)
    top = ring(w / 2 - ins, d / 2 - ins, max(c - ins * .4, .01), h * (1 - crown))
    apex = bm.verts.new(m4 @ Vector((0, 0, h)))
    n = len(base)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((base[i], base[j], top[j], top[i])).material_index = mi
        bm.faces.new((top[i], top[j], apex)).material_index = mi


def add_block(bm, m4, w, d, h, mi, inset=.06, crown=.25):
    """A pillow stone with a closed bottom (for stones seen from below or the side)."""
    add_pillow(bm, m4, w, d, h, mi, inset, .28, crown)


def stone_face(x, y, z, rx=0., rz=0.):
    """Matrix for a pillow whose bulge points toward -Y (wall face stones)."""
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(math.pi / 2 + rx, 4, 'X')


def clip_x(o, lo=-4., hi=4.):
    """Cut a mesh to lo <= x <= hi (for seamless tiles)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(hi, 0, 0),
                           plane_no=(1, 0, 0), clear_outer=True)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(lo, 0, 0),
                           plane_no=(-1, 0, 0), clear_outer=True)
    bm.to_mesh(o.data)
    bm.free()
    return o


def wrap_rows(rng, lo, hi, wmin, wmax, period=8.):
    """Random running-bond partition of a periodic row; returns spans (a, b) that may cross hi."""
    start = lo + rng.uniform(0, wmax)
    spans = []
    x = start
    end = start + period
    while x < end - 1e-6:
        w = rng.uniform(wmin, wmax)
        if end - (x + w) < wmin * .8:
            w = end - x
        spans.append((x, x + w))
        x += w
    return spans


def periodic(spans, lo=-4., hi=4., period=8.):
    """Duplicate spans that cross the tile edge so clip_x makes them seamless."""
    out = []
    for a, b in spans:
        if b <= hi:
            out.append((a, b))
        elif a >= hi:
            out.append((a - period, b - period))
        else:
            out.append((a, b))
            out.append((a - period, b - period))
    return out


# ----------------------------------------------------------------------------- cloth and roofs
def awning(k, x, width, z_top, y, depth, drop, mat_a, mat_b, n=None, flap=.22, frame_mat=None):
    """Striped sloping awning from a wall at (y, z_top) out to (y - depth, z_top - drop) with a scalloped flap."""
    parts = []
    n = n or max(4, int(round(width / .5)))
    n += n % 2 == 0 and 1 or 0  # odd so both ends match
    sw = width / n
    length = math.hypot(depth, drop)
    ang = math.atan2(drop, depth)
    for i in range(n):
        cx = x - width / 2 + sw * (i + .5)
        m = mat_a if i % 2 == 0 else mat_b
        parts.append(box(k, 'Stripe', (cx, y - depth / 2, z_top - drop / 2), (sw + .002, length, .07), m, .025,
                         rot=(ang, 0, 0)))
        prof = [(-sw / 2, 0), (sw / 2, 0), (sw / 2, -flap * .55)]
        for j in range(1, 6):
            a = j / 6 * math.pi
            prof.append((sw / 2 * math.cos(a), -flap * .55 - flap * .45 * math.sin(a)))
        prof.append((-sw / 2, -flap * .55))
        parts.append(k.prism('Flap', prof, .04, m, loc=(cx, y - depth - .01, z_top - drop + .02), bevel=0))
    if frame_mat is not None:
        parts.append(rod(k, 'AwningBar', (x - width / 2, y - depth - .02, z_top - drop),
                         (x + width / 2, y - depth - .02, z_top - drop), .03, frame_mat))
        for s in (-1, 1):
            parts.append(rod(k, 'AwningArm', (x + s * (width / 2 - .05), y, z_top - drop - .3),
                             (x + s * (width / 2 - .05), y - depth, z_top - drop), .025, frame_mat))
    return parts


def roof_courses(k, name, mat, x0, x1, y0, y1, z0, z1, rows, thick=.09, overhang=.0):
    """Rows of overlapping tile courses on a slope from (y0, z0) (eave) up to (y1, z1) (ridge), spanning x0..x1."""
    parts = []
    dy, dz = y1 - y0, z1 - z0
    length = math.hypot(dy, dz)
    ang = math.atan2(dz, dy)
    step = length / rows
    for i in range(rows):
        t = (i + .5) / rows
        cy, cz = y0 + dy * t, z0 + dz * t
        nrm = Vector((0, -dz, dy)).normalized() * (thick * .5)
        if nrm.z < 0:
            nrm = -nrm
        parts.append(box(k, name, (0 + (x0 + x1) / 2, cy + nrm.y, cz + nrm.z), (x1 - x0 + overhang, step * 1.12, thick),
                         mat, .035, 1, rot=(ang, 0, 0)))
    return parts


def sign_board(k, x, z, y, w, h, board, rim, depth=.08):
    return [box(k, 'Board', (x, y - depth / 2, z), (w, depth, h), board, .03, 2),
            frame(k, 'BoardRim', rounded([(x - w / 2 - .05, z - h / 2 - .05), (x + w / 2 + .05, z - h / 2 - .05),
                                          (x + w / 2 + .05, z + h / 2 + .05), (x - w / 2 - .05, z + h / 2 + .05)], .05, 1),
                  rounded([(x - w / 2 + .03, z - h / 2 + .03), (x + w / 2 - .03, z - h / 2 + .03),
                           (x + w / 2 - .03, z + h / 2 - .03), (x - w / 2 + .03, z + h / 2 - .03)], .03, 1),
                  y - depth + .02, .04, rim, bevel=.01)]


def star(outer, inner, n=5, phase=math.pi / 2):
    pts = []
    for i in range(n * 2):
        a = phase + i * math.pi / n
        r = outer if i % 2 == 0 else inner
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return pts


def circle(r, n=16, cx=0., cz=0.):
    return [(cx + math.cos(i / n * math.tau) * r, cz + math.sin(i / n * math.tau) * r) for i in range(n)]


def lumps(k, name, mat, center, radii, n, rng, spread=1., seg=10, rings=6, squash=1.):
    """A cluster of soft balls (foliage clumps, rock heaps)."""
    parts = []
    cx, cy, cz = center
    for i in range(n):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(.3, 1.) * spread
        r = rng.uniform(radii[0], radii[1])
        parts.append(k.ball(name, (cx + math.cos(a) * rr, cy + math.sin(a) * rr * .6, cz + rng.uniform(-.2, .3) * r),
                            (r, r * .9, r * squash), mat, seg, rings))
    return parts


def tube(k, name, points, radius, mat, res=1, closed=False):
    """Round tube through a polyline with a light cross-section (bevel_resolution `res`)."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = res
    curve.use_fill_caps = True
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1)
    spline.use_cyclic_u = closed
    o = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object
    o.select_set(False)
    o.data.materials.clear()
    o.data.materials.append(mat)
    k.current.append(o)
    return o


def pot(k, name, loc, r, h, mat, seg=8):
    """Chimney pot / flower pot: tapered with a rolled rim (one light lathe)."""
    prof = [(r * .8, 0), (r * 1.1, h * .82), (r * 1.1, h), (r * .7, h)]
    return k.lathe(name, prof, mat, loc=loc, segments=seg)


def sweep(k, name, points, radii, mat, v=8, cap=True, flat=1.):
    """A tube swept through `points` with a per-point radius (0 closes to a tip). `flat` squashes the
    cross-section (blades, leaves)."""
    pts = [Vector(p) for p in points]
    bm = bmesh.new()
    rings = []
    prev = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < .9 else Vector((1, 0, 0))
            n = t.cross(ref).normalized()
        else:
            n = (prev - t * prev.dot(t)).normalized()
        b = t.cross(n)
        prev = n
        r = radii[i]
        if r <= 1e-5:
            rings.append([bm.verts.new(p)])
        else:
            rings.append([bm.verts.new(p + (n * math.cos(a) * flat + b * math.sin(a)) * r)
                          for a in [j / v * math.tau for j in range(v)]])
    for ra, rb in zip(rings, rings[1:]):
        if len(rb) == 1:
            for j in range(v):
                bm.faces.new((ra[j], ra[(j + 1) % v], rb[0]))
        elif len(ra) == 1:
            for j in range(v):
                bm.faces.new((ra[0], rb[(j + 1) % v], rb[j]))
        else:
            for j in range(v):
                bm.faces.new((ra[j], ra[(j + 1) % v], rb[(j + 1) % v], rb[j]))
    if cap and len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if cap and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_object(k, name, bm, [mat])


def place(parts, loc=(0, 0, 0), rot=(0, 0, 0), pivot=(0, 0, 0)):
    """Rigidly move already-built parts: rotate about `pivot`, then translate by `loc`."""
    from mathutils import Euler
    bpy.context.view_layer.update()
    m = (Matrix.Translation(Vector(loc) + Vector(pivot)) @ Euler(rot).to_matrix().to_4x4()
         @ Matrix.Translation(-Vector(pivot)))
    for p in parts:
        p.matrix_world = m @ p.matrix_world
    return parts
