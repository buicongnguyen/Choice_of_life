"""Parametric toy people, hair, accessories and Biscuit the dog.

Runtime contract (checked by src/render/assets.test.ts through the manifest):
  body_*.glb   Root > Hips > {Torso > {Head, ArmL, ArmR}, LegL, LegR}
               empties: HeadCenter (extras.radius), HandR, HandL, Back, Chest
               materials: Skin, Hair (brows), Top, Bottom, Shoes, Accent, Eye, EyeShine, Blush, Mouth
  hair_*.glb   modelled for a unit head centred at the origin; material Hair (+ HairTie)
  acc_*.glb    head accessories are unit-head sized; body accessories are real size
  dog.glb      Root > Body > {Head > {EarL, EarR}, Tail, LegFL, LegFR, LegBL, LegBR}
Every joint's origin is its pivot, so the runtime animates by rotating joints.
Models face -Y in Blender (+Z in glTF / Three.js).
"""
import math

from mathutils import Vector

from kit import GLOSS, MATTE, SATIN

AGES = {
    'toddler': dict(head=.25, foot_h=.05, leg=.16, hips_h=.12, torso_h=.19, torso_w=.31, torso_d=.25,
                    hips_w=.30, arm=.19, arm_r=.052, leg_r=.064, hand=.058),
    'child': dict(head=.265, foot_h=.055, leg=.25, hips_h=.12, torso_h=.25, torso_w=.33, torso_d=.24,
                  hips_w=.31, arm=.25, arm_r=.053, leg_r=.066, hand=.06),
    'teen': dict(head=.28, foot_h=.065, leg=.35, hips_h=.14, torso_h=.31, torso_w=.38, torso_d=.26,
                 hips_w=.35, arm=.32, arm_r=.058, leg_r=.074, hand=.066),
    'adult': dict(head=.29, foot_h=.07, leg=.39, hips_h=.15, torso_h=.35, torso_w=.44, torso_d=.29,
                  hips_w=.39, arm=.36, arm_r=.065, leg_r=.083, hand=.073),
    'elder': dict(head=.29, foot_h=.07, leg=.35, hips_h=.15, torso_h=.33, torso_w=.45, torso_d=.31,
                  hips_w=.40, arm=.34, arm_r=.063, leg_r=.08, hand=.071),
}

DEFAULT_COLOURS = dict(skin='#e9a878', hair='#4a2c1d', top='coral', bottom='denim', shoes='white',
                       accent='marigold')


def materials(kit, c):
    """The shared character material set. Names are the runtime recolour contract."""
    c = {**DEFAULT_COLOURS, **c}
    return dict(
        skin=kit.mat('Skin', c['skin'], .55),
        hair=kit.mat('Hair', c['hair'], .42),
        top=kit.mat('Top', c['top'], SATIN),
        bottom=kit.mat('Bottom', c['bottom'], SATIN),
        shoes=kit.mat('Shoes', c['shoes'], GLOSS),
        accent=kit.mat('Accent', c['accent'], GLOSS),
        sole=kit.mat('Sole', '#f6efe6', MATTE),
        eye=kit.mat('Eye', '#1b1426', .12),
        shine=kit.mat('EyeShine', '#ffffff', .2, emit=1.4),
        blush=kit.mat('Blush', 'blush', .6),
        mouth=kit.mat('Mouth', '#7a2233', .4),
        shirt=kit.mat('Shirt', '#fbf6ee', SATIN),
        metal=kit.mat('Button', 'brass', .3, metal=.6),
    )


# --------------------------------------------------------------------------- face
def build_face(kit, m, center, r, age):
    """Big glossy eyes with highlights, brows, blush, nose, smile and ears."""
    radii = (r, r * .94, r * .92)
    parts = []
    big = {'toddler': 1.12, 'child': 1.06, 'teen': 1.0, 'adult': .94, 'elder': .86, 'baby': 1.18}[age]
    for s in (-1, 1):
        eye = kit.decal('Eye', center, radii, (s * .37, -1, .02), (r * .13 * big, r * .06, r * .17 * big), m['eye'],
                        lift=-r * .02)
        parts.append(eye)
        p, n = kit.on_ellipsoid(center, radii, (s * .37 + .06, -1, .12))
        parts.append(kit.ball('EyeShine', p + n * r * .02, r * .045 * big, m['shine'], 12, 8))
        p, n = kit.on_ellipsoid(center, radii, (s * .37 - .05, -1, -.05))
        parts.append(kit.ball('EyeShine', p + n * r * .025, r * .022 * big, m['shine'], 10, 6))
        brow = kit.decal('Brow', center, radii, (s * .38, -1, .36), (r * .12, r * .05, r * .035), m['hair'],
                         lift=r * .01, spin=s * .16)
        parts.append(brow)
        parts.append(kit.decal('Blush', center, radii, (s * .62, -1, -.24), (r * .12, r * .03, r * .075), m['blush'],
                               lift=-r * .005))
        ear, _ = kit.on_ellipsoid(center, radii, (s, .05, -.05))
        parts.append(kit.ball('Ear', ear - Vector((s * r * .04, 0, 0)), (r * .1, r * .13, r * .16), m['skin'], 14, 10))
    p, n = kit.on_ellipsoid(center, radii, (0, -1, -.14))
    parts.append(kit.ball('Nose', p, (r * .075, r * .06, r * .06), m['skin'], 14, 10))
    p, n = kit.on_ellipsoid(center, radii, (0, -1, -.32))
    smile = kit.torus('Mouth', p + n * r * .005, r * .1, r * .026, m['mouth'], arc=math.radians(150))
    # The torus lies in XY with the kept arc on -Y; tip it so the ring faces the face normal
    # and the arc hangs downward as a smile.
    smile.rotation_euler = (math.atan2(-n.y, n.z), 0, 0)
    parts.append(smile)
    return parts


# --------------------------------------------------------------------------- bodies
def build_body(kit, age='adult', outfit='jacket', colours=None):
    """A standing toy person. Returns the Root empty."""
    a = AGES[age]
    m = materials(kit, colours or {})
    hw, hh, td, tw, th = a['hips_w'], a['hips_h'], a['torso_d'], a['torso_w'], a['torso_h']
    z_hip = a['foot_h'] + a['leg']
    z_waist = z_hip + hh * .55
    z_neck = z_waist + th
    r = a['head']
    head_c = Vector((0, 0, z_neck + r * .82))
    z_sh = z_waist + th * .8
    leg_x = hw * .27
    sleeves = {'tee': 'short', 'dress': 'short', 'scrubs': 'short'}.get(outfit, 'long')
    legwear = {'tee': 'shorts', 'dress': 'skirt', 'onesie': 'long'}.get(outfit, 'long')

    # ------------------------------------------------------------------ legs
    legs = {}
    for side, s in (('L', 1), ('R', -1)):
        x = s * leg_x
        parts = []
        top = Vector((x, 0, z_hip + a['leg_r'] * .3))
        ankle = Vector((x, 0, a['foot_h'] + a['leg_r'] * .6))
        if legwear == 'long':
            parts.append(kit.limb('Pant', top, ankle + Vector((0, 0, a['leg_r'] * .3)), a['leg_r'] * 1.12,
                                  a['leg_r'] * 1.02, m['bottom']))
            parts.append(kit.cyl('Cuff', ankle + Vector((0, 0, a['leg_r'] * .35)), a['leg_r'] * 1.12,
                                 a['leg_r'] * .5, m['bottom'], bevel=a['leg_r'] * .2))
        else:
            parts.append(kit.limb('Leg', top, ankle, a['leg_r'], a['leg_r'] * .9, m['skin']))
            if legwear == 'shorts':
                knee = top + (ankle - top) * .42
                parts.append(kit.limb('Shorts', top, knee, a['leg_r'] * 1.35, a['leg_r'] * 1.3, m['bottom']))
            parts.append(kit.cyl('Sock', ankle + Vector((0, 0, a['leg_r'] * .15)), a['leg_r'] * .98,
                                 a['leg_r'] * .8, m['shirt'], bevel=a['leg_r'] * .2))
        fh = a['foot_h']
        parts.append(kit.box('Shoe', (x, -a['leg_r'] * .55, fh * .62), (a['leg_r'] * 2.25, a['leg_r'] * 3.6, fh * 1.35),
                             m['shoes'], bevel=fh * .6, segments=4))
        parts.append(kit.box('Sole', (x, -a['leg_r'] * .55, fh * .13), (a['leg_r'] * 2.35, a['leg_r'] * 3.7, fh * .32),
                             m['sole'], bevel=fh * .14, segments=2))
        legs[side] = kit.join('Leg' + side, parts, pivot=(x, 0, z_hip))

    # ------------------------------------------------------------------ hips
    parts = [kit.box('Hips', (0, 0, z_hip + hh * .15), (hw, td * .92, hh * 1.1), m['bottom'], bevel=hh * .45, segments=4)]
    if legwear == 'skirt':
        parts[0].data.materials[0] = m['top']
        skirt_h = a['leg'] * .55
        parts.append(kit.cyl('Skirt', (0, 0, z_hip - skirt_h * .35), hw * .95, skirt_h, m['top'], vertices=28,
                             radius2=hw * .6, bevel=.03))
        parts.append(kit.torus('Hem', (0, 0, z_hip - skirt_h * .82), hw * .92, .018, m['accent']))
    if outfit in ('jacket', 'suit', 'cardigan', 'overalls', 'hoodie', 'varsity', 'sweater', 'scrubs'):
        parts.append(kit.box('Belt', (0, 0, z_hip + hh * .55), (hw * 1.02, td * .95, hh * .22), m['bottom'],
                             bevel=hh * .1))
    hips = kit.join('Hips', parts, pivot=(0, 0, z_hip))

    # ------------------------------------------------------------------ torso
    parts = []
    body_mat = m['accent'] if outfit in ('jacket',) else m['top']
    parts.append(kit.tbox('Chest', (0, 0, z_waist + th * .5), (tw, td * .94), (tw * .92, td), th, body_mat,
                          bevel=min(tw, td) * .42, segments=5))
    front_y = -td * .5
    if outfit in ('jacket', 'suit'):
        # Shirt V and lapels on the front; the tie only for the suit.
        parts.append(kit.prism('ShirtV', [(-tw * .16, th * .98), (tw * .16, th * .98), (0, th * .35)], .03, m['shirt'],
                               loc=(0, front_y - .004, z_waist), bevel=.008))
        for s in (-1, 1):
            parts.append(kit.prism('Lapel', [(s * tw * .05, th * .98), (s * tw * .2, th * .95), (s * tw * .03, th * .4)],
                                   .035, m['accent'] if outfit == 'suit' else m['top'],
                                   loc=(0, front_y - .02, z_waist), bevel=.01))
        if outfit == 'suit':
            parts.append(kit.prism('Tie', [(-.025, th * .92), (.025, th * .92), (.035, th * .45), (0, th * .36),
                                           (-.035, th * .45)], .02, m['accent'], loc=(0, front_y - .035, z_waist),
                                   bevel=.006))
        for i in range(2):
            parts.append(kit.cyl('Button', (0, front_y - .02, z_waist + th * (.28 - i * .14)), .018, .02, m['metal'],
                                 axis='Y', bevel=.005))
    elif outfit == 'hoodie':
        parts.append(kit.torus('Hood', (0, td * .12, z_neck - .005), tw * .3, tw * .1, m['top'],
                               rot=(math.radians(-18), 0, 0)))
        parts.append(kit.box('Pocket', (0, front_y - .01, z_waist + th * .25), (tw * .6, .04, th * .3),
                             m['accent'], bevel=.015))
        for s in (-1, 1):
            parts.append(kit.capsule('String', (s * .04, front_y - .02, z_neck - .02),
                                     (s * .045, front_y - .03, z_neck - th * .3), .01, m['shirt']))
    elif outfit in ('tee', 'sweater', 'varsity', 'dress'):
        parts.append(kit.torus('Collar', (0, 0, z_neck - .005), tw * .19, .022, m['accent']))
        if outfit == 'tee':
            p = (0, front_y - .01, z_waist + th * .55)
            parts.append(kit.prism('Star', star_points(th * .17, th * .075), .03, m['accent'], loc=p, bevel=.006))
        if outfit == 'varsity':
            parts.append(kit.box('Letter', (-tw * .22, front_y - .01, z_waist + th * .65), (th * .2, .03, th * .24),
                                 m['shirt'], bevel=.01))
            parts.append(kit.box('Trim', (0, 0, z_waist + th * .05), (tw * 1.02, td * 1.02, th * .1), m['accent'],
                                 bevel=.02))
    elif outfit == 'scrubs':
        parts.append(kit.prism('VNeck', [(-tw * .13, th * .99), (tw * .13, th * .99), (0, th * .66)], .03, m['skin'],
                               loc=(0, front_y - .004, z_waist), bevel=.006))
        parts.append(kit.box('Badge', (tw * .22, front_y - .012, z_waist + th * .62), (.07, .02, .09), m['accent'],
                             bevel=.01))
        parts.append(kit.box('Pocket', (-tw * .2, front_y - .01, z_waist + th * .45), (tw * .26, .03, th * .22),
                             m['top'], bevel=.012))
    elif outfit == 'overalls':
        parts.append(kit.box('Bib', (0, front_y + .02, z_waist + th * .35), (tw * .62, .06, th * .62), m['bottom'],
                             bevel=.025))
        parts.append(kit.box('BibPocket', (0, front_y - .01, z_waist + th * .42), (tw * .3, .03, th * .2), m['bottom'],
                             bevel=.012))
        for s in (-1, 1):
            parts.append(kit.box('Strap', (s * tw * .24, 0, z_waist + th * .8), (.055, td * 1.04, th * .42), m['bottom'],
                                 bevel=.02))
            parts.append(kit.cyl('Button', (s * tw * .24, front_y - .02, z_waist + th * .66), .022, .02, m['metal'],
                                 axis='Y', bevel=.005))
    elif outfit == 'cardigan':
        parts.append(kit.prism('ShirtV', [(-tw * .15, th * .98), (tw * .15, th * .98), (0, th * .45)], .03, m['shirt'],
                               loc=(0, front_y - .004, z_waist), bevel=.008))
        for i in range(4):
            parts.append(kit.cyl('Button', (0, front_y - .02, z_waist + th * (.4 - i * .1)), .016, .02, m['accent'],
                                 axis='Y', bevel=.005))
        for s in (-1, 1):
            parts.append(kit.box('Pocket', (s * tw * .25, front_y - .01, z_waist + th * .2), (tw * .22, .03, th * .18),
                                 m['top'], bevel=.012))
    parts.append(kit.cyl('Neck', (0, 0, z_neck + r * .05), r * .3, r * .35, m['skin'], bevel=.01))
    torso = kit.join('Torso', parts, pivot=(0, 0, z_waist))

    # ------------------------------------------------------------------ arms
    arms = {}
    for side, s in (('L', 1), ('R', -1)):
        sh = Vector((s * (tw * .5 + a['arm_r'] * .1), 0, z_sh))
        hand = sh + Vector((s * a['arm'] * .2, -a['arm'] * .05, -a['arm']))
        parts = []
        sleeve_mat = m['accent'] if outfit == 'varsity' or outfit == 'jacket' else m['top']
        if sleeves == 'long':
            parts.append(kit.limb('Sleeve', sh, hand - (hand - sh) * .08, a['arm_r'] * 1.2, a['arm_r'] * 1.05, sleeve_mat))
            parts.append(kit.limb('Cuff', hand - (hand - sh) * .18, hand - (hand - sh) * .06, a['arm_r'] * 1.12,
                                  a['arm_r'] * 1.12, m['accent'] if outfit in ('hoodie', 'cardigan') else sleeve_mat))
        else:
            parts.append(kit.limb('Arm', sh, hand, a['arm_r'], a['arm_r'] * .9, m['skin']))
            parts.append(kit.limb('Sleeve', sh + Vector((0, 0, a['arm_r'] * .3)), sh + (hand - sh) * .38,
                                  a['arm_r'] * 1.35, a['arm_r'] * 1.25, m['top']))
        parts.append(kit.ball('Hand', hand, (a['hand'], a['hand'] * .95, a['hand'] * 1.05), m['skin'], 18, 12))
        parts.append(kit.ball('Thumb', hand + Vector((-s * a['hand'] * .2, -a['hand'] * .7, a['hand'] * .25)),
                              a['hand'] * .38, m['skin'], 12, 8))
        arms[side] = (kit.join('Arm' + side, parts, pivot=sh), hand)

    # ------------------------------------------------------------------ head
    parts = [kit.ball('Skull', head_c, (r, r * .94, r * .92), m['skin'], 30, 18)]
    parts += build_face(kit, m, head_c, r, age)
    head = kit.join('Head', parts, pivot=(0, 0, z_neck), sharp_angle=80)

    # ------------------------------------------------------------------ hierarchy
    root = kit.empty('Root', (0, 0, 0), props={'age': age, 'outfit': outfit, 'height': float(head_c.z + r * .92)})
    kit.parent(hips, root)
    kit.parent(legs['L'], hips)
    kit.parent(legs['R'], hips)
    kit.parent(torso, hips)
    kit.parent(head, torso)
    for side in ('L', 'R'):
        arm, hand = arms[side]
        kit.parent(arm, torso)
        kit.empty('Hand' + side, hand, parent=arm)
    kit.empty('HeadCenter', head_c, parent=head, props={'radius': float(r)})
    kit.empty('Back', (0, td * .5, z_waist + th * .55), parent=torso)
    kit.empty('Chest', (0, -td * .5, z_waist + th * .6), parent=torso)
    kit.paint([o for o in kit.current if o.type == 'MESH'], lo=0, hi=head_c.z + r)
    return root


def build_baby(kit, colours=None):
    """A crawling baby in a onesie: torso horizontal, hands and knees on the floor."""
    c = {'top': 'sun', 'accent': 'coral', 'bottom': 'sun', **(colours or {})}
    m = materials(kit, c)
    r = .2
    z_body = .19
    parts = [kit.ball('Belly', (0, .02, z_body), (.16, .2, .13), m['top'], 28, 16),
             kit.ball('Bib', (0, -.14, z_body + .03), (.1, .05, .09), m['accent'], 20, 12)]
    for i, x in enumerate((-.05, .05)):
        parts.append(kit.cyl('Snap', (x, -.2, z_body + .02), .015, .015, m['shirt'], axis='Y', bevel=.004))
    torso = kit.join('Torso', parts, pivot=(0, .02, z_body))
    hips = kit.join('Hips', [kit.ball('Bottom', (0, .17, z_body - .01), (.15, .12, .13), m['top'], 24, 14),
                             kit.ball('Tail', (0, .28, z_body + .03), .03, m['accent'], 12, 8)],
                    pivot=(0, .15, z_body))
    head_c = Vector((0, -.26, z_body + .17))
    parts = [kit.ball('Skull', head_c, (r, r * .94, r * .92), m['skin'], 36, 22)]
    parts += build_face(kit, m, head_c, r, 'baby')
    parts.append(kit.ball('Curl', head_c + Vector((0, 0, r * .92)), (.035, .035, .05), m['hair'], 12, 8))
    head = kit.join('Head', parts, pivot=(0, -.18, z_body + .08), sharp_angle=80)
    arms, legs = {}, {}
    for side, s in (('L', 1), ('R', -1)):
        sh = Vector((s * .12, -.12, z_body))
        hand = Vector((s * .13, -.16, .045))
        arms[side] = kit.join('Arm' + side, [kit.limb('Sleeve', sh, hand, .05, .045, m['top']),
                                            kit.ball('Hand', hand, .048, m['skin'], 16, 10)], pivot=sh)
        hip = Vector((s * .1, .17, z_body - .03))
        knee = Vector((s * .11, .1, .05))
        foot = Vector((s * .1, .3, .05))
        legs[side] = kit.join('Leg' + side, [kit.limb('Thigh', hip, knee, .06, .055, m['top']),
                                            kit.limb('Shin', knee, foot, .052, .045, m['top']),
                                            kit.ball('Foot', foot + Vector((0, .02, 0)), (.045, .06, .04), m['skin'],
                                                     14, 8)], pivot=hip)
    root = kit.empty('Root', props={'age': 'baby', 'outfit': 'onesie', 'height': float(head_c.z + r)})
    kit.parent(torso, root)
    kit.parent(hips, torso)
    kit.parent(head, torso)
    for side in ('L', 'R'):
        kit.parent(arms[side], torso)
        kit.parent(legs[side], hips)
    kit.empty('HeadCenter', head_c, parent=head, props={'radius': r})
    kit.empty('Back', (0, .05, z_body + .13), parent=torso)
    kit.empty('HandR', (-.13, -.16, .045), parent=arms['R'])
    kit.empty('HandL', (.13, -.16, .045), parent=arms['L'])
    kit.empty('Chest', (0, -.16, z_body), parent=torso)
    kit.paint([o for o in kit.current if o.type == 'MESH'], lo=0, hi=head_c.z + r)
    return root


def star_points(outer, inner, n=5):
    pts = []
    for i in range(n * 2):
        a = math.pi / 2 + i * math.pi / n
        rad = outer if i % 2 == 0 else inner
        pts.append((math.cos(a) * rad, math.sin(a) * rad))
    return pts


# --------------------------------------------------------------------------- hair
def _cap(kit, mat, front_cut=.42, back_cut=-.28, side_cut=None, scale=(1.08, 1.05, 1.03), thickness=.07,
         offset=(0, .02, .03), name='Cap', cols=40, rows=16):
    """A hair shell over a unit head whose lower edge follows a smooth hairline.

    The shell is a spherical grid: every column runs from the crown down to the
    hairline height for its azimuth, so the rim is a clean curve (no stair steps).
    """
    import bmesh
    import bpy
    rx, ry, rz = scale
    bm = bmesh.new()
    grid = []
    for i in range(cols):
        phi = i * math.tau / cols
        y = math.sin(phi)
        x = math.cos(phi)
        fy = smooth01((-y - .1) / .7)  # 0 at the back, 1 at the face
        cut = back_cut + (front_cut - back_cut) * fy
        if side_cut is not None and abs(x) > .55 and y > -.55:
            cut = min(cut, side_cut + (cut - side_cut) * smooth01((.75 - abs(x)) / .2))
        theta_max = math.acos(max(-.98, min(.98, cut / rz)))
        col = []
        for j in range(rows + 1):
            th = theta_max * (j / rows) ** .9
            p = Vector((rx * math.sin(th) * x, ry * math.sin(th) * y, rz * math.cos(th)))
            col.append(bm.verts.new(p + Vector(offset)))
        grid.append(col)
    top = bm.verts.new(Vector((0, 0, rz)) + Vector(offset))
    for i in range(cols):
        a, b = grid[i], grid[(i + 1) % cols]
        bm.faces.new((top, a[1], b[1]))
        for j in range(1, rows):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    # The first ring coincides with the pole; drop it.
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    mesh.materials.append(mat)
    kit.current.append(o)
    mod = o.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = -1
    mod2 = o.modifiers.new('round', 'BEVEL')
    mod2.width = thickness * .45
    mod2.segments = 3
    mod2.limit_method = 'ANGLE'
    kit._apply_mods(o)
    return o


def smooth01(t):
    t = max(0., min(1., t))
    return t * t * (3 - 2 * t)


def build_hair(kit, style, colour='#4a2c1d'):
    """Hair for a unit head at the origin (the runtime scales it by HeadCenter.radius)."""
    m = kit.mat('Hair', colour, .42)
    tie = kit.mat('HairTie', 'coral', GLOSS)
    parts = []
    if style == 'short':
        parts.append(_cap(kit, m, front_cut=.44, back_cut=-.35))
        # A side-swept fringe and a cowlick instead of a row of tufts.
        parts.append(kit.ball('Fringe', (-.12, -.8, .58), (.64, .24, .2), m, 20, 10,
                              rot=(math.radians(-10), math.radians(-14), math.radians(10))))
        parts.append(kit.ball('Swoop', (.46, -.66, .5), (.3, .26, .22), m, 16, 8, rot=(0, math.radians(35), 0)))
        parts.append(kit.ball('Crown', (.1, .35, .92), (.34, .3, .2), m, 16, 8, rot=(math.radians(-30), 0, 0)))
    elif style == 'spiky':
        parts.append(_cap(kit, m, front_cut=.45, back_cut=-.3))
        for i in range(7):
            a = -1.1 + i * .37
            base = Vector((math.sin(a) * .55, math.cos(a) * .25 - .1, .75))
            tip = base + Vector((math.sin(a) * .25, .25, .45))
            parts.append(kit.limb('Spike', base, tip, .2, .03, m, 12))
        parts.append(kit.ball('Fringe', (0, -.82, .52), (.5, .18, .16), m, 18, 10))
    elif style == 'buzz':
        parts.append(_cap(kit, m, front_cut=.5, back_cut=-.3, scale=(1.03, 1.02, 1.02), thickness=.04))
    elif style in ('bob', 'long'):
        parts.append(_cap(kit, m, front_cut=.38, back_cut=-.55, side_cut=-.4, scale=(1.12, 1.1, 1.05), thickness=.1))
        parts.append(kit.ball('Fringe', (-.18, -.82, .5), (.55, .2, .2), m, 18, 10, rot=(0, math.radians(-8), 0)))
        for s in (-1, 1):
            parts.append(kit.ball('Side', (s * .92, -.2, -.25), (.2, .45, .45), m, 16, 10))
        if style == 'long':
            parts.append(kit.box('Back', (0, .55, -.65), (1.35, .45, 1.1), m, bevel=.2, segments=4))
            for s in (-1, 1):
                parts.append(kit.limb('Lock', (s * .85, -.25, -.3), (s * .9, -.1, -1.05), .22, .14, m))
    elif style == 'ponytail':
        parts.append(_cap(kit, m, front_cut=.4, back_cut=-.3))
        parts.append(kit.ball('Fringe', (.12, -.82, .52), (.52, .2, .18), m, 18, 10, rot=(0, math.radians(10), 0)))
        parts.append(kit.torus('Tie', (0, .95, .45), .13, .06, tie, rot=(math.radians(70), 0, 0)))
        parts.append(kit.limb('Tail', (0, 1.02, .42), (0, 1.3, -.35), .26, .1, m))
        parts.append(kit.ball('TailTip', (0, 1.28, -.3), .12, m, 12, 8))
    elif style == 'pigtails':
        parts.append(_cap(kit, m, front_cut=.4, back_cut=-.3))
        parts.append(kit.ball('Fringe', (0, -.82, .52), (.55, .2, .17), m, 18, 10))
        for s in (-1, 1):
            parts.append(kit.torus('Tie', (s * .95, .15, .3), .12, .055, tie, rot=(0, math.radians(90), 0)))
            parts.append(kit.limb('Tail', (s * 1.02, .15, .3), (s * 1.45, .3, -.45), .26, .1, m))
    elif style == 'bun':
        parts.append(_cap(kit, m, front_cut=.4, back_cut=-.4, scale=(1.08, 1.06, 1.04)))
        parts.append(kit.ball('Bun', (0, .45, 1.0), .42, m, 24, 14))
        parts.append(kit.torus('Tie', (0, .35, .78), .22, .06, tie, rot=(math.radians(-35), 0, 0)))
        parts.append(kit.ball('Fringe', (0, -.8, .55), (.6, .22, .16), m, 18, 10))
    elif style == 'curly':
        # A cloud of chunky curls around the crown and back, leaving the face open.
        for i in range(34):
            golden = i * 2.39996
            z = 1 - (i + .5) / 34 * 1.35
            rad = math.sqrt(max(0., 1 - z * z))
            x, y = math.cos(golden) * rad, math.sin(golden) * rad
            if y < -.35 and z < .45:
                continue
            d = Vector((x, y, z)).normalized()
            parts.append(kit.ball('Curl', d * 1.02, .36 + .06 * math.sin(i * 1.7), m, 12, 8))
    elif style == 'balding':
        # A horseshoe of hair around the back and sides: a low back shell plus side puffs.
        parts.append(_cap(kit, m, front_cut=-.1, back_cut=-.4, scale=(1.06, 1.05, .62), thickness=.1,
                          offset=(0, .08, .05)))
        for sgn in (-1, 1):
            parts.append(kit.ball('SidePuff', (sgn * .9, .05, .05), (.22, .42, .3), m, 16, 8))
    else:
        raise ValueError(style)
    hair = kit.join('Hair', parts, pivot=(0, 0, 0), sharp_angle=70)
    kit.paint([hair], lo=-1.2, hi=1.3, shade=.72)
    return hair


# --------------------------------------------------------------------------- accessories
def build_accessory(kit, kind):
    """Returns the accessory object; see module docstring for sizing."""
    parts = []
    if kind == 'glasses':
        frame = kit.mat('Accent', 'charcoal', GLOSS)
        lens = kit.mat('Glass', 'glass', .08, alpha=.35)
        for s in (-1, 1):
            parts.append(kit.torus('Rim', (s * .37, -1.02, .02), .23, .045, frame, rot=(math.pi / 2, 0, 0)))
            parts.append(kit.cyl('Lens', (s * .37, -1.02, .02), .21, .02, lens, axis='Y', bevel=0))
            parts.append(kit.capsule('Arm', (s * .6, -.98, .05), (s * .98, -.1, .05), .03, frame))
        parts.append(kit.torus('Bridge', (0, -1.05, .06), .1, .03, frame, rot=(-math.pi / 2, 0, 0), arc=math.pi))
    elif kind == 'beard':
        m = kit.mat('Hair', '#5a3a26', .5)
        parts.append(kit.ball('Beard', (0, -.55, -.55), (.78, .55, .5), m, 24, 14))
        for s in (-1, 1):
            parts.append(kit.ball('Cheek', (s * .72, -.35, -.3), (.26, .4, .4), m, 16, 10))
        parts.append(kit.ball('Mustache', (0, -.98, -.22), (.38, .14, .12), m, 16, 10))
    elif kind == 'mustache':
        m = kit.mat('Hair', '#d8d2cc', .5)
        for s in (-1, 1):
            parts.append(kit.ball('Mustache', (s * .17, -.97, -.22), (.24, .12, .1), m, 16, 10,
                                  rot=(0, math.radians(s * 14), 0)))
    elif kind == 'sunhat':
        straw = kit.mat('Accent', 'sun', SATIN)
        band = kit.mat('HatBand', 'coral', GLOSS)
        parts.append(kit.cyl('Brim', (0, 0, .55), 1.75, .08, straw, vertices=40, bevel=.035))
        parts.append(kit.ball('Crown', (0, 0, .6), (1.05, 1.05, .78), straw, 32, 16))
        parts.append(kit.cyl('Band', (0, 0, .72), 1.03, .18, band, vertices=40, bevel=.03))
        parts.append(kit.ball('Flower', (.8, -.55, .8), .2, kit.mat('Flower', 'berry', GLOSS), 14, 10))
    elif kind == 'cap':
        cloth = kit.mat('Accent', 'teal', SATIN)
        # The crown hugs the skull (unit head, z-scale .92) from the brow line up.
        crown = kit.ball('Crown', (0, .03, 0), (1.1, 1.08, 1.0), cloth, 28, 16)
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(crown.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, .28),
                               plane_no=(0, 0, 1), clear_inner=True)
        bm.to_mesh(crown.data)
        bm.free()
        parts.append(crown)
        parts.append(kit.torus('Band', (0, .03, .3), 1.05, .07, cloth))
        parts.append(kit.box('Peak', (0, -1.12, .3), (1.2, .78, .09), cloth, bevel=.04,
                             rot=(math.radians(-8), 0, 0)))
        parts.append(kit.ball('Button', (0, .03, 1.0), .1, kit.mat('Button', 'coral', GLOSS), 12, 8))
    elif kind == 'bow':
        m = kit.mat('Accent', 'coral', GLOSS)
        for s in (-1, 1):
            parts.append(kit.ball('Loop', (s * .28 + .55, .1, 1.0), (.26, .12, .2), m, 16, 10,
                                  rot=(0, math.radians(s * 20), 0)))
        parts.append(kit.ball('Knot', (.55, .1, 1.0), .1, m, 12, 8))
    elif kind == 'backpack':
        m = kit.mat('Accent', 'teal', SATIN)
        m2 = kit.mat('Flap', 'marigold', GLOSS)
        parts.append(kit.box('Pack', (0, .1, 0), (.28, .15, .3), m, bevel=.06, segments=4))
        parts.append(kit.box('Flap', (0, .08, .08), (.29, .17, .12), m2, bevel=.04))
        parts.append(kit.box('Pocket', (0, .18, -.06), (.18, .05, .1), m2, bevel=.025))
        for s in (-1, 1):
            parts.append(kit.box('Strap', (s * .1, -.02, .03), (.04, .06, .3), m, bevel=.015))
    elif kind == 'satchel':
        m = kit.mat('Accent', 'wood', SATIN)
        parts.append(kit.box('Bag', (.22, -.02, -.12), (.08, .26, .2), m, bevel=.04))
        parts.append(kit.box('Flap', (.25, -.02, -.07), (.03, .27, .12), kit.mat('Flap', 'wood_dark', SATIN), bevel=.012))
        parts.append(kit.tube('Strap', [(.2, -.02, -.05), (.1, -.12, .2), (-.18, -.16, .32), (-.24, 0, .3)], .014, m))
    elif kind == 'cane':
        m = kit.mat('Accent', 'wood_dark', SATIN)
        parts.append(kit.cyl('Shaft', (0, 0, -.38), .022, .78, m, bevel=.008, vertices=12))
        parts.append(kit.tube('Crook', [(0, 0, .0), (0, 0, .04), (0, -.04, .09), (0, -.1, .09), (0, -.13, .05)], .024, m))
        parts.append(kit.cyl('Tip', (0, 0, -.77), .03, .04, kit.mat('Rubber', 'rubber', MATTE), bevel=.01))
    elif kind == 'umbrella':
        canopy = kit.mat('Accent', 'coral', GLOSS)
        stripe = kit.mat('Stripe', 'marigold', GLOSS)
        parts.append(kit.cyl('Shaft', (0, 0, .45), .015, .95, kit.mat('Metal', 'steel', .3, metal=.7), bevel=.005,
                             vertices=10))
        for i in range(8):
            parts.append(fan_panel(kit, 'Panel', i, 8, .64, .32, .95, canopy if i % 2 == 0 else stripe))
        parts.append(kit.ball('Top', (0, 0, .97), .04, canopy, 10, 6))
        parts.append(kit.tube('Handle', [(0, 0, 0), (0, 0, -.06), (.04, 0, -.1), (.08, 0, -.06)], .02,
                              kit.mat('Grip', 'wood_dark', SATIN)))
    elif kind == 'stethoscope':
        m = kit.mat('Accent', 'ink', GLOSS)
        steel = kit.mat('Metal', 'steel', .25, metal=.8)
        parts.append(kit.tube('Tube', [(-.12, .02, .06), (-.14, -.1, -.02), (-.06, -.16, -.14), (0, -.17, -.2)], .012, m))
        parts.append(kit.tube('Tube2', [(.12, .02, .06), (.14, -.1, -.02), (.06, -.16, -.14), (0, -.17, -.2)], .012, m))
        parts.append(kit.cyl('Bell', (0, -.18, -.25), .035, .02, steel, axis='Y', bevel=.006))
    else:
        raise ValueError(kind)
    obj = kit.join('Accessory', parts, pivot=(0, 0, 0), sharp_angle=60)
    kit.paint([obj], shade=.8)
    return obj


# --------------------------------------------------------------------------- dog
def build_dog(kit):
    """Biscuit: a chunky golden pup with floppy ears and a coral collar."""
    fur = kit.mat('Fur', '#f0a441', .55)
    light = kit.mat('FurLight', '#ffe2b0', .6)
    ear = kit.mat('Ear', '#a8561f', .55)
    m = dict(eye=kit.mat('Eye', '#1b1426', .12), shine=kit.mat('EyeShine', '#ffffff', .2, emit=1.4),
             nose=kit.mat('Nose', '#2a1a1a', .2), collar=kit.mat('Accent', 'coral', GLOSS),
             tag=kit.mat('Button', 'brass', .25, metal=.7), tongue=kit.mat('Mouth', 'pink', .35))
    z = .3
    body = kit.join('Body', [kit.capsule('Barrel', (0, -.14, z + .02), (0, .2, z), .17, fur),
                             kit.ball('Belly', (0, .02, z - .07), (.13, .25, .1), light, 20, 12),
                             kit.torus('Collar', (0, -.26, z + .1), .12, .035, m['collar'],
                                       rot=(math.radians(70), 0, 0)),
                             kit.cyl('Tag', (0, -.36, z + .01), .035, .015, m['tag'], axis='Y', bevel=.004)],
                    pivot=(0, 0, z))
    hc = Vector((0, -.36, z + .2))
    parts = [kit.ball('Skull', hc, (.17, .16, .15), fur, 28, 18),
             kit.ball('Muzzle', hc + Vector((0, -.14, -.05)), (.09, .09, .07), light, 20, 12),
             kit.ball('Nose', hc + Vector((0, -.225, -.02)), (.04, .03, .03), m['nose'], 14, 8),
             kit.ball('Tongue', hc + Vector((0, -.19, -.11)), (.035, .03, .02), m['tongue'], 12, 8)]
    for s in (-1, 1):
        parts.append(kit.decal('Eye', hc, (.17, .16, .15), (s * .45, -1, .25), (.03, .02, .038), m['eye'], lift=-.004))
        p, n = kit.on_ellipsoid(hc, (.17, .16, .15), (s * .45 + .08, -1, .38))
        parts.append(kit.ball('EyeShine', p + n * .008, .011, m['shine'], 8, 6))
    head = kit.join('Head', parts, pivot=hc + Vector((0, .08, -.08)))
    ears = {}
    for side, s in (('L', 1), ('R', -1)):
        top = hc + Vector((s * .13, .02, .1))
        ears[side] = kit.join('Ear' + side, [kit.ball('Flap', top + Vector((s * .05, 0, -.09)), (.05, .08, .12), ear,
                                                        16, 10, rot=(0, math.radians(s * 20), 0))], pivot=top)
    tail = kit.join('Tail', [kit.limb('Tail', (0, .33, z + .06), (0, .45, z + .24), .045, .03, fur)],
                    pivot=(0, .33, z + .06))
    legs = {}
    for name, x, y in (('LegFL', .09, -.16), ('LegFR', -.09, -.16), ('LegBL', .09, .2), ('LegBR', -.09, .2)):
        top = Vector((x, y, z - .02))
        legs[name] = kit.join(name, [kit.limb('Leg', top, (x, y, .05), .055, .05, fur),
                                     kit.ball('Paw', (x, y - .02, .04), (.06, .07, .045), light, 14, 8)], pivot=top)
    root = kit.empty('Root', props={'kind': 'dog', 'height': float(hc.z + .15)})
    kit.parent(body, root)
    kit.parent(head, body)
    kit.parent(tail, body)
    for e in ears.values():
        kit.parent(e, head)
    for leg in legs.values():
        kit.parent(leg, body)
    kit.paint([o for o in kit.current if o.type == 'MESH'], lo=0, hi=hc.z + .15)
    return root


def fan_panel(kit, name, i, n, radius, drop, top, material, thickness=.02):
    """One wedge of an umbrella canopy: apex at `top`, rim `drop` lower, slightly domed."""
    import bmesh
    import bpy
    a0, a1 = i * math.tau / n, (i + 1) * math.tau / n
    bm = bmesh.new()
    pts = [(0, 0, top)]
    for k in range(5):
        a = a0 + (a1 - a0) * k / 4
        sag = math.sin(k / 4 * math.pi) * .03
        pts.append((math.cos(a) * radius, math.sin(a) * radius, top - drop + sag))
    mid = [(math.cos(a0 + (a1 - a0) * k / 4) * radius * .55, math.sin(a0 + (a1 - a0) * k / 4) * radius * .55,
            top - drop * .38) for k in range(5)]
    apex = bm.verts.new(pts[0])
    rim = [bm.verts.new(p) for p in pts[1:]]
    ring = [bm.verts.new(p) for p in mid]
    for k in range(4):
        bm.faces.new((apex, ring[k], ring[k + 1]))
        bm.faces.new((ring[k], rim[k], rim[k + 1], ring[k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    mesh.materials.append(material)
    mod = o.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    kit._apply_mods(o)
    kit.current.append(o)
    return o
