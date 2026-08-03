import type { Stats } from "./types";

// ---------------------------------------------------------------------------
// A special, one-time SELECTION stage: when you start your career you choose
// how you commute to work. The options are gated by your net worth — you can
// walk for free, but a used car (let alone a chauffeured luxury car) is only
// open to you once you've built up some money. The fancier the commute, the
// happier (and pricier) it is. Pick exactly one.
// ---------------------------------------------------------------------------

export interface CommuteTier {
  id: string;
  name: string;
  emoji: string;
  /** Up-front dollar cost. */
  cost: number;
  /** Minimum net worth to unlock this option. */
  minNet: number;
  /** One-off stat effects when chosen. */
  effects: Partial<Stats>;
  blurb: string;
  storyTag: string;
}

export const COMMUTES: CommuteTier[] = [
  {
    id: "walk",
    name: "Walk / cycle",
    emoji: "🚶",
    cost: 0,
    minNet: 0,
    effects: { health: 6, fun: -2 },
    blurb: "Free, and it keeps you fit — but the daily slog is a grind.",
    storyTag: "commute_walk",
  },
  {
    id: "transit",
    name: "Public transit",
    emoji: "🚌",
    cost: 1200,
    minNet: 2000,
    effects: { happiness: 3 },
    blurb: "Bus and train. Cheap, easy, no parking headaches.",
    storyTag: "commute_transit",
  },
  {
    id: "car",
    name: "Drive a car",
    emoji: "🚗",
    cost: 5000,
    minNet: 15000,
    effects: { happiness: 5, fun: 4 },
    blurb: "Your own car — comfort and freedom on every trip.",
    storyTag: "commute_car",
  },
  {
    id: "luxury",
    name: "Luxury car",
    emoji: "🏎️",
    cost: 25000,
    minNet: 120000,
    effects: { happiness: 8, fun: 5 },
    blurb: "Glide to work in style. Turns heads — and burns cash.",
    storyTag: "commute_luxury",
  },
];
