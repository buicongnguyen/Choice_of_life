"""Renders the Choice of Life UI art (logo and icons) in Blender 4.5, headless.

    blender --background --factory-startup --python art/ui/build_ui.py -- [name ...]

Writes transparent WebP files to public/ui/. Every icon is a small toy object built
from the same bevelled kit and palette as the game's models, lit the same way
(warm key, cool rim, soft fill), so the interface looks like part of the world.
The logo uses Lilita One (SIL Open Font License, art/ui/fonts/LilitaOne-OFL.txt).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import kit as kitmod  # noqa: E402
from kit import GLOSS, SATIN  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public', 'ui')
FONT = os.path.join(HERE, 'fonts', 'LilitaOne-Regular.ttf')
ICON_SIZE = 192


# ------------------------------------------------------------------------ scene
def studio(size_x, size_y, ortho_scale, target=(0, 0, 0), tilt=1.1):
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.resolution_x, scene.render.resolution_y = size_x, size_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 90
    world = bpy.data.worlds.new('Sky')
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (*kitmod.colour('#dcefff'), 1)
    bg.inputs[1].default_value = .75
    for name, energy, colour, direction in (
            ('Key', 3.4, '#fff1d6', (-.45, .55, -.75)),
            ('Rim', 2.2, '#9fd4ff', (.7, -.5, .35)),
            ('Fill', .9, '#ffd9b0', (.2, .9, -.2))):
        light = bpy.data.lights.new(name, 'SUN')
        light.energy = energy
        light.color = kitmod.colour(colour)
        light.angle = math.radians(12)
        o = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(o)
        o.rotation_euler = Vector(direction).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('Cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = ortho_scale
    co = bpy.data.objects.new('Cam', cam)
    bpy.context.collection.objects.link(co)
    # Looking at the icon face-on from -Y, tipped a little so the bevels catch light.
    co.location = Vector(target) + Vector((0, -10, tilt))
    co.rotation_euler = (Vector(target) - co.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = co


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def fit(objects, pad=1.12):
    """Returns the ortho scale that frames the objects' XZ extent."""
    bpy.context.view_layer.update()
    xs, zs = [], []
    for o in objects:
        if o.type != 'MESH':
            continue
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            xs.append(w.x)
            zs.append(w.z)
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    return max(max(xs) - min(xs), max(zs) - min(zs)) * pad, (cx, 0, cz), (max(xs) - min(xs), max(zs) - min(zs))


# ------------------------------------------------------------------------ helpers
def extrude_path(k, name, points, depth, material, bevel=.06, closed=True):
    """A flat outline (x, z) extruded along Y with rounded edges: badges, arrows, bars."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, -depth / 2, z)) for x, z in points]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(0, depth, 0), verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    mesh.materials.append(material)
    k._bevel(o, bevel, 4)
    k.current.append(o)
    return o


def rounded_rect(w, h, r, seg=6):
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return pts


def heart_outline(size, n=48):
    """A heart as an (x, z) outline (the classic parametric heart), about `size` tall."""
    pts = []
    for i in range(n):
        t = i / n * math.tau
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * size / 32, z * size / 32))
    return pts


def font():
    return bpy.data.fonts.load(FONT, check_existing=True)


def badge(k, colour, rim='cream', radius=1.0):
    """The round toy coin every glyph icon sits on: a coloured disc with a cream rim."""
    body = k.mat('Badge', colour, GLOSS)
    ring = k.mat('BadgeRim', rim, SATIN)
    k.cyl('Rim', (0, .06, 0), radius, .34, ring, axis='Y', vertices=48, bevel=.12, segments=4)
    k.cyl('Face', (0, -.06, 0), radius * .84, .3, body, axis='Y', vertices=48, bevel=.1, segments=4)


def glyph_mat(k):
    return k.mat('Glyph', 'white', SATIN)


def import_model(name):
    path = os.path.join(ROOT, 'art', '.raw', name + '.glb')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


# ------------------------------------------------------------------------ glyphs
def g_pause(k):
    badge(k, 'coral')
    for x in (-.24, .24):
        extrude_path(k, 'Bar', rounded_rect(.2, .72, .09), .22, glyph_mat(k), .04).location = (x, -.3, 0)


def g_play(k):
    badge(k, 'teal')
    extrude_path(k, 'Tri', [(-.22, -.38), (.4, 0), (-.22, .38)], .22, glyph_mat(k), .07).location = (.04, -.3, 0)


def g_close(k):
    badge(k, 'berry')
    for a in (45, -45):
        o = extrude_path(k, 'Cross', rounded_rect(.2, .8, .09), .22, glyph_mat(k), .04)
        o.location = (0, -.3, 0)
        o.rotation_euler = (0, math.radians(a), 0)


def g_back(k):
    badge(k, 'teal')
    pts = [(-.42, 0), (-.02, .38), (-.02, .16), (.4, .16), (.4, -.16), (-.02, -.16), (-.02, -.38)]
    extrude_path(k, 'Arrow', pts, .22, glyph_mat(k), .05).location = (0, -.3, 0)


def g_arrow(k, up=True):
    badge(k, 'marigold')
    pts = [(0, .42), (.38, .02), (.15, .02), (.15, -.4), (-.15, -.4), (-.15, .02), (-.38, .02)]
    o = extrude_path(k, 'Arrow', pts, .22, glyph_mat(k), .05)
    o.location = (0, -.3, 0)
    if not up:
        o.rotation_euler = (0, math.pi, 0)


def g_jump(k):
    badge(k, 'coral')
    g = glyph_mat(k)
    # Two stacked chevrons over a ground line: "hop up".
    for z in (.2, -.08):
        extrude_path(k, 'Chevron', [(-.36, z - .12), (0, z + .2), (.36, z - .12), (.24, z - .24), (0, z - .02), (-.24, z - .24)], .22, g, .04).location = (0, -.3, 0)
    extrude_path(k, 'Ground', rounded_rect(.72, .12, .06), .2, g, .03).location = (0, -.3, -.42)


def g_gear(k):
    badge(k, 'ocean')
    pts = []
    teeth = 8
    for i in range(teeth * 4):
        a = i / (teeth * 4) * math.tau
        r = .44 if (i % 4) in (1, 2) else .33
        pts.append((math.cos(a) * r, math.sin(a) * r))
    extrude_path(k, 'Gear', pts, .2, glyph_mat(k), .03).location = (0, -.3, 0)
    k.cyl('Hole', (0, -.42, 0), .13, .06, k.mat('Badge', 'ocean', GLOSS), axis='Y', vertices=24, bevel=.02)


def g_music(k):
    badge(k, 'plum')
    g = glyph_mat(k)
    k.ball('NoteA', (-.2, -.3, -.24), (.17, .12, .13), g, 20, 12, rot=(0, math.radians(-20), 0))
    k.ball('NoteB', (.26, -.3, -.14), (.17, .12, .13), g, 20, 12, rot=(0, math.radians(-20), 0))
    extrude_path(k, 'Stems', [(-.08, -.22), (-.08, .36), (.38, .46), (.38, -.12), (.3, -.12), (.3, .34), (0, .27), (0, -.22)], .16, g, .03).location = (0, -.3, 0)


def g_volume(k):
    badge(k, 'teal')
    g = glyph_mat(k)
    extrude_path(k, 'Speaker', [(-.42, -.14), (-.22, -.14), (.02, -.36), (.02, .36), (-.22, .14), (-.42, .14)], .2, g, .04).location = (0, -.3, 0)
    for r in (.2, .34):
        pts = [(math.cos(a) * r + .06, math.sin(a) * r) for a in [math.radians(-50 + i * 10) for i in range(11)]]
        k.tube('Wave', [(x, -.3, z) for x, z in pts], .045, g, vertices=8)


def g_motion(k):
    badge(k, 'mint', rim='cream')
    g = k.mat('GlyphDark', 'ink', SATIN)
    for i, z in enumerate((.2, 0, -.2)):
        pts = [(-.4 + j * .1, -.3, z + math.sin(j * .9) * .06) for j in range(9)]
        k.tube('Wave', pts, .05, g, vertices=8)


def g_text(k):
    badge(k, 'ocean')
    add_text(k, 'Aa', size=.86, depth=.14, material=glyph_mat(k), loc=(0, -.34, -.3))


def g_quality(k):
    badge(k, 'berry')
    g = glyph_mat(k)
    for (x, z, s) in ((-.08, .04, .42), (.28, .28, .18), (.3, -.26, .14)):
        pts = []
        for i in range(8):
            a = i / 8 * math.tau + math.pi / 2
            r = s if i % 2 == 0 else s * .32
            pts.append((x + math.cos(a) * r, z + math.sin(a) * r))
        extrude_path(k, 'Sparkle', pts, .18, g, .03).location = (0, -.3, 0)


def g_journal(k):
    badge(k, 'coral')
    cover = k.mat('Cover', 'ocean', SATIN)
    paper = k.mat('Paper', 'cream', SATIN)
    k.box('Book', (0, -.3, 0), (.62, .16, .74), cover, bevel=.05)
    k.box('Pages', (.05, -.34, 0), (.5, .12, .66), paper, bevel=.03)
    k.box('Band', (-.24, -.4, 0), (.08, .06, .76), k.mat('Ribbon', 'marigold', GLOSS), bevel=.02)
    extrude_path(k, 'Heart', heart_outline(.3), .06, k.mat('Heart', 'berry', GLOSS), .015).location = (.06, -.42, -.02)


def g_home(k):
    badge(k, 'leaf')
    g = glyph_mat(k)
    extrude_path(k, 'House', [(-.34, -.36), (.34, -.36), (.34, .06), (.46, .06), (0, .44), (-.46, .06), (-.34, .06)], .2, g, .04).location = (0, -.3, 0)
    extrude_path(k, 'Door', rounded_rect(.18, .3, .06), .08, k.mat('Door', 'coral', GLOSS), .02).location = (0, -.42, -.2)


def g_dog(k):
    badge(k, 'marigold')
    fur = k.mat('Fur', '#f0a441', SATIN)
    light = k.mat('FurLight', '#ffe2b0', SATIN)
    ear = k.mat('Ear', '#a8561f', SATIN)
    k.ball('Head', (0, -.3, 0), (.38, .26, .34), fur, 24, 14)
    k.ball('Muzzle', (0, -.52, -.1), (.18, .12, .13), light, 18, 10)
    k.ball('Nose', (0, -.64, -.04), (.07, .05, .05), k.mat('Nose', 'ink', GLOSS), 12, 8)
    for s in (-1, 1):
        k.ball('Ear', (s * .34, -.3, .12), (.12, .1, .24), ear, 16, 10, rot=(0, math.radians(s * 25), 0))
        k.ball('Eye', (s * .14, -.55, .1), (.05, .03, .06), k.mat('Eye', 'ink', .1), 12, 8)


def g_partner(k):
    badge(k, 'leaf')
    extrude_path(k, 'Heart', heart_outline(.72), .2, glyph_mat(k), .05).location = (0, -.3, .02)


# Pickup icons reuse the actual game models, so HUD and world match exactly.
MODEL_ICONS = {'health': 'pickup_heart', 'happiness': 'pickup_star', 'money': 'pickup_coin', 'keepsake': 'keepsake',
               'letter': 'letter'}

GLYPHS = {
    'pause': g_pause, 'play': g_play, 'close': g_close, 'back': g_back, 'up': lambda k: g_arrow(k, True),
    'down': lambda k: g_arrow(k, False), 'jump': g_jump, 'settings': g_gear, 'music': g_music, 'volume': g_volume,
    'motion': g_motion, 'text': g_text, 'quality': g_quality, 'journal': g_journal, 'home': g_home, 'dog': g_dog,
    'partner': g_partner,
}


def add_text(k, text, size, depth, material, loc, align='CENTER'):
    curve = bpy.data.curves.new('Text', 'FONT')
    curve.body = text
    curve.font = font()
    curve.size = size
    curve.extrude = depth / 2
    curve.bevel_depth = min(.035, depth * .3)
    curve.bevel_resolution = 3
    curve.align_x = align
    o = bpy.data.objects.new('Text', curve)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object
    o.select_set(False)
    o.data.materials.clear()
    o.data.materials.append(material)
    k.current.append(o)
    return o


# ------------------------------------------------------------------------ logo
def build_logo(k):
    """'Choice of Life' as chunky bevelled toy letters with a coral shadow body and a tiny lighthouse."""
    cream = k.mat('Letters', '#fffaf0', GLOSS)
    gold = k.mat('Life', 'sun', GLOSS)
    side = k.mat('Side', 'coral_dark', SATIN)
    ink = k.mat('Outline', '#5a1e3a', SATIN)
    parts = []

    def word(text, size, x, z, face, spacing=0.0):
        curve = bpy.data.curves.new(text, 'FONT')
        curve.body = text
        curve.font = font()
        curve.size = size
        curve.space_character = 1 + spacing
        curve.extrude = .15 * size
        # A small bevel keeps the counters and i-dots open; the chunkiness comes from the extrusion.
        curve.bevel_depth = .018 * size
        curve.bevel_resolution = 3
        curve.offset = 0
        curve.align_x = 'LEFT'
        o = bpy.data.objects.new(text, curve)
        bpy.context.collection.objects.link(o)
        o.location = (x, 0, z)
        o.rotation_euler = (math.pi / 2, 0, 0)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.convert(target='MESH')
        o = bpy.context.object
        o.select_set(False)
        # Front faces get the face colour, the extruded sides and back the coral body.
        mesh = o.data
        mesh.materials.clear()
        mesh.materials.append(face)
        mesh.materials.append(side)
        # Text is built facing local +Z; its front faces point that way.
        for poly in mesh.polygons:
            poly.material_index = 0 if poly.normal.z > .6 else 1
        k.current.append(o)
        return o

    top = word('Choice of', 1.0, 0, .62, cream)
    bpy.context.view_layer.update()
    top_w = max((top.matrix_world @ v.co).x for v in top.data.vertices)
    life = word('Life', 1.28, 0, -.5, gold)
    bpy.context.view_layer.update()
    life_w = max((life.matrix_world @ v.co).x for v in life.data.vertices)
    # Centre both lines.
    top.location.x -= top_w / 2
    life.location.x -= life_w / 2 + .5
    parts += [top, life]
    # The lighthouse stands beside "Life": red and white bands, a glowing lamp.
    red = k.mat('Tower', 'red', GLOSS)
    white = k.mat('TowerWhite', 'white', GLOSS)
    lamp = k.mat('LampGlow', 'lamp', .2, emit=2.5)
    roof = k.mat('Roof', 'navy', GLOSS)
    bpy.context.view_layer.update()
    # Right of "Life", under the top line.
    lx = life.location.x + life_w + .42
    base_z = -.52
    h = .66
    for i in range(4):
        z0 = base_z + i * h / 4
        r0 = .27 - .06 * i / 4
        k.cyl('Band', (lx, 0, z0 + h / 8), r0, h / 4, red if i % 2 == 0 else white, radius2=r0 - .06 / 4, vertices=28, bevel=.02)
    k.cyl('Gallery', (lx, 0, base_z + h + .02), .27, .05, roof, vertices=28, bevel=.02)
    k.cyl('Lamp', (lx, 0, base_z + h + .14), .15, .2, lamp, vertices=24, bevel=.02)
    k.cyl('Cap', (lx, 0, base_z + h + .3), .19, .14, roof, vertices=24, bevel=.02, radius2=.02)
    k.cyl('Rock', (lx, .05, base_z - .05), .42, .12, k.mat('Rock', 'stone_dark', SATIN), vertices=20, bevel=.05)


def reset_all():
    kitmod.reset()
    for world in list(bpy.data.worlds):
        bpy.data.worlds.remove(world)


def build_icon(name):
    reset_all()
    k = kitmod.Kit()
    if name in MODEL_ICONS:
        objs = import_model(MODEL_ICONS[name])
        meshes = [o for o in objs if o.type == 'MESH']
        # Turn a little so the icons read as 3D, like they do spinning in the game.
        roots = [o for o in objs if o.parent is None]
        for r in roots:
            r.rotation_euler = (0, 0, math.radians(-18 if name != 'money' else -8))
        scale, target, _ = fit(meshes, 1.12)
    else:
        GLYPHS[name](k)
        k.paint([o for o in k.current if o.type == 'MESH'], shade=.8)
        scale, target, _ = fit(k.current, 1.08)
    studio(ICON_SIZE, ICON_SIZE, scale, target)
    render(os.path.join(OUT, name + '.webp'))


def build_logo_image():
    reset_all()
    k = kitmod.Kit()
    build_logo(k)
    k.paint([o for o in k.current if o.type == 'MESH'], shade=.82)
    scale, target, (w, h) = fit(k.current, 1.06)
    ratio = w / h
    height = 520
    width = int(round(height * ratio / 8) * 8)
    # Looking up a little shows the coral extrusion under every letter, like a standing sign.
    studio(width, int(height * 1.04), w * 1.06, (target[0], target[1], target[2] + .03), tilt=-2.2)
    render(os.path.join(OUT, 'logo.webp'))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    os.makedirs(OUT, exist_ok=True)
    names = argv or ['logo', *MODEL_ICONS, *GLYPHS]
    for name in names:
        if name == 'logo':
            build_logo_image()
        else:
            build_icon(name)
        print('rendered', name)


if __name__ == '__main__':
    main()
