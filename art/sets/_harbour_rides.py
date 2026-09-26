"""Animated harbour pieces: the teen bicycle and the seagull.

bicycle.glb  Root > Frame > {WheelF, WheelB, Crank}; empties Seat, Bars (on Frame), PedalL, PedalR (on Crank)
gull.glb     Root > Body > {WingL, WingR, Head}
Every joint's origin is its pivot (wheels at the hub, crank at the bottom bracket, wings at the shoulder),
so the runtime animates by rotating joints: wheels and crank about X, wings about Y. Both face -Y.
"""
import math

from mathutils import Vector

import _harbour_lib as L
from _harbour_lib import GLOSS, MATTE, SATIN, box, cyl, ball, rod

R_WHEEL = .33


def _wheel(k, name, hub, m):
    y, z = hub
    parts = [k.torus('Tyre', (0, y, z), R_WHEEL - .035, .035, m['rubber'], rot=(0, math.pi / 2, 0), major_seg=24,
                     minor_seg=6),
             k.torus('Rim', (0, y, z), R_WHEEL - .075, .018, m['steel'], rot=(0, math.pi / 2, 0), major_seg=24,
                     minor_seg=4),
             cyl(k, 'Hub', (0, y, z), .045, .11, m['steel'], axis='X', v=10, bevel=.01)]
    n = 10
    for i in range(n):
        a = i / n * math.tau
        side = .03 if i % 2 else -.03
        parts.append(rod(k, 'Spoke', (side, y, z), (0, y + math.cos(a) * (R_WHEEL - .085), z + math.sin(a) * (R_WHEEL - .085)),
                         .006, m['steel'], 4))
    # Reflector clip on two spokes so the spin reads.
    parts.append(box(k, 'Reflector', (0, y, z + .19), (.012, .05, .03), m['frame'], 0))
    return k.join(name, parts, pivot=(0, y, z), sharp_angle=50)


def bicycle(k):
    m = dict(frame=k.mat('Frame', 'coral', GLOSS), rubber=k.mat('Rubber', 'rubber', MATTE),
             steel=k.mat('Steel', '#c9d6e6', .25, metal=.7), seat=k.mat('Saddle', '#3a2a33', SATIN),
             trim=k.mat('Trim', 'white', GLOSS), basket=k.mat('Basket', 'marigold', SATIN),
             grip=k.mat('Grip', 'teal', GLOSS))
    # Upright, low toy geometry sized for the chibi teen (hip height ~.42 m): the saddle sits just
    # ahead of the rear tyre so the feet reach the pedals, and the bars come back to the hands.
    hf, hb = (-.52, R_WHEEL), (.5, R_WHEEL)
    bb = Vector((0, .02, .26))
    seat_c = Vector((0, .1, .52))
    head_top = Vector((0, -.34, .72))
    head_bot = Vector((0, -.39, .55))
    tube = .034
    parts = [L.tube(k, 'SeatTube', [tuple(bb), tuple(seat_c + Vector((0, .01, .04)))], tube, m['frame']),
             L.tube(k, 'TopTube', [tuple(seat_c), tuple(head_top - Vector((0, 0, .04)))], tube, m['frame']),
             L.tube(k, 'DownTube', [tuple(bb), tuple(head_bot + Vector((0, 0, .03)))], tube * 1.2, m['frame']),
             L.tube(k, 'HeadTube', [tuple(head_bot - Vector((0, .01, .03))), tuple(head_top + Vector((0, .01, .03)))], .038,
                    m['frame'])]
    for s in (-1, 1):
        parts.append(L.tube(k, 'ChainStay', [tuple(bb + Vector((s * .03, 0, 0))), (s * .055, hb[0], hb[1])], .018, m['frame']))
        parts.append(L.tube(k, 'SeatStay', [tuple(seat_c + Vector((s * .02, .01, -.02))), (s * .055, hb[0], hb[1])], .016,
                            m['frame']))
        parts.append(L.tube(k, 'Fork', [tuple(head_bot + Vector((s * .03, 0, 0))), (s * .05, hf[0] - .02, hf[1] + .14),
                                        (s * .05, hf[0], hf[1])], .018, m['frame']))
    parts.append(ball(k, 'Lug', tuple(bb), .05, m['frame'], 10, 6))
    # Seat post, saddle, stem and bars.
    saddle = seat_c + Vector((0, .02, .12))
    parts.append(rod(k, 'SeatPost', tuple(seat_c), tuple(saddle - Vector((0, 0, .02))), .02, m['steel'], 8))
    parts.append(ball(k, 'Saddle', tuple(saddle + Vector((0, .02, 0))), (.09, .15, .045), m['seat'], 12, 6))
    parts.append(ball(k, 'SaddleNose', tuple(saddle + Vector((0, -.12, .005))), (.035, .08, .03), m['seat'], 8, 5))
    bars = head_top + Vector((0, .03, .14))
    parts.append(rod(k, 'Stem', tuple(head_top), tuple(bars), .022, m['steel'], 8))
    parts.append(L.tube(k, 'Bar', [(-.28, bars.y + .13, bars.z + .02), (-.17, bars.y + .03, bars.z), (.17, bars.y + .03, bars.z),
                                   (.28, bars.y + .13, bars.z + .02)], .017, m['steel']))
    for s in (-1, 1):
        parts.append(cyl(k, 'Grip', (s * .28, bars.y + .13, bars.z + .02), .026, .12, m['grip'], axis='X', v=8, bevel=.01))
    parts.append(ball(k, 'Bell', (.12, bars.y - .01, bars.z + .04), (.03, .03, .02), m['steel'], 8, 4))
    # Fenders, chain, chain guard, rear rack, front basket and lamp.
    for (y, z), a0, a1 in ((hf, .2, 2.3), (hb, .9, 3.0)):
        pts = [(0, y + math.cos(a) * (R_WHEEL + .04), z + math.sin(a) * (R_WHEEL + .04))
               for a in [a0 + (a1 - a0) * i / 7 for i in range(8)]]
        parts.append(L.tube(k, 'Fender', pts, .03, m['trim']))
    chain = [(-.07, bb.y + math.cos(a) * .1, bb.z + math.sin(a) * .1) for a in [i / 6 * math.pi - math.pi / 2 for i in range(7)]]
    chain += [(-.07, hb[0] + math.cos(a) * .045, hb[1] + math.sin(a) * .045) for a in
              [math.pi / 2 - i / 6 * math.pi for i in range(7)]]
    parts.append(L.tube(k, 'Chain', chain, .008, m['rubber'], closed=True))
    ang = math.atan2(hb[1] - bb.z, hb[0] - bb.y)
    parts.append(box(k, 'ChainGuard', (-.1, (bb.y + hb[0]) / 2 - .05, (bb.z + hb[1]) / 2 + .07), (.015, .36, .05), m['trim'],
                     .008, rot=(ang, 0, 0)))
    parts.append(cyl(k, 'Cog', (-.07, hb[0], hb[1]), .05, .02, m['steel'], axis='X', v=10, bevel=0))
    rack_z = R_WHEEL * 2 + .08
    parts.append(box(k, 'Rack', (0, hb[0] + .06, rack_z), (.16, .34, .025), m['steel'], .008))
    for s in (-1, 1):
        parts.append(rod(k, 'RackStay', (s * .06, hb[0] + .16, rack_z), (s * .055, hb[0], hb[1]), .01, m['steel'], 4))
        parts.append(rod(k, 'RackArm', (s * .06, hb[0] - .1, rack_z), tuple(seat_c + Vector((s * .02, .02, 0))), .01,
                         m['steel'], 4))
    parts.append(box(k, 'TailLight', (0, hb[0] + .24, rack_z - .03), (.06, .03, .04), m['frame'], .01))
    bk = Vector((0, bars.y - .19, bars.z - .07))
    parts.append(k.tbox('Basket', tuple(bk), (.3, .24), (.25, .2), .2, m['basket'], bevel=.025, segments=1))
    for i in range(2):
        parts.append(box(k, 'Weave', (0, bk.y - .122, bk.z - .04 + i * .08), (.28, .012, .022), m['trim'], 0))
    parts.append(k.torus('BasketRim', (0, bk.y, bk.z + .1), .15, .014, m['trim'], major_seg=12, minor_seg=3))
    parts[-1].scale = (1, .8, 1)
    parts.append(cyl(k, 'Lamp', (0, head_top.y - .08, head_top.z - .05), .04, .06, m['trim'], axis='Y', v=10, bevel=.01))
    frame = k.join('Frame', parts, pivot=(0, 0, 0), sharp_angle=50)
    wf = _wheel(k, 'WheelF', hf, m)
    wb = _wheel(k, 'WheelB', hb, m)
    # Crank: chainring on the right (-X), arms opposite, pedals; pivot at the bottom bracket.
    arm = .13
    cparts = [cyl(k, 'Chainring', (-.07, bb.y, bb.z), .1, .02, m['steel'], axis='X', v=16, bevel=.004),
              cyl(k, 'Spindle', tuple(bb), .025, .2, m['steel'], axis='X', v=8, bevel=0)]
    pedal_l = bb + Vector((.12, 0, -arm))
    pedal_r = bb + Vector((-.12, 0, arm))
    for p, sx in ((pedal_l, 1), (pedal_r, -1)):
        cparts.append(rod(k, 'CrankArm', (sx * .09, bb.y, bb.z), (sx * .09, p.y, p.z), .016, m['steel'], 6))
        cparts.append(box(k, 'Pedal', (p.x + sx * .03, p.y, p.z), (.09, .1, .025), m['rubber'], .008, 1))
    crank = k.join('Crank', cparts, pivot=tuple(bb), sharp_angle=50)
    root = k.empty('Root', props={'kind': 'bicycle', 'wheel_radius': R_WHEEL, 'height': float(bars.z + .05),
                                  'crank_length': arm})
    k.parent(frame, root)
    k.parent(wf, frame)
    k.parent(wb, frame)
    k.parent(crank, frame)
    k.empty('Seat', tuple(saddle + Vector((0, .02, .045))), parent=frame)
    k.empty('Bars', (0, bars.y + .13, bars.z + .02), parent=frame)
    k.empty('PedalL', tuple(pedal_l + Vector((.03, 0, .02))), parent=crank)
    k.empty('PedalR', tuple(pedal_r + Vector((-.03, 0, .02))), parent=crank)
    k.paint([o for o in k.current if o.type == 'MESH'], lo=0, hi=1.1, shade=.72)
    return root


def gull(k):
    white = k.mat('Feather', 'white', SATIN)
    grey = k.mat('Grey', '#aab4cc', SATIN)
    ink = k.mat('Ink', 'ink', GLOSS)
    beak = k.mat('Beak', 'sun', GLOSS)
    spot = k.mat('Spot', 'red', GLOSS)
    feet = k.mat('Feet', 'orange', GLOSS)
    shine = k.mat('EyeShine', '#ffffff', .2, emit=1.2)
    z = .3
    body = k.join('Body', [
        ball(k, 'Body', (0, .03, z), (.12, .27, .11), white, 14, 8),
        ball(k, 'Back', (0, .08, z + .05), (.11, .2, .06), grey, 12, 6),
        k.prism('Tail', [(-.08, 0), (.08, 0), (.05, .16), (-.05, .16)], .04, grey, loc=(0, .24, z + .03), axis='Y',
                bevel=.01, rot=(-math.pi / 2 + .25, 0, 0)),
        k.prism('TailTip', [(-.052, .14), (.052, .14), (.05, .18), (-.05, .18)], .045, ink, loc=(0, .24, z + .03),
                axis='Y', bevel=0, rot=(-math.pi / 2 + .25, 0, 0)),
    ] + [p for s in (-1, 1) for p in (
        rod(k, 'Leg', (s * .05, 0, z - .08), (s * .05, 0, .03), .014, feet, 6),
        k.prism('Foot', [(-.05, 0), (.05, 0), (0, -.09)], .015, feet, loc=(s * .05, -.02, .008), axis='Y', bevel=0,
                rot=(-math.pi / 2, 0, 0)))], pivot=(0, 0, z), sharp_angle=60)
    hc = Vector((0, -.2, z + .12))
    head = k.join('Head', [
        ball(k, 'Head', tuple(hc), (.085, .09, .085), white, 12, 7),
        k.cyl('Beak', (0, hc.y - .12, hc.z - .015), .032, .1, beak, vertices=8, bevel=0, radius2=.008,
              rot=(math.pi / 2 + .1, 0, 0)),
        ball(k, 'Spot', (0, hc.y - .135, hc.z - .03), .012, spot, 6, 4),
    ] + [p for s in (-1, 1) for p in (
        ball(k, 'Eye', (s * .06, hc.y - .05, hc.z + .025), .017, ink, 8, 5),
        ball(k, 'EyeShine', (s * .068, hc.y - .062, hc.z + .033), .006, shine, 6, 4))],
        pivot=(0, -.15, z + .05), sharp_angle=60)
    wings = {}
    for side, s in (('L', 1), ('R', -1)):
        sh = Vector((s * .1, -.02, z + .07))

        def panel(name, outline, mat, thick, bevel):
            pts = [(s * x, y) for x, y in outline]
            if s < 0:
                pts.reverse()
            return k.prism(name, pts, thick, mat, loc=(0, 0, 0), axis='Y', bevel=bevel, rot=(-math.pi / 2, 0, 0))
        # Gull-wing bend: the inner arm lifts, the outer hand droops; black tips, white trailing edge.
        inner = [panel('Wing', [(0, -.1), (.32, -.1), (.32, .1), (0, .13)], grey, .045, .015),
                 panel('WingEdge', [(0, .1), (.32, .08), (.32, .11), (0, .14)], white, .05, 0)]
        outer = [panel('Wing', [(0, -.1), (.2, -.085), (.33, -.03), (.36, .02), (.22, .08), (0, .1)], grey, .04, .012),
                 panel('WingTip', [(.18, -.085), (.33, -.03), (.36, .02), (.22, .08), (.14, .01)], ink, .046, 0)]
        up, down = math.radians(16), math.radians(14)
        L.place(inner, loc=tuple(sh), rot=(0, -s * up, 0))
        joint = sh + Vector((s * .31 * math.cos(up), 0, .31 * math.sin(up)))
        L.place(outer, loc=tuple(joint), rot=(0, s * down, 0))
        wings[side] = k.join('Wing' + side, inner + outer, pivot=tuple(sh), sharp_angle=60)
    root = k.empty('Root', props={'kind': 'gull', 'height': float(hc.z + .09), 'wingspan': 1.5})
    k.parent(body, root)
    k.parent(head, body)
    for w in wings.values():
        k.parent(w, body)
    k.paint([o for o in k.current if o.type == 'MESH'], lo=0, hi=hc.z + .1, shade=.8)
    return root
