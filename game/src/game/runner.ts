import { HAZARD_HALF_LENGTH, LANE_Z, type Course, type Lane, type Spawn } from "./course";

/** Fixed simulation step. Rendering interpolates; collisions only ever use this state. */
export const STEP = 1 / 120;

export const LANE_SPEED = 11;
/** Clearance for a low hazard without a recorded height. */
const LOW_CLEARANCE = 0.42;
const PLAYER_HALF_LENGTH = 0.3;
/**
 * Jumps are shaped by the running speed: at any pace a jump keeps you above the tallest low
 * hazard (JUMP_CLEAR_HEIGHT) for long enough to pass its whole footprint, plus JUMP_SLACK
 * seconds of timing forgiveness either side. Slow chapters get a floatier hop.
 */
export const JUMP_APEX = 1.05;
export const JUMP_CLEAR_HEIGHT = 0.46;
export const JUMP_SLACK = 0.13;
const JUMP_CLEAR_TIME = [0.45, 1.35] as const;

export interface JumpShape {
  /** Take-off speed (m/s up) and gravity (m/s²) for this jump. */
  vy: number;
  gravity: number;
  /** Seconds from take-off to the top of the arc. */
  apexTime: number;
}

export function jumpShape(runSpeed: number): JumpShape {
  const v = Math.max(0.5, runSpeed);
  const footprint = 2 * (HAZARD_HALF_LENGTH + PLAYER_HALF_LENGTH);
  const clearTime = Math.min(JUMP_CLEAR_TIME[1], Math.max(JUMP_CLEAR_TIME[0], footprint / v + 2 * JUMP_SLACK));
  // Above height h for time t around the apex H: t = 2 * sqrt(2 (H - h) / g).
  const gravity = (8 * (JUMP_APEX - JUMP_CLEAR_HEIGHT)) / (clearTime * clearTime);
  const vy = Math.sqrt(2 * gravity * JUMP_APEX);
  return { vy, gravity, apexTime: vy / gravity };
}
const HIT_DEPTH = 0.95;
const INVULNERABLE = 1.2;
const SHIELD_COOLDOWN = 20;

export interface RunnerOptions {
  /** Cruise speed in m/s. */
  speed: number;
  /** Biscuit fetches pickups from neighbouring lanes. */
  magnet: boolean;
  /** Sam absorbs one hit every 20 seconds. */
  shield: boolean;
  /** Juno's letters can be collected (you promised to write). */
  letters?: boolean;
}

export type RunnerEvent =
  | { type: "pickup"; spawn: Spawn; magnet: boolean }
  | { type: "keepsake"; spawn: Spawn }
  | { type: "letter"; spawn: Spawn }
  | { type: "hit"; spawn: Spawn }
  | { type: "shielded"; spawn: Spawn }
  | { type: "streak"; count: number }
  | { type: "jump" }
  | { type: "land" }
  | { type: "gust-warning"; dir: -1 | 1 }
  | { type: "gust"; dir: -1 | 1 }
  | { type: "arrived" };

export interface RunnerInput {
  /** -1 = toward the far lane, +1 = toward the near lane (edge-triggered). */
  laneStep?: -1 | 1;
  jump?: boolean;
}

export class Runner {
  x = 0;
  lane: Lane = 1;
  z: number = LANE_Z[1];
  y = 0;
  vy = 0;
  speed = 0;
  cruise: number;
  /** Where to come to rest (an encounter), or null to keep running. */
  stopAt: number | null = null;
  invulnerable = 0;
  shieldCooldown = 0;
  streak = 0;
  time = 0;
  /** Suppresses steering while the story takes over (approach to an encounter). */
  autopilotLane: Lane | null = null;
  private next = 0;
  private collected = new Set<number>();
  private gustIndex = 0;
  private pendingGust: { at: number; dir: -1 | 1 } | null = null;
  private wasAirborne = false;
  private gravity = jumpShape(0).gravity;

  constructor(
    readonly course: Course,
    private options: RunnerOptions,
    startX = 0,
  ) {
    this.cruise = options.speed;
    this.x = startX;
    this.prevX = startX;
    while (this.next < course.spawns.length && course.spawns[this.next].x < startX - 2) this.next++;
    while (this.gustIndex < course.gusts.length && course.gusts[this.gustIndex] < startX) this.gustIndex++;
  }

  setOptions(options: Partial<RunnerOptions>) {
    this.options = { ...this.options, ...options };
    if (options.speed) this.cruise = options.speed;
  }

  /** How far before a low hazard to take off so the top of the jump is right over it. */
  jumpLead(): number {
    return this.speed * jumpShape(this.speed).apexTime;
  }

  get airborne() {
    return this.y > 0.001;
  }

  get shieldReady() {
    return this.options.shield && this.shieldCooldown <= 0;
  }

  isCollected(id: number) {
    return this.collected.has(id);
  }

  /** State before the last step, for render interpolation. */
  prevX = 0;
  prevY = 0;
  prevZ: number = LANE_Z[1];

  collectedIds(): number[] {
    return [...this.collected];
  }

  /** Marks spawns already taken before a reload so they can't be collected twice. */
  preCollect(ids: readonly number[]) {
    for (const id of ids) this.collected.add(id);
  }

  step(input: RunnerInput, dt = STEP): RunnerEvent[] {
    const events: RunnerEvent[] = [];
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevZ = this.z;
    this.time += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);

    // ------------------------------------------------------------ steering
    if (this.autopilotLane !== null) {
      this.lane = this.autopilotLane;
    } else if (input.laneStep) {
      this.lane = Math.max(0, Math.min(2, this.lane + input.laneStep)) as Lane;
    }
    if (input.jump && !this.airborne && this.stopAt === null) {
      const shape = jumpShape(this.speed);
      this.vy = shape.vy;
      this.gravity = shape.gravity;
      events.push({ type: "jump" });
    }
    const targetZ = LANE_Z[this.lane];
    const dz = targetZ - this.z;
    this.z += Math.sign(dz) * Math.min(Math.abs(dz), LANE_SPEED * dt);

    // ------------------------------------------------------------ vertical
    if (this.airborne || this.vy > 0) {
      this.vy -= this.gravity * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.vy = 0;
    }
    if (this.wasAirborne && !this.airborne) events.push({ type: "land" });
    this.wasAirborne = this.airborne;

    // ------------------------------------------------------------ speed
    let target = this.cruise;
    if (this.stopAt !== null) {
      const remaining = this.stopAt - this.x;
      // Brake so the runner arrives gently: v = sqrt(2 a d) with a comfortable deceleration.
      target = Math.min(this.cruise, Math.sqrt(Math.max(0, 2 * 6 * remaining)));
      if (remaining <= 0.05) {
        this.x = this.stopAt;
        this.speed = 0;
        this.stopAt = null;
        this.cruise = 0;
        events.push({ type: "arrived" });
        return events;
      }
    }
    const accel = target > this.speed ? 7 : 14;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), accel * dt);
    this.x += this.speed * dt;

    // ------------------------------------------------------------ wind (chapter 6)
    if (this.pendingGust && this.time >= this.pendingGust.at) {
      const dir = this.pendingGust.dir;
      this.pendingGust = null;
      // Re-check at the moment of the push: the player may have moved since the warning.
      if (this.autopilotLane === null && this.laneIsClear(this.lane + dir, this.x - 1, this.x + 10)) {
        this.lane = Math.max(0, Math.min(2, this.lane + dir)) as Lane;
        events.push({ type: "gust", dir });
      }
    }
    if (this.gustIndex < this.course.gusts.length && this.x >= this.course.gusts[this.gustIndex] - this.speed * 1.2) {
      const gx = this.course.gusts[this.gustIndex++];
      const dir = this.safeGustDirection(gx);
      if (dir) {
        this.pendingGust = { at: this.time + 1.2, dir };
        events.push({ type: "gust-warning", dir });
      }
    }

    // ------------------------------------------------------------ collisions
    const spawns = this.course.spawns;
    while (this.next < spawns.length && spawns[this.next].x < this.x - 3) this.next++;
    for (let i = this.next; i < spawns.length && spawns[i].x < this.x + 3; i++) {
      const s = spawns[i];
      if (this.collected.has(s.id)) continue;
      if (s.kind === "letter" && !this.options.letters) continue;
      const dx = Math.abs(s.x - this.x);
      const sz = LANE_Z[s.lane];
      if (s.kind === "hazard") {
        if (dx > HAZARD_HALF_LENGTH + PLAYER_HALF_LENGTH || Math.abs(sz - this.z) > HIT_DEPTH) continue;
        if (s.hazard?.kind === "low" && this.y > (s.hazard.height ?? LOW_CLEARANCE)) continue;
        if (this.invulnerable > 0) continue;
        this.collected.add(s.id);
        if (this.shieldReady) {
          this.shieldCooldown = SHIELD_COOLDOWN;
          this.invulnerable = 0.6;
          events.push({ type: "shielded", spawn: s });
        } else {
          this.invulnerable = INVULNERABLE;
          this.speed *= 0.55;
          this.streak = 0;
          events.push({ type: "hit", spawn: s });
        }
        continue;
      }
      const centre = this.y + 0.6;
      const reach = Math.abs(s.y - centre) < 0.85;
      const inLane = dx < 0.8 && Math.abs(sz - this.z) < 0.9;
      const fetched = this.options.magnet && s.kind === "pickup" && s.y < 0.8 && dx < 1.2 && Math.abs(sz - this.z) < 2.3;
      if (!((inLane && reach) || fetched)) continue;
      this.collected.add(s.id);
      if (s.kind === "keepsake") events.push({ type: "keepsake", spawn: s });
      else if (s.kind === "letter") events.push({ type: "letter", spawn: s });
      else {
        events.push({ type: "pickup", spawn: s, magnet: !(inLane && reach) });
        this.streak += 1;
        if (this.streak % 20 === 0) events.push({ type: "streak", count: this.streak });
      }
    }
    return events;
  }

  private laneIsClear(lane: number, from: number, to: number) {
    if (lane < 0 || lane > 2) return false;
    return !this.course.spawns.some((s) => s.kind === "hazard" && s.lane === lane && s.x > from && s.x < to);
  }

  /** Push toward a neighbouring lane that has no hazard over the next 14 m; 0 if none. */
  private safeGustDirection(gx: number): -1 | 1 | 0 {
    const options = ([-1, 1] as const).filter((d) => this.laneIsClear(this.lane + d, gx - 2, gx + 14));
    if (!options.length) return 0;
    return options[Math.floor((gx * 7.13) % options.length)];
  }
}
