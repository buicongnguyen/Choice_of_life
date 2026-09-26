"""Marigold Bay kit: harbour town, coast road, lantern festival, harbour hazards, bicycle and gull.

Builders live in the _harbour_*.py helper modules (not scanned by build.py):
  _harbour_lib.py    shared helpers (window frames, doors, pillow stones, awnings, sweeps, finishing)
  _harbour_town.py   street tile, terraced houses, bakery, schools, fish market
  _harbour_props.py  street furniture, coast furniture, festival pieces, in-lane hazards
  _harbour_sea.py    coast tiles, guardrail, seawall, pier, boats, lighthouse, far headland and hills
  _harbour_rides.py  bicycle and gull (animated hierarchies)

Conventions beyond art/README.md:
  - Ground tiles (street/road/boardwalk/cliff path) span exactly X -4..4 over Y -6..+3.5, walking surface at
    Z = 0 (extras 'tile' = 8, 'surface' = 0) and tile seamlessly along X.
  - Buildings and back-edge pieces (houses, bakery, schools, seawall, guardrail) are authored in place:
    origin (0, 0, 0) on the street centre line, facade on Y = +3.5 facing -Y (extras 'front', 'width', 'depth').
  - Spans (bunting, lantern_string) have poles at X = +-4 (extras 'span' = 8); the pier is centred on its
    footprint with its deck at Z = 1 (extras 'deck').
  - Boats have their waterline at Z = 0 (extras 'draft', 'length'); the lighthouse carries 'light_z';
    cliff_big carries 'top' (Z of the grassy top) and 'top_x'/'top_y' (where the lighthouse stands).
  - Every static root has extras 'height'; hazards also 'kind' ('low' can be jumped, 'tall' must be dodged).
"""
import _harbour_props as props
import _harbour_rides as rides
import _harbour_sea as sea
import _harbour_town as town

ASSETS = [
    ('harbour', town, ['street_tile', 'house_a', 'house_b', 'house_c', 'house_d', 'bakery', 'school', 'high_school',
                       'fish_market']),
    ('harbour', props, ['lamp_post', 'bench', 'planter', 'bollard', 'bunting', 'crate_stack', 'barrel', 'tree_pine',
                        'fence_warning']),
    ('harbour', sea, ['seawall', 'pier', 'boat_small', 'boat_fishing', 'sailboat', 'lighthouse', 'cliff_big', 'hill_far']),
    ('coast', sea, ['road_tile', 'boardwalk_tile', 'cliff_path_tile', 'guardrail']),
    ('coast', props, ['beach_hut', 'bus_stop', 'dune_grass', 'signpost', 'rock_low', 'ice_cream_cart']),
    ('festival', props, ['lantern_string', 'festival_stall']),
    ('hazards_harbour', props, ['hz_puddle', 'hz_crates', 'hz_barrel', 'hz_cone', 'hz_bin', 'hz_sandcastle',
                                'hz_deckchair', 'hz_picnic']),
    ('vehicles', rides, ['bicycle', 'gull']),
]


def registry():
    return {name: (group, getattr(module, name)) for group, module, names in ASSETS for name in names}
