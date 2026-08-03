import type { HouseTier } from "./types";

// ---------------------------------------------------------------------------
// Property you can buy once you're earning — priced in real dollars. The home
// you LIVE in is the nicest one you own; its QUALITY (1..5) becomes the
// background of every home stage (a villa is bright and grand; a studio is
// cracked and run-down). You can only buy what you can afford.
//
// A pricier home costs more to keep (`upkeep` dollars drain every action) — so
// splurging on a villa squeezes everything else. And once you own more than one
// place, the spare homes become rentals that pay `rentYield` dollars every
// stage — the start of a little property empire.
// ---------------------------------------------------------------------------

export const HOUSE_TIERS: HouseTier[] = [
  {
    id: "studio",
    name: "Studio flat",
    emoji: "🏚️",
    cost: 80000,
    quality: 1,
    happiness: 3,
    upkeep: 0,
    rentYield: 5000,
    blurb: "Cheap and cramped, with cracks in the walls. It's a start.",
  },
  {
    id: "condo",
    name: "City condo",
    emoji: "🏢",
    cost: 180000,
    quality: 2,
    happiness: 7,
    upkeep: 2500,
    rentYield: 11000,
    blurb: "A tidy apartment in a decent block. Comfortable and yours.",
  },
  {
    id: "townhouse",
    name: "Townhouse",
    emoji: "🏠",
    cost: 320000,
    quality: 3,
    happiness: 11,
    upkeep: 4500,
    rentYield: 19000,
    blurb: "A bright, roomy townhouse. Proud to call it home.",
  },
  {
    id: "house",
    name: "Family house",
    emoji: "🏡",
    cost: 600000,
    quality: 4,
    happiness: 15,
    upkeep: 8500,
    rentYield: 36000,
    blurb: "A lovely detached home with a garden. Room to grow.",
  },
  {
    id: "villa",
    name: "Luxury villa",
    emoji: "🏰",
    cost: 1500000,
    quality: 5,
    happiness: 20,
    upkeep: 14000,
    rentYield: 90000,
    blurb: "A magnificent villa — the reward for years of hard work, but grand to keep.",
  },
];
