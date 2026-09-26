"""Build every Choice of Life GLB into public/models/ and write the manifest.

    blender --background --factory-startup --python art/build.py -- [group|name ...]

With no arguments everything is rebuilt. Arguments filter by group name
(`characters`, `hair`, `accessories`, `props`, `places`, ...) or by asset name
(`body_child_tee`, `hair_bun`). The manifest records every asset's byte size,
triangle count, joints and materials so tests can check the runtime contract.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import kit as kitmod  # noqa: E402
import characters as ch  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
RAW = os.path.join(ROOT, 'art', '.raw')

BODIES = [
    ('toddler', 'overalls'), ('child', 'tee'), ('child', 'dress'), ('child', 'hoodie'),
    ('teen', 'hoodie'), ('teen', 'varsity'), ('teen', 'dress'), ('teen', 'tee'),
    ('adult', 'jacket'), ('adult', 'dress'), ('adult', 'scrubs'), ('adult', 'overalls'), ('adult', 'suit'),
    ('adult', 'sweater'), ('elder', 'cardigan'), ('elder', 'dress'),
]
HAIR = ['short', 'spiky', 'buzz', 'bob', 'long', 'ponytail', 'pigtails', 'bun', 'curly', 'balding']
ACCESSORIES = ['glasses', 'beard', 'mustache', 'sunhat', 'cap', 'bow', 'backpack', 'satchel', 'cane', 'umbrella',
               'stethoscope']


def registry():
    reg = {}
    reg['body_baby'] = ('characters', lambda k: ch.build_baby(k))
    for age, outfit in BODIES:
        reg['body_%s_%s' % (age, outfit)] = ('characters', lambda k, a=age, o=outfit: ch.build_body(k, a, o))
    for style in HAIR:
        reg['hair_' + style] = ('hair', lambda k, s=style: ch.build_hair(k, s))
    for kind in ACCESSORIES:
        reg['acc_' + kind] = ('accessories', lambda k, s=kind: ch.build_accessory(k, s))
    reg['dog'] = ('characters', lambda k: ch.build_dog(k))
    # Place kits: every module in art/sets exposes registry() -> {name: (group, builder)}.
    sets_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sets')
    if os.path.isdir(sets_dir):
        sys.path.insert(0, sets_dir)
        for file in sorted(os.listdir(sets_dir)):
            if file.endswith('.py') and not file.startswith('_'):
                module = __import__(file[:-3])
                for name, (group, fn) in module.registry().items():
                    if name in reg:
                        raise SystemExit('duplicate asset name %s in sets/%s' % (name, file))
                    reg[name] = (group, fn)
    return reg


def describe(root):
    tris = 0
    joints = []
    mats = set()

    def walk(o):
        nonlocal tris
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
            mats.update(m.name for m in o.data.materials if m)
        joints.append(o.name)
        for c in o.children:
            walk(c)
    walk(root)
    return tris, joints, sorted(mats)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(RAW, exist_ok=True)
    reg = registry()
    names = [n for n, (g, _) in reg.items() if not argv or n in argv or g in argv]
    if not names:
        raise SystemExit('Nothing matches %s' % argv)
    preview = os.environ.get('PREVIEW')
    if preview:
        return render_preview(reg, names, preview)
    for name in names:
        group, fn = reg[name]
        kitmod.reset()
        k = kitmod.Kit()
        root = fn(k)
        path = os.path.join(RAW, name + '.glb')
        k.export(path, [root])
        tris, joints, mats = describe(root)
        extras = {key: root[key] for key in root.keys() if isinstance(root[key], (int, float, str))}
        # A sidecar per asset; art/pack.mjs assembles public/models/manifest.json from them,
        # so parallel builds of different sets never race on one file.
        with open(os.path.join(RAW, name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(dict(group=group, bytes=os.path.getsize(path), triangles=tris, nodes=joints,
                           materials=mats, extras=extras), f, indent=1, sort_keys=True)
        print('built %-28s %7d bytes %6d tris' % (name, os.path.getsize(path), tris))
    print('built %d assets (run node art/pack.mjs to compress into public/models)' % len(names))


def render_preview(reg, names, out):
    """Build the named assets into one scene side by side and render them (no export)."""
    import preview as pv
    from mathutils import Vector
    kitmod.reset()
    x = 0.
    gap = float(os.environ.get('GAP', '.6'))
    tallest = 1.
    for name in names:
        k = kitmod.Kit()
        root = reg[name][1](k)
        bpy.context.view_layer.update()
        objs = [o for o in k.current if o.type == 'MESH']
        xs = [(o.matrix_world @ v.co).x for o in objs for v in o.data.vertices] or [0]
        zs = [(o.matrix_world @ v.co).z for o in objs for v in o.data.vertices] or [1]
        width = max(xs) - min(xs)
        root.location.x += x - min(xs)
        x += width + gap
        tallest = max(tallest, max(zs))
    span = x - gap
    pad = float(os.environ.get('PAD', '0'))
    pv.studio(Vector((span / 2, 0, tallest * .45)), max(span / 2, tallest * 1.1) + pad)
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('wrote', out)


if __name__ == '__main__':
    main()
