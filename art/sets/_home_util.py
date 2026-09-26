"""Geometry helpers for the Cottage on Gull Lane kit (art/sets/home.py).

These extend art/kit.py without changing it: pillow ("puff") shapes from 2D
outlines, profile rails, lofts, low reliefs, seamless X clipping for 8 m tiles
and small deformers. Every helper registers its object in `kit.current` so
`kit.join` and `kit.paint` treat it like a kit primitive.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.tau

# Cottage colours on top of kit.PALETTE (sRGB hex).
HONEY = '#e8973f'
HONEY_LIGHT = '#f4b25a'
HONEY_DEEP = '#d27f2e'
WOOD_SEAM = '#8f4a1f'
CORAL_SOFT = '#ff8a66'
TEAL_LIGHT = '#2fc0cf'
CREAM_WARM = '#ffe6bf'
TERRACOTTA = '#e2703f'


# ----------------------------------------------------------------------------- core
def link(kit, name, bm, materials, recalc=True):
    """Turn a bmesh into a scene object with one or more material slots."""
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    for m in (materials if isinstance(materials, (list, tuple)) else [materials]):
        mesh.materials.append(m)
    kit.current.append(o)
    return o


def place(o, loc=None, rot=None):
    if loc is not None:
        o.location = loc
    if rot is not None:
        o.rotation_euler = rot
    return o


def rounded_rect(u0, u1, v0, v1, r, seg=3, corners=(True, True, True, True)):
    """CCW outline of a rectangle with rounded corners (BL, BR, TR, TL flags)."""
    r = max(0., min(r, (u1 - u0) / 2 - 1e-4, (v1 - v0) / 2 - 1e-4))
    spec = [((u0 + r, v0 + r), math.pi, (u0, v0)), ((u1 - r, v0 + r), 1.5 * math.pi, (u1, v0)),
            ((u1 - r, v1 - r), 0., (u1, v1)), ((u0 + r, v1 - r), .5 * math.pi, (u0, v1))]
    pts = []
    for (c, a0, sharp), rounded in zip(spec, corners):
        if not rounded or r <= 0:
            pts.append(sharp)
            continue
        for i in range(seg + 1):
            a = a0 + (math.pi / 2) * i / seg
            pts.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    return pts


def circle(r, n, cx=0., cy=0., start=0.):
    return [(cx + r * math.cos(start + i * TAU / n), cy + r * math.sin(start + i * TAU / n)) for i in range(n)]


def star(outer, inner, n=5, tip_round=0., start=math.pi / 2, steps=2):
    """Star outline; tip_round > 0 softens tips and valleys with a few corner cuts."""
    pts = []
    for i in range(n * 2):
        a = start + i * math.pi / n
        rad = outer if i % 2 == 0 else inner
        pts.append((math.cos(a) * rad, math.sin(a) * rad))
    if tip_round > 0:
        pts = chaikin(pts, steps, tip_round)
    return pts


def heart(size, n=36):
    """Heart outline (lobes up, point down), about `size` wide, centred near its middle."""
    pts = []
    for i in range(n):
        t = TAU * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 34 * size, (y + 2.5) / 34 * size))
    return pts[::-1] if _area(pts) < 0 else pts


def blob(r, n, wobble, seed, sx=1., sy=1.):
    """Irregular rounded outline (stones, puddles)."""
    rnd = random.Random(seed)
    phases = [rnd.uniform(0, TAU) for _ in range(3)]
    amps = [wobble * rnd.uniform(.5, 1.) for _ in range(3)]
    pts = []
    for i in range(n):
        a = TAU * i / n
        k = 1 + sum(amp * math.sin((j + 2) * a + ph) for j, (amp, ph) in enumerate(zip(amps, phases)))
        pts.append((math.cos(a) * r * k * sx, math.sin(a) * r * k * sy))
    return pts


def chaikin(pts, iterations=2, cut=.25, closed=True):
    for _ in range(iterations):
        out = []
        m = len(pts)
        rng = range(m) if closed else range(m - 1)
        if not closed:
            out.append(pts[0])
        for i in rng:
            p, q = pts[i], pts[(i + 1) % m]
            out.append((p[0] + (q[0] - p[0]) * cut, p[1] + (q[1] - p[1]) * cut))
            out.append((p[0] + (q[0] - p[0]) * (1 - cut), p[1] + (q[1] - p[1]) * (1 - cut)))
        if not closed:
            out.append(pts[-1])
        pts = out
    return pts


def _area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
               for i in range(len(pts))) / 2


def _plane(plane):
    """Map (u, v, w) -> xyz where w is the 'toward the viewer' axis of the plane."""
    return {
        'XZ': lambda u, v, w: (u, -w, v),     # front faces -Y (wall decals, pickups)
        'XY': lambda u, v, w: (u, v, w),      # front faces +Z (things lying flat)
        'YZ': lambda u, v, w: (-w, u, v),     # front faces -X
        'ZY': lambda u, v, w: (w, u, v),      # front faces +X
    }[plane]


# ----------------------------------------------------------------------------- shapes
def puff(kit, name, outline, depth, material, rings=4, n=2.4, center=None, loc=(0, 0, 0), rot=None,
         plane='XZ', back='puff', back_depth=None, inflate=None):
    """Pillow shape: a 2D outline inflated into a soft, rounded solid.

    `depth` is the total thickness (front + back halves). back='puff' mirrors the
    front, 'flat' closes it with a flat face, 'none' leaves it open (reliefs that
    sit on a surface). `n` > 2 makes flatter faces with rounder edges.
    """
    if center is None:
        center = (sum(p[0] for p in outline) / len(outline), sum(p[1] for p in outline) / len(outline))
    cu, cv = center
    e = 2 / n
    P = _plane(plane)
    bm = bmesh.new()
    count = len(outline)
    rim = [bm.verts.new(P(u, v, 0)) for u, v in outline]
    sides = [(1, depth / 2)]
    if back == 'puff':
        sides.append((-1, (back_depth if back_depth is not None else depth) / 2))
    for sign, d in sides:
        prev = rim
        for k in range(1, rings):
            phi = (math.pi / 2) * k / rings
            s = math.cos(phi) ** e
            h = math.sin(phi) ** e * d * sign
            ring = [bm.verts.new(P(cu + (u - cu) * s, cv + (v - cv) * s, h)) for u, v in outline]
            for i in range(count):
                j = (i + 1) % count
                bm.faces.new((prev[i], prev[j], ring[j], ring[i]))
            prev = ring
        c = bm.verts.new(P(cu, cv, d * sign))
        for i in range(count):
            j = (i + 1) % count
            bm.faces.new((prev[i], prev[j], c))
    if back == 'flat':
        bm.faces.new(rim[::-1])
    if back == 'none':
        # Open reliefs: orient faces toward the viewer axis.
        axis = Vector(P(0, 0, 1))
        for f in bm.faces:
            f.normal_update()
            if f.normal.dot(axis) < 0:
                f.normal_flip()
        o = link(kit, name, bm, material, recalc=False)
    else:
        o = link(kit, name, bm, material)
    return place(o, loc, rot)


def relief(kit, name, outline, height, material, loc=(0, 0, 0), plane='XZ', rot=None, rings=2):
    """A low raised badge on a surface: outline at the surface, a bevelled plateau on top
    (rings=1 gives a faceted, pyramid-like stud)."""
    return puff(kit, name, outline, height * 2, material, rings=rings, n=3.2, loc=loc, rot=rot, plane=plane,
                back='none')


def rail(kit, name, profile, x0, x1, material, caps=True):
    """Extrude a closed (y, z) profile along X from x0 to x1 (skirting, rails, slabs)."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in profile]
    b = [bm.verts.new((x1, y, z)) for y, z in profile]
    m = len(profile)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps:
        bm.faces.new(a[::-1])
        bm.faces.new(b)
    return link(kit, name, bm, material)


def loft(kit, name, loops, material, caps=(True, True), closed=True, pick=None):
    """Skin a list of 3D point loops (same point count) into one surface.

    `material` may be a list; `pick(loop_index, point_index)` then returns the material
    index of each side face (caps use index 0).
    """
    bm = bmesh.new()
    rows = [[bm.verts.new(p) for p in loop] for loop in loops]
    m = len(loops[0])
    for li, (r0, r1) in enumerate(zip(rows, rows[1:])):
        for i in range(m if closed else m - 1):
            j = (i + 1) % m
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            if pick:
                f.material_index = pick(li, i)
    if closed and caps[0]:
        bm.faces.new(rows[0][::-1])
    if closed and caps[1]:
        bm.faces.new(rows[-1])
    return link(kit, name, bm, material)


def extrude_z(kit, name, outline, z0, z1, material, bevel=0., segments=1):
    """Extrude an (x, y) outline vertically."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z0)) for x, y in outline]
    b = [bm.verts.new((x, y, z1)) for x, y in outline]
    m = len(outline)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    o = link(kit, name, bm, material)
    if bevel > 0:
        kit._bevel(o, bevel, segments)
    return o


def disc(kit, name, outline, z, material, loc=(0, 0, 0), dome=0., rings=1):
    """Flat (optionally slightly domed) top-facing patch; no underside."""
    bm = bmesh.new()
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    rim = [bm.verts.new((x, y, z)) for x, y in outline]
    prev = rim
    for k in range(1, rings):
        s = 1 - k / rings
        ring = [bm.verts.new((cx + (x - cx) * s, cy + (y - cy) * s, z + dome * (1 - s * s))) for x, y in outline]
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            bm.faces.new((prev[i], prev[j], ring[j], ring[i]))
        prev = ring
    c = bm.verts.new((cx, cy, z + dome))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((prev[i], prev[j], c))
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return place(link(kit, name, bm, material, recalc=False), loc)


def ring_band(kit, name, r0, r1, z, material, segments=48, lip=0.):
    """Flat annulus facing +Z (rug bands)."""
    prof = [(r0, z), (r1, z)] if lip <= 0 else [(r0, z), (r1 - lip, z), (r1, z - lip)]
    o = kit.lathe(name, prof, material, segments=segments)
    return o


# ----------------------------------------------------------------------------- mesh ops
def bake(o):
    """Apply an object's transform into its mesh."""
    o.data.transform(o.matrix_basis)
    o.matrix_basis = Matrix.Identity(4)
    return o


def deform(o, fn):
    """Move every vertex (world space) with fn(Vector) -> Vector. Bakes the transform first."""
    bake(o)
    for v in o.data.vertices:
        v.co = fn(v.co.copy())
    o.data.update()
    return o


def clip_x(o, x0=-4., x1=4.):
    """Cut a joined object to x0..x1 so 8 m tiles meet without bevelled ends."""
    bake(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(x1, 0, 0), plane_no=(1, 0, 0), clear_outer=True)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(x0, 0, 0), plane_no=(-1, 0, 0), clear_outer=True)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return o


def clip_plane(o, co, no):
    """Remove everything on the `no` side of a plane (bake first)."""
    bake(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no, clear_outer=True)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return o


def wrap_copies(xs, lo=-4., hi=4., margin=.5):
    """Positions plus their +-8 m copies that still reach into the tile (for seamless tiles)."""
    out = []
    for x in xs:
        for dx in (-8., 0., 8.):
            if lo - margin <= x + dx <= hi + margin:
                out.append(x + dx)
    return out


def tris(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def bezier(p0, p1, p2, p3, n):
    """Sample a cubic Bezier into n+1 points."""
    p0, p1, p2, p3 = (Vector(p) for p in (p0, p1, p2, p3))
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(tuple(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3))
    return pts


def arc_points(center, radius, a0, a1, n, plane='XZ'):
    cx, cy, cz = center
    pts = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        if plane == 'XZ':
            pts.append((cx + radius * math.cos(a), cy, cz + radius * math.sin(a)))
        elif plane == 'YZ':
            pts.append((cx, cy + radius * math.cos(a), cz + radius * math.sin(a)))
        else:
            pts.append((cx + radius * math.cos(a), cy + radius * math.sin(a), cz))
    return pts


def lathe(kit, name, profile, materials, seg_mats=None, segments=32, loc=(0, 0, 0), rot=None, caps=True):
    """Spin an (r, z) profile around Z with a material index per profile segment.

    Unlike kit.lathe, open ends are only capped when `caps` is set, so annuli
    and rims never grow a coplanar disc.
    """
    mats = materials if isinstance(materials, (list, tuple)) else [materials]
    bm = bmesh.new()
    rings = []
    for i in range(segments):
        a = i * TAU / segments
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * ca, r * sa, z)) for r, z in profile])
    for i in range(segments):
        r0, r1 = rings[i], rings[(i + 1) % segments]
        for j in range(len(profile) - 1):
            f = bm.faces.new((r0[j], r0[j + 1], r1[j + 1], r1[j]))
            if seg_mats:
                f.material_index = seg_mats[j]
    if caps and profile[0][0] > 1e-4:
        bm.faces.new([ring[0] for ring in rings])
    if caps and profile[-1][0] > 1e-4:
        bm.faces.new([ring[-1] for ring in reversed(rings)])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    closed = (profile[0][0] <= 1e-4 or caps) and (profile[-1][0] <= 1e-4 or caps)
    if closed:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    else:
        # Open bands and annuli: face away from the axis and upward.
        for f in bm.faces:
            f.normal_update()
            c = f.calc_center_median()
            want = Vector((c.x, c.y, 0)).normalized() + Vector((0, 0, .5))
            if f.normal.dot(want) < 0:
                f.normal_flip()
    o = link(kit, name, bm, mats, recalc=False)
    return place(o, loc, rot)


def sector_ball(kit, name, loc, radius, materials, sectors=6, segments=18, rings=10, axis_tilt=(0, 0, 0)):
    """UV sphere whose longitude sectors alternate materials (beach balls, marbles)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    n = len(materials)
    for f in bm.faces:
        c = f.calc_center_median()
        a = (math.atan2(c.y, c.x) + TAU) % TAU
        if abs(c.z) > radius * .93:
            f.material_index = n - 1 if n > sectors else 0
        else:
            f.material_index = int(a / TAU * sectors) % min(n, sectors)
    o = link(kit, name, bm, list(materials))
    return place(o, loc, axis_tilt)


def pillow_outline(w, h, n=28, pinch=.07, power=.55):
    """Square-ish cushion outline with plump corners and slightly pinched sides."""
    pts = []
    for i in range(n):
        t = TAU * i / n
        c, s = math.cos(t), math.sin(t)
        x = math.copysign(abs(c) ** power, c)
        y = math.copysign(abs(s) ** power, s)
        k = 1 - pinch * math.cos(4 * t)
        pts.append((x * w / 2 * k, y * h / 2 * k))
    return pts


def leaf_outline(length, width, n=8, tip=.12):
    """Pointed leaf from its base at (0, 0) to its tip at (0, length); CCW."""
    right, left = [], []
    for i in range(1, n):
        t = i / n
        wdt = width / 2 * math.sin(math.pi * t ** .8) * (1 - tip * t)
        right.append((wdt, length * t))
        left.append((-wdt, length * t))
    return [(0, 0)] + right + [(0, length)] + left[::-1]


def scallop_circle(r, lobes, depth, n_per=4):
    pts = []
    total = lobes * n_per
    for i in range(total):
        a = TAU * i / total
        k = 1 - depth + depth * abs(math.cos(a * lobes / 2))
        pts.append((math.cos(a) * r * k, math.sin(a) * r * k))
    return pts


def decal(kit, name, center, radii, direction, size, material, lift=0., seg=10, rings=5):
    """Low-poly version of kit.decal: a flattened ellipsoid lying on an ellipsoid surface."""
    p, n = kit.on_ellipsoid(center, radii, direction, lift)
    o = kit.ball(name, p, size, material, seg, rings)
    o.rotation_euler = n.to_track_quat('-Y', 'Z').to_euler()
    return o
