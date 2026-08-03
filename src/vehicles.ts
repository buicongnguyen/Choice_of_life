import type { VehicleTier } from "./types";

// ---------------------------------------------------------------------------
// Vehicles you can buy from your teens onward — a one-off purchase you own for
// life (so each only ever shows up until you've bought it). A bicycle is cheap
// and keeps you fit; a motorbike is a thrill with a little risk; a car is a big,
// pricey comfort; a sports car is pure (expensive) status. Pricier rides hit
// your wallet hard — that money can't go anywhere else.
// ---------------------------------------------------------------------------

export const VEHICLES: VehicleTier[] = [
  {
    id: "bicycle",
    name: "Bicycle",
    emoji: "🚲",
    cost: 400,
    effects: { health: 6, fun: 3, happiness: 2 },
    blurb: "Cheap, green and great exercise. Pedals you everywhere.",
    storyTag: "veh_bike",
  },
  {
    id: "motorbike",
    name: "Motorbike",
    emoji: "🏍️",
    cost: 6000,
    effects: { fun: 11, happiness: 4, health: -3 },
    blurb: "A real thrill on two wheels — fast, fun, and a touch risky.",
    storyTag: "veh_moto",
  },
  {
    id: "car",
    name: "Car",
    emoji: "🚗",
    cost: 28000,
    effects: { happiness: 8, fun: 4, health: -1 },
    blurb: "Freedom and comfort. It costs a lot — and a lot to run.",
    storyTag: "veh_car",
  },
  {
    id: "sportscar",
    name: "Sports car",
    emoji: "🏎️",
    cost: 120000,
    effects: { happiness: 13, fun: 9, health: -1 },
    blurb: "Roaring, head-turning status. A serious dent in your savings.",
    storyTag: "veh_sports",
  },
];
