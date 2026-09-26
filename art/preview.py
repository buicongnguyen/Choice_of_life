"""Render review sheets of built GLBs with the game's lighting intent (Eevee, Standard view).

    blender --background --factory-startup --python art/preview.py -- <sheet> <out.png>

Sheets compose characters the way the runtime does: a body GLB, hair scaled by
the HeadCenter radius, head/body accessories on their sockets, and material
colours overridden by name.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import kit as kitmod  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'art', '.raw')

SKIN = {'porcelain': '#fcd5bd', 'peach': '#f0b48a', 'tan': '#d99560', 'bronze': '#b8743f', 'umber': '#8a522c',
        'deep': '#5e3620'}

CAST = [
    dict(body='body_baby', hair=None, colours=dict(skin=SKIN['peach'], hair='#4a2c1d')),
    dict(body='body_toddler_overalls', hair='short', colours=dict(skin=SKIN['peach'], hair='#4a2c1d', top='sun',
                                                                  bottom='coral')),
    dict(body='body_child_tee', hair='short', colours=dict(skin=SKIN['peach'], hair='#4a2c1d', top='teal',
                                                            bottom='navy', accent='sun', shoes='coral'),
         acc=['backpack']),
    dict(body='body_child_dress', hair='pigtails', colours=dict(skin=SKIN['tan'], hair='#1f1a1a', top='berry',
                                                                  accent='sun', shoes='white')),
    dict(body='body_teen_hoodie', hair='spiky', colours=dict(skin=SKIN['peach'], hair='#4a2c1d', top='marigold',
                                                             bottom='denim', accent='coral', shoes='white')),
    dict(body='body_teen_varsity', hair='buzz', colours=dict(skin=SKIN['umber'], hair='#1a1414', top='plum',
                                                             accent='white', bottom='charcoal', shoes='red')),
    dict(body='body_adult_scrubs', hair='bun', colours=dict(skin=SKIN['bronze'], hair='#2b1a14', top='teal',
                                                            bottom='teal', accent='white', shoes='white'),
         acc=['stethoscope']),
    dict(body='body_adult_overalls', hair='buzz', colours=dict(skin=SKIN['tan'], hair='#5a3a26', top='coral',
                                                                bottom='navy', shoes='wood_dark'), acc=['beard', 'cap']),
    dict(body='body_adult_suit', hair='short', colours=dict(skin=SKIN['porcelain'], hair='#e0b050', top='charcoal',
                                                            bottom='charcoal', accent='berry', shoes='ink')),
    dict(body='body_adult_dress', hair='curly', colours=dict(skin=SKIN['deep'], hair='#221616', top='marigold',
                                                             accent='teal', shoes='coral'), acc=['glasses']),
    dict(body='body_elder_cardigan', hair='bun', colours=dict(skin=SKIN['porcelain'], hair='#e8e4ee', top='lilac',
                                                              bottom='navy', accent='cream', shoes='wood_dark'),
         acc=['glasses', 'cane']),
    dict(body='dog', hair=None, colours={}),
]


def import_glb(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    return roots[0], new


def recolour(objects, colours):
    names = {'skin': 'Skin', 'hair': 'Hair', 'top': 'Top', 'bottom': 'Bottom', 'shoes': 'Shoes', 'accent': 'Accent'}
    for o in objects:
        if o.type != 'MESH':
            continue
        for i, slot in enumerate(o.material_slots):
            m = slot.material
            if not m:
                continue
            base = m.name.split('.')[0]
            for key, mat_name in names.items():
                if base == mat_name and key in colours:
                    new = m.copy()
                    set_colour(new, kitmod.colour(colours[key]))
                    slot.material = new


def set_colour(m, c):
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    link = p.inputs['Base Color'].links
    if link:
        node = link[0].from_node
        for inp in node.inputs:
            if inp.type == 'RGBA' and not inp.links:
                inp.default_value = (*c, 1)
    else:
        p.inputs['Base Color'].default_value = (*c, 1)


def find(objects, name):
    for o in objects:
        if o.name.split('.')[0] == name:
            return o
    return None


def compose(entry, x):
    root, objs = import_glb(entry['body'])
    root.location = (x, 0, 0)
    recolour(objs, entry.get('colours', {}))
    head_centre = find(objs, 'HeadCenter')
    radius = head_centre['radius'] if head_centre and 'radius' in head_centre else .29
    if entry.get('hair'):
        hroot, hobjs = import_glb('hair_' + entry['hair'])
        recolour(hobjs, {'hair': entry['colours'].get('hair', '#4a2c1d')})
        hroot.parent = head_centre
        hroot.matrix_parent_inverse.identity()
        hroot.location = (0, 0, 0)
        hroot.scale = (radius,) * 3
    for acc in entry.get('acc', []):
        aroot, aobjs = import_glb('acc_' + acc)
        socket = {'backpack': 'Back', 'satchel': 'Back', 'cane': 'HandR', 'umbrella': 'HandR',
                  'stethoscope': 'Chest'}.get(acc, 'HeadCenter')
        target = find(objs, socket)
        aroot.parent = target
        aroot.matrix_parent_inverse.identity()
        aroot.location = (0, 0, 0)
        if socket == 'HeadCenter':
            aroot.scale = (radius,) * 3
        if acc == 'beard':
            recolour(aobjs, {'hair': entry['colours'].get('hair', '#5a3a26')})
    return root


def studio(target, width, sun_dir=(-.5, -.6, -.7)):
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.resolution_x, scene.render.resolution_y = 1600, 700
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('Sky')
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (*kitmod.colour('#bfe6ff'), 1)
    bg.inputs[1].default_value = .9
    sun = bpy.data.lights.new('Sun', 'SUN')
    sun.energy = 3.2
    sun.color = kitmod.colour('#fff1d6')
    sun.angle = math.radians(8)
    o = bpy.data.objects.new('Sun', sun)
    bpy.context.collection.objects.link(o)
    o.rotation_euler = Vector(sun_dir).to_track_quat('-Z', 'Y').to_euler()
    fill = bpy.data.lights.new('Rim', 'SUN')
    fill.energy = 1.2
    fill.color = kitmod.colour('#9fd4ff')
    o = bpy.data.objects.new('Rim', fill)
    bpy.context.collection.objects.link(o)
    o.rotation_euler = Vector((.6, .8, -.3)).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=80, location=(target.x, 0, 0))
    floor = bpy.context.object
    fm = bpy.data.materials.new('Floor')
    fm.use_nodes = True
    bsdf = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*kitmod.colour('#ffd9a0'), 1)
    bsdf.inputs['Roughness'].default_value = .85
    floor.data.materials.append(fm)
    cam = bpy.data.cameras.new('Cam')
    cam.lens = 55
    co = bpy.data.objects.new('Cam', cam)
    bpy.context.collection.objects.link(co)
    co.location = target + Vector((0, -width * 2.9, width * .62))
    co.rotation_euler = (target + Vector((0, 0, .1)) - co.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = co


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    sheet, out = argv[0], argv[1]
    kitmod.reset()
    if sheet == 'cast':
        step = .95
        lo, hi = (int(v) for v in os.environ.get('CAST_SLICE', '0:99').split(':'))
        cast = CAST[lo:hi]
        for i, entry in enumerate(cast):
            compose(entry, i * step)
        span = (len(cast) - 1) * step
        studio(Vector((span / 2, 0, float(os.environ.get('LOOKZ', '.75')))), span / 2 + float(os.environ.get('PAD', '1.2')))
    else:
        names = sheet.split(',')
        step = float(os.environ.get('STEP', '3'))
        for i, n in enumerate(names):
            root, _ = import_glb(n)
            root.location = (i * step, 0, 0)
        span = (len(names) - 1) * step
        studio(Vector((span / 2, 0, float(os.environ.get('LOOKZ', '1')))), span / 2 + float(os.environ.get('PAD', '2')))
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('wrote', out)


if __name__ == '__main__':
    main()
