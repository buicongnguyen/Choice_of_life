"""Chapter 1 "First Light": the Cottage on Gull Lane, its garden and Dad's boat shed.

Groups:
  home          room tiles (floor, walls), furniture, garden tiles and garden props
  pickups       heart, star, coin, keepsake marble, letter, time-capsule tin
  hazards_home  toddler hazards (extras.height; low <= .45 m is jumpable, tall must be dodged)

Tiles (home_floor, home_wall*, garden_floor, garden_fence) are 8 m long in X, centred on
X = 0, authored in world space: floor/grass top at Z = 0, wall front face at Y = +3.5,
fence front near Y = +3.5. Props have their origin at the footprint centre, base at Z = 0,
front facing -Y. Builders live in the _home_*.py helper modules.
"""
import _home_room as room

try:
    import _home_furniture as furniture
except ImportError:  # pragma: no cover - modules are added as the kit grows
    furniture = None
try:
    import _home_garden as garden
except ImportError:  # pragma: no cover
    garden = None
try:
    import _home_items as items
except ImportError:  # pragma: no cover
    items = None


def registry():
    reg = {
        'home_floor': ('home', room.build_floor),
        'home_wall': ('home', lambda k: room.build_wall(k, 'plain')),
        'home_wall_window': ('home', lambda k: room.build_wall(k, 'window')),
        'home_wall_door': ('home', lambda k: room.build_wall(k, 'door')),
        'rug_round': ('home', room.build_rug),
    }
    for module, group in ((furniture, 'home'), (garden, 'home')):
        if module is not None:
            for name, fn in module.BUILDERS.items():
                reg[name] = (group, fn)
    if items is not None:
        for name, (group, fn) in items.BUILDERS.items():
            reg[name] = (group, fn)
    return reg
