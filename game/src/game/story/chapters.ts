import { has } from "../life";
import type { LifeState } from "../types";
import type { ChapterDef, PlaceId } from "./model";

const cityOrHome = (s: LifeState): PlaceId => (s.path === "shop" ? "harbour" : "city");

export const CHAPTERS: ChapterDef[] = [
  {
    index: 0,
    id: "prologue",
    number: "Prologue",
    title: "The Lighthouse",
    ages: [70, 70],
    subtitle: "Age 70 · The cliffs above Marigold Bay",
    intro: "",
    length: 150,
    speed: 3.6,
    places: [{ from: 0, place: "dusk_cliff" }],
    sky: "dusk",
    stages: [{ from: 0, age: "elder", mode: "walk" }],
    hazards: [],
    density: 0,
    keepsakes: ["", "", ""],
    music: "promise",
  },
  {
    index: 1,
    id: "first-light",
    number: "Chapter One",
    title: "First Light",
    ages: [0, 5],
    subtitle: "Age 0 to 5 · The cottage on Gull Lane",
    intro:
      "You arrive three weeks early, in the middle of a thunderstorm. Nana Pearl says you have lighthouse lungs. You have not stopped exploring since.",
    length: 370,
    speed: 2.7,
    places: [
      { from: 0, place: "home" },
      { from: 0.64, place: "garden" },
    ],
    sky: "morning",
    stages: [
      { from: 0, age: "baby", mode: "crawl" },
      { from: 0.38, age: "toddler", mode: "toddle" },
    ],
    hazards: [
      { model: "hz_milk_puddle", kind: "low", score: "health", label: "Spilled milk" },
      { model: "hz_cat", kind: "low", score: "happiness", label: "Sleeping cat" },
      { model: "hz_blocks", kind: "tall", score: "happiness", label: "Block tower" },
      { model: "hz_laundry", kind: "tall", score: "health", label: "Laundry pile" },
    ],
    density: 4.2,
    keepsakes: [
      "Your first tooth, kept in a matchbox by Dad.",
      "The harbour bell, heard through the nursery window.",
      "Nana's lullaby about the light that never goes out.",
    ],
    music: "first-light",
  },
  {
    index: 2,
    id: "the-tin",
    number: "Chapter Two",
    title: "The Tin",
    ages: [6, 11],
    subtitle: "Age 6 to 11 · Marigold Bay",
    intro:
      "Marigold Bay has one school, two bakeries and a lighthouse that has not been switched off in ninety years. It is the whole world, and you intend to run all of it.",
    length: 530,
    speed: 3.5,
    places: [
      { from: 0, place: "harbour" },
      { from: 0.86, place: "cliff" },
    ],
    sky: "noon",
    stages: [{ from: 0, age: "child", mode: "run" }],
    hazards: [
      { model: "hz_puddle", kind: "low", score: "health", label: "Puddle" },
      { model: "hz_barrel", kind: "low", score: "money", label: "Rolling barrel" },
      { model: "hz_crates", kind: "tall", score: "money", label: "Fish crates" },
    ],
    density: 4.6,
    keepsakes: [
      "Cinnamon buns from the bakery on Saturday mornings.",
      "Chalk drawings on the harbour wall that the rain washed away.",
      "The first time you swam past the end of the pier.",
    ],
    music: "harbour",
  },
  {
    index: 3,
    id: "crosscurrents",
    number: "Chapter Three",
    title: "Crosscurrents",
    ages: [12, 17],
    subtitle: "Age 12 to 17 · The coast road",
    intro:
      "You get a bicycle for your twelfth birthday and immediately understand that the coast road was built for you personally.",
    length: 720,
    speed: 4.8,
    places: [
      { from: 0, place: "coast" },
      { from: 0.62, place: "cliff" },
      { from: 0.8, place: "coast" },
    ],
    sky: "golden",
    stages: [{ from: 0, age: "teen", mode: "bike" }],
    hazards: [
      { model: "hz_cone", kind: "low", score: "health", label: "Traffic cone" },
      { model: "hz_sandcastle", kind: "low", score: "happiness", label: "Sandcastle" },
      { model: "hz_bin", kind: "tall", score: "happiness", label: "Wheelie bin" },
      { model: "hz_puddle", kind: "low", score: "health", label: "Puddle" },
    ],
    density: 4.4,
    keepsakes: [
      "Flying down Gull Hill with no hands.",
      "A mixtape from Juno, labelled DO NOT LOSE.",
      "Sunburn and chips on the harbour wall.",
    ],
    letters: true,
    drift: { happiness: -3 },
    music: "coast",
    outro: (s) => (has(s, "biscuit_nana") ? ["Biscuit comes to live with you. For a week he sleeps by the door, waiting."] : []),
  },
  {
    index: 4,
    id: "leaving-harbour",
    number: "Chapter Four",
    title: "Leaving Harbour",
    ages: [18, 24],
    subtitle: "Age 18 to 24 · The 7:14 to Brightwater",
    intro:
      "The train to Brightwater leaves at 7:14 every morning. For eighteen years you have heard it, and never once been on it.",
    length: 670,
    speed: 4.0,
    places: (s) => [
      { from: 0, place: "station" },
      { from: 0.16, place: cityOrHome(s) },
    ],
    sky: "city_morning",
    stages: [{ from: 0, age: "adult", mode: "run" }],
    hazards: [
      { model: "hz_suitcase", kind: "low", score: "money", label: "Suitcase" },
      { model: "hz_coffee_spill", kind: "low", score: "happiness", label: "Coffee spill" },
      { model: "hz_wet_sign", kind: "tall", score: "health", label: "Wet floor" },
    ],
    density: 4.8,
    keepsakes: [
      "The first morning you woke up grown, and nobody told you what to do.",
      "Your first pay packet, spent entirely on a good coat.",
      "Midnight chips with friends you'd only just met.",
    ],
    letters: true,
    drift: { happiness: -2 },
    music: "city",
    outro: (s) =>
      has(s, "biscuit")
        ? ["Biscuit dies in October, old and loved, with his head on Dad's slipper."]
        : [],
  },
  {
    index: 5,
    id: "the-climb",
    number: "Chapter Five",
    title: "The Climb",
    ages: [25, 39],
    subtitle: (s) => (s.path === "shop" ? "Age 25 to 39 · The busy years in the bay" : "Age 25 to 39 · Brightwater downtown"),
    intro:
      "Your thirties arrive like a train that doesn't stop at your station. There is always another meeting, another bill, another thing that matters.",
    length: 750,
    speed: 4.5,
    places: (s) => [{ from: 0, place: cityOrHome(s) }],
    sky: "city_noon",
    stages: [{ from: 0, age: "adult", mode: "run" }],
    hazards: [
      { model: "hz_paper_stack", kind: "tall", score: "happiness", label: "Deadline pile" },
      { model: "hz_coffee_spill", kind: "low", score: "health", label: "Coffee spill" },
      { model: "hz_scooter", kind: "tall", score: "money", label: "Parked scooter" },
      { model: "hz_suitcase", kind: "low", score: "money", label: "Suitcase" },
    ],
    density: 5.2,
    keepsakes: [
      "The first key to a home that was actually yours.",
      "Laughing so hard in a meeting you had to leave the room.",
      "A Sunday so empty and perfect you did nothing at all.",
    ],
    drift: { health: -2, happiness: -4 },
    music: "climb",
  },
  {
    index: 6,
    id: "the-storm",
    number: "Chapter Six",
    title: "The Storm",
    ages: [40, 54],
    subtitle: "Age 40 to 54 · Weather",
    intro: "Some years are just weather. You get through them the way you get through rain: head down, with someone, if you're lucky.",
    length: 700,
    speed: 4.0,
    places: (s) =>
      s.path === "shop"
        ? [{ from: 0, place: "storm_harbour" }]
        : [
            { from: 0, place: "storm_city" },
            { from: 0.5, place: "storm_harbour" },
          ],
    sky: "storm",
    stages: [{ from: 0, age: "adult", mode: "run" }],
    hazards: [
      { model: "hz_branch", kind: "low", score: "health", label: "Fallen branch" },
      { model: "hz_storm_puddle", kind: "low", score: "happiness", label: "Flood puddle" },
      { model: "hz_bin_tipped", kind: "tall", score: "money", label: "Tipped bin" },
    ],
    density: 4.6,
    keepsakes: [
      "Holding an umbrella over someone who needed it more.",
      "The first morning after the storm, when the whole town smelled of salt.",
      "A hospital hot chocolate that tasted like hope.",
    ],
    wind: true,
    drift: { health: -4, happiness: -5 },
    music: "storm",
    outro: (s) =>
      has(s, "juno_saved_light")
        ? [
            "Juno reads about the council vote in the paper. Three weeks later the lighthouse has a campaign, a website and a very determined woman with a megaphone.",
            "It's saved. She sends you a photo of the scaffolding with the caption: 'Seventy. Promise.'",
          ]
        : [],
  },
  {
    index: 7,
    id: "golden-hour",
    number: "Chapter Seven",
    title: "Golden Hour",
    ages: [55, 69],
    subtitle: "Age 55 to 69 · The lantern festival",
    intro:
      "Every summer Marigold Bay hangs a thousand lanterns along the harbour. This year you promise yourself you'll see every one of them.",
    length: 520,
    speed: 3.0,
    places: [{ from: 0, place: "festival" }],
    sky: "sunset",
    stages: [
      { from: 0, age: "adult", mode: "walk" },
      { from: 0.5, age: "elder", mode: "walk" },
    ],
    hazards: [
      { model: "hz_picnic", kind: "low", score: "health", label: "Picnic basket" },
      { model: "hz_sandcastle", kind: "low", score: "happiness", label: "Sandcastle" },
      { model: "hz_deckchair", kind: "tall", score: "health", label: "Deckchair" },
    ],
    density: 3.2,
    keepsakes: [
      "A thousand lanterns reflected in the harbour.",
      "Teaching someone to whistle with a blade of grass.",
      "Dancing badly at the festival and not caring at all.",
    ],
    drift: { health: -5 },
    music: "golden",
    outro: (s) => [
      "Mom and Dad go in the same year, eight months apart. Dad said he'd keep her waiting. He didn't.",
      has(s, "moved_home") || has(s, "parents_with_us") || s.path === "shop"
        ? "You were there for both. It's the thing you're proudest of, and the thing you talk about least."
        : "Both times you got the call on the 7:14, and both times you made it in time to say the important thing.",
    ],
  },
  {
    index: 8,
    id: "the-promise",
    number: "The End",
    title: "The Promise",
    ages: [70, 70],
    subtitle: "Age 70 · The lighthouse",
    intro: "Fifty-nine years later, you climb the cliff path again.",
    length: 300,
    speed: 3.8,
    places: [{ from: 0, place: "dusk_cliff" }],
    sky: "dusk",
    stages: [{ from: 0, age: "elder", mode: "walk" }],
    hazards: [],
    density: 0,
    keepsakes: ["", "", ""],
    music: "promise",
  },
];

export const FINALE = CHAPTERS.length - 1;
export const PLAYABLE = CHAPTERS.filter((c) => c.hazards.length > 0).map((c) => c.index);

/** Age shown on the HUD at a given course progress. */
export function ageAt(chapter: ChapterDef, progress: number): number {
  const [a, b] = chapter.ages;
  return Math.min(b, Math.floor(a + (b - a + 0.999) * Math.max(0, Math.min(1, progress))));
}

export function stageAt(chapter: ChapterDef, progress: number) {
  let stage = chapter.stages[0];
  for (const s of chapter.stages) if (progress >= s.from) stage = s;
  return stage;
}
