"""Choice of Life toy-diorama art kit for Blender 4.5 (run headless).

Every asset is built from soft-bevelled primitives with glossy, saturated
materials. A height-based vertex colour ("painted light") cools and darkens the
bottom of each model and keeps the top warm. glTF multiplies COLOR_0 with the
material colour, so the runtime can still recolour a material by name.

Blender is Z-up and models face -Y. glTF export converts to Three.js Y-up with
the model facing +Z.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# Authored as sRGB hex swatches. Warm and vivid; beige is only an accent.
PALETTE = {
    'coral': '#ff6b4a', 'coral_dark': '#d9442c', 'marigold': '#ffb627', 'sun': '#ffd84a',
    'teal': '#12a5b8', 'ocean': '#0b6e8a', 'deep': '#074a66', 'leaf': '#5cc639',
    'leaf_dark': '#2f9a3a', 'moss': '#3f8f2f', 'berry': '#e8416f', 'sky': '#6ec8ff',
    'cream': '#fff1d6', 'white': '#fffaf0', 'plum': '#6b3fa0', 'lilac': '#a78bfa',
    'navy': '#23407a', 'denim': '#3a6fc4', 'ink': '#1d1a2b', 'charcoal': '#34323f',
    'brick': '#c9523a', 'terracotta': '#e0764a', 'sand': '#f4c983', 'wood': '#b86b35',
    'wood_light': '#dd9a57', 'wood_dark': '#7a4221', 'stone': '#b8b2c8', 'stone_dark': '#7d7894',
    'steel': '#9fb3c8', 'brass': '#f2b134', 'mint': '#5fe0b0', 'pink': '#ff8fb1',
    'blush': '#ff7f7f', 'glass': '#9fe6ff', 'lamp': '#fff0a8', 'rubber': '#2a2733',
    'red': '#f03a3a', 'orange': '#ff8a1f', 'grass': '#6fd04a', 'lime': '#b6e94a',
}

# One glossy/matte vocabulary so every asset reads as the same toy set.
GLOSS = .32
SATIN = .5
MATTE = .72


def srgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def linear(c):
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)


def colour(value):
    if isinstance(value, str):
        value = PALETTE.get(value, value)
        return linear(srgb(value))
    return tuple(value)


def reset():
    """Empty the file without touching preferences (safe for --factory-startup)."""
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
                       bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.node_groups):
        for block in list(collection):
            collection.remove(block)


def smoothstep(t):
    t = max(0., min(1., t))
    return t * t * (3 - 2 * t)


class Kit:
    """Material library, primitive builders, joining, painting and export."""

    def __init__(self):
        self.materials = {}
        self.current = []

    # ------------------------------------------------------------------ materials
    def mat(self, name, value, rough=SATIN, metal=0., emit=0., alpha=None):
        """Principled material: vertex paint x colour factor (glTF COLOR_0 x baseColorFactor)."""
        if name in self.materials:
            return self.materials[name]
        c = colour(value)
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*c, 1)
        m.use_nodes = True
        tree = m.node_tree
        p = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        p.inputs['Roughness'].default_value = rough
        p.inputs['Metallic'].default_value = metal
        if emit:
            p.inputs['Base Color'].default_value = (*c, 1)
            p.inputs['Emission Color'].default_value = (*c, 1)
            p.inputs['Emission Strength'].default_value = emit
        else:
            attr = tree.nodes.new('ShaderNodeVertexColor')
            attr.layer_name = 'Paint'
            mix = tree.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1
            tree.links.new(attr.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = (*c, 1)
            tree.links.new(mix.outputs[2], p.inputs['Base Color'])
        if alpha is not None:
            p.inputs['Alpha'].default_value = alpha
            m.surface_render_method = 'BLENDED'
        self.materials[name] = m
        return m

    # ----------------------------------------------------------------- internals
    def _new(self, name, material):
        o = bpy.context.object
        o.name = name
        o.data.name = name
        o.data.materials.clear()
        o.data.materials.append(material)
        self.current.append(o)
        return o

    def _bevel(self, o, width, segments=3, angle=True):
        if width <= 0:
            return
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = width
        mod.segments = segments
        mod.limit_method = 'ANGLE' if angle else 'NONE'
        mod.harden_normals = False
        self._apply_mods(o)

    def _apply_mods(self, o):
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)

    def _bake_scale(self, o):
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.select_set(False)

    # ----------------------------------------------------------------- primitives
    def box(self, name, loc, size, material, bevel=.06, segments=3, rot=None):
        """Rounded box. `size` is the full extent; bevel is clamped to stay solid."""
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        o = self._new(name, material)
        o.scale = size
        self._bake_scale(o)
        self._bevel(o, min(bevel, min(size) * .48), segments)
        if rot:
            o.rotation_euler = rot
        return o

    def tbox(self, name, loc, top, bottom, height, material, bevel=.05, segments=3, shift=(0, 0), rot=None):
        """Tapered box: `top`/`bottom` are (x, y) extents; `shift` slides the top face."""
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        o = self._new(name, material)
        for v in o.data.vertices:
            s = top if v.co.z > 0 else bottom
            v.co.x *= s[0]
            v.co.y *= s[1]
            v.co.z *= height
            if v.co.z > 0:
                v.co.x += shift[0]
                v.co.y += shift[1]
        self._bevel(o, min(bevel, height * .45, min(*top, *bottom) * .45), segments)
        if rot:
            o.rotation_euler = rot
        return o

    def ball(self, name, loc, radii, material, segments=20, rings=12, rot=None):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
        o = self._new(name, material)
        o.scale = radii if isinstance(radii, (tuple, list)) else (radii,) * 3
        self._bake_scale(o)
        if rot:
            o.rotation_euler = rot
        return o

    def cyl(self, name, loc, radius, depth, material, axis='Z', vertices=24, bevel=.03, radius2=None, segments=2, rot=None):
        if radius2 is None:
            bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
        else:
            bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius2, depth=depth, location=loc)
        o = self._new(name, material)
        self._bevel(o, min(bevel, depth * .45, max(radius, radius2 or 0) * .45), segments)
        o.rotation_euler = rot or {'Z': (0, 0, 0), 'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0)}[axis]
        return o

    def torus(self, name, loc, major, minor, material, rot=(0, 0, 0), major_seg=24, minor_seg=8, arc=None):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_seg,
                                         minor_segments=minor_seg, location=(0, 0, 0))
        o = self._new(name, material)
        if arc is not None:
            # Keep only the lower arc (a smile) spanning `arc` radians, centred on -Z after rotation.
            bm = bmesh.new()
            bm.from_mesh(o.data)
            doomed = [v for v in bm.verts if math.atan2(v.co.y, v.co.x) > -math.pi / 2 + arc / 2
                      or math.atan2(v.co.y, v.co.x) < -math.pi / 2 - arc / 2]
            bmesh.ops.delete(bm, geom=doomed, context='VERTS')
            bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
            bm.to_mesh(o.data)
            bm.free()
        o.location = loc
        o.rotation_euler = rot
        return o

    def limb(self, name, a, b, r1, r2, material, vertices=14):
        """Round-ended tapered capsule from point a to b."""
        a, b = Vector(a), Vector(b)
        d = b - a
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=vertices, radius1=r1, radius2=r2, depth=d.length)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(o)
        mesh.materials.append(material)
        self._bevel(o, min(r1, r2) * .9, 3)
        o.location = (a + b) / 2
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        self.current.append(o)
        return o

    def capsule(self, name, a, b, radius, material, vertices=14):
        """Sphere-swept segment (a true capsule) from a to b."""
        a, b = Vector(a), Vector(b)
        d = b - a
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=vertices, v_segments=max(8, vertices // 2), radius=radius)
        half = d.length / 2
        for v in bm.verts:
            v.co.z += half if v.co.z > 0 else -half
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(o)
        mesh.materials.append(material)
        o.location = (a + b) / 2
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler() if d.length > 1e-6 else (0, 0, 0)
        self.current.append(o)
        return o

    def lathe(self, name, profile, material, loc=(0, 0, 0), segments=32, rot=None):
        """Spin a side profile [(radius, z), ...] around Z (vases, bottles, towers)."""
        bm = bmesh.new()
        rings = []
        for i in range(segments):
            a = i * math.tau / segments
            ca, sa = math.cos(a), math.sin(a)
            rings.append([bm.verts.new((r * ca, r * sa, z)) for r, z in profile])
        for i in range(segments):
            r0, r1 = rings[i], rings[(i + 1) % segments]
            for j in range(len(profile) - 1):
                bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
        # Caps where the profile does not close on the axis.
        if profile[0][0] > 1e-4:
            bm.faces.new([ring[0] for ring in reversed(rings)])
        if profile[-1][0] > 1e-4:
            bm.faces.new([ring[-1] for ring in rings])
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(o)
        mesh.materials.append(material)
        o.location = loc
        if rot:
            o.rotation_euler = rot
        self.current.append(o)
        return o

    def prism(self, name, profile, width, material, loc=(0, 0, 0), axis='Y', bevel=.03, segments=2, rot=None):
        """Extrude a 2D outline. axis='Y': profile is (x, z), extruded along Y (front shapes).
        axis='X': profile is (y, z), extruded along X (side shapes)."""
        bm = bmesh.new()
        if axis == 'X':
            verts = [bm.verts.new((-width / 2, p[0], p[1])) for p in profile]
            vec = Vector((width, 0, 0))
        else:
            verts = [bm.verts.new((p[0], -width / 2, p[1])) for p in profile]
            vec = Vector((0, width, 0))
        face = bm.faces.new(verts)
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        bmesh.ops.translate(bm, vec=vec, verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(o)
        mesh.materials.append(material)
        self._bevel(o, bevel, segments)
        o.location = loc
        if rot:
            o.rotation_euler = rot
        self.current.append(o)
        return o

    def tube(self, name, points, radius, material, vertices=10, closed=False):
        """Round tube through a polyline (handles, strings, rails)."""
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = radius
        # A round bevel has 4 + 2 * (resolution * 2) sides; honour the requested side count.
        curve.bevel_resolution = max(0, (vertices - 4) // 4)
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
        o.data.materials.append(material)
        self.current.append(o)
        return o

    # ------------------------------------------------------------ surface helpers
    @staticmethod
    def on_ellipsoid(center, radii, direction, lift=0.):
        """Point on an ellipsoid surface along `direction`, plus its outward normal."""
        d = Vector(direction).normalized()
        rx, ry, rz = radii
        # Scale factor so that (d*t) lies on the ellipsoid.
        t = 1 / math.sqrt((d.x / rx) ** 2 + (d.y / ry) ** 2 + (d.z / rz) ** 2)
        p = d * t
        n = Vector((p.x / rx ** 2, p.y / ry ** 2, p.z / rz ** 2)).normalized()
        return Vector(center) + p + n * lift, n

    def decal(self, name, center, radii, direction, size, material, lift=0., spin=0.):
        """A flattened ellipsoid sitting on a surface, facing its normal (eyes, blush, badges)."""
        p, n = self.on_ellipsoid(center, radii, direction, lift)
        o = self.ball(name, p, size, material, 16, 8)
        q = n.to_track_quat('-Y', 'Z')
        o.rotation_euler = (q @ Matrix.Rotation(spin, 4, 'Y').to_quaternion()).to_euler() if spin else q.to_euler()
        return o

    # ------------------------------------------------------------------ assembly
    def join(self, name, parts, pivot=None, sharp_angle=40):
        """Join parts into one multi-material object with its origin at `pivot`."""
        parts = [p for p in parts if p is not None]
        keep = [c for c in self.current if all(c is not p for p in parts)]
        bpy.ops.object.select_all(action='DESELECT')
        for p in parts:
            p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        o = bpy.context.object
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        o.name = name
        o.data.name = name
        # Merge material slots that share a material so each joined object has one primitive per material.
        self._dedupe_slots(o)
        if pivot is not None:
            pivot = Vector(pivot)
            o.data.transform(Matrix.Translation(o.location - pivot))
            o.location = pivot
        for poly in o.data.polygons:
            poly.use_smooth = True
        o.data.set_sharp_from_angle(angle=math.radians(sharp_angle))
        o.select_set(False)
        self.current = keep + [o]
        return o

    @staticmethod
    def _dedupe_slots(o):
        mesh = o.data
        seen = {}
        remap = []
        for i, slot in enumerate(mesh.materials):
            key = slot.name if slot else None
            if key not in seen:
                seen[key] = len(seen)
            remap.append(seen[key])
        if len(seen) == len(mesh.materials):
            return
        unique = []
        for slot in mesh.materials:
            if slot not in unique:
                unique.append(slot)
        # materials.clear() resets every face's index, so remember the remapped indices first.
        indices = [remap[poly.material_index] for poly in mesh.polygons]
        mesh.materials.clear()
        for m in unique:
            mesh.materials.append(m)
        for poly, index in zip(mesh.polygons, indices):
            poly.material_index = index

    def empty(self, name, loc=(0, 0, 0), parent=None, props=None):
        o = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(o)
        o.location = loc
        o.empty_display_size = .1
        for k, v in (props or {}).items():
            o[k] = v
        if parent:
            self.parent(o, parent)
        self.current.append(o)
        return o

    @staticmethod
    def parent(child, parent):
        bpy.context.view_layer.update()
        world = child.matrix_world.copy()
        child.parent = parent
        child.matrix_world = world
        return child

    # --------------------------------------------------------------------- paint
    def paint(self, objects, lo=None, hi=None, shade=.62, tint=(.86, .9, 1.08), warm=(1.04, 1.0, .94)):
        """Height-based painted light as a 'Paint' colour attribute (linear floats).

        The bottom is `shade` dark and cool-tinted, the top is warm and full bright.
        """
        bpy.context.view_layer.update()
        meshes = [o for o in objects if o.type == 'MESH']
        if not meshes:
            return
        zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
        lo = min(zs) if lo is None else lo
        hi = max(zs) if hi is None else hi
        span = max(hi - lo, 1e-4)
        for o in meshes:
            mesh = o.data
            if 'Paint' in mesh.color_attributes:
                mesh.color_attributes.remove(mesh.color_attributes['Paint'])
            attr = mesh.color_attributes.new('Paint', 'FLOAT_COLOR', 'POINT')
            mw = o.matrix_world
            for i, v in enumerate(mesh.vertices):
                t = smoothstep((( mw @ v.co).z - lo) / span)
                k = shade + (1 - shade) * t
                c = [min(1., k * (tint[j] * (1 - t) + warm[j] * t)) for j in range(3)]
                attr.data[i].color = (*c, 1)
            mesh.color_attributes.active_color = attr
            mesh.color_attributes.render_color_index = mesh.color_attributes.find('Paint')

    # --------------------------------------------------------------------- export
    def export(self, path, roots, extras=True):
        """Export `roots` and all their descendants as one GLB."""
        objects = []

        def walk(o):
            objects.append(o)
            for c in o.children:
                walk(c)
        for r in roots:
            walk(r)
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', use_selection=True, export_yup=True,
            export_extras=extras, export_apply=True, export_vertex_color='ACTIVE',
            export_all_vertex_colors=False, export_animations=False, export_texcoords=False,
            export_tangents=False, export_cameras=False, export_lights=False)
        return objects
