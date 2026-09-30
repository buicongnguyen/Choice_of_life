/**
 * Footsteps that match the ground.
 *
 * Every limb that touches the floor (legs, a crawling baby's knees and hands, the dog's paws) runs
 * the same stride cycle, offset by its own phase. For a `duty` fraction of the cycle its contact
 * point is planted: it travels backward under the body at exactly the running speed, so in the
 * world it stands still. For the rest of the cycle it lifts and swings forward again.
 *
 * The body rides as high as it can while every contact still reaches its spot, and each limb is
 * rotated towards its contact point and shortened a little when the spot is closer than the limb
 * is long (the toy figures have no knees, so a shortened leg reads as a bent one).
 */
export type Gait = "run" | "walk" | "toddle" | "crawl" | "dog";

interface GaitShape {
  /** Swing half-angle (rad) of a straight limb at full speed. */
  amp: number;
  /** Speed (m/s) at which the stride reaches full length; slower means shorter steps. */
  full: number;
  /** Fraction of the cycle each contact is planted (below 0.5 there is a flight phase). */
  duty: number;
  /** How high the swinging contact lifts, as a fraction of limb length. */
  lift: number;
  /** Most stride cycles per second before the legs blur; faster lengthens the stride instead. */
  maxFreq: number;
}

const SHAPES: Record<Gait, GaitShape> = {
  run: { amp: 0.58, full: 3.2, duty: 0.38, lift: 0.22, maxFreq: 4.5 },
  walk: { amp: 0.55, full: 2.2, duty: 0.55, lift: 0.12, maxFreq: 4.2 },
  toddle: { amp: 0.6, full: 2.0, duty: 0.4, lift: 0.18, maxFreq: 4.8 },
  crawl: { amp: 0.5, full: 1.6, duty: 0.42, lift: 0.12, maxFreq: 5.5 },
  dog: { amp: 0.55, full: 3.0, duty: 0.4, lift: 0.2, maxFreq: 7 },
};

/** Longest swing angle (rad) a lengthened stride may reach. */
export const MAX_AMP = 1.2;

export interface GaitParams {
  /** Stride cycles per second. */
  freq: number;
  /** How far in front of and behind its rest spot a planted contact travels. */
  reach: number;
  duty: number;
  /** Lift of the swinging contact. */
  lift: number;
}

export function gaitParams(gait: Gait, speed: number, limbLength: number): GaitParams {
  const shape = SHAPES[gait];
  const L = Math.max(0.05, limbLength);
  if (speed <= 0.01) return { freq: 0, reach: 0, duty: shape.duty, lift: 0 };
  const amp = shape.amp * Math.min(1, Math.max(0.35, speed / shape.full));
  let reach = L * Math.sin(amp);
  // Planted for duty/freq seconds while the ground moves 2·reach under it.
  let freq = (speed * shape.duty) / (2 * reach);
  if (freq > shape.maxFreq) {
    freq = shape.maxFreq;
    reach = Math.min(L * Math.sin(MAX_AMP), (speed * shape.duty) / (2 * freq));
  }
  return { freq, reach, duty: shape.duty, lift: shape.lift * L * Math.min(1, speed / shape.full + 0.3) };
}

/** Scales a gait's lengths (e.g. from metres into a scaled model's own units). */
export function scaleGait(g: GaitParams, k: number): GaitParams {
  return { ...g, reach: g.reach * k, lift: g.lift * k };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (p: number) => p - Math.floor(p);

export interface Contact {
  /** Offset from the middle of the stride, forward positive. */
  x: number;
  /** Height above the floor. */
  lift: number;
  stance: boolean;
}

/** Where a contact is at cycle position p: planted for p < duty, swinging after. */
export function contactAt(p: number, g: GaitParams): Contact {
  p = wrap(p);
  if (g.freq === 0) return { x: 0, lift: 0, stance: true };
  if (p < g.duty) return { x: g.reach * (1 - (2 * p) / g.duty), lift: 0, stance: true };
  const q = (p - g.duty) / (1 - g.duty);
  // Hermite swing from behind to in front whose end speeds match the stance (-2·reach per duty),
  // so the foot is still in the world as it peels off and as it sets down; it reaches a little
  // past its landing spot and draws back onto it. It lifts and lands gently (sin²).
  const tangent = (-2 * g.reach * (1 - g.duty)) / g.duty;
  const x = -g.reach + 2 * g.reach * smooth(q) + tangent * q * (2 * q - 1) * (q - 1);
  return { x, lift: g.lift * Math.sin(Math.PI * q), stance: false };
}

/** A limb as rigged: where its floor contact sits relative to its pivot at rest. */
export interface Limb {
  /** Cycle offset (0..1). */
  phase: number;
  /** Contact point ahead of the pivot at rest. */
  forward: number;
  /** Contact point below the pivot at rest (the pivot's height when standing). */
  down: number;
}

export interface LimbPose {
  /** Rotation from rest (rad); positive swings the contact backward (the models' convention). */
  angle: number;
  /** Length scale (1 = rest length). */
  stretch: number;
}

export interface GaitPose {
  limbs: LimbPose[];
  /** Body height relative to rest (0 or below). */
  body: number;
}

/** Solves every limb and the body height at stride position `cycle`. */
export function solveGait(cycle: number, g: GaitParams, limbs: Limb[]): GaitPose {
  const contacts = limbs.map((l) => contactAt(cycle + l.phase, g));
  const reachOf = (l: Limb) => Math.hypot(l.forward, l.down);
  // Standing still, a contact rests where it was rigged; on the move its stride is centred under
  // the pivot, which keeps the body's dip smallest (a crawling baby's knees rest ahead of its hips).
  const xOf = (l: Limb, c: Contact) => {
    const R = reachOf(l) * 0.995;
    return Math.max(-R, Math.min(R, (g.freq > 0 ? 0 : l.forward) + c.x));
  };
  // As high as possible while each contact can still get down to its spot.
  let body = 0;
  limbs.forEach((l, i) => {
    const R = reachOf(l);
    const x = xOf(l, contacts[i]);
    body = Math.min(body, contacts[i].lift + Math.sqrt(R * R - x * x) - l.down);
  });
  return {
    body,
    limbs: limbs.map((l, i) => {
      const x = xOf(l, contacts[i]);
      const h = l.down + body - contacts[i].lift;
      return { angle: Math.atan2(l.forward, l.down) - Math.atan2(x, h), stretch: Math.min(1, Math.hypot(x, h) / reachOf(l)) };
    }),
  };
}

/** Crank turns per wheel turn on the bicycle (it is geared so one pedal turn rolls ~4.6 m). */
export const CRANK_RATIO = 0.45;
