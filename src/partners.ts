import type { Gender, Partner } from "./types";

// ---------------------------------------------------------------------------
// Marriage candidates. The Marriage & Baby stage shows these and asks the
// player to choose one. The chosen partner's modifiers are applied passively at
// every stage transition afterwards — so who you marry shapes the rest of your
// life. There are eight women and eight men; each gender uses all eight
// heritage/appearance combinations from the storybook character system.
//
// Partners are people, not prizes for hitting a body, IQ, or wealth threshold.
// Every candidate is available; the meaningful choice is the lifestyle each
// relationship brings to the chapters that follow.
// ---------------------------------------------------------------------------

export const PARTNERS: Partner[] = [
  {
    id: "maya",
    name: "Maya",
    title: "the Doctor",
    gender: "female",
    heritage: "asian",
    appearance: "classic",
    emoji: "👩‍⚕️",
    blurb: "Caring and brilliant. A life together supports health, with busy days along the way.",
    modifiers: { health: 3, happiness: 1 },
    moneyMod: 6000,
    storyTag: "mate_doctor",
  },
  {
    id: "leo",
    name: "Leo",
    title: "the Entrepreneur",
    gender: "male",
    heritage: "western",
    appearance: "classic",
    emoji: "👨‍💼",
    blurb: "Ambitious and driven. Builds wealth, but works long hours.",
    modifiers: { fun: -1 },
    moneyMod: 9000,
    storyTag: "mate_entrepreneur",
  },
  {
    id: "ravi",
    name: "Ravi",
    title: "the Engineer",
    gender: "male",
    heritage: "asian",
    appearance: "classic",
    emoji: "👨‍🔧",
    blurb: "Steady and clever. A dependable, comfortable home.",
    modifiers: { smarts: 2 },
    moneyMod: 5000,
    storyTag: "mate_engineer",
  },
  {
    id: "sam",
    name: "Sam",
    title: "the Teacher",
    gender: "male",
    heritage: "black",
    appearance: "classic",
    emoji: "👨‍🏫",
    blurb: "Patient and wise. Makes you and the kids a little smarter.",
    modifiers: { smarts: 3, happiness: 1 },
    storyTag: "mate_teacher",
  },
  {
    id: "nina",
    name: "Nina",
    title: "the Athlete",
    gender: "female",
    heritage: "black",
    appearance: "classic",
    emoji: "🏃‍♀️",
    blurb: "Energetic and active. Life together brings movement, play and busy weekends.",
    modifiers: { health: 3, fun: 2 },
    storyTag: "mate_athlete",
  },
  {
    id: "jude",
    name: "Jude",
    title: "the Chef",
    gender: "male",
    heritage: "middleEastern",
    appearance: "classic",
    emoji: "👨‍🍳",
    blurb: "Generous and cosy. Every meal is healthy and delicious.",
    modifiers: { health: 2, happiness: 2 },
    moneyMod: 500,
    storyTag: "mate_chef",
  },
  {
    id: "elena",
    name: "Elena",
    title: "the Traveller",
    gender: "female",
    heritage: "western",
    appearance: "classic",
    emoji: "🧳",
    blurb: "Adventurous and joyful. You'll see the world together — if you can fund it.",
    modifiers: { fun: 3, happiness: 1 },
    moneyMod: -2000,
    storyTag: "mate_traveller",
  },
  {
    id: "aria",
    name: "Aria",
    title: "the Artist",
    gender: "female",
    heritage: "middleEastern",
    appearance: "classic",
    emoji: "👩‍🎨",
    blurb: "Free-spirited and warm. Life together favors creativity over financial comfort.",
    modifiers: { fun: 3, happiness: 2 },
    moneyMod: -1500,
    storyTag: "mate_artist",
  },
  {
    id: "hana",
    name: "Hana",
    title: "the Software Engineer",
    gender: "female",
    heritage: "asian",
    appearance: "alternate",
    emoji: "👩‍💻",
    blurb: "Curious and inventive. She brings bright ideas, steady support and playful problem-solving.",
    modifiers: { smarts: 3, fun: 1 },
    moneyMod: 6500,
    storyTag: "mate_software_engineer",
  },
  {
    id: "kenji",
    name: "Kenji",
    title: "the Nurse",
    gender: "male",
    heritage: "asian",
    appearance: "alternate",
    emoji: "👨‍⚕️",
    blurb: "Calm and compassionate. He knows when to care, listen and help the household recover.",
    modifiers: { health: 3, happiness: 1 },
    moneyMod: 4500,
    storyTag: "mate_nurse",
  },
  {
    id: "zuri",
    name: "Zuri",
    title: "the Dancer",
    gender: "female",
    heritage: "black",
    appearance: "alternate",
    emoji: "💃",
    blurb: "Expressive and joyful. Music, movement and laughter keep everyday life lively.",
    modifiers: { fun: 3, health: 2 },
    moneyMod: 500,
    storyTag: "mate_dancer",
  },
  {
    id: "malik",
    name: "Malik",
    title: "the Athlete",
    gender: "male",
    heritage: "black",
    appearance: "alternate",
    emoji: "🏃‍♂️",
    blurb: "Upbeat and disciplined. He turns healthy habits into adventures you can share.",
    modifiers: { health: 3, fun: 2 },
    storyTag: "mate_athlete",
  },
  {
    id: "sofia",
    name: "Sofia",
    title: "the Chef",
    gender: "female",
    heritage: "western",
    appearance: "alternate",
    emoji: "👩‍🍳",
    blurb: "Creative and generous. Her table is a warm place for stories, friends and family.",
    modifiers: { health: 2, happiness: 2 },
    moneyMod: 500,
    storyTag: "mate_chef",
  },
  {
    id: "mateo",
    name: "Mateo",
    title: "the Dancer",
    gender: "male",
    heritage: "western",
    appearance: "alternate",
    emoji: "🕺",
    blurb: "Confident and warm. He brings rhythm, courage and spontaneous fun to the years ahead.",
    modifiers: { fun: 3, happiness: 2 },
    moneyMod: 500,
    storyTag: "mate_dancer_male",
  },
  {
    id: "noor",
    name: "Noor",
    title: "the Lawyer",
    gender: "female",
    heritage: "middleEastern",
    appearance: "alternate",
    emoji: "👩‍⚖️",
    blurb: "Thoughtful and persuasive. She brings clear judgment, loyalty and a strong sense of fairness.",
    modifiers: { smarts: 2, happiness: 1 },
    moneyMod: 7000,
    storyTag: "mate_lawyer",
  },
  {
    id: "omar",
    name: "Omar",
    title: "the Community Doctor",
    gender: "male",
    heritage: "middleEastern",
    appearance: "alternate",
    emoji: "👨‍⚕️",
    blurb: "Kind and dependable. He balances a caring career with quiet, restorative time at home.",
    modifiers: { health: 3, happiness: 1 },
    moneyMod: 6000,
    storyTag: "mate_doctor_male",
  },
];

/** The game's authored marriage rule: a man meets women; a woman meets men. */
export function spouseGenderForPlayer(playerGender: Gender): Gender {
  return playerGender === "male" ? "female" : "male";
}

/** Stable, source-ordered candidates for the wedding interlude. */
export function marriageCandidatesForPlayer(
  playerGender: Gender
): Partner[] {
  const spouseGender = spouseGenderForPlayer(playerGender);
  return PARTNERS.filter(
    (partner) => partner.gender === spouseGender
  );
}

/** Resolve only a canonical candidate that this player is allowed to marry. */
export function marriageCandidateById(
  playerGender: Gender,
  partnerId: string
): Partner | null {
  return (
    marriageCandidatesForPlayer(playerGender).find(
      (partner) => partner.id === partnerId
    ) ?? null
  );
}
