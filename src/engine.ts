import type {
  CharacterAppearanceId,
  Gender,
  HeritageStyle,
  HistoryEntry,
  HouseTier,
  JobUniform,
  LifeOption,
  Occupation,
  OptionCategory,
  Partner,
  PersonKind,
  PetKind,
  Stage,
  Stats,
  StatKey,
  UpperSceneKind,
  VehicleTier,
} from "./types";
import {
  START_STATS,
  START_MONEY,
  START_WEIGHT,
  START_MUSCLE,
  START_NUTRITION,
  START_MENTAL,
  STAT_KEYS,
  STAT_META,
  applyEffects,
  clampStat,
  clampIq,
  composeHealth,
  crossEffects,
  ageMaturity,
  dampIqGain,
  activityDiscount,
  lifeExpectancy,
  moneyHappinessBias,
  formatMoney,
  weightColor,
  weightHealthDrain,
  weightStatus,
} from "./stats";
import { STAGES } from "./stages";
import {
  PARTNERS,
  marriageCandidateById,
  marriageCandidatesForPlayer,
  spouseGenderForPlayer,
} from "./partners";
import { OCCUPATIONS, TIER_LABELS } from "./occupations";
import { HOUSE_TIERS } from "./houses";
import { VEHICLES } from "./vehicles";
import { COMMUTES, type CommuteTier } from "./commutes";
import { EVENTS, type RandomEvent } from "./events";
import {
  friendAgeForStage,
  friendGenderForOrdinal,
  friendVisualKey,
  nextFriendVisualIdentity,
  normalizeFriendVisualIdentities,
  isSameStagePeerKind,
  peerVisualIdentity,
} from "./friends";
import {
  PERSON_REACTION_SECONDS,
  interactionExpressionsAt,
} from "./character-interactions";
import {
  movementIsActive,
  stableFacingForVector,
} from "./character-motion";
import {
  type Biography,
  type BioChapter,
  listBios,
  saveBio,
  deleteBio,
  getBio,
  bioMomentCount,
  MOMENT_PRESETS,
  makeMoment,
  newBiography,
} from "./biography";
import { avatarLook, drawAvatar, drawCharacterNamePlate, drawEventItem, drawInteractionExpression, drawPerson, drawPet, drawRoom, drawStation, personLook, type AvatarFacing } from "./sprites";
import {
  storybookVisualHeight,
  warmStorybookCharacterAtlases,
  warmStorybookPortraits,
  warmStorybookSetupAtlases,
} from "./storybook-characters";
import { warmStorybookPetAtlases } from "./storybook-pets";
import {
  drawJobCharacter,
  JOB_UNIFORMS,
  jobArtHeritage,
  jobCharacterFrame,
  jobUniformHasSummer,
  warmJobCharacterAtlases,
} from "./job-characters";
import {
  drawSummerCharacter,
  warmSummerCharacterAtlases,
} from "./summer-characters";
import {
  professionLifeOptions,
  sameProfessionVisual,
  type ProfessionVisualIdentity,
} from "./profession-npcs";
import {
  EMPTY_PARENT_CAREERS,
  normalizeParentCareerIds,
  parentOccupation,
  parentProfessionSpec,
  type ParentCareerIds,
} from "./parent-careers";
import { playerCareerUniform } from "./career-uniform";
import { playerBodyVariantAtAge } from "./player-body-variant";
import {
  LIFE_SEASONS,
  SEASONAL_LIFE_STAGE_IDS,
  lifeSeasonAt,
  type LifeSeason,
} from "./life-season";
import {
  normalizeStartingIq,
  startingIqPlan,
} from "./setup-iq";
import { createUI, type UIRefs } from "./ui";
import { generateStory, type CauseOfEnd, type LifeStory } from "./story";
import { linePool } from "./messages";
import { ECONOMIC_BACKGROUNDS, LIFE_SPEEDS, backgroundMoney, chapterAgeStep, partnerLifeAge } from "./life-rules";

// Room dimensions are NOT fixed: they switch between a tall portrait shape and a
// wide-short landscape shape (setRoomDims) so the playfield fills the screen in
// either orientation instead of a narrow centre strip. Everything reads these
// live, so re-laying out is just setRoomDims() + a canvas resize + rebuild.
let W = 640;
let H = 1000;
let FLOOR_Y = 72; // sky-only non-playable band; ground starts right below it
let DOOR_X = W - 74;
const STAGE_GATE_R = 31;
const GATE_HALF_H = STAGE_GATE_R + 7;
const UTILITY_GATE_X = 58;
const FAMILY_TREE_GATE_R = 23;
const ASSETS_GATE_R = 21;
const TRAINING_GATE_R = 21;
const UTILITY_GATE_GAP = 54;
const SPEED = 205; // base move speed (scaled up by your IQ — smart = nimble)
let PY_MIN = 142; // feet stay on ground while the sky remains scenic only
let PY_MAX = 982;
let SOCIAL_Y_MIN = PY_MIN + 48;
let FAMILY_Y_MAX = PY_MAX - 24;

// Supersample to the display's pixel density — 1 on a standard screen, 2 on
// retina/mobile. SS=2 everywhere drew 4× the pixels a 1× display can even show,
// which is the main cause of the slow/janky canvas. (Mirrors ui.ts.)
const SS = Math.min(2, Math.max(1, Math.ceil((typeof window !== "undefined" && window.devicePixelRatio) || 1)));
/** Depth comparator for the render draw-list — reused so it isn't reallocated each frame. */
const byDepth = (a: { y: number }, b: { y: number }): number => a.y - b.y;
const ROOM_PORTRAIT = { W: 640, H: 1000, FLOOR_Y: 72, PY_MIN: 142, PY_MAX: 982 };
const ROOM_LANDSCAPE = { W: 1180, H: 560, FLOOR_Y: 52, PY_MIN: 116, PY_MAX: 544 };
function setRoomDims(r: { W: number; H: number; FLOOR_Y: number; PY_MIN: number; PY_MAX: number }): void {
  W = r.W;
  H = r.H;
  FLOOR_Y = r.FLOOR_Y;
  PY_MIN = r.PY_MIN;
  PY_MAX = r.PY_MAX;
  DOOR_X = W - 74;
  SOCIAL_Y_MIN = PY_MIN + 48;
  FAMILY_Y_MAX = PY_MAX - 24;
}
const ZONE_GATE_GAP = 48;
const MIN_ZONE_HEIGHT = 118;
// --- moving-items mechanic ---
const GOOD_SPEED = 24; // common good items drift AWAY; touch them to collect
const BAD_SPEED = 34; // bad items drift TOWARD you (auto-applied on contact)
const BAD_EVENT_ALERT_R = 185; // bad-luck hazards wake up only when you get close
const ITEM_R = 26; // contact / collect radius
const BLOCK_R = 30; // an NPC standing in the path blocks a bad item
const SATIATE_TIME = 9; // seconds a bad item stays frozen/faded after you do its good counterpart
const BABY_FAMILY_SIT_R = 92; // newborn family sits only when the baby crawls right up to them
const PET_FOLLOW_SPEED = 124;
const PET_HAPPY_R = 34;
const PET_HAPPY_COOLDOWN = 6;
const CAT_PURR_HAPPY = 0.2;
const CAT_PURR_INTERVAL = 5;
const PET_FOLLOW_OFFSETS: Record<
  AvatarFacing,
  readonly [number, number]
> = {
  left: [30, 8],
  right: [-30, 8],
  front: [0, -30],
  back: [0, 30],
};
const BAD_SOCIAL_TAGS = ["smoker_friend", "gangster_friend", "playboy_friend"];
const INVENTORY_MAX_SLOTS = 8;
const INVENTORY_MAX_COUNT = 9;
const FOOD_USE_COOLDOWN = 5;
const FOOD_FRESH = 20; // enough time to understand the tray and choose eat/give
const LIFE_SEASON_DISPLAY: Record<
  LifeSeason,
  { emoji: string; label: string }
> = {
  spring: { emoji: "🌱", label: "Spring" },
  summer: { emoji: "☀️", label: "Summer" },
  autumn: { emoji: "🍂", label: "Autumn" },
  winter: { emoji: "❄️", label: "Winter" },
};
const ELEMENTARY_INDEX = STAGES.findIndex((s) => s.id === "elementary");
const MIDDLE_INDEX = STAGES.findIndex((s) => s.id === "middle");
const CAREER_INDEX = STAGES.findIndex((s) => s.id === "career");
const ELEMENTARY_ASSETS_MONEY = 200000;
const BAD_FIT_TAGS = ["sedentary", "gaming", "screen", "toy_phone", "cigarette"];
const BAD_FOCUS_TAGS = ["wine", "whisky", "beer"];
const GOOD_PEER_TAGS = ["study", "sports", "exercise", "friends"];
const FAMILY_MONEY_MIN = 10000;
const FAMILY_MONEY_MAX = 2000000;
const FAMILY_PARENTS_UNTIL = 36; // Mum/Dad/sibling stay in the family area until you reach middle age (the midlife chapter)
const PARENT_SUPPORT_END_AGE = 18;
const PARENT_SUPPORT_MIN = 800;
const PARENT_SUPPORT_MAX = 160000;
const PARENT_INCOME_SHIFT_MIN = 0.1;
const PARENT_INCOME_SHIFT_MAX = 0.5;
const HOUSE_APPRECIATION_MIN = 0.03;
const HOUSE_APPRECIATION_MAX = 0.05;
const VEHICLE_DEPRECIATION = 0.12;
const LIFE_SPEED_DEFAULT_INDEX = LIFE_SPEEDS.indexOf(1);
const LIFE_SPEED_MIN_INDEX = 0;
const LIFE_SPEED_MAX_INDEX = LIFE_SPEEDS.length - 1;
const HERITAGE_OPTIONS: { id: HeritageStyle; label: string }[] = [
  { id: "western", label: "Western" },
  { id: "asian", label: "Asian" },
  { id: "middleEastern", label: "Middle Eastern" },
  { id: "black", label: "Black / African diaspora" },
];
const TRAINING_LINKS = {
  iq: "https://www.youtube.com/results?search_query=how+to+be+smarter+increase+iq",
  money: "https://www.youtube.com/results?search_query=financial+education+how+to+earn+more+money",
  family: "https://www.youtube.com/results?search_query=how+to+treat+family+members+well+mental+health",
} as const;
type TrainingKind = keyof typeof TRAINING_LINKS;
type TrainingCategory = "iq" | "eq" | "strategy";
type TrainingLevel = "starter" | "practice" | "advanced";

interface TrainingQuestion {
  q: string;
  answers: readonly string[];
  correct: number;
  win: string;
}

type TrainingQuestionBank = Record<TrainingLevel, TrainingQuestion[]>;

const TRAINING_DATABASE_URL = "./data/training-questions.json";
const SAVE_KEY = "choice-of-life-v1-active-life";
const FUNNEL_KEY = "choice-of-life-v1-local-funnel";
const TRAINING_LEVELS: { id: TrainingLevel; label: string }[] = [
  { id: "starter", label: "Lv 1" },
  { id: "practice", label: "Lv 2" },
  { id: "advanced", label: "Lv 3" },
];
const TRAINING_IQ_RANGES: Record<TrainingLevel, readonly [number, number]> = {
  starter: [0, 14],
  practice: [14, 28],
  advanced: [28, 40],
};
const TRAINING_CATEGORY_META: Record<TrainingCategory, { icon: string; title: string; summary: string }> = {
  iq: {
    icon: "🧩",
    title: "Tricky IQ Game",
    summary: "Logic, pattern, and careful-reading traps.",
  },
  eq: {
    icon: "💛",
    title: "EQ Questions",
    summary: "Feelings, empathy, conflict, and family care.",
  },
  strategy: {
    icon: "📈",
    title: "Strategy Questions",
    summary: "Money, career, risk, and long-term planning.",
  },
};
const TRAINING_CATEGORIES: TrainingCategory[] = ["iq", "eq", "strategy"];
const TRAINING_PUZZLES = [
  {
    q: "A clock shows 3:15. What is the angle between the hour and minute hands?",
    answers: ["7.5 degrees", "15 degrees", "22.5 degrees"],
    correct: 0,
    win: "Tiny geometry win. +2 IQ.",
  },
  {
    q: "Which number comes next: 2, 6, 12, 20, 30, ?",
    answers: ["36", "40", "42"],
    correct: 2,
    win: "You spotted the growing gap pattern. +2 IQ.",
  },
  {
    q: "All bloops are razzies. Some razzies are lups. Are all bloops definitely lups?",
    answers: ["Yes", "No", "Only at night"],
    correct: 1,
    win: "Careful logic beats fast guessing. +2 IQ.",
  },
  {
    q: "Which number comes next: 3, 6, 11, 18, 27, ?",
    answers: ["36", "38", "41"],
    correct: 1,
    win: "You followed the odd-number gaps. +2 IQ.",
  },
  {
    q: "A book and a pen cost $1.10 together. The book costs $1.00 more than the pen. How much is the pen?",
    answers: ["$0.05", "$0.10", "$0.15"],
    correct: 0,
    win: "You slowed down and avoided the quick trap. +2 IQ.",
  },
  {
    q: "If 6 robots make 6 toys in 6 minutes, how many minutes do 60 robots need to make 60 toys?",
    answers: ["6 minutes", "10 minutes", "60 minutes"],
    correct: 0,
    win: "Rate reasoning unlocked. +2 IQ.",
  },
  {
    q: "Which pair continues the pattern: 1A, 2B, 4D, 8H, ?",
    answers: ["10J", "12L", "16P"],
    correct: 2,
    win: "You tracked both number and letter doubling. +2 IQ.",
  },
  {
    q: "Maya is older than Leo. Leo is older than Nina. Who is youngest?",
    answers: ["Maya", "Leo", "Nina"],
    correct: 2,
    win: "Clean ordering, clean answer. +2 IQ.",
  },
  {
    q: "If today is Wednesday, what day is 10 days from now?",
    answers: ["Friday", "Saturday", "Sunday"],
    correct: 1,
    win: "Calendar math handled. +2 IQ.",
  },
  {
    q: "Which word does not belong: apple, pear, carrot, peach?",
    answers: ["pear", "carrot", "peach"],
    correct: 1,
    win: "Category spotting sharpened. +2 IQ.",
  },
  {
    q: "Wing is to bird as fin is to what?",
    answers: ["fish", "boat", "cloud"],
    correct: 0,
    win: "Analogy solved. +2 IQ.",
  },
  {
    q: "All red boxes are heavy. This box is heavy. Can we prove it is red?",
    answers: ["Yes", "No", "Only if it is square"],
    correct: 1,
    win: "You avoided reversing the logic. +2 IQ.",
  },
  {
    q: "Which number comes next: 2, 3, 5, 9, 17, ?",
    answers: ["31", "33", "35"],
    correct: 1,
    win: "You spotted the doubling jumps. +2 IQ.",
  },
  {
    q: "In a race, you pass the person in second place. What place are you in now?",
    answers: ["First", "Second", "Third"],
    correct: 1,
    win: "Nice trap dodge. +2 IQ.",
  },
  {
    q: "How many months have at least 28 days?",
    answers: ["1", "11", "12"],
    correct: 2,
    win: "You read the question carefully. +2 IQ.",
  },
  {
    q: "A die has opposite faces that sum to 7. What is opposite 2?",
    answers: ["3", "4", "5"],
    correct: 2,
    win: "Spatial rule remembered. +2 IQ.",
  },
  {
    q: "Which number is missing: 4, 9, 16, 25, ?",
    answers: ["30", "36", "42"],
    correct: 1,
    win: "Square-number pattern solved. +2 IQ.",
  },
  {
    q: "If A is taller than B, and B is taller than C, which must be true?",
    answers: ["A is taller than C", "C is taller than A", "B is shortest"],
    correct: 0,
    win: "Transitive logic clicked. +2 IQ.",
  },
  {
    q: "A code shifts each letter forward by 1. What does CAT become?",
    answers: ["DBU", "CBU", "DBT"],
    correct: 0,
    win: "Code pattern cracked. +2 IQ.",
  },
  {
    q: "Which comes next: 81, 27, 9, ?",
    answers: ["6", "3", "1"],
    correct: 1,
    win: "Division pattern found. +2 IQ.",
  },
  {
    q: "One kilogram of feathers and one kilogram of rice: which is heavier?",
    answers: ["feathers", "rice", "same weight"],
    correct: 2,
    win: "Measurement trap avoided. +2 IQ.",
  },
  {
    q: "A square has four equal sides. If its side is 5, what is its perimeter?",
    answers: ["10", "20", "25"],
    correct: 1,
    win: "Geometry basics are strong. +2 IQ.",
  },
  {
    q: "Which word completes the pattern: hot is to cold as up is to ?",
    answers: ["high", "down", "sky"],
    correct: 1,
    win: "Opposite-pair reasoning solved. +2 IQ.",
  },
  {
    q: "A train leaves at 2:00 and arrives at 3:45. How long was the trip?",
    answers: ["1 hour 15 minutes", "1 hour 45 minutes", "2 hours 15 minutes"],
    correct: 1,
    win: "Time reasoning improved. +2 IQ.",
  },
  {
    q: "Which number is the odd one out: 14, 21, 28, 35, 43?",
    answers: ["21", "35", "43"],
    correct: 2,
    win: "Multiples pattern spotted. +2 IQ.",
  },
  {
    q: "A drawer has red, blue, and green marbles. How many must you grab to guarantee two are the same color?",
    answers: ["3", "4", "5"],
    correct: 1,
    win: "Pigeonhole thinking unlocked. +2 IQ.",
  },
  {
    q: "You enter a dark room with one match, a candle, and a lamp. What should you light first?",
    answers: ["the candle", "the lamp", "the match"],
    correct: 2,
    win: "Careful first-step logic. +2 IQ.",
  },
  {
    q: "What letter comes next: O, T, T, F, F, S, S, ?",
    answers: ["E", "N", "T"],
    correct: 0,
    win: "You saw the number initials. +2 IQ.",
  },
  {
    q: "Two mothers and two daughters share three snacks equally, with one snack each. How is that possible?",
    answers: ["one is a grandmother", "one snack is split", "there are four people"],
    correct: 0,
    win: "Family-relationship trick solved. +2 IQ.",
  },
  {
    q: "You face north. Turn right twice, then left once. Which way are you facing?",
    answers: ["east", "south", "west"],
    correct: 0,
    win: "Mental rotation worked. +2 IQ.",
  },
  {
    q: "A clock is set right at noon but loses 10 minutes every hour. What time will it show at 3:00 real time?",
    answers: ["2:30", "2:40", "3:10"],
    correct: 0,
    win: "Time-drift reasoning solved. +2 IQ.",
  },
  {
    q: "All Zips are Zaps. No Zaps are Zops. Can any Zip be a Zop?",
    answers: ["yes", "no", "only some"],
    correct: 1,
    win: "Set logic is clean. +2 IQ.",
  },
  {
    q: "How many letters are in the phrase 'the alphabet'?",
    answers: ["8", "11", "26"],
    correct: 1,
    win: "You read the words, not the idea. +2 IQ.",
  },
  {
    q: "What pair comes next: AZ, BY, CX, ?",
    answers: ["DW", "DU", "EV"],
    correct: 0,
    win: "Opposite alphabet pattern found. +2 IQ.",
  },
  {
    q: "Two fathers and two sons sit together, but there are only three people. How?",
    answers: ["grandfather, father, son", "one is imaginary", "two are twins"],
    correct: 0,
    win: "Overlapping roles spotted. +2 IQ.",
  },
  {
    q: "A loud clap scares five birds off a fence. Two were closest to the sound. How many birds stay?",
    answers: ["3", "5", "0"],
    correct: 2,
    win: "Real-world consequence noticed. +2 IQ.",
  },
  {
    q: "Which word becomes longer when you add two letters to it?",
    answers: ["long", "short", "wide"],
    correct: 1,
    win: "Wordplay trap solved. +2 IQ.",
  },
  {
    q: "A boat is full of people, but there is not a single person on it. Why?",
    answers: ["everyone is married", "the boat is empty", "it is underwater"],
    correct: 0,
    win: "The wording twist landed. +2 IQ.",
  },
  {
    q: "Which number's English spelling has letters in alphabetical order?",
    answers: ["forty", "sixty", "ninety"],
    correct: 0,
    win: "Letter-order pattern solved. +2 IQ.",
  },
  {
    q: "A word is hidden here: SILENT can be rearranged into what?",
    answers: ["listen", "inlets", "both"],
    correct: 2,
    win: "Anagram flexibility. +2 IQ.",
  },
] as const;
const TRAINING_BANKS: Record<Exclude<TrainingCategory, "iq">, Record<TrainingLevel, TrainingQuestion[]>> = {
  eq: {
    starter: [
      {
        q: "A friend gets quiet after your joke. What is the best first move?",
        answers: ["tease them more", "ask privately if they are okay", "ignore it"],
        correct: 1,
        win: "Empathy noticed the signal. +EQ.",
      },
      {
        q: "You receive an angry message from a sibling. What should you do before replying?",
        answers: ["pause and breathe", "send a bigger message", "block them forever"],
        correct: 0,
        win: "Self-control kept the bridge open. +EQ.",
      },
      {
        q: "A classmate wins an award you wanted. Which response shows strong EQ?",
        answers: ["congratulate and learn", "say it was luck", "stop talking to them"],
        correct: 0,
        win: "You turned jealousy into growth. +EQ.",
      },
      {
        q: "A parent says they are disappointed. What helps most?",
        answers: ["listen and ask how to improve", "walk away mid-sentence", "blame someone else"],
        correct: 0,
        win: "Repair starts with listening. +EQ.",
      },
      {
        q: "You feel nervous before a test. Which choice is healthiest?",
        answers: ["name the feeling and plan", "pretend nothing exists", "panic-scroll"],
        correct: 0,
        win: "Naming emotions makes them easier to guide. +EQ.",
      },
      {
        q: "A friend shares a private worry. What should you do?",
        answers: ["share it for gossip", "keep it private unless safety is at risk", "laugh it off"],
        correct: 1,
        win: "Trust is protected. +EQ.",
      },
      {
        q: "A new student sits alone at lunch. What is a kind move?",
        answers: ["invite them with no pressure", "stare at them", "make a joke about it"],
        correct: 0,
        win: "Social awareness found a gentle opening. +EQ.",
      },
      {
        q: "You made a mistake that hurt someone. What apology works best?",
        answers: ["I am sorry for what I did", "sorry you feel that way", "everyone makes mistakes"],
        correct: 0,
        win: "A clear apology repairs faster. +EQ.",
      },
      {
        q: "An argument is getting louder. What lowers the heat?",
        answers: ["speak slower and quieter", "interrupt faster", "win by volume"],
        correct: 0,
        win: "Calm tone changed the room. +EQ.",
      },
      {
        q: "Someone celebrates a tradition you do not know. What shows respect?",
        answers: ["ask kindly if they want to share", "call it strange", "copy it as a joke"],
        correct: 0,
        win: "Curiosity stayed respectful. +EQ.",
      },
    ],
    practice: [
      {
        q: "A friend cancels plans twice. What is the most emotionally smart response?",
        answers: ["accuse them", "check in and ask what is happening", "ghost them"],
        correct: 1,
        win: "You checked the story before judging. +EQ.",
      },
      {
        q: "Someone says, 'You never listen.' What should you try first?",
        answers: ["repeat their main point", "explain why they are wrong", "change the subject"],
        correct: 0,
        win: "Reflection showed you heard them. +EQ.",
      },
      {
        q: "A bad friend pressures you to do something risky. What is strongest?",
        answers: ["set a boundary and leave", "prove you are brave", "say yes to fit in"],
        correct: 0,
        win: "Boundaries protected your future. +EQ.",
      },
      {
        q: "Two relatives fight about shared money. What helps the conversation?",
        answers: ["write facts and needs first", "pick a side instantly", "raise old grudges"],
        correct: 0,
        win: "You separated facts from heat. +EQ.",
      },
      {
        q: "You feel jealous when a sibling is praised. What is the best inner move?",
        answers: ["notice jealousy and choose a goal", "attack the sibling", "pretend you feel nothing"],
        correct: 0,
        win: "You converted emotion into direction. +EQ.",
      },
      {
        q: "A teammate is late twice. What is a fair first step?",
        answers: ["talk privately about impact", "mock them in public", "do nothing forever"],
        correct: 0,
        win: "Private repair beats public shame. +EQ.",
      },
      {
        q: "A customer or teacher is angry. What response usually de-escalates?",
        answers: ["acknowledge feeling, then solve", "match their anger", "say calm down"],
        correct: 0,
        win: "You handled emotion before solution. +EQ.",
      },
      {
        q: "A family member is grieving. What helps most early on?",
        answers: ["listen and stay present", "force them to cheer up", "rank whose pain is worse"],
        correct: 0,
        win: "Presence can be powerful. +EQ.",
      },
      {
        q: "An online comment insults you. What protects your mental health?",
        answers: ["pause before responding", "fight all night", "post their private info"],
        correct: 0,
        win: "Impulse control saved energy. +EQ.",
      },
      {
        q: "In a group choice, one quiet person is affected most. What should you do?",
        answers: ["invite their view", "decide without them", "speak over them"],
        correct: 0,
        win: "Inclusive decisions are stronger. +EQ.",
      },
    ],
    advanced: [
      {
        q: "You are leading while stressed. What builds trust?",
        answers: ["name the pressure and clarify next steps", "hide everything", "snap at people"],
        correct: 0,
        win: "Honest leadership steadied the group. +EQ.",
      },
      {
        q: "A friend asks for a loan you cannot afford. What is healthiest?",
        answers: ["empathize and set a clear no", "lend rent money", "shame them"],
        correct: 0,
        win: "Kind boundaries are still kind. +EQ.",
      },
      {
        q: "You need to describe hurt without attacking. Which opener is best?",
        answers: ["I felt hurt when...", "You always ruin things", "Everyone agrees with me"],
        correct: 0,
        win: "An I-statement kept the door open. +EQ.",
      },
      {
        q: "Someone says 'I'm fine' but looks tense. What is a good response?",
        answers: ["gently ask once, then respect space", "demand a confession", "ignore all signals"],
        correct: 0,
        win: "You balanced care with respect. +EQ.",
      },
      {
        q: "Your feedback hurt someone more than expected. What should come first?",
        answers: ["listen and repair impact", "defend your intent only", "say they are too sensitive"],
        correct: 0,
        win: "Impact got attention. +EQ.",
      },
      {
        q: "A partner keeps interrupting. What is a mature request?",
        answers: ["Can we take turns finishing?", "You never care", "silent treatment"],
        correct: 0,
        win: "Specific requests beat global blame. +EQ.",
      },
      {
        q: "A child is melting down in public. What helps most?",
        answers: ["stay calm and name the feeling", "shout louder", "mock the crying"],
        correct: 0,
        win: "Co-regulation helped the child settle. +EQ.",
      },
      {
        q: "A coworker takes credit for your work. What is strategic and fair?",
        answers: ["document and discuss calmly", "explode in the meeting", "quit instantly"],
        correct: 0,
        win: "You protected truth without losing control. +EQ.",
      },
      {
        q: "Someone gives criticism that is partly wrong. What is the best response?",
        answers: ["find the useful part first", "reject all of it", "attack their character"],
        correct: 0,
        win: "You extracted value from discomfort. +EQ.",
      },
      {
        q: "Two people want opposite outcomes. What creates a better chance of agreement?",
        answers: ["ask the need behind each position", "vote before listening", "repeat your demand"],
        correct: 0,
        win: "Needs revealed room for compromise. +EQ.",
      },
    ],
  },
  strategy: {
    starter: [
      {
        q: "What is the main job of a budget?",
        answers: ["match income to plans", "hide spending", "make money disappear"],
        correct: 0,
        win: "Budget thinking sharpened. +Strategy.",
      },
      {
        q: "What should usually come before risky investing?",
        answers: ["emergency savings", "a bigger phone", "guessing stocks"],
        correct: 0,
        win: "Risk order improved. +Strategy.",
      },
      {
        q: "Which debt is usually best to attack first?",
        answers: ["highest interest debt", "smallest font debt", "oldest-looking bill"],
        correct: 0,
        win: "Interest-cost strategy improved. +Strategy.",
      },
      {
        q: "Why is starting to save early powerful?",
        answers: ["compound growth has more time", "banks give magic gifts", "prices stop changing"],
        correct: 0,
        win: "Compounding clicked. +Strategy.",
      },
      {
        q: "What grows career value fastest?",
        answers: ["useful skills plus proof", "only wishing", "changing titles daily"],
        correct: 0,
        win: "Skill-building plan improved. +Strategy.",
      },
      {
        q: "What is networking in a healthy career?",
        answers: ["building helpful relationships", "begging strangers", "collecting business cards only"],
        correct: 0,
        win: "Career relationships got clearer. +Strategy.",
      },
      {
        q: "Before an interview, what should you prepare?",
        answers: ["role research and examples", "only your outfit", "nothing"],
        correct: 0,
        win: "Preparation raised your odds. +Strategy.",
      },
      {
        q: "Which is closest to wealth?",
        answers: ["assets minus debts", "monthly salary only", "shopping bags"],
        correct: 0,
        win: "Net-worth thinking unlocked. +Strategy.",
      },
      {
        q: "What is diversification?",
        answers: ["spreading risk across assets", "buying one rumor", "hiding cash randomly"],
        correct: 0,
        win: "Portfolio risk improved. +Strategy.",
      },
      {
        q: "A normal car loses value over time. What is this called?",
        answers: ["depreciation", "appreciation", "promotion"],
        correct: 0,
        win: "Asset behavior learned. +Strategy.",
      },
    ],
    practice: [
      {
        q: "You can work overtime or study a valuable skill. What should you compare?",
        answers: ["opportunity cost", "shoe size", "weather only"],
        correct: 0,
        win: "Trade-off thinking improved. +Strategy.",
      },
      {
        q: "A job offer is lower than expected. What helps negotiation most?",
        answers: ["market data and value proof", "anger only", "accept silently always"],
        correct: 0,
        win: "Negotiation got more grounded. +Strategy.",
      },
      {
        q: "Why can one single stock be risky?",
        answers: ["one company can fail", "markets close forever", "shares weigh too much"],
        correct: 0,
        win: "Concentration risk spotted. +Strategy.",
      },
      {
        q: "Paying bills on time usually helps what?",
        answers: ["credit strength", "height", "shoe quality"],
        correct: 0,
        win: "Credit habits improved. +Strategy.",
      },
      {
        q: "The debt avalanche method pays which debt first?",
        answers: ["highest interest rate", "prettiest logo", "newest envelope"],
        correct: 0,
        win: "Debt payoff strategy improved. +Strategy.",
      },
      {
        q: "Why find a mentor?",
        answers: ["learn from experience faster", "copy their life exactly", "avoid all work"],
        correct: 0,
        win: "Mentor strategy unlocked. +Strategy.",
      },
      {
        q: "A stronger resume usually shows what?",
        answers: ["measured results", "only duties", "favorite snacks"],
        correct: 0,
        win: "Career evidence improved. +Strategy.",
      },
      {
        q: "Before changing careers, what should you test?",
        answers: ["skills, market, and fit", "only the logo", "random luck"],
        correct: 0,
        win: "Career pivot got safer. +Strategy.",
      },
      {
        q: "What is insurance mainly for?",
        answers: ["protecting against big losses", "guaranteed profit", "avoiding budgets"],
        correct: 0,
        win: "Risk protection clicked. +Strategy.",
      },
      {
        q: "A side hustle earns money. What grows it best long-term?",
        answers: ["reinvest in what works", "spend all instantly", "never track results"],
        correct: 0,
        win: "Growth loop identified. +Strategy.",
      },
    ],
    advanced: [
      {
        q: "As you get older, why might your investments become less risky?",
        answers: ["less time to recover losses", "risk disappears", "cash turns into houses"],
        correct: 0,
        win: "Life-stage investing improved. +Strategy.",
      },
      {
        q: "During a recession, what is often wise if your job is uncertain?",
        answers: ["increase cash cushion", "take bigger random risks", "ignore expenses"],
        correct: 0,
        win: "Downside planning improved. +Strategy.",
      },
      {
        q: "When comparing two job offers, salary is not enough. What else matters?",
        answers: ["benefits, growth, risk, fit", "desk color only", "company logo size"],
        correct: 0,
        win: "Offer comparison leveled up. +Strategy.",
      },
      {
        q: "What is a BATNA in negotiation?",
        answers: ["best alternative if no deal", "a bank code", "a tax penalty"],
        correct: 0,
        win: "Negotiation fallback identified. +Strategy.",
      },
      {
        q: "A business is profitable on paper but has no cash to pay bills. What failed?",
        answers: ["cash-flow planning", "font choice", "office decoration"],
        correct: 0,
        win: "Cash flow became visible. +Strategy.",
      },
      {
        q: "A house can rise 4% yearly but has upkeep. What should you compare?",
        answers: ["total return after costs", "wall color only", "door count"],
        correct: 0,
        win: "Real asset return improved. +Strategy.",
      },
      {
        q: "Why can a small early investment beat a larger late one?",
        answers: ["more compounding years", "older money is heavier", "late money is illegal"],
        correct: 0,
        win: "Time horizon strategy clicked. +Strategy.",
      },
      {
        q: "What is risk-adjusted return?",
        answers: ["reward compared with risk taken", "return after lunch", "a guaranteed win"],
        correct: 0,
        win: "Smarter return comparison unlocked. +Strategy.",
      },
      {
        q: "You are offered a promotion with burnout risk. What should you evaluate?",
        answers: ["pay, learning, health cost", "title only", "office chair color"],
        correct: 0,
        win: "Career strategy included health. +Strategy.",
      },
      {
        q: "A market trend is popular. What should you check before investing?",
        answers: ["evidence, valuation, and risk", "how loud people are", "only the logo"],
        correct: 0,
        win: "Hype filter upgraded. +Strategy.",
      },
    ],
  },
};
const TRAINING_IQ_EXTRA_BANKS: Record<TrainingLevel, TrainingQuestion[]> = {
  starter: [
    {
      q: "Which number comes next: 5, 10, 20, 40, ?",
      answers: ["45", "60", "80"],
      correct: 2,
      win: "Doubling pattern solved. +2 IQ.",
    },
    {
      q: "Which word does not belong: blue, green, chair, red?",
      answers: ["blue", "chair", "red"],
      correct: 1,
      win: "Category trap cleared. +2 IQ.",
    },
    {
      q: "If a week has 7 days, how many days are in 3 weeks?",
      answers: ["14", "21", "28"],
      correct: 1,
      win: "Simple multiplication stayed sharp. +2 IQ.",
    },
    {
      q: "What letter comes next: A, C, F, J, O, ?",
      answers: ["S", "U", "V"],
      correct: 1,
      win: "Growing letter gaps found. +2 IQ.",
    },
    {
      q: "A basket has 4 apples. You take 2. How many apples do you have?",
      answers: ["2", "4", "6"],
      correct: 0,
      win: "Wording trap handled. +2 IQ.",
    },
  ],
  practice: [
    {
      q: "If 3 painters paint 3 walls in 3 hours, how long do 9 painters need for 9 walls?",
      answers: ["3 hours", "6 hours", "9 hours"],
      correct: 0,
      win: "Rate scaling stayed clean. +2 IQ.",
    },
    {
      q: "A is east of B. C is east of A. Who is farthest east?",
      answers: ["A", "B", "C"],
      correct: 2,
      win: "Spatial ordering solved. +2 IQ.",
    },
    {
      q: "What comes next: 1, 1, 2, 3, 5, 8, ?",
      answers: ["11", "13", "16"],
      correct: 1,
      win: "Fibonacci flow spotted. +2 IQ.",
    },
    {
      q: "If all Mips are Nops, and all Nops are Lums, are all Mips definitely Lums?",
      answers: ["yes", "no", "only half"],
      correct: 0,
      win: "Chain logic clicked. +2 IQ.",
    },
    {
      q: "Which pair continues: 2Z, 4Y, 8X, ?",
      answers: ["10W", "16W", "16V"],
      correct: 1,
      win: "Number doubling and letter countdown solved. +2 IQ.",
    },
  ],
  advanced: [
    {
      q: "A box has 2 red, 2 blue, and 2 yellow socks. How many socks guarantee a matching pair?",
      answers: ["3", "4", "5"],
      correct: 1,
      win: "Worst-case reasoning unlocked. +2 IQ.",
    },
    {
      q: "If no artists are robots, and some coders are artists, what must be true?",
      answers: ["some coders are not robots", "all coders are robots", "no coders exist"],
      correct: 0,
      win: "Logic overlap solved. +2 IQ.",
    },
    {
      q: "A clock gains 5 minutes every hour. After 6 real hours, how far fast is it?",
      answers: ["20 minutes", "30 minutes", "60 minutes"],
      correct: 1,
      win: "Accumulated drift calculated. +2 IQ.",
    },
    {
      q: "What comes next: 1, 4, 9, 16, 25, ?",
      answers: ["30", "36", "49"],
      correct: 1,
      win: "Square sequence held steady. +2 IQ.",
    },
    {
      q: "If two coins total 30 cents and one is not a nickel, what are they?",
      answers: ["quarter and nickel", "two dimes", "quarter and penny"],
      correct: 0,
      win: "The other coin can be the nickel. +2 IQ.",
    },
  ],
};
const TRAINING_EXTRA_BANKS: Record<Exclude<TrainingCategory, "iq">, Record<TrainingLevel, TrainingQuestion[]>> = {
  eq: {
    starter: [
      {
        q: "You feel your body getting tense during a talk. What is a good first clue?",
        answers: ["you may be triggered", "you are always right", "the other person must leave"],
        correct: 0,
        win: "Body-signal awareness improved. +EQ.",
      },
      {
        q: "A younger sibling keeps asking questions. What response builds connection?",
        answers: ["answer kindly or set a gentle time", "call them annoying", "ignore them all day"],
        correct: 0,
        win: "Patience became a relationship skill. +EQ.",
      },
      {
        q: "A friend looks proud of a drawing. What is a supportive response?",
        answers: ["ask what they like about it", "point out flaws first", "change the topic"],
        correct: 0,
        win: "Encouragement landed well. +EQ.",
      },
      {
        q: "You are too tired to help. What is emotionally honest?",
        answers: ["I care, but I need rest first", "yes, then resent it", "vanish without words"],
        correct: 0,
        win: "Honest limits protected trust. +EQ.",
      },
      {
        q: "Someone says thank you. What small habit strengthens bonds?",
        answers: ["receive it warmly", "reject the thanks", "make it awkward"],
        correct: 0,
        win: "Warm receiving is a skill too. +EQ.",
      },
    ],
    practice: [
      {
        q: "A teammate gives a bad idea in public. What protects dignity?",
        answers: ["ask a clarifying question", "laugh at them", "call it stupid"],
        correct: 0,
        win: "Respect kept collaboration alive. +EQ.",
      },
      {
        q: "A parent repeats advice you know. What can reduce conflict?",
        answers: ["thank them and state your plan", "roll your eyes", "start a new fight"],
        correct: 0,
        win: "You balanced respect and autonomy. +EQ.",
      },
      {
        q: "Your friend is happy about something you dislike. What shows empathy?",
        answers: ["be happy for their happiness", "ruin the moment", "compare it to your taste"],
        correct: 0,
        win: "Empathy separated their joy from your taste. +EQ.",
      },
      {
        q: "You said yes too quickly and regret it. What is best?",
        answers: ["renegotiate early and clearly", "miss the promise silently", "blame the calendar"],
        correct: 0,
        win: "Repair came before failure. +EQ.",
      },
      {
        q: "A joke hurts someone even if you meant well. What matters now?",
        answers: ["repair the impact", "argue about intent only", "repeat the joke"],
        correct: 0,
        win: "Impact got care. +EQ.",
      },
    ],
    advanced: [
      {
        q: "Two family members tell opposite stories. What is the safest role?",
        answers: ["listen for needs before judging", "become the judge instantly", "spread both stories"],
        correct: 0,
        win: "You slowed the triangle down. +EQ.",
      },
      {
        q: "A friend keeps venting but never changes. What boundary is kind?",
        answers: ["I can listen for ten minutes, then need rest", "never talk again", "solve their life for them"],
        correct: 0,
        win: "Compassion gained a boundary. +EQ.",
      },
      {
        q: "A group excludes one person by habit. What is leadership?",
        answers: ["create a real chance for them to join", "join the exclusion", "pretend it is invisible"],
        correct: 0,
        win: "Inclusive leadership rose. +EQ.",
      },
      {
        q: "Someone apologizes badly but seems sincere. What can you do?",
        answers: ["state what repair would help", "punish forever", "pretend it never happened"],
        correct: 0,
        win: "Repair got concrete. +EQ.",
      },
      {
        q: "You must give hard feedback to someone fragile. What helps?",
        answers: ["be specific, kind, and actionable", "hide all truth", "attack personality"],
        correct: 0,
        win: "Care and clarity worked together. +EQ.",
      },
    ],
  },
  strategy: {
    starter: [
      {
        q: "What is the first step before making a big purchase?",
        answers: ["check needs, budget, and trade-offs", "buy fast", "copy a celebrity"],
        correct: 0,
        win: "Purchase planning improved. +Strategy.",
      },
      {
        q: "What does income mean?",
        answers: ["money coming in", "money owed", "money already spent"],
        correct: 0,
        win: "Money vocabulary sharpened. +Strategy.",
      },
      {
        q: "What does expense mean?",
        answers: ["money going out", "free income", "a secret bonus"],
        correct: 0,
        win: "Expense tracking clicked. +Strategy.",
      },
      {
        q: "What is a good reason to learn a new skill?",
        answers: ["raise future options", "avoid all work", "guarantee luck"],
        correct: 0,
        win: "Skill investment made sense. +Strategy.",
      },
      {
        q: "Which is usually a better emergency fund place?",
        answers: ["safe and easy to access", "locked in risky bets", "hidden in a game"],
        correct: 0,
        win: "Emergency planning improved. +Strategy.",
      },
    ],
    practice: [
      {
        q: "What is the best reason to track net worth yearly?",
        answers: ["see long-term direction", "feel rich for one day", "avoid decisions"],
        correct: 0,
        win: "Long-term tracking improved. +Strategy.",
      },
      {
        q: "You get a raise. What protects your future?",
        answers: ["increase saving before lifestyle grows", "spend it all instantly", "hide it"],
        correct: 0,
        win: "Lifestyle creep avoided. +Strategy.",
      },
      {
        q: "What makes a career story stronger in interviews?",
        answers: ["challenge, action, result", "random details only", "long excuses"],
        correct: 0,
        win: "Interview storytelling leveled up. +Strategy.",
      },
      {
        q: "Before choosing a major or job path, what should you compare?",
        answers: ["interest, skill, market demand", "only popularity", "only room color"],
        correct: 0,
        win: "Career fit got sharper. +Strategy.",
      },
      {
        q: "What is the value of an informational interview?",
        answers: ["learn real work from insiders", "ask for money first", "skip research"],
        correct: 0,
        win: "Career research network grew. +Strategy.",
      },
    ],
    advanced: [
      {
        q: "A high salary requires 80-hour weeks. What should you calculate?",
        answers: ["hourly value and health cost", "title sparkle only", "desk size"],
        correct: 0,
        win: "Total career cost became visible. +Strategy.",
      },
      {
        q: "What is the danger of investing with borrowed money?",
        answers: ["losses can be amplified", "profits become illegal", "risk becomes zero"],
        correct: 0,
        win: "Leverage risk spotted. +Strategy.",
      },
      {
        q: "A rental house has income and repairs. What matters most?",
        answers: ["net cash flow after costs", "paint color only", "rent before any expenses"],
        correct: 0,
        win: "Rental math improved. +Strategy.",
      },
      {
        q: "When switching jobs, why keep relationships warm?",
        answers: ["future opportunities travel through trust", "everyone forgets skills", "it replaces work"],
        correct: 0,
        win: "Reputation strategy improved. +Strategy.",
      },
      {
        q: "A plan works only in perfect conditions. What should you add?",
        answers: ["margin of safety", "more optimism only", "a louder slogan"],
        correct: 0,
        win: "Resilient planning unlocked. +Strategy.",
      },
    ],
  },
};

type Mode =
  | "title"
  | "setup"
  | "playing"
  | "partner"
  | "occupation"
  | "house"
  | "vehicle"
  | "commute"
  | "timetravel"
  | "transition"
  | "ending"
  | "biolist"
  | "bioauthor"
  | "profile"
  | "familytree"
  | "friends"
  | "assets"
  | "training"
  | "careermove"
  | "settings";

type StationKind = "good" | "bad" | "person" | "neutral" | "event";
type StationZone = "social" | "family";

interface Station {
  x: number;
  y: number;
  opt: LifeOption;
  kind: StationKind;
  zone: StationZone;
  /** Stable storybook identity for a person station. */
  appearance?: CharacterAppearanceId;
  /** Stable peer heritage; family members inherit the player's heritage. */
  heritage?: HeritageStyle;
  /** For surprise world pickups/hazards spawned from events.ts. */
  event?: RandomEvent;
  /** For bad items: which good category satiates it (diet = food, fit = activity). */
  guard?: string;
  /** Seconds before a bad item can catch you again after a contact. */
  contactCd: number;
  /** For bad items: seconds you're "full" of it — it freezes and fades while >0. */
  satiated: number;
}

interface PersonReaction {
  targetId: string;
  person: PersonKind;
  startedAt: number;
  endsAt: number;
  positive: boolean;
  kind: "talk" | "gift";
}

interface InventorySlot {
  opt: LifeOption;
  count: number;
  eatBy?: number; // seconds left before collected food auto-eats (food slots only)
}

type FamilyRelationKind = "parent" | "child" | "partner" | "sibling";

interface FamilyMember {
  id: string;
  name: string;
  role: string;
  icon: string;
  ageOffset: number;
  generation: number;
  tone: string;
  locked?: boolean;
}

interface FamilyEdge {
  id: string;
  from: string;
  to: string;
  kind: FamilyRelationKind;
  label: string;
}

/** A rewindable snapshot of the whole life, captured at each stage's start. */
type MarketKey = "stock" | "gold" | "property";
// A tiny tradable market for the Assets page. drift = long-run nominal annual
// return, vol = a toned-down yearly wiggle — from historical figures (S&P 500
// ~10%/yr, gold ~7%/yr, US housing ~4–5%/yr). Prices drift up with a little
// randomness, so it reads as a mostly-up line you can buy low and sell high.
const MARKET_ASSETS: { key: MarketKey; icon: string; name: string; drift: number; vol: number }[] = [
  { key: "stock", icon: "📈", name: "Stock index", drift: 0.09, vol: 0.11 },
  { key: "gold", icon: "🥇", name: "Gold", drift: 0.06, vol: 0.09 },
  { key: "property", icon: "🏘️", name: "Property fund", drift: 0.05, vol: 0.05 },
];

// Friends you make from elementary school on. Each is generated to "fit logic":
// age near yours (they grow up alongside you), a gender, a plausible IQ, and how
// you met. Lists grow a little each chapter, capped so it stays readable.
interface Friend {
  id: string;
  name: string;
  gender: Gender;
  /** Optional on read so v5 saves made before friend portraits still migrate. */
  heritage?: HeritageStyle;
  appearance?: CharacterAppearanceId;
  ageOffset: number; // age relative to the player's, so a classmate stays your age
  iq: number;
  how: string;
  since: string;
  bond: number; // 0-100 closeness — grows the longer you're friends; some drift apart
  vibe: string; // a one-word personality flavour
}
const FRIEND_CAP = 16;
const FRIEND_FIRST_M = ["Liam", "Noah", "Ethan", "Mason", "Lucas", "Oliver", "Aiden", "Caleb", "Leo", "Max", "Nathan", "Owen", "Eli", "Theo", "Jude", "Felix", "Marcus", "Hugo", "Andre", "Kai", "Diego", "Omar", "Jonah", "Reza"];
const FRIEND_FIRST_F = ["Emma", "Olivia", "Ava", "Sophia", "Isla", "Mia", "Chloe", "Lily", "Zoe", "Nora", "Maya", "Ruby", "Ella", "Grace", "Hana", "Aria", "Iris", "Nina", "Clara", "Leah", "Amara", "Yuki", "Priya", "Sofia"];
const FRIEND_LAST = ["Tran", "Nguyen", "Park", "Kim", "Lee", "Smith", "Jones", "Garcia", "Khan", "Silva", "Rossi", "Wang", "Cohen", "Okafor", "Diaz", "Novak", "Singh", "Tanaka", "Brown", "Hassan", "Mendez", "Ito", "Adler", "Costa"];
const FRIEND_PLAN: Record<string, { how: string; iqBias?: number; ageSpread?: number }[]> = {
  elementary: [{ how: "classmate" }, { how: "classmate" }, { how: "best friend" }],
  middle: [{ how: "classmate" }, { how: "study buddy", iqBias: 12 }],
  high: [{ how: "schoolmate" }, { how: "teammate", iqBias: -3, ageSpread: 1 }, { how: "study buddy", iqBias: 14 }],
  university: [{ how: "roommate", ageSpread: 3 }, { how: "lab partner", iqBias: 16, ageSpread: 3 }, { how: "classmate", ageSpread: 3 }],
  career: [{ how: "coworker", iqBias: 8, ageSpread: 8 }, { how: "coworker", ageSpread: 8 }],
  marriage: [{ how: "couple friend", ageSpread: 5 }],
  midlife: [{ how: "neighbour", ageSpread: 9 }, { how: "coworker", iqBias: 6, ageSpread: 8 }],
  senior: [{ how: "neighbour", ageSpread: 8 }, { how: "club friend", ageSpread: 10 }],
  retirement: [{ how: "old friend", ageSpread: 6 }],
};
const FRIEND_VIBES = ["loyal", "funny", "kind", "ambitious", "easy-going", "outgoing", "thoughtful", "adventurous", "caring", "witty", "driven", "gentle", "bold", "creative", "cheerful", "dependable", "curious", "warm"];
// starting closeness by how you met — best friends start close, coworkers cooler
const FRIEND_BOND_BASE: Record<string, number> = {
  "best friend": 70, "old friend": 64, "club friend": 56, "roommate": 56, "couple friend": 52,
  "study partner": 52, "study buddy": 50, "lab partner": 50, "teammate": 48,
  "classmate": 42, "schoolmate": 42, "coworker": 38, "neighbour": 36,
};

interface Snapshot {
  stageIndex: number;
  age: number;
  gender: Gender;
  heritage: HeritageStyle;
  /** Optional only so v5 saves made before appearance variants still load. */
  appearance?: CharacterAppearanceId;
  /** Stable per-life seed used to keep NPC looks unchanged across renders. */
  lifeSeed?: string;
  stats: Stats;
  money: number;
  weight: number;
  muscle: number;
  nutrition: number;
  mental: number;
  partnerId: string | null;
  occupationId: string | null;
  /** Optional on read so saves made before parent career setup still load. */
  parentCareerIds?: ParentCareerIds;
  commute: string | null;
  lifetimeEarned: number;
  connections: number;
  familyFund: number;
  parentAnnualSupport: number;
  homeQuality: number;
  homeIds: string[];
  homePurchaseAges: number[];
  hadChild: boolean;
  familyBond: number;
  spouseDeceased: boolean;
  habitCount: number;
  investments: number;
  market: Record<MarketKey, number>;
  holdings: Record<MarketKey, number>;
  friends: Friend[];
  friendNextId: number;
  moneyWise: boolean;
  iqCeiling: number;
  geneBonus: number;
  owned: string[];
  vehiclePurchaseAges: [string, number][];
  jobsTaken: string[];
  usedOnce?: string[];
  usedEvents: string[];
  inventory: InventorySlot[];
  selectedInventory: number;
  familyMembers: FamilyMember[];
  familyEdges: FamilyEdge[];
  familyHiddenIds: string[];
  familySelectedId: string;
  familyNextId: number;
  bigFired: boolean;
  jackpotFired: boolean;
  petAdopted: boolean;
  petKind: PetKind | null;
  petX: number;
  petY: number;
  /** Optional so saves created before four-way pet art remain compatible. */
  petFacing?: AvatarFacing;
  petHappyCd: number;
  eventsLog: string[];
  healthSum: number;
  happinessSum: number;
  smartsSum: number;
  healthCount: number;
  historyLen: number;
}

interface SavedGame {
  version: 5;
  savedAt: number;
  playerName: string;
  lifeSpeed: number;
  snapshot: Snapshot;
  timeline: Snapshot[];
  history: HistoryEntry[];
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stableAnswerOrder(seed: string, count: number): number[] {
  return Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => stableHash(`${seed}:${a}`) - stableHash(`${seed}:${b}`)
  );
}

function jobArtSeasonFor(
  uniform: JobUniform,
  lifeSeason: LifeSeason | null
): "standard" | "summer" {
  return lifeSeason === "summer" &&
    jobUniformHasSummer(uniform)
    ? "summer"
    : "standard";
}

export class Game {
  private ui: UIRefs;
  private mode: Mode = "title";
  private stageIndex = 0;
  private stats: Stats = { ...START_STATS };
  private age = 0;
  private gender: Gender = "male";
  private heritage: HeritageStyle = "western";
  private appearance: CharacterAppearanceId = "alternate";
  private lifeSeed = "new-life";
  private lifeSpeed = 1;
  private economicBackground = "comfortable";
  private soundEnabled = localStorage.getItem("choice-of-life-v1-sound") !== "off";
  private audioContext: AudioContext | null = null;
  private weight = START_WEIGHT;
  private money = START_MONEY; // real dollars (bank balance), can grow large
  // the three pillars of Health (each 0..100) — health is composed from them
  private muscle = START_MUSCLE; // fitness/strength: gym, sports, exercise
  private nutrition = START_NUTRITION; // diet quality: good food up, junk down
  private mental = START_MENTAL; // mental wellbeing: family/friends + happiness
  private occupation: Occupation | null = null;
  private parentCareerIds: ParentCareerIds =
    EMPTY_PARENT_CAREERS;
  private commute: string | null = null; // chosen commute (career selection stage)
  private playerName = ""; // optional name for the LinkedIn-style career profile
  private lifetimeEarned = 0; // total dollars earned from work over the whole life
  private connections = 0; // professional network — grown by coworkers & networking
  private familyFund = START_MONEY; // family resources rolled at birth
  private setupFamilyFund = FAMILY_MONEY_MIN; // editable setup roll before a new life starts
  private parentAnnualSupport = 0; // yearly support from Mommy & Daddy until adulthood
  private homeQuality = 0;
  private homes: HouseTier[] = []; // every property bought; you live in the best one
  private homePurchaseAges: number[] = []; // parallel to homes; lets property appreciate over time
  private houseUpkeep = 0; // per-action dollar drain from your home (mortgage/upkeep)
  private rentalIncome = 0; // per-stage dollars from spare homes rented out
  private investments = 0; // dollars in the market — compounds over the stages
  private moneyWise = false; // learned money management → better, steadier returns
  private iqCeiling = 100; // lifelong IQ potential, rolled at birth
  private geneBonus = 0; // longevity genetics (-5..+5 yrs), rolled at birth
  private familyBond = 0; // time invested in family — unlocks grandkids later
  private owned = new Set<string>(); // one-off, owned-for-life purchases (vehicles, skills)
  private vehiclePurchaseAges = new Map<string, number>(); // vehicle id -> age bought; cars depreciate with time
  private jobsTaken = new Set<string>(); // occupations whose one-off perks were already granted this life
  private bigFired = false; // a "big" windfall already happened (1/life)
  private jackpotFired = false; // a jackpot already happened (1/life total)
  private petAdopted = false; // adopted a pet (1/life)
  private petKind: PetKind | null = null;
  private petX = 132;
  private petY = 640;
  private petFacing: AvatarFacing = "right";
  private petMoving = false;
  private petWalkPhase = 0;
  private petHappyCd = 0;
  private spouseDeceased = false;
  private habitCount = 0;
  private trainingQuestionIndex: Record<TrainingCategory, number> = { iq: 0, eq: 0, strategy: 0 };
  private trainingLevel: Record<TrainingCategory, TrainingLevel> = { iq: "starter", eq: "starter", strategy: "starter" };
  private trainingDatabase: Partial<Record<TrainingCategory, TrainingQuestionBank>> | null = null;
  private eventCooldown = 2;
  private usedEvents = new Set<string>();
  private eventsLog: string[] = [];
  private timeline: Snapshot[] = [];
  private history: HistoryEntry[] = [];
  private partner: Partner | null = null;
  private hadChild = false;
  private familyMembers: FamilyMember[] = [];
  private familyEdges: FamilyEdge[] = [];
  private familyHiddenIds = new Set<string>();
  private familySelectedId = "player";
  private familyNextId = 1;
  private biography: Biography | null = null; // set when replaying an authored life
  private editBio: Biography | null = null; // the draft being edited in the author
  // the how-to-play guide shows once (then it's tucked away during the game)
  private guideSeen = localStorage.getItem("choice-of-life-v1-guide-seen") === "1";
  private theme: "day" | "night" = localStorage.getItem("choice-of-life-v1-theme") === "night" ? "night" : "day";
  private currentLandscape = false;

  private healthSum = 0;
  private happinessSum = 0;
  private smartsSum = 0;
  private healthCount = 0;

  private usedOnce = new Set<string>();
  private stations: Station[] = [];
  private people: Station[] = []; // cached person stations (block bad items)
  // a transient banner shown in the sky area after you interact with a person:
  // a nice descriptive line (text) + the point changes (sub)
  private skyMessage: { text: string; sub?: string; color: string; timer: number; wrapW?: number; wrapLines?: string[]; wrapCW?: number } | null = null;
  // Render-only social feedback. It is intentionally absent from saves and
  // snapshots so a conversation cue can never change gameplay.
  private personReaction: PersonReaction | null = null;
  private reducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches ?? false
      : false;
  // reused scratch draw-list — avoids allocating an array + N wrapper objects every frame
  private drawList: { y: number; station?: Station; pet?: boolean }[] = [];
  // HUD dirty-check — skip the per-frame DOM writes when nothing relevant changed
  private hudSig = NaN;
  private hudMode = "";
  private hudOcc = "";
  // rotating flavor-line cursor, keyed per person-kind / item-id (cosmetic)
  private lineIndex: Record<string, number> = {};
  // a small buy/sell market shown on the Assets page (price index + units held)
  private market: Record<MarketKey, number> = { stock: 100, gold: 100, property: 100 };
  private holdings: Record<MarketKey, number> = { stock: 0, gold: 0, property: 0 };
  private friends: Friend[] = [];
  private friendNextId = 0;
  private floats: FloatText[] = [];
  private focusIndex = -1;

  private px = 46;
  private py = 450;
  private walkPhase = 0;
  private moving = false;
  private facing: AvatarFacing = "front";
  private verticalBias = 0;
  private cooldown = 0;
  private foodCooldown = 0;
  private trayTipShown = false; // the "collect items" guidance shows in the sky once per life, not in the tray
  private autoHealCd = 0; // min seconds between automatic low-health tray meals
  private hintTimer = 0;

  private transitionTimer = 0;
  private transitionNext = 0;

  private story: LifeStory | null = null;
  private inventory: InventorySlot[] = [];
  private selectedInventory = 0;

  private input = { left: false, right: false, up: false, down: false };
  // analog thumb-stick vector (-1..1); when engaged it overrides the keyboard
  private joyActive = false;
  private joyX = 0;
  private joyY = 0;
  private joyPointerId: number | null = null;
  private actQueued = false;
  private lastTime = 0;
  private renderTime = 0;
  private frameErrors = 0;

  constructor(mount: HTMLElement) {
    this.ui = createUI(mount);
    this.applyTheme();
    this.applyLayout(true);
    this.bindInput();
    window.addEventListener("resize", () => this.applyLayout());
    window.addEventListener("orientationchange", () => this.applyLayout());
    window.addEventListener("plj:character-atlas-ready", () => {
      if (this.mode === "friends") this.renderFriendFaces();
    });
    void this.loadTrainingDatabase();
    this.showTitle();
    this.renderInventory();
    requestAnimationFrame(this.frame);
    // Debug handle for headless verification (mirrors other games' debug APIs).
    (window as unknown as { __pixelLife: Game }).__pixelLife = this;
  }

  /**
   * Pick the room shape from the viewport orientation: a tall portrait room, or
   * a wide-short landscape room so a phone held sideways gets a full-width
   * playfield instead of a narrow centre strip. Resizes the canvas + re-lays the
   * running stage when the orientation flips.
   */
  private applyLayout(initial = false): void {
    const landscape = window.innerWidth > window.innerHeight && window.innerHeight < 640;
    if (!initial && landscape === this.currentLandscape) return;
    this.currentLandscape = landscape;
    setRoomDims(landscape ? ROOM_LANDSCAPE : ROOM_PORTRAIT);
    const cv = this.ui.canvas;
    cv.width = W * SS;
    cv.height = H * SS;
    this.ui.ctx.setTransform(SS, 0, 0, SS, 0, 0);
    this.ui.ctx.imageSmoothingEnabled = true;
    this.ui.ctx.imageSmoothingQuality = "high";
    this.ui.frame.style.setProperty("--room-aspect", `${W} / ${H}`);
    if (!initial) {
      // re-fit the in-progress game to the new room shape
      this.px = Math.max(48, Math.min(W - 36, this.px));
      this.py = Math.max(PY_MIN, Math.min(PY_MAX, this.py));
      if (this.mode === "playing") this.buildStations();
      this.placePetInRoom(this.petX, this.petY);
    }
  }

  /** Test/debug snapshot of the live game state. */
  debugState() {
    return {
      mode: this.mode,
      stage: STAGES[this.stageIndex]?.id,
      upperScene: this.upperScene(),
      lifeSeason: this.currentLifeSeason(),
      playerBodyVariant: this.currentPlayerBodyVariant(),
      playerCareerUniform: playerCareerUniform(
        this.occupation,
        STAGES[this.stageIndex]?.id ?? "",
        this.gender,
        this.heritage
      ),
      age: Math.round(this.age * 10) / 10,
      lifeSpeed: this.lifeSpeed,
      familyZoneShare: this.familyZoneShare(),
      zoneSplitY: this.zoneSplitY(),
      gates: {
        familyTree: this.canShowFamilyTreeGate(),
        assets: this.canShowAssetsGate(),
        training: this.canShowTrainingGate(),
      },
      lifeExp: this.lifeExp(),
      stats: { ...this.stats },
      px: Math.round(this.px),
      py: Math.round(this.py),
      focus: this.focusIndex >= 0 ? this.stations[this.focusIndex]?.opt.id : null,
      professionNpcs: this.stations
        .filter((station) => station.opt.professionNpc)
        .map((station) => ({
          optionId: station.opt.id,
          ...station.opt.professionNpc,
        })),
      friends: this.friends.map((friend) => ({
        id: friend.id,
        gender: friend.gender,
        heritage: friend.heritage,
        appearance: friend.appearance,
      })),
      interaction: this.personReaction
        ? {
            target: this.personReaction.targetId,
            kind: this.personReaction.kind,
            remaining: Math.max(
              0,
              Math.round(
                (this.personReaction.endsAt - this.renderTime) * 100
              ) / 100
            ),
            expressions: interactionExpressionsAt(
              this.reducedMotion
                ? 0
                : this.renderTime -
                    this.personReaction.startedAt,
              this.personReaction.person,
              this.personReaction.positive
            ),
          }
        : null,
      partner: this.partner?.id ?? null,
      gender: this.gender,
      heritage: this.heritage,
      appearance: this.appearance,
      lifeSeed: this.lifeSeed,
      facing: this.facing,
      weight: Math.round(this.weight),
      health: Math.round(this.stats.health),
      muscle: Math.round(this.muscle),
      nutrition: Math.round(this.nutrition),
      mental: Math.round(this.mental),
      occupation: this.occupation?.id ?? null,
      parentCareerIds: { ...this.parentCareerIds },
      commute: this.commute,
      lifetimeEarned: Math.round(this.lifetimeEarned),
      connections: this.connections,
      money: Math.round(this.money),
      netWorth: Math.round(this.netWorth()),
      familyFund: Math.round(this.familyFund),
      parentAnnualSupport: Math.round(this.parentAnnualSupport),
      iq: Math.round(this.stats.smarts),
      iqCeiling: this.iqCeiling,
      geneBonus: this.geneBonus,
      familyBond: this.familyBond,
      homeQuality: this.homeQuality,
      homes: this.homes.map((h) => h.id),
      houseUpkeep: Math.round(this.houseUpkeep),
      rentalIncome: this.rentalIncome,
      investments: Math.round(this.investments),
      moneyWise: this.moneyWise,
      owned: [...this.owned],
      habitCount: this.habitCount,
      caps: { bigFired: this.bigFired, jackpotFired: this.jackpotFired, petAdopted: this.petAdopted, petKind: this.petKind },
      pet: this.petKind ? {
        kind: this.petKind,
        x: Math.round(this.petX),
        y: Math.round(this.petY),
        facing: this.petFacing,
        moving: this.petMoving,
        happyCooldown: Math.round(this.petHappyCd * 10) / 10,
      } : null,
      events: [...this.eventsLog],
      eventItems: this.stations
        .filter((s) => s.kind === "event" && s.event)
        .map((s) => ({
          id: s.event!.id,
          title: s.event!.title,
          good: s.event!.good !== false,
          x: Math.round(s.x),
          y: Math.round(s.y),
        })),
      inventory: this.inventory.map((slot, i) => ({
        id: slot.opt.id,
        label: slot.opt.label,
        icon: slot.opt.icon,
        count: slot.count,
        selected: i === this.selectedInventory,
      })),
      familyGraph: {
        members: this.familyMembers.length,
        edges: this.familyEdges.length,
        hidden: this.familyHiddenIds.size,
        selected: this.familySelectedId,
      },
      foodCooldown: Math.round(this.foodCooldown * 10) / 10,
      timelineLen: this.timeline.filter(Boolean).length,
      historyLen: this.history.length,
    };
  }

  /** Test/debug: force a random event item (by id, or a default eligible one). */
  debugFireEvent(id?: string): string | null {
    const e = id ? EVENTS.find((x) => x.id === id) : EVENTS[0];
    if (!e || this.mode !== "playing") return null;
    this.spawnEventItem(e);
    return e.id;
  }

  /** Test/debug: collect a visible event item immediately. */
  debugCollectEvent(id?: string): string | null {
    const st = this.stations.find((s) => s.kind === "event" && s.event && (!id || s.event.id === id));
    if (!st || this.mode !== "playing") return null;
    const eventId = st.event!.id;
    this.collectEventItem(st);
    return eventId;
  }

  /** Test/debug: adopt a room pet immediately. */
  debugAdoptPet(kind: PetKind = "dog"): PetKind | null {
    if (this.mode !== "playing") return null;
    this.adoptPet(kind, this.px + 70, this.py + 28);
    return this.petKind;
  }

  /** Test/debug: choose an option by id in the current stage (ignores position). */
  debugChoose(optId: string): void {
    const idx = this.stations.findIndex((s) => s.opt.id === optId);
    if (idx < 0) return;
    this.focusIndex = idx;
    this.cooldown = 0;
    this.doAction();
  }

  /** Test/debug: pick a partner / occupation / house / vehicle / commute / rewind by id. */
  debugPick(kind: "partner" | "occupation" | "house" | "vehicle" | "commute" | "rewind", id: string): void {
    if (kind === "partner") {
      const p = PARTNERS.find((x) => x.id === id);
      if (p) this.pickPartner(p);
    } else if (kind === "occupation") {
      const o = OCCUPATIONS.find((x) => x.id === id);
      if (o) this.pickOccupation(o);
    } else if (kind === "house") {
      const h = HOUSE_TIERS.find((x) => x.id === id);
      if (h) this.buyHouse(h);
    } else if (kind === "vehicle") {
      const v = VEHICLES.find((x) => x.id === id);
      if (v) this.buyVehicle(v);
    } else if (kind === "commute") {
      const c = COMMUTES.find((x) => x.id === id);
      if (c) this.pickCommute(c);
    } else if (kind === "rewind") {
      this.rewind(Number(id));
    }
  }

  // --- lifecycle ------------------------------------------------------------

  private readSavedGame(): SavedGame | null {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "null") as Partial<SavedGame> | null;
      if (!parsed || parsed.version !== 5 || !parsed.snapshot || !Array.isArray(parsed.history) || !Array.isArray(parsed.timeline)) return null;
      if (!Number.isInteger(parsed.snapshot.stageIndex) || parsed.snapshot.stageIndex < 0 || parsed.snapshot.stageIndex >= STAGES.length) return null;
      return parsed as SavedGame;
    } catch {
      return null;
    }
  }

  private persistGame(): void {
    if (this.biography || this.mode === "title" || this.mode === "ending") return;
    try {
      const snapshot = this.snapshot();
      const save: SavedGame = {
        version: 5,
        savedAt: Date.now(),
        playerName: this.playerName,
        lifeSpeed: this.lifeSpeed,
        snapshot,
        // Keep chapter-entry checkpoints separate from the active state so
        // time travel still returns to the beginning of each chapter.
        timeline: [...this.timeline],
        history: [...this.history],
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // A full or unavailable storage area must never stop play.
    }
  }

  private async continueSavedGame(button?: HTMLButtonElement): Promise<void> {
    const save = this.readSavedGame();
    if (!save) return this.showTitle();
    const heritage = this.normalizeHeritage(save.snapshot.heritage);
    const appearance = this.normalizeAppearance(
      save.snapshot.appearance
    );
    const lifeSeed =
      typeof save.snapshot.lifeSeed === "string" &&
      save.snapshot.lifeSeed.trim()
        ? save.snapshot.lifeSeed.slice(0, 80)
        : `legacy-${save.savedAt}`;
    save.snapshot.heritage = heritage;
    save.snapshot.gender =
      save.snapshot.gender === "female" ? "female" : "male";
    save.snapshot.appearance = appearance;
    save.snapshot.petKind = this.normalizePetKind(
      save.snapshot.petKind
    );
    save.snapshot.petFacing = this.normalizePetFacing(
      save.snapshot.petFacing
    );
    save.snapshot.lifeSeed = lifeSeed;
    const savedParentCareerIds = normalizeParentCareerIds(
      save.snapshot.parentCareerIds
    );
    save.snapshot.parentCareerIds = savedParentCareerIds;
    for (const checkpoint of save.timeline) {
      if (!checkpoint || typeof checkpoint !== "object") continue;
      checkpoint.heritage = this.normalizeHeritage(checkpoint.heritage);
      checkpoint.gender =
        checkpoint.gender === "female" ? "female" : "male";
      checkpoint.appearance = this.normalizeAppearance(
        checkpoint.appearance
      );
      checkpoint.petKind = this.normalizePetKind(
        checkpoint.petKind
      );
      checkpoint.petFacing = this.normalizePetFacing(
        checkpoint.petFacing
      );
      checkpoint.lifeSeed =
        typeof checkpoint.lifeSeed === "string" &&
        checkpoint.lifeSeed.trim()
          ? checkpoint.lifeSeed.slice(0, 80)
          : lifeSeed;
      checkpoint.parentCareerIds = normalizeParentCareerIds(
        checkpoint.parentCareerIds ?? savedParentCareerIds
      );
    }
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Loading your character…";
    }
    try {
      const stageIndex = save.snapshot.stageIndex;
      const savedOccupation = save.snapshot.occupationId
        ? OCCUPATIONS.find(
            (occupation) =>
              occupation.id === save.snapshot.occupationId
          ) ?? null
        : null;
      const savedBodyVariant = playerBodyVariantAtAge({
        occupation: savedOccupation,
        stageId: STAGES[stageIndex]?.id ?? "",
        age: save.snapshot.age,
        gender: save.snapshot.gender,
        heritage,
      });
      const savedLifeSeason = lifeSeasonAt(
        STAGES[stageIndex]?.id ?? "",
        save.snapshot.age
      );
      const savedJobVisuals: ProfessionVisualIdentity[] = [];
      if (savedBodyVariant.kind === "career-uniform") {
        savedJobVisuals.push(
          savedBodyVariant.careerUniform
        );
      }
      for (const role of ["mother", "father"] as const) {
        const profession = parentProfessionSpec(
          role,
          savedParentCareerIds,
          heritage
        );
        if (profession) savedJobVisuals.push(profession);
      }
      // Saved lives may use an atlas that has not been requested on the title
      // screen. Decode the whole heritage pair before gameplay so neither the
      // player nor opposite-gender family briefly flashes the old fallback.
      if (save.snapshot.petKind === "dog" || save.snapshot.petKind === "cat") {
        void warmStorybookPetAtlases(save.snapshot.petKind);
      }
      const [ready] = await Promise.all([
        warmStorybookCharacterAtlases(heritage),
        savedBodyVariant.kind === "summer-casual"
            ? warmSummerCharacterAtlases(
                heritage,
                save.snapshot.gender
              )
            : Promise.resolve(true),
        ...savedJobVisuals.map((visual) =>
          warmJobCharacterAtlases(
            visual.heritage,
            visual.gender,
            visual.uniform,
            jobArtSeasonFor(
              visual.uniform,
              savedLifeSeason
            )
          )
        ),
      ]);
      if (!ready) {
        if (button?.isConnected) {
          button.textContent = "Retry character download";
        }
        this.hint("Character art could not load. Your save is safe; check your connection and retry.");
        return;
      }
      if (button && !button.isConnected) return;
      const chapterEntry = save.timeline[stageIndex];
      this.playerName = typeof save.playerName === "string" ? save.playerName.slice(0, 40) : "";
      this.setLifeSpeed(save.lifeSpeed);
      this.history = [...save.history];
      this.timeline = [...save.timeline];
      // Reuse the normal restoration path for the active snapshot, then put
      // the original chapter-entry checkpoint back for time travel.
      this.timeline[stageIndex] = save.snapshot;
      this.rewind(stageIndex);
      if (chapterEntry) this.timeline[stageIndex] = chapterEntry;
      this.persistGame();
      this.recordFunnel("life_resumed");
      this.hint(`▶ Continued ${this.playerDisplayName()}'s life at age ${Math.floor(this.age)}.`);
    } catch {
      this.clearSavedGame();
      this.recordFunnel("invalid_save_removed");
      this.showTitle();
      this.hint("The previous save was damaged, so it was safely removed.");
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    }
  }

  private clearSavedGame(): void {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  private recordFunnel(event: string): void {
    try {
      const data = JSON.parse(localStorage.getItem(FUNNEL_KEY) || "{}") as Record<string, { count: number; lastAt: number }>;
      const previous = data[event];
      data[event] = { count: (previous?.count ?? 0) + 1, lastAt: Date.now() };
      localStorage.setItem(FUNNEL_KEY, JSON.stringify(data));
    } catch { /* local measurement is optional */ }
  }

  private exportFunnel(): void {
    const payload = localStorage.getItem(FUNNEL_KEY) || "{}";
    const blob = new Blob([payload], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "choice-of-life-reference-playtest.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  private playFeedback(positive: boolean): void {
    if (!this.soundEnabled) return;
    try {
      const audio = this.audioContext ?? new AudioContext();
      this.audioContext = audio;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = positive ? 620 : 190;
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, audio.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.13);
    } catch { /* sound is enhancement-only */ }
  }

  private newGame(
    keepBiography = false,
    startStageIndex = 0,
    familyFundOverride?: number,
    startingIqOverride: number | null = null,
    parentCareerIds: ParentCareerIds =
      EMPTY_PARENT_CAREERS
  ): void {
    if (!keepBiography) this.clearSavedGame();
    if (!keepBiography) this.biography = null; // normal play is never a replay
    if (!keepBiography) this.lifeSeed = this.createLifeSeed();
    this.lineIndex = {}; // restart the rotating greeting / pickup lines
    const startIndex = keepBiography ? 0 : this.normalizeStageIndex(startStageIndex);
    this.stats = { ...START_STATS };
    this.age = 0;
    this.weight = START_WEIGHT;
    this.familyFund = keepBiography ? this.rollFamilyMoney() : this.normalizeFamilyMoney(familyFundOverride ?? this.setupFamilyFund);
    this.parentAnnualSupport = this.rollParentSupport(this.familyFund);
    this.money = this.familyFund;
    this.muscle = START_MUSCLE;
    this.nutrition = START_NUTRITION;
    this.mental = START_MENTAL;
    this.recomputeHealth();
    this.occupation = null;
    this.parentCareerIds = keepBiography
      ? EMPTY_PARENT_CAREERS
      : normalizeParentCareerIds(parentCareerIds);
    this.commute = null;
    this.homeQuality = 0;
    this.homes = [];
    this.homePurchaseAges = [];
    this.houseUpkeep = 0;
    this.rentalIncome = 0;
    this.investments = 0;
    this.market = { stock: 100, gold: 100, property: 100 };
    this.holdings = { stock: 0, gold: 0, property: 0 };
    this.friends = [];
    this.friendNextId = 0;
    this.moneyWise = false;
    // roll a lifelong IQ potential (mean 100, sd 15, clamped) + a rare gifted bump
    this.iqCeiling = Math.max(70, Math.min(145, Math.round(gaussian(100, 15))));
    if (Math.random() < 0.02) this.iqCeiling = 150 + Math.floor(Math.random() * 11); // ~2% gifted (150-160)
    const iqPlan = startingIqPlan(
      STAGES[startIndex].ageStart,
      this.iqCeiling,
      keepBiography ? null : startingIqOverride
    );
    this.stats.smarts = iqPlan.currentIq;
    this.iqCeiling = iqPlan.iqCeiling;
    this.geneBonus = Math.round((Math.random() * 10 - 5) * 10) / 10; // longevity genes -5..+5
    this.familyBond = 0;
    this.lifetimeEarned = 0;
    this.connections = 0;
    this.owned = new Set();
    this.vehiclePurchaseAges = new Map();
    this.jobsTaken = new Set();
    this.bigFired = false;
    this.jackpotFired = false;
    this.petAdopted = false;
    this.petKind = null;
    this.petX = 132;
    this.petY = 640;
    this.petFacing = "right";
    this.petMoving = false;
    this.petWalkPhase = 0;
    this.petHappyCd = 0;
    this.spouseDeceased = false;
    this.habitCount = 0;
    this.eventCooldown = 2;
    this.foodCooldown = 0;
    this.trayTipShown = false;
    this.autoHealCd = 0;
    this.usedEvents = new Set();
    this.inventory = [];
    this.selectedInventory = 0;
    this.eventsLog = [];
    this.timeline = [];
    this.history = [];
    this.partner = null;
    this.hadChild = false;
    this.resetFamilyGraph();
    this.healthSum = 0;
    this.happinessSum = 0;
    this.smartsSum = 0;
    this.healthCount = 0;
    this.floats = [];
    this.skyMessage = null;
    this.personReaction = null;
    this.story = null;
    this.renderInventory();
    this.sampleHealth();
    this.loadStage(startIndex);
    this.recordFunnel("life_started");
    const start = STAGES[startIndex];
    this.hint(startIndex === 0
      ? "Move near Milk or a family member, then tap Collect."
      : `${start.emoji} Started at ${start.name} (age ${start.ageStart}). IQ: ${Math.round(this.stats.smarts)}. Style: ${this.heritageLabel()}. Speed: ${this.lifeSpeedLabel()}.`);
  }

  private loadStage(i: number, restoring = false): void {
    this.stageIndex = i;
    const s = STAGES[i];
    if (!restoring) this.usedOnce.clear();
    this.age = Math.max(this.age, s.ageStart);
    this.px = 70;
    this.py = 500;
    this.placePetInRoom(this.px + 86, this.py + 48);
    this.focusIndex = -1;
    this.personReaction = null;
    this.buildStations();
    this.warmPlayerBodyVariant();
    this.renderFocusPanel(); // reset the panel to the default prompt on stage entry
    this.renderInventory();
    // On a rewind the running averages + entry snapshot were just restored from
    // timeline[i] (which already counts this entry's sample) — re-sampling and
    // re-snapshotting here would double-count it and drift life expectancy.
    if (!restoring) {
      this.addFriendsForStage(); // make this chapter's new friends before snapshotting
      this.sampleHealth();
      this.timeline[i] = this.snapshot(); // capture entry state for time travel
    }
    // a biography replays an authored life — no occupation/marriage pickers
    if (!this.biography && s.isMarriage && !this.partner) {
      this.mode = "partner";
      this.showPartner();
    } else if (!this.biography && s.isCareer && !this.occupation) {
      this.mode = "occupation";
      this.showOccupation();
    } else if (!this.biography && s.isCareer && this.occupation && !this.commute) {
      this.mode = "commute";
      this.showCommute();
    } else {
      this.mode = "playing";
      this.clearOverlay();
    }
    if (!this.biography) this.persistGame();
  }

  private snapshot(): Snapshot {
    return {
      stageIndex: this.stageIndex,
      age: this.age,
      gender: this.gender,
      heritage: this.heritage,
      appearance: this.appearance,
      lifeSeed: this.lifeSeed,
      stats: { ...this.stats },
      money: this.money,
      weight: this.weight,
      muscle: this.muscle,
      nutrition: this.nutrition,
      mental: this.mental,
      partnerId: this.partner?.id ?? null,
      occupationId: this.occupation?.id ?? null,
      parentCareerIds: { ...this.parentCareerIds },
      commute: this.commute,
      lifetimeEarned: this.lifetimeEarned,
      connections: this.connections,
      familyFund: this.familyFund,
      parentAnnualSupport: this.parentAnnualSupport,
      homeQuality: this.homeQuality,
      homeIds: this.homes.map((h) => h.id),
      homePurchaseAges: [...this.homePurchaseAges],
      hadChild: this.hadChild,
      familyBond: this.familyBond,
      spouseDeceased: this.spouseDeceased,
      habitCount: this.habitCount,
      investments: this.investments,
      market: { ...this.market },
      holdings: { ...this.holdings },
      friends: this.friends.map((f) => ({ ...f })),
      friendNextId: this.friendNextId,
      moneyWise: this.moneyWise,
      iqCeiling: this.iqCeiling,
      geneBonus: this.geneBonus,
      owned: [...this.owned],
      vehiclePurchaseAges: [...this.vehiclePurchaseAges.entries()],
      jobsTaken: [...this.jobsTaken],
      usedOnce: [...this.usedOnce],
      inventory: this.inventory.map((slot) => ({ opt: slot.opt, count: slot.count, eatBy: slot.eatBy })),
      selectedInventory: this.selectedInventory,
      familyMembers: this.familyMembers.map((m) => ({ ...m })),
      familyEdges: this.familyEdges.map((e) => ({ ...e })),
      familyHiddenIds: [...this.familyHiddenIds],
      familySelectedId: this.familySelectedId,
      familyNextId: this.familyNextId,
      bigFired: this.bigFired,
      jackpotFired: this.jackpotFired,
      petAdopted: this.petAdopted,
      petKind: this.petKind,
      petX: this.petX,
      petY: this.petY,
      petFacing: this.petFacing,
      petHappyCd: this.petHappyCd,
      usedEvents: [...this.usedEvents],
      eventsLog: [...this.eventsLog],
      healthSum: this.healthSum,
      happinessSum: this.happinessSum,
      smartsSum: this.smartsSum,
      healthCount: this.healthCount,
      historyLen: this.history.length,
    };
  }

  /** Some NPC options only make sense in context (spouse alive, kids exist…). */
  private optionAvailable(o: LifeOption): boolean {
    if (o.person === "spouse") return !!this.partner && !this.spouseDeceased;
    if (o.person === "child") return this.hadChild;
    // grandkids only appear in old age if you invested time in family earlier
    if (o.person === "grandkid") return this.hadChild && this.familyBond >= 3;
    // one-off purchases/skills disappear once you own them
    if (o.permanent && this.owned.has(o.id)) return false;
    // the vehicle picker hides once you own every vehicle
    if (o.opensVehiclePicker) return VEHICLES.some((v) => !this.owned.has("veh_" + v.id));
    return true;
  }

  /** The stations for the current chapter — a biography's moments, or the defaults. */
  private currentOptions(): LifeOption[] {
    const s = STAGES[this.stageIndex];
    if (this.biography) {
      const ch = this.biography.chapters[s.id];
      if (ch && ch.moments.length) return ch.moments.map((m) => this.sanitizeMoment(m));
      return []; // an authored life with nothing recorded for this chapter — a quiet time
    }
    const base = this.withPartnerDetails(
      this.withParentCareerDetails(
        this.withFamilyPresence(
          s.options.filter((o) => this.optionAvailable(o)),
          s
        )
      )
    );
    const reservedProfessionVisuals: ProfessionVisualIdentity[] =
      [];
    const reservedPlayerCareerVisual =
      playerCareerUniform(
        this.occupation,
        s.id,
        this.gender,
        this.heritage
      );
    if (reservedPlayerCareerVisual) {
      reservedProfessionVisuals.push(
        reservedPlayerCareerVisual
      );
    }
    for (const role of ["mother", "father"] as const) {
      const profession = parentProfessionSpec(
        role,
        this.parentCareerIds,
        this.heritage
      );
      if (profession) {
        reservedProfessionVisuals.push(profession);
      }
    }
    return [
      ...base,
      ...professionLifeOptions(
        this.lifeSeed,
        s.id,
        3,
        reservedProfessionVisuals.length
          ? reservedProfessionVisuals
          : undefined
      ),
    ];
  }

  /**
   * Keep your parents and sibling in the family area through the whole first half
   * of life, not just the cot. They appear from birth until you reach middle age
   * (the midlife chapter, age 36) — aging as you age (👩→👵, 👨→👴) — and then
   * they've passed on, leaving the area to your own spouse, kids and grandkids.
   * Only the family members a chapter doesn't already feature are added, so nothing
   * is ever doubled up.
   */
  private withFamilyPresence(base: LifeOption[], s: Stage): LifeOption[] {
    if (this.biography || s.ageStart >= FAMILY_PARENTS_UNTIL) return base;
    const present = (k: PersonKind) => base.some((o) => o.person === k);
    const elderly = s.ageStart >= 30; // by the time you're a grown adult, they're white-haired
    const extra: LifeOption[] = [];
    if (!present("mother"))
      extra.push({ id: "mum", label: "Mum", icon: elderly ? "👵" : "👩", person: "mother", desc: "Time with Mum — warmth and a proud smile, however old you grow.", category: "social", effects: { happiness: 7, health: 2 }, storyTag: "family_love" });
    if (!present("father"))
      extra.push({ id: "dad", label: "Dad", icon: elderly ? "👴" : "👨", person: "father", desc: "Dad's still in your corner — a word of advice and a clap on the back.", category: "social", effects: { happiness: 6, fun: 3 }, storyTag: "family_love" });
    if (!present("sibling") && !present("babySibling"))
      extra.push({ id: "sibling", label: "Sibling", icon: "🧑", person: "sibling", desc: "Your brother or sister — a partner in crime through all of it.", category: "social", effects: { happiness: 6, fun: 3 }, storyTag: "friends" });
    return extra.length ? [...base, ...extra] : base;
  }

  /**
   * Parent careers add identity and conversation context only. Keeping this as
   * a shallow option decoration preserves every authored effect, cost, earning,
   * support rule, and story tag unchanged.
   */
  private withParentCareerDetails(
    options: LifeOption[]
  ): LifeOption[] {
    return options.map((option) => {
      const role =
        option.person === "mother"
          ? "mother"
          : option.person === "father"
            ? "father"
            : null;
      if (!role) return option;
      const occupation = parentOccupation(
        role,
        this.parentCareerIds
      );
      if (!occupation) return option;
      const roleLabel =
        role === "mother" ? "Mum" : "Dad";
      const professionNpc = parentProfessionSpec(
        role,
        this.parentCareerIds,
        this.heritage
      );
      return {
        ...option,
        label: `${roleLabel} · ${occupation.name}`,
        desc: `${option.desc} ${roleLabel}'s job: ${occupation.name}.`,
        ...(professionNpc ? { professionNpc } : {}),
      };
    });
  }

  /** Keep the chosen partner's name and identity visible in every later room. */
  private withPartnerDetails(
    options: LifeOption[]
  ): LifeOption[] {
    if (!this.partner) return options;
    return options.map((option) =>
      option.person === "spouse"
        ? {
            ...option,
            label: this.partner!.name,
            icon: this.partner!.emoji,
            desc: `${this.partner!.name}, ${this.partner!.title}. ${option.desc}`,
          }
        : option
    );
  }

  /** Reduce a loaded biography moment to known-safe fields (localStorage is untrusted,
   *  so it can never carry a house/vehicle picker, a gamble, a cost or a one-off flag). */
  private sanitizeMoment(m: LifeOption): LifeOption {
    return {
      id: String(m.id ?? "bm"),
      label: String(m.label ?? "A moment"),
      icon: String(m.icon ?? "📌"),
      desc: String(m.desc ?? ""),
      category: m.category ?? "special",
      effects: m.effects && typeof m.effects === "object" ? m.effects : {},
      ...(typeof m.earn === "number" && isFinite(m.earn) ? { earn: m.earn } : {}),
      ...(m.person ? { person: m.person } : {}),
      storyTag: "bio_moment",
    };
  }

  /** Sort each choice into a kind: people are static, junk/screen-time CHASE you
   *  (bad), pickers are static (neutral), and free beneficial items FLEE (good). */
  private classifyOption(opt: LifeOption): { kind: StationKind; guard?: string } {
    if (opt.person) return { kind: "person" };
    // The first two chapters teach deliberate movement and interaction. Arcade
    // pursuit, hazards and the inventory arrive only after that foundation.
    if (this.stageIndex < 2) return { kind: "neutral" };
    if (this.isBadSocialOption(opt)) return { kind: "bad", guard: opt.storyTag === "smoker_friend" ? "fit" : "focus" };
    if (opt.opensHousePicker || opt.opensVehiclePicker || opt.opensCareerDesk || opt.gamble || opt.invest || opt.moneyMgmt || opt.category === "special")
      return { kind: "neutral" };
    const t = opt.storyTag;
    if (opt.treat) return { kind: "good" }; // candy & sweets: a treat you collect & can gift
    if (t === "junkfood") return { kind: "bad", guard: "diet" }; // avoid by eating well
    if (BAD_FIT_TAGS.includes(t ?? "")) return { kind: "bad", guard: "fit" }; // avoid by staying fit
    if (BAD_FOCUS_TAGS.includes(t ?? "")) return { kind: "bad", guard: "focus" }; // avoid by staying grounded
    return { kind: "good" };
  }

  private buildStations(): void {
    const opts = this.currentOptions();
    const xStart = 100;
    const xEnd = W - 120;
    const totals: Record<StationZone, number> = { social: 0, family: 0 };
    for (const opt of opts) totals[this.stationZone(opt)]++;
    const counts: Record<StationZone, number> = { social: 0, family: 0 };
    // Spread choices across each half of the taller room. Common good/bad
    // items get their velocity in moveStations; people and pickers stay put.
    this.stations = opts.map((opt) => {
      const c = this.classifyOption(opt);
      const zone = this.stationZone(opt);
      const zoneIndex = counts[zone]++;
      const zoneTotal = totals[zone];
      const rows = this.zoneRows(zone);
      const peerIdentity =
        c.kind === "person" &&
        opt.person &&
        isSameStagePeerKind(opt.person)
          ? peerVisualIdentity(this.lifeSeed, opt.person)
          : null;
      return {
        x: zoneTotal === 1 ? (xStart + xEnd) / 2 : xStart + ((xEnd - xStart) * zoneIndex) / (zoneTotal - 1),
        y: rows[zoneIndex % rows.length],
        opt,
        kind: c.kind,
        zone,
        appearance:
          c.kind === "person"
            ? peerIdentity?.appearance ??
              this.appearanceForNpc(opt)
            : undefined,
        heritage:
          c.kind === "person"
            ? opt.professionNpc?.heritage ??
              peerIdentity?.heritage ??
              this.heritageForNpc(opt)
            : undefined,
        guard: c.guard,
        contactCd: 0,
        satiated: 0,
      } as Station;
    });
    this.people = this.stations.filter((s) => s.kind === "person");
    const portraitLooks = this.people
      .filter(
        (station) =>
          !station.opt.professionNpc ||
          station.opt.person === "mother" ||
          station.opt.person === "father"
      )
      .map((station) =>
        personLook(
          station.opt.person!,
          this.gender,
          this.stageIndex,
          station.heritage ?? this.heritage,
          station.appearance ??
            this.appearanceForNpc(station.opt),
          station.opt.person === "spouse"
            ? this.partner?.gender
            : undefined
        )
      );
    void warmStorybookPortraits(portraitLooks);
    const lifeSeason = this.currentLifeSeason();
    for (const station of this.people) {
      const profession = station.opt.professionNpc;
      if (!profession) continue;
      void warmJobCharacterAtlases(
        profession.heritage,
        profession.gender,
        profession.uniform,
        jobArtSeasonFor(
          profession.uniform,
          lifeSeason
        )
      );
    }
  }

  private stationZone(opt: LifeOption): StationZone {
    if (this.isFamilyOption(opt)) return "family";
    if (opt.person) return "social";
    const tag = opt.storyTag ?? "";
    const socialTags = [
      "friends",
      "love",
      "sports",
      "exercise",
      "play_active",
      "travel",
      "party",
      "music",
      "hobby",
      "network",
      "volunteer",
      "date",
      "gamble",
      "cigarette",
      "beer",
      "wine",
      "whisky",
    ];
    if (opt.category === "social" || socialTags.includes(tag)) return "social";
    return "family";
  }

  private isFamilyOption(opt: LifeOption): boolean {
    const familyPeople: PersonKind[] = ["mother", "father", "grandma", "grandpa", "babySibling", "sibling", "spouse", "baby", "child", "grandkid"];
    if (opt.person && familyPeople.includes(opt.person)) return true;
    const tag = opt.storyTag ?? "";
    return tag === "family" || tag === "family_love" || tag === "grandkids" || tag === "toy_doll" || opt.id === "baby";
  }

  private isBadSocialOption(opt: LifeOption): boolean {
    return !!opt.person && !!opt.storyTag && BAD_SOCIAL_TAGS.includes(opt.storyTag);
  }

  private clearsBadPeerPressure(opt: LifeOption): boolean {
    const stage = STAGES[this.stageIndex]?.id;
    return (stage === "high" || stage === "university") &&
      !this.isBadSocialOption(opt) &&
      !!opt.storyTag &&
      GOOD_PEER_TAGS.includes(opt.storyTag);
  }

  private clearBadPeerPressure(): void {
    const removed = this.stations.filter((st) => st.opt.storyTag && BAD_SOCIAL_TAGS.includes(st.opt.storyTag));
    if (removed.length === 0) return;
    for (const st of removed) {
      this.floats.push({ x: st.x, y: st.y - 42, text: "👋 bad crowd left", color: "#7fd0a0", life: 1.5 });
    }
    this.stations = this.stations.filter((st) => !st.opt.storyTag || !BAD_SOCIAL_TAGS.includes(st.opt.storyTag));
    this.people = this.stations.filter((s) => s.kind === "person");
    this.focusIndex = -1;
    this.hint("Good friends pulled you away from the bad crowd.");
  }

  private shouldSitWithNewborn(st: Station): boolean {
    const babyCenterX = this.px;
    const babyCenterY = this.py - 32;
    const dx = babyCenterX - st.x;
    const dy = babyCenterY - st.y;
    return this.stageIndex === 0 &&
      st.kind === "person" &&
      !!st.opt.person &&
      this.isFamilyOption(st.opt) &&
      Math.hypot(dx, dy) <= BABY_FAMILY_SIT_R;
  }

  private zoneRows(zone: StationZone): number[] {
    const bounds = this.zoneBounds(zone);
    return [bounds.min, (bounds.min + bounds.max) / 2, bounds.max];
  }

  private familyZoneShare(): number {
    const id = STAGES[this.stageIndex]?.id;
    if (id === "newborn" || id === "toddler" || id === "early") return 0.64;
    if (id === "elementary" || id === "middle" || id === "high") return 0.54;
    if (id === "university" || id === "career") return 0.34;
    if (id === "marriage" || id === "midlife") return 0.42;
    if (id === "senior" || id === "retirement") return 0.5;
    return 0.5;
  }

  private zoneSplitY(): number {
    const playable = FAMILY_Y_MAX - SOCIAL_Y_MIN;
    return Math.round(FAMILY_Y_MAX - playable * this.familyZoneShare());
  }

  private upperScene(): UpperSceneKind {
    const scenes = STAGES[this.stageIndex]?.upperScenes ?? ["park"];
    if (scenes.length <= 1) return scenes[0] ?? "park";
    return scenes[Math.floor(this.renderTime / 12) % scenes.length];
  }

  private currentLifeSeason(): LifeSeason | null {
    const stage = STAGES[this.stageIndex];
    return stage ? lifeSeasonAt(stage.id, this.age) : null;
  }

  private currentPlayerBodyVariant() {
    return playerBodyVariantAtAge({
      occupation: this.occupation,
      stageId: STAGES[this.stageIndex]?.id ?? "",
      age: this.age,
      gender: this.gender,
      heritage: this.heritage,
    });
  }

  private zoneBounds(zone: StationZone): { min: number; max: number } {
    const splitY = this.zoneSplitY();
    if (zone === "social") {
      return { min: SOCIAL_Y_MIN, max: Math.max(SOCIAL_Y_MIN + MIN_ZONE_HEIGHT, splitY - ZONE_GATE_GAP) };
    }
    return {
      min: Math.min(FAMILY_Y_MAX - MIN_ZONE_HEIGHT, splitY + ZONE_GATE_GAP),
      max: FAMILY_Y_MAX,
    };
  }

  private petFacingToward(
    dx: number,
    dy: number,
    fallback: AvatarFacing = this.petFacing
  ): AvatarFacing {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return fallback;
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "back" : "front";
  }

  private placePetInRoom(x = this.px + 86, y = this.py + 48): void {
    if (!this.petKind) return;
    const bounds = this.zoneBounds("family");
    this.petX = Math.max(78, Math.min(W - 112, x));
    this.petY = Math.max(bounds.min + 24, Math.min(bounds.max - 4, y));
    this.petFacing = this.petFacingToward(
      this.px - this.petX,
      this.py - this.petY
    );
    this.petMoving = false;
  }

  private adoptPet(kind: PetKind, x = this.px + 70, y = this.py + 36): void {
    this.petAdopted = true;
    this.petKind = kind;
    this.petHappyCd = 1.6;
    this.petWalkPhase = 0;
    this.petMoving = false;
    void warmStorybookPetAtlases(kind);
    this.placePetInRoom(x, y);
  }

  private updatePet(dt: number): void {
    if (!this.petKind) return;
    if (this.petHappyCd > 0) this.petHappyCd = Math.max(0, this.petHappyCd - dt);
    const bounds = this.zoneBounds("family");

    if (this.petKind === "cat") {
      this.petMoving = false;
      this.petWalkPhase += dt * 1.2;
      this.petX = Math.max(78, Math.min(W - 112, this.petX));
      this.petY = Math.max(bounds.min + 24, Math.min(bounds.max - 4, this.petY));
      this.petFacing = this.petFacingToward(
        this.px - this.petX,
        this.py - this.petY
      );
      if (this.petHappyCd <= 0) {
        this.petHappyCd = CAT_PURR_INTERVAL;
        this.applyEff({ happiness: CAT_PURR_HAPPY }, "mental");
        this.floats.push({ x: this.petX, y: this.petY - 58, text: "🐱 purr", color: "#ffd23f", life: 1.1 });
      }
      return;
    }

    const [offsetX, offsetY] = PET_FOLLOW_OFFSETS[this.facing];
    const targetX = Math.max(
      78,
      Math.min(W - 112, this.px + offsetX)
    );
    const targetY = Math.max(
      bounds.min + 24,
      Math.min(bounds.max - 4, this.py + offsetY)
    );
    const dx = targetX - this.petX;
    const dy = targetY - this.petY;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 22) {
      this.petMoving = true;
      const sp = PET_FOLLOW_SPEED * (d > 140 ? 1.25 : 1);
      this.petX += (dx / d) * sp * dt;
      this.petY += (dy / d) * sp * dt;
      this.petFacing = this.petFacingToward(dx, dy);
      this.petWalkPhase += dt * 10;
    } else {
      this.petMoving = false;
      this.petWalkPhase += dt * 3;
    }

    this.petX = Math.max(78, Math.min(W - 112, this.petX));
    this.petY = Math.max(bounds.min + 24, Math.min(bounds.max - 4, this.petY));
    if (Math.hypot(this.px - this.petX, this.py - this.petY) <= PET_HAPPY_R && this.petHappyCd <= 0) {
      this.petHappyCd = PET_HAPPY_COOLDOWN;
      this.applyEff({ happiness: 2 }, "mental");
      this.floats.push({ x: this.petX, y: this.petY - 58, text: "🐶 +happy", color: "#ffd23f", life: 1.25 });
      this.hint("Your dog ran up to you. +2 Happy.");
    }
  }

  // --- per-stage balance helpers -------------------------------------------

  private stageStep(): number {
    return this.baseStageStep() * this.lifeSpeed;
  }

  private baseStageStep(): number {
    const s = STAGES[this.stageIndex];
    return chapterAgeStep(s.ageStart, s.ageEnd);
  }

  private optionAgeCost(opt: LifeOption): number {
    return (opt.ageCost ?? this.baseStageStep()) * this.lifeSpeed;
  }

  private nearestLifeSpeedIndex(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return LIFE_SPEED_DEFAULT_INDEX;
    let best = LIFE_SPEED_DEFAULT_INDEX;
    let bestDelta = Number.POSITIVE_INFINITY;
    LIFE_SPEEDS.forEach((speed, i) => {
      const delta = Math.abs(Math.log2(value / speed));
      if (delta < bestDelta) {
        best = i;
        bestDelta = delta;
      }
    });
    return best;
  }

  private lifeSpeedIndex(): number {
    return this.nearestLifeSpeedIndex(this.lifeSpeed);
  }

  private setLifeSpeedIndex(index: number): void {
    const raw = Number.isFinite(index) ? index : LIFE_SPEED_DEFAULT_INDEX;
    const safe = Math.max(LIFE_SPEED_MIN_INDEX, Math.min(LIFE_SPEED_MAX_INDEX, Math.round(raw)));
    this.lifeSpeed = LIFE_SPEEDS[safe];
    this.renderHud();
  }

  private setLifeSpeed(value: number): void {
    this.setLifeSpeedIndex(this.nearestLifeSpeedIndex(value));
  }

  private lifeSpeedInputAttrs(): string {
    return `min="${LIFE_SPEED_MIN_INDEX}" max="${LIFE_SPEED_MAX_INDEX}" step="1" value="${this.lifeSpeedIndex()}"`;
  }

  private lifeSpeedLabel(): string {
    if (this.lifeSpeed < 1) return `1/${Math.round(1 / this.lifeSpeed)}x`;
    return `${this.lifeSpeed}x`;
  }

  private normalizeStageIndex(i: number): number {
    return Math.max(0, Math.min(STAGES.length - 1, Math.round(Number.isFinite(i) ? i : 0)));
  }

  private normalizeHeritage(value: string | null | undefined): HeritageStyle {
    const found = HERITAGE_OPTIONS.find((o) => o.id === value);
    return found?.id ?? "western";
  }

  private normalizePetFacing(
    value: string | null | undefined,
    fallback: AvatarFacing = "front"
  ): AvatarFacing {
    return value === "left" ||
      value === "right" ||
      value === "front" ||
      value === "back"
      ? value
      : fallback;
  }

  private normalizePetKind(
    value: string | null | undefined
  ): PetKind | null {
    return value === "dog" || value === "cat" ? value : null;
  }

  private heritageLabel(): string {
    return HERITAGE_OPTIONS.find((o) => o.id === this.heritage)?.label ?? "Western";
  }

  /** The chapter gate is open once you're old enough — or always, when replaying
   *  a biography (so quiet/short chapters are never a dead end). */
  private doorOpen(): boolean {
    return !!this.biography || this.age >= STAGES[this.stageIndex].ageEnd;
  }

  private nearGate(): boolean {
    return Math.abs(this.py - this.zoneSplitY()) <= GATE_HALF_H;
  }

  /** Higher IQ → faster on your feet, so you can dodge the bad things more easily. */
  private speedFactor(): number {
    return 0.8 + Math.max(0, this.stats.smarts - 40) * 0.005; // iq 40→0.8 … 160→1.4
  }

  private rollFamilyMoney(): number {
    return backgroundMoney("comfortable");
  }

  private normalizeFamilyMoney(value: number): number {
    const raw = Number.isFinite(value) ? value : FAMILY_MONEY_MIN;
    const clamped = Math.max(FAMILY_MONEY_MIN, Math.min(FAMILY_MONEY_MAX, raw));
    return Math.round(clamped / 1000) * 1000;
  }

  private rollParentSupport(familyFund: number): number {
    const rate = 0.025 + Math.pow(Math.random(), 1.7) * 0.06;
    const raw = Math.max(PARENT_SUPPORT_MIN, Math.min(PARENT_SUPPORT_MAX, familyFund * rate));
    return Math.round(raw / 100) * 100;
  }

  private applyParentSupportForChapter(cur: (typeof STAGES)[number], lines: string[]): void {
    const endAge = Math.min(cur.ageEnd, PARENT_SUPPORT_END_AGE);
    const years = Math.max(0, endAge - cur.ageStart);
    if (years <= 0 || this.parentAnnualSupport <= 0) return;

    const shiftMagnitude = PARENT_INCOME_SHIFT_MIN + Math.random() * (PARENT_INCOME_SHIFT_MAX - PARENT_INCOME_SHIFT_MIN);
    const shift = (Math.random() < 0.58 ? 1 : -1) * shiftMagnitude;
    this.parentAnnualSupport = Math.round(
      Math.max(PARENT_SUPPORT_MIN, Math.min(PARENT_SUPPORT_MAX, this.parentAnnualSupport * (1 + shift))) / 100
    ) * 100;

    const support = Math.round(this.parentAnnualSupport * years);
    this.money += support;
    lines.push(
      `👪 Mommy & Daddy support: +${formatMoney(support)} over these years. Parent income flow ${shift >= 0 ? "+" : "−"}${Math.round(Math.abs(shift) * 100)}%/yr (now ~${formatMoney(this.parentAnnualSupport)}/yr).`
    );
    this.floats.push({ x: this.px, y: this.py - 104, text: `👪 +${formatMoney(support)}`, color: "#3ddc84", life: 1.6 });
  }

  private idCounter = 0;
  /** A short unique-ish id for biographies and their moments. */
  private uid(): string {
    return Date.now().toString(36) + (this.idCounter++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  /** Sample Health, Happiness and IQ each action so longevity rewards STEADY stats. */
  private sampleHealth(): void {
    this.healthSum += this.stats.health;
    this.happinessSum += this.stats.happiness;
    this.smartsSum += this.stats.smarts;
    this.healthCount += 1;
  }

  /** Life expectancy from the running averages of Health, Happiness and IQ (+ genes). */
  private lifeExp(): number {
    const n = this.healthCount || 1;
    const le = lifeExpectancy(this.healthSum / n, this.happinessSum / n, this.smartsSum / n) + this.geneBonus;
    return Math.round(Math.max(45, Math.min(120, le)));
  }

  private yearsHeld(purchaseAge: number | undefined): number {
    return Math.max(0, this.age - (purchaseAge ?? Math.max(18, this.age)));
  }

  private houseAppreciationRate(h: HouseTier): number {
    const step = (HOUSE_APPRECIATION_MAX - HOUSE_APPRECIATION_MIN) / 4;
    return HOUSE_APPRECIATION_MIN + (Math.max(1, Math.min(5, h.quality)) - 1) * step;
  }

  private houseAssetValue(h: HouseTier, index: number): number {
    const years = this.yearsHeld(this.homePurchaseAges[index]);
    return Math.round(h.cost * Math.pow(1 + this.houseAppreciationRate(h), years));
  }

  private vehicleAssetValue(v: VehicleTier): number {
    const years = this.yearsHeld(this.vehiclePurchaseAges.get(v.id));
    const valueRatio = Math.max(0.18, Math.pow(1 - VEHICLE_DEPRECIATION, years));
    return Math.round(v.cost * valueRatio);
  }

  private ownedVehicles(): VehicleTier[] {
    return VEHICLES.filter((v) => this.owned.has("veh_" + v.id));
  }

  /** Net worth in dollars: cash + stocks + appreciated property + depreciated vehicles. */
  private netWorth(): number {
    let nw = this.money + this.investments;
    for (const a of MARKET_ASSETS) nw += this.holdings[a.key] * this.market[a.key];
    this.homes.forEach((h, i) => { nw += this.houseAssetValue(h, i); });
    for (const v of this.ownedVehicles()) nw += this.vehicleAssetValue(v);
    return nw;
  }

  /** Income multiplier from IQ — smart people earn more (1 + 0.012*(IQ-100)). */
  private incomeMul(): number {
    return Math.max(0.3, 1 + 0.012 * (this.stats.smarts - 100));
  }

  /** Recompute the derived Health score (0..120) from its three pillars + weight. */
  private recomputeHealth(): void {
    this.stats.health = composeHealth(this.muscle, this.nutrition, this.mental, this.weight);
  }

  /**
   * Add a health delta to the right pillar — or, for a "split" (general) effect,
   * nudge ALL three pillars by the full delta so the composed Health score moves
   * by exactly that delta (composeHealth's pillar weights sum to 1).
   */
  private routeHealth(h: number, kind: "muscle" | "nutrition" | "mental" | "split"): void {
    if (kind === "muscle") this.muscle = clampStat(this.muscle + h);
    else if (kind === "nutrition") this.nutrition = clampStat(this.nutrition + h);
    else if (kind === "mental") this.mental = clampStat(this.mental + h);
    else {
      this.muscle = clampStat(this.muscle + h);
      this.nutrition = clampStat(this.nutrition + h);
      this.mental = clampStat(this.mental + h);
    }
  }

  /**
   * Apply effects, routing any `health` delta into the health pillars (which
   * pillar depends on the source — exercise→muscle, food→nutrition, people→
   * mental) and recomposing the overall Health score. All non-health effects
   * (happiness/fun/IQ) go through the normal clamps.
   */
  private applyEff(eff: Partial<Stats>, kind: "muscle" | "nutrition" | "mental" | "split" = "split"): void {
    const h = eff.health;
    if (h === undefined) {
      this.stats = applyEffects(this.stats, eff);
      return;
    }
    const rest = { ...eff };
    delete rest.health;
    this.stats = applyEffects(this.stats, rest);
    this.routeHealth(h, kind);
    this.recomputeHealth();
  }

  /** Which health pillar an option's health effect should feed. */
  private healthKindFor(opt: LifeOption): "muscle" | "nutrition" | "mental" | "split" {
    if (this.isBadSocialOption(opt)) return "split";
    if (opt.category === "health") return "muscle";
    if (opt.person || opt.category === "social") return "mental";
    if (opt.category === "food") return "nutrition";
    const t = opt.storyTag;
    if (BAD_FIT_TAGS.includes(t ?? "")) return "muscle";
    if (t === "sleep" || t === "rest" || t === "sleep_baby") return "mental";
    return "split";
  }

  /** A partner-specific later-life event. Individual variation replaces the
   *  old gender-determined timing. */
  private spouseDeathAge(): number {
    return partnerLifeAge(this.partner?.id ?? "companion");
  }

  private passiveTick(): void {
    const s = this.stats;
    // modern life drifts toward weight gain
    this.weight = clampStat(this.weight + 0.13);
    // the three health pillars drift on their own between deliberate choices:
    //  • muscle atrophies without training (worse with age + out-of-band weight)
    this.muscle = clampStat(this.muscle - (0.5 + this.age * 0.012) - weightHealthDrain(this.weight));
    //  • diet reverts toward a mediocre baseline unless you keep eating well
    this.nutrition = clampStat(this.nutrition + (45 - this.nutrition) * 0.04);
    //  • mental wellbeing tracks your happiness, and loneliness (no fun) erodes it
    this.mental = clampStat(this.mental + (s.happiness - this.mental) * 0.05 - (s.fun < 25 ? 0.6 : 0));
    s.fun = clampStat(s.fun - 0.45);
    s.happiness = clampStat(s.happiness - 0.25);
    // IQ drifts down slowly, faster in old age (crystallised knowledge cushions it)
    const iqDecay = this.age > 80 ? 0.3 : this.age > 70 ? 0.18 : this.age > 55 ? 0.08 : 0.03;
    s.smarts = clampIq(s.smarts - iqDecay);
    // cost of living (you become independent at 18) + home upkeep, eased by high
    // stats — a thriving life is cheaper to sustain. Floored at $0 (no debt).
    if (this.age >= 18 || this.occupation) {
      const living = 6000 * activityDiscount(s) + this.houseUpkeep;
      this.money = Math.max(0, this.money - Math.round(living));
    } else if (this.houseUpkeep) {
      this.money = Math.max(0, this.money - Math.round(this.houseUpkeep));
    }
    // knock-on effects that wire the meters together (poverty stress, loneliness…)
    const fx = crossEffects(s, this.money);
    this.routeHealth(fx.health, "split"); // poverty/comfort touch the body & mind
    s.happiness = clampStat(s.happiness + fx.happiness);
    // being very over/under-weight is also a little dispiriting
    const ws = weightStatus(this.weight);
    if (ws === "obese" || ws === "underweight") s.happiness = clampStat(s.happiness - 0.25);
    // recompose Health from the (now-updated) pillars + weight
    this.recomputeHealth();
  }

  // --- actions --------------------------------------------------------------

  private doAction(): void {
    if (this.mode !== "playing" || this.cooldown > 0) return;

    // near the open gate? walk through to advance (also handy on touch)
    if (this.focusIndex < 0) {
      if (this.canShowTrainingGate() && this.nearTrainingGate()) {
        this.showTraining();
        return;
      }
      if (this.canShowAssetsGate() && this.nearAssetsGate()) {
        this.showAssets();
        return;
      }
      if (this.canShowFamilyTreeGate() && this.nearFamilyTreeGate()) {
        this.showFamilyTree();
        return;
      }
      if (this.doorOpen() && this.px > DOOR_X - 36 && this.nearGate()) this.advanceStage();
      return;
    }

    const st = this.stations[this.focusIndex];
    if (st.kind === "event") {
      this.cooldown = 0.2;
      this.collectEventItem(st);
      return;
    }
    if (st.kind === "bad") return; // bad things aren't pressed — they catch you
    const opt = st.opt;
    if (opt.once && this.usedOnce.has(opt.id)) {
      this.hint("You already did that this chapter.");
      return;
    }
    if (opt.permanent && this.owned.has(opt.id)) {
      this.hint("You already own that.");
      return;
    }

    // buying a house / vehicle opens a picker instead of applying a normal action
    if (opt.opensHousePicker) {
      this.mode = "house";
      this.showHouse();
      return;
    }
    if (opt.opensVehiclePicker) {
      if (!VEHICLES.some((v) => !this.owned.has("veh_" + v.id))) {
        this.hint("You already own every vehicle!");
        return;
      }
      this.mode = "vehicle";
      this.showVehicle();
      return;
    }
    // the career desk opens the change-job / promotion picker
    if (opt.opensCareerDesk) {
      this.mode = "careermove";
      this.showCareerMove();
      return;
    }

    // Affordability gate: a cost / invest / gamble stake can't be paid when broke.
    const gateCost = opt.cost ? Math.round(opt.cost * activityDiscount(this.stats)) : 0;
    const price = gateCost + (opt.invest ?? 0) + (opt.gamble?.stake ?? 0);
    if (price > 0 && this.money < price) {
      this.hint("💸 Not enough money for that.");
      return;
    }
    this.cooldown = 0.28;
    this.markGuideSeen();
    if (st.kind === "person") {
      // interacting with a person → announce who + the point change in the sky
      const before = {
        health: this.stats.health,
        happiness: this.stats.happiness,
        fun: this.stats.fun,
        smarts: this.stats.smarts,
        money: this.money,
      };
      this.applyOption(opt);
      this.showOptionSky(opt, before);
      if (this.mode === "playing") {
        const wellbeingDelta =
          this.stats.health -
          before.health +
          (this.stats.happiness - before.happiness);
        const positive =
          !this.isBadSocialOption(opt) && wellbeingDelta >= 0;
        this.startPersonReaction(st, "talk", positive);
      }
    } else {
      this.applyOption(opt);
    }
  }

  private startPersonReaction(
    station: Station,
    kind: PersonReaction["kind"],
    positive: boolean
  ): void {
    if (!station.opt.person || this.mode !== "playing") return;
    this.personReaction = {
      targetId: station.opt.id,
      person: station.opt.person,
      startedAt: this.renderTime,
      endsAt: this.renderTime + PERSON_REACTION_SECONDS,
      positive,
      kind,
    };
  }

  private currentPersonReaction() {
    const reaction = this.personReaction;
    if (!reaction) return null;
    const target = this.stations.find(
      (station) =>
        station.opt.id === reaction.targetId &&
        station.opt.person === reaction.person
    );
    if (!target) return null;
    return {
      target,
      expressions: interactionExpressionsAt(
        this.reducedMotion
          ? 0
          : this.renderTime - reaction.startedAt,
        reaction.person,
        reaction.positive
      ),
    };
  }

  /**
   * Apply a choice's full outcome — effects, money, weight, ageing, habits and
   * events. Used when you press deliberate choices, touch common good items, or
   * when a BAD thing catches you. Gating + pickers are the caller's job.
   */
  private applyOption(opt: LifeOption): void {
    const s = STAGES[this.stageIndex];
    const discount = activityDiscount(this.stats);
    const realCost = opt.cost ? Math.round(opt.cost * discount) : 0;
    const badSocial = this.isBadSocialOption(opt);

    const eff: Partial<Stats> = { ...opt.effects };
    // healthy choices pay off faster: eating well and exercising build health
    // at 1.6x so a good routine visibly beats decay
    if ((opt.category === "food" || opt.category === "health") && (eff.health ?? 0) > 0) {
      eff.health = Math.round(eff.health! * 1.6);
    }
    // IQ never jumps. Risky peer pressure gets a stronger visible penalty than
    // ordinary distractions, but it is still capped to avoid one-contact ruin.
    if (eff.smarts !== undefined) {
      eff.smarts = badSocial && eff.smarts < 0 ? Math.max(-4, eff.smarts * 0.55) : dampIqGain(eff.smarts);
    }

    let moneyDelta = 0;
    // earnings (work, chores) — scaled by IQ × your occupation's pay when relevant
    if (opt.earn) {
      let amt = opt.earn;
      if (opt.scalesWithSmarts) amt *= this.incomeMul() * (this.occupation?.salaryMul ?? 1);
      amt = Math.round(amt);
      moneyDelta += amt;
      if (amt > 0) this.lifetimeEarned += amt; // lifetime career earnings (for the profile)
    }
    // your professional network grows when you spend time with people / network
    if (opt.storyTag === "network") this.connections += 20 + Math.floor(Math.random() * 21);
    else if (!badSocial && (opt.person || opt.category === "social")) this.connections += 1 + Math.floor(Math.random() * 3);
    // pay any up-front (already-discounted) cost
    if (realCost) moneyDelta -= realCost;
    // buying stocks moves the stake out of cash and into the market pot
    if (opt.invest) {
      this.investments += opt.invest;
      moneyDelta -= opt.invest;
      this.floats.push({ x: this.px, y: this.py - 104, text: "📈", color: "#5db8ff", life: 1.3 });
    }
    // learning money management switches on smarter, steadier returns for life
    if (opt.moneyMgmt) this.moneyWise = true;

    // doing a GOOD thing makes its BAD counterpart back off — eat well and junk
    // food freezes & fades; play sport OR spend time with family and screen-time
    // / all-night gaming stops chasing you (you're "full" of it for a while).
    if (opt.category === "food" && (opt.effects.health ?? 0) > 0) this.satiateBad("diet");
    if (!badSocial && (opt.category === "health" || opt.person || opt.category === "social")) this.satiateBad("fit");
    if (!badSocial && (opt.category === "smarts" || opt.storyTag === "study" || opt.storyTag === "friends" || opt.storyTag === "sports")) this.satiateBad("focus");
    if (this.clearsBadPeerPressure(opt)) this.clearBadPeerPressure();

    // try-your-luck: roll the gamble and fold the dollar outcome in
    let gambleClause: string | null = null;
    if (opt.gamble) {
      const g = opt.gamble;
      moneyDelta -= g.stake;
      const r = Math.random();
      if (r < g.jackpotChance) {
        moneyDelta += g.jackpot;
        eff.happiness = (eff.happiness ?? 0) + 10;
        gambleClause = g.jackpotStory;
        this.floats.push({ x: this.px, y: this.py - 102, text: "✨ JACKPOT!", color: "#ffd23f", life: 1.7 });
      } else if (r < g.jackpotChance + g.prizeChance) {
        moneyDelta += g.prize;
        eff.happiness = (eff.happiness ?? 0) + 4;
        gambleClause = g.prizeStory;
      } else {
        eff.happiness = (eff.happiness ?? 0) - 3;
        gambleClause = g.bustStory;
      }
    }
    // one-off lifetime purchases/skills are remembered so they don't reappear
    if (opt.permanent) this.owned.add(opt.id);
    // family time invested unlocks grandkids in old age
    if (opt.storyTag === "family" || opt.id === "baby") this.familyBond += 1;

    this.money = Math.max(0, this.money + moneyDelta);
    this.applyEff(eff, this.healthKindFor(opt));
    // spending real time with people is a direct boost to mental wellbeing
    if (opt.person && !badSocial) {
      this.mental = clampStat(this.mental + 3);
      this.recomputeHealth();
    }
    if (gambleClause) this.eventsLog.push(gambleClause);
    if (moneyDelta !== 0)
      this.floats.push({ x: this.px, y: this.py - 88, text: `${moneyDelta > 0 ? "+" : "−"}${formatMoney(Math.abs(moneyDelta))}`, color: moneyDelta > 0 ? "#3ddc84" : "#ff9f6b", life: 1.4 });

    // body weight: explicit delta, else derived from what kind of action it is
    const wDelta = opt.weight ?? this.autoWeightDelta(opt);
    this.weight = clampStat(this.weight + wDelta);

    this.age += this.optionAgeCost(opt);
    this.passiveTick();
    this.sampleHealth();
    if (opt.once) {
      this.usedOnce.add(opt.id);
      this.renderFocusPanel(); // reflect the "already done" state
    }
    if (opt.id === "baby") this.hadChild = true;

    // "good habits" book: reading it adds up — 5+ reads pays off in lasting health
    let habitBonus = 0;
    if (opt.habit) {
      this.habitCount += 1;
      if (this.habitCount === 5) {
        this.applyEff({ health: 15, happiness: 5 }, "split");
        habitBonus = 15;
        this.hint("📗 Your good habits stuck for life! +15 ❤️");
      } else if (this.habitCount > 5) {
        this.applyEff({ health: 4 }, "split");
        habitBonus = 4;
      }
    }

    this.history.push({
      stageId: s.id,
      stageName: s.name,
      optionId: opt.id,
      storyTag: opt.storyTag,
      ageAt: this.age,
    });
    this.spawnFloats(eff, wDelta);
    if (habitBonus) this.floats.push({ x: this.px, y: this.py - 90, text: `+${habitBonus} ❤️`, color: "#ff5d6c", life: 1.3 });

    if (this.stats.health <= 0) return this.finishLife("health", Math.round(this.age));

    // every so often, life throws a surprise (found wallet, lottery, …)
    if (this.mode === "playing") this.maybeFireEvent();
    if (this.history.length === 1) this.recordFunnel("first_action");
    this.persistGame();
  }

  // --- random "Easter egg" events -------------------------------------------

  /** Whether an event is eligible right now (age, once, and per-life tier caps). */
  private eventEligible(e: RandomEvent): boolean {
    if (e.once && this.usedEvents.has(e.id)) return false;
    if (this.age < (e.minAge ?? 0) || this.age > (e.maxAge ?? 999)) return false;
    // per-life caps — big/jackpot adults only, pets and jackpots once ever
    if (e.tier === "big" && (this.bigFired || this.age < 18)) return false;
    if (e.tier === "jackpot" && (this.jackpotFired || this.age < 18)) return false;
    if (e.tier === "pet" && this.petAdopted) return false;
    return true;
  }

  private maybeFireEvent(): void {
    if (this.stations.some((st) => st.kind === "event")) return;
    if (this.eventCooldown > 0) {
      this.eventCooldown -= 1;
      return;
    }
    if (Math.random() > 0.16) return; // ~1 in 6 actions once off cooldown
    let pool = EVENTS.filter((e) => this.eventEligible(e));
    // Pity guarantee: by the senior years, if no jackpot has ever fired, give a
    // long, lucky-starved life a real (but still ~once) shot at its one big moment.
    if (!this.jackpotFired && this.stageIndex >= STAGES.length - 3 && Math.random() < 0.25) {
      const jackpots = EVENTS.filter((e) => e.tier === "jackpot" && this.eventEligible(e));
      if (jackpots.length) return this.spawnEventItem(weightedPick(jackpots));
    }
    if (pool.length === 0) return;
    this.spawnEventItem(weightedPick(pool));
  }

  private spawnEventItem(e: RandomEvent): void {
    const zone = this.eventZone(e);
    const pos = this.eventSpawnPosition(zone);
    const category: OptionCategory =
      e.tier === "pet" ? "social" : e.money && e.money > 0 ? "wealth" : "special";
    this.stations.push({
      ...pos,
      opt: {
        id: `event-${e.id}`,
        label: e.title,
        icon: e.emoji,
        desc: e.desc,
        category,
        effects: e.effects,
        storyTag: "easter_event",
      },
      kind: "event",
      zone,
      event: e,
      contactCd: 0,
      satiated: 0,
    });
    this.eventCooldown = 4;
  }

  private eventZone(e: RandomEvent): StationZone {
    if (e.tier === "pet") return "family";
    if (e.good === false) return "social";
    return e.money && e.money > 0 ? "social" : "family";
  }

  private eventSpawnPosition(zone: StationZone): { x: number; y: number } {
    const spawnLeft = this.px > W / 2;
    const bounds = this.zoneBounds(zone);
    const yMid = (bounds.min + bounds.max) / 2;
    for (let tries = 0; tries < 14; tries++) {
      const x = spawnLeft ? 88 + Math.random() * 120 : W - 210 + Math.random() * 120;
      const y = bounds.min + Math.random() * (bounds.max - bounds.min);
      if (Math.hypot(x - this.px, y - this.py) < 150) continue;
      if (this.stations.some((st) => Math.hypot(x - st.x, y - st.y) < 58)) continue;
      return { x, y };
    }
    const fallbackY = Math.max(bounds.min, Math.min(bounds.max, this.py + (this.py < yMid ? 120 : -120)));
    return { x: spawnLeft ? 130 : W - 150, y: fallbackY };
  }

  private collectEventItem(st: Station): void {
    const e = st.event;
    if (!e) return;
    if (e.once) this.usedEvents.add(e.id);
    if (e.tier === "big") this.bigFired = true;
    if (e.tier === "jackpot") this.jackpotFired = true;
    if (e.tier === "pet") this.adoptPet(e.id === "kitten" ? "cat" : "dog", st.x, st.y);
    const i = this.stations.indexOf(st);
    if (i >= 0) this.stations.splice(i, 1);
    this.focusIndex = -1;
    this.markGuideSeen();
    this.applyEff(e.effects, e.tier === "pet" ? "mental" : "split");
    if (e.money) this.money = Math.max(0, this.money + e.money);
    this.eventsLog.push(e.storyClause);
    this.floats.push({
      x: st.x,
      y: st.y - 62,
      text: e.emoji,
      color: e.good === false ? "#ff8a8a" : e.tier === "pet" ? "#ffd23f" : "#3ddc84",
      life: 1.2,
    });
    if (e.money) {
      this.floats.push({
        x: st.x,
        y: st.y - 82,
        text: `${e.money > 0 ? "+" : "−"}${formatMoney(Math.abs(e.money))}`,
        color: e.money > 0 ? "#3ddc84" : "#ff9f6b",
        life: 1.45,
      });
    }
    this.spawnFloats(e.effects);
    if (e.tier === "pet") {
      const petName = this.petKind === "cat" ? "cat" : "dog";
      this.hint(`You adopted a ${petName}. It now lives in the family room.`);
    }
    this.renderFocusPanel();
    if (this.stats.health <= 0) this.finishLife("health", Math.round(this.age));
  }

  /** Body-weight change implied by an option when it has no explicit `weight`. */
  private autoWeightDelta(opt: LifeOption): number {
    // tuned so 1 junk + 1 exercise roughly cancels: balance keeps you healthy,
    // junk-heavy tips you overweight, exercise offsets it.
    if (opt.category === "food") return (opt.effects.health ?? 0) < 0 ? 3 : -1;
    if (opt.category === "health") return -3; // exercise & sports burn it off
    const t = opt.storyTag;
    if (BAD_FIT_TAGS.includes(t ?? "")) return 1.5;
    return 0;
  }

  private spawnFloats(eff: Partial<Stats>, wDelta = 0): void {
    let row = 0;
    const push = (text: string, color: string) => {
      this.floats.push({
        x: this.px + (row % 2 === 0 ? -18 : 18),
        y: this.py - 66 - Math.floor(row / 2) * 14,
        text,
        color,
        life: 1.1,
      });
      row++;
    };
    for (const k of STAT_KEYS) {
      const d = eff[k];
      if (!d) continue;
      const r = Math.round(d);
      if (r === 0) continue;
      push(`${r > 0 ? "+" : ""}${r} ${STAT_META[k].icon}`, r > 0 ? STAT_META[k].color : "#ff7a7a");
    }
    if (Math.abs(wDelta) >= 1) {
      // gaining weight is the "bad" direction, so colour it like a penalty
      push(`${wDelta > 0 ? "+" : ""}${Math.round(wDelta)} ⚖️`, wDelta > 0 ? "#ff9f6b" : "#7fd0a0");
    }
  }

  /** A short "look back over the life so far" shown on each stage transition. */
  private lifeRecap(): string[] {
    const trail = STAGES.slice(0, this.stageIndex + 1).map((s) => s.emoji).join(" → ");
    const s = this.stats;
    let vibe: string;
    if (s.health >= 70 && s.happiness >= 70) vibe = "Healthy and happy so far — a good life.";
    else if (s.health < 35) vibe = "Your health has been fragile — take care of it.";
    else if (s.happiness < 35) vibe = "Happiness has been hard to come by lately.";
    else if (s.health >= 70) vibe = "You're keeping in good health.";
    else if (s.happiness >= 70) vibe = "You've found plenty of joy along the way.";
    else vibe = "Life has had its ups and downs.";
    return [`📖 Your journey so far: ${trail}`, vibe];
  }

  /**
   * Ease IQ toward the age-appropriate average (your potential × age-maturity),
   * within a +/-25 band and a small per-chapter cap — so IQ grows with age in
   * childhood, plateaus, and gently declines, and never jumps.
   */
  private driftIq(): void {
    const target = this.iqCeiling * ageMaturity(this.age);
    const cap = this.age < 16 ? 5 : this.age < 55 ? 1.2 : 1.6;
    const drift = Math.max(-cap, Math.min(cap, (target - this.stats.smarts) * 0.3));
    // Only cap the UPPER side (you can't run far above your age peers). The lower
    // side is governed by the smooth drift + the global floor — never snapped up,
    // so a gifted child's IQ still rises gradually rather than jumping to the band.
    const banded = Math.min(target + 25, this.stats.smarts + drift);
    this.stats.smarts = clampIq(banded);
  }

  private advanceStage(): void {
    if (this.mode !== "playing") return; // never advance twice in one frame
    this.markGuideSeen();
    const cur = STAGES[this.stageIndex];
    const lines: string[] = [`You lived through your ${cur.name} years.`, ...this.lifeRecap()];

    // partner modifiers (and their income/cost) shape every chapter after the wedding
    if (this.partner) {
      this.applyEff(this.partner.modifiers, "split");
      if (this.partner.moneyMod) this.money = Math.max(0, this.money + this.partner.moneyMod);
    }

    this.applyParentSupportForChapter(cur, lines);

    // IQ drifts toward the age-appropriate average each chapter (so it tracks the
    // age curve smoothly and stays within a band of your potential — never snaps)
    this.driftIq();

    // education pays off when you start your career — a smart start means savings
    if (this.stageIndex + 1 === CAREER_INDEX) {
      const bonus = Math.round(Math.max(0, this.stats.smarts - 100) * 1500);
      if (bonus > 0) {
        this.money += bonus;
        lines.push(`Your studying paid off — a ${formatMoney(bonus)} head start on your savings.`);
      }
    }

    // your investment pot compounds between chapters — IQ and money sense grow the
    // returns, but markets can dip too. Realised gains are cashed into your account.
    if (this.investments > 0) {
      const dipChance = this.moneyWise ? 0.1 : 0.18;
      if (Math.random() < dipChance) {
        const loss = 0.08 + Math.random() * 0.16;
        this.investments = Math.max(0, this.investments * (1 - loss));
        lines.push(`📉 Markets dipped — your investments slid to ~${formatMoney(this.investments)}. You hold on.`);
      } else {
        const rate = 0.07 + 0.0014 * (this.stats.smarts - 100) + (this.moneyWise ? 0.04 : 0);
        this.investments *= 1 + Math.max(0, rate);
        const realised = Math.round(this.investments * 0.22);
        this.investments = Math.max(0, this.investments - realised);
        if (realised > 0) {
          this.money += realised;
          lines.push(`📈 Investments grew — you cashed out ${formatMoney(realised)} (pot ~${formatMoney(this.investments)}).`);
        }
      }
      this.investments = Math.min(this.investments, 50000000); // keep the pot sane
    }

    // the tradable market also drifts forward a chapter's worth of years
    const marketYears = STAGES[this.stageIndex] ? Math.max(2, Math.min(14, STAGES[this.stageIndex].ageEnd - STAGES[this.stageIndex].ageStart)) : 5;
    this.stepMarket(marketYears);
    this.growFriends(); // your friendships drift closer (or apart) a little each chapter

    // spare properties pay rent every chapter
    if (this.rentalIncome > 0) {
      this.money += this.rentalIncome;
      lines.push(`🏘️ Rental income: ${formatMoney(this.rentalIncome)} from your ${this.homes.length - 1 > 1 ? "properties" : "spare property"}.`);
    }

    // money nudges happiness with diminishing returns (Kahneman/Killingsworth)
    this.stats.happiness = clampStat(this.stats.happiness + moneyHappinessBias(this.money));
    this.sampleHealth();

    const next = this.stageIndex + 1;
    if (this.stageIndex === 0) this.recordFunnel("first_chapter_complete");
    if (next === CAREER_INDEX) this.recordFunnel("reached_adulthood");

    // A companion may pass in later life. The timing varies by the individual
    // partner rather than being determined by gender.
    if (this.partner && !this.spouseDeceased) {
      const upcomingAge = next < STAGES.length
        ? Math.max(this.age, STAGES[next].ageStart)
        : Math.max(this.age, cur.ageEnd);
      if (upcomingAge >= this.spouseDeathAge()) {
        this.spouseDeceased = true;
        this.applyEff({ happiness: -16, health: -4 }, "mental");
        const who = this.partner.gender === "male" ? "husband" : "wife";
        lines.push(`💔 Your ${who} ${this.partner.name} passed away. You grieve, but carry on.`);
      }
    }

    const le = this.lifeExp();
    if (this.stats.health <= 0) return this.finishLife("health", Math.round(this.age));
    if (next >= STAGES.length) return this.finishLife("natural", Math.round(this.age));
    if (this.age >= le) return this.finishLife(le < 70 ? "health" : "natural", Math.round(this.age));

    lines.push(`Now entering: ${STAGES[next].emoji} ${STAGES[next].name}`);
    this.transitionNext = next;
    this.transitionTimer = 2.4;
    this.mode = "transition";
    this.showTransition(lines);
  }

  private finishLife(cause: CauseOfEnd, deathAge: number): void {
    if (this.mode === "ending") return; // idempotent — only die and measure once
    this.clearSavedGame();
    this.recordFunnel("life_complete");
    this.story = generateStory({
      history: this.history,
      finalStats: this.stats,
      partner: this.partner,
      deathAge,
      cause,
      hadChild: this.hadChild,
      gender: this.gender,
      weight: this.weight,
      occupation: this.occupation,
      homeQuality: this.homeQuality,
      widowed: this.spouseDeceased,
      events: this.eventsLog,
      habitMaster: this.habitCount >= 5,
      vehicles: VEHICLES.filter((v) => this.owned.has("veh_" + v.id)).map((v) => `a ${v.name.toLowerCase()}`),
      moneyWise: this.moneyWise,
      propertiesOwned: this.homes.length,
      money: Math.round(this.money),
      netWorth: Math.round(this.netWorth()),
    });
    this.mode = "ending";
    this.showEnding();
  }

  private pickPartner(p: Partner): void {
    if (this.mode !== "partner" || this.partner) return;
    const chosen = marriageCandidateById(
      this.gender,
      p.id
    );
    if (!chosen) return;
    this.partner = chosen;
    // Stations were built before the picker, when spouse-only options were
    // unavailable. Rebuild now so the chosen spouse enters this chapter.
    this.buildStations();
    this.applyEff({ happiness: 10, health: 2 }, "mental");
    this.history.push({
      stageId: "marriage",
      stageName: "Marriage & Baby",
      optionId: "wed_" + chosen.id,
      storyTag: undefined,
      ageAt: this.age,
    });
    this.timeline[this.stageIndex] = this.snapshot(); // re-capture: now married
    this.mode = "playing";
    this.clearOverlay();
    this.hint(`💍 You married ${chosen.name}, ${chosen.title}!`);
    this.persistGame();
  }

  private pickOccupation(o: Occupation): void {
    this.occupation = o;
    // Career stations were first built before the initial career picker knew
    // the player's job. Rebuild once now so a matching profession NPC receives
    // a different reviewed visual identity.
    this.buildStations();
    this.warmPlayerBodyVariant();
    if (o.perks && !this.jobsTaken.has(o.id)) this.applyEff(o.perks, "split");
    this.jobsTaken.add(o.id);
    this.history.push({
      stageId: "career",
      stageName: "Career",
      optionId: "job_" + o.id,
      storyTag: o.storyTag,
      ageAt: this.age,
    });
    this.timeline[this.stageIndex] = this.snapshot();
    this.hint(`${o.emoji} You became a ${o.name}!`);
    // a second career-start fork: how will you commute to work?
    if (!this.commute) {
      this.mode = "commute";
      this.showCommute();
    } else {
      this.mode = "playing";
      this.clearOverlay();
    }
    this.persistGame();
  }

  private buyHouse(h: HouseTier): void {
    if (this.money < h.cost) {
      this.hint("You can't afford that one yet.");
      return;
    }
    const owningAlready = this.homes.length > 0;
    this.money -= h.cost;
    this.applyEff({ happiness: h.happiness });
    this.homes.push(h);
    this.homePurchaseAges.push(this.age);
    this.recomputeHomes();
    this.age += this.stageStep();
    this.passiveTick();
    this.sampleHealth();
    this.history.push({
      stageId: STAGES[this.stageIndex].id,
      stageName: STAGES[this.stageIndex].name,
      optionId: "house_" + h.id,
      storyTag: owningAlready ? "rental" : "home",
      ageAt: this.age,
    });
    this.mode = "playing";
    this.clearOverlay();
    this.hint(
      owningAlready
        ? `${h.emoji} A second property! You'll rent it out for income.`
        : `${h.emoji} You bought a ${h.name.toLowerCase()}!`
    );
    this.persistGame();
  }

  /**
   * You live in the nicest place you own (that sets the home background and its
   * upkeep); every other property is rented out for a per-stage income.
   */
  private recomputeHomes(): void {
    if (this.homes.length === 0) {
      this.homeQuality = 0;
      this.houseUpkeep = 0;
      this.rentalIncome = 0;
      return;
    }
    let best = this.homes[0];
    for (const h of this.homes) if (h.quality > best.quality) best = h;
    this.homeQuality = best.quality;
    this.houseUpkeep = best.upkeep;
    // the home you live in earns nothing; the rest are rentals
    let rent = 0;
    let usedLiveIn = false;
    for (const h of this.homes) {
      if (h === best && !usedLiveIn) { usedLiveIn = true; continue; }
      rent += h.rentYield;
    }
    this.rentalIncome = rent;
  }

  private liveHome(): HouseTier | null {
    if (this.homes.length === 0) return null;
    let best = this.homes[0];
    for (const h of this.homes) if (h.quality > best.quality) best = h;
    return best;
  }

  private buyVehicle(v: VehicleTier): void {
    const key = "veh_" + v.id;
    if (this.owned.has(key)) {
      this.hint("You already own that.");
      return;
    }
    if (this.money < v.cost) {
      this.hint("You can't afford that one yet.");
      return;
    }
    this.owned.add(key);
    this.vehiclePurchaseAges.set(v.id, this.age);
    this.money -= v.cost;
    this.applyEff(v.effects, "split");
    this.age += this.stageStep();
    this.passiveTick();
    this.sampleHealth();
    this.history.push({
      stageId: STAGES[this.stageIndex].id,
      stageName: STAGES[this.stageIndex].name,
      optionId: "veh_" + v.id,
      storyTag: v.storyTag,
      ageAt: this.age,
    });
    this.spawnFloats(v.effects);
    this.floats.push({ x: this.px, y: this.py - 88, text: `−${formatMoney(v.cost)}`, color: "#ff9f6b", life: 1.4 });
    this.mode = "playing";
    this.clearOverlay();
    this.hint(`${v.emoji} You bought a ${v.name.toLowerCase()}!`);
    this.persistGame();
    if (this.stats.health <= 0) return this.finishLife("health", Math.round(this.age));
  }

  /** A special selection at the start of your career: how do you get to work? */
  private pickCommute(c: CommuteTier): void {
    if (this.netWorth() < c.minNet) {
      this.hint("You can't afford that commute yet.");
      return;
    }
    this.commute = c.id;
    if (c.cost) this.money = Math.max(0, this.money - c.cost);
    this.applyEff(c.effects, "muscle");
    this.history.push({
      stageId: "career",
      stageName: "Career",
      optionId: "commute_" + c.id,
      storyTag: c.storyTag,
      ageAt: this.age,
    });
    this.timeline[this.stageIndex] = this.snapshot();
    this.mode = "playing";
    this.clearOverlay();
    this.hint(`${c.emoji} ${c.name} — that's how you'll get to work.`);
    this.persistGame();
  }

  /** Time travel: jump back to the start of a previously-visited stage. */
  private rewind(stageIndex: number): void {
    const snap = this.timeline[stageIndex];
    if (!snap) return;
    this.gender = snap.gender;
    this.heritage = snap.heritage ?? "western";
    this.parentCareerIds = normalizeParentCareerIds(
      snap.parentCareerIds
    );
    this.appearance = this.normalizeAppearance(snap.appearance);
    this.lifeSeed =
      typeof snap.lifeSeed === "string" && snap.lifeSeed.trim()
        ? snap.lifeSeed
        : `legacy-stage-${stageIndex}`;
    this.stats = { ...snap.stats };
    this.money = snap.money;
    this.weight = snap.weight;
    this.muscle = snap.muscle;
    this.nutrition = snap.nutrition;
    this.mental = snap.mental;
    this.age = snap.age;
    this.commute = snap.commute;
    this.lifetimeEarned = snap.lifetimeEarned;
    this.connections = snap.connections;
    this.familyFund = snap.familyFund;
    this.parentAnnualSupport = snap.parentAnnualSupport;
    this.homes = snap.homeIds.map((id) => HOUSE_TIERS.find((h) => h.id === id)).filter(Boolean) as HouseTier[];
    this.homePurchaseAges = snap.homePurchaseAges?.length
      ? [...snap.homePurchaseAges]
      : this.homes.map(() => Math.max(18, snap.age));
    this.recomputeHomes();
    this.hadChild = snap.hadChild;
    this.familyBond = snap.familyBond;
    this.spouseDeceased = snap.spouseDeceased;
    this.habitCount = snap.habitCount;
    this.investments = snap.investments;
    this.market = snap.market ? { ...snap.market } : { stock: 100, gold: 100, property: 100 };
    this.holdings = snap.holdings ? { ...snap.holdings } : { stock: 0, gold: 0, property: 0 };
    this.friends = this.normalizeFriends(snap.friends ?? []);
    this.friendNextId = snap.friendNextId ?? this.friends.length;
    this.moneyWise = snap.moneyWise;
    this.iqCeiling = snap.iqCeiling;
    this.geneBonus = snap.geneBonus;
    this.owned = new Set(snap.owned);
    this.vehiclePurchaseAges = new Map(snap.vehiclePurchaseAges ?? []);
    this.jobsTaken = new Set(snap.jobsTaken);
    this.usedOnce = new Set(snap.usedOnce ?? []);
    this.inventory = snap.inventory.map((slot) => ({ opt: slot.opt, count: slot.count, eatBy: slot.eatBy }));
    this.selectedInventory = Math.max(0, Math.min(snap.selectedInventory, this.inventory.length - 1));
    this.familyMembers = snap.familyMembers.map((m) => ({ ...m }));
    this.familyEdges = snap.familyEdges.map((e) => ({ ...e }));
    this.familyHiddenIds = new Set(snap.familyHiddenIds);
    this.familySelectedId = snap.familySelectedId;
    this.familyNextId = snap.familyNextId;
    this.bigFired = snap.bigFired;
    this.jackpotFired = snap.jackpotFired;
    this.petAdopted = snap.petAdopted;
    this.petKind = this.normalizePetKind(snap.petKind);
    this.petX = snap.petX ?? 132;
    this.petY = snap.petY ?? 640;
    this.petHappyCd = snap.petHappyCd ?? 0;
    this.petFacing = this.normalizePetFacing(
      snap.petFacing,
      this.petX > this.px ? "left" : "right"
    );
    this.petMoving = false;
    this.petWalkPhase = 0;
    this.usedEvents = new Set(snap.usedEvents);
    this.eventsLog = [...snap.eventsLog];
    this.eventCooldown = 2;
    this.healthSum = snap.healthSum;
    this.happinessSum = snap.happinessSum;
    this.smartsSum = snap.smartsSum;
    this.healthCount = snap.healthCount;
    this.partner = snap.partnerId ? PARTNERS.find((p) => p.id === snap.partnerId) ?? null : null;
    this.occupation = snap.occupationId
      ? OCCUPATIONS.find((o) => o.id === snap.occupationId) ?? null
      : null;
    this.history = this.history.slice(0, snap.historyLen);
    this.floats = [];
    this.skyMessage = null;
    this.personReaction = null;
    this.clearOverlay();
    this.loadStage(stageIndex, true); // restoring: don't re-sample/re-snapshot the entry
    if (this.petKind) {
      this.petFacing = this.normalizePetFacing(
        snap.petFacing,
        this.petFacing
      );
    }
    this.hint(`⏳ You travelled back to age ${Math.floor(this.age)}.`);
  }

  // --- main loop ------------------------------------------------------------

  private frame = (t: number): void => {
    const dt = Math.min(0.05, (t - this.lastTime) / 1000 || 0);
    this.lastTime = t;
    this.renderTime = t / 1000;
    // a single bad frame must never freeze the whole game
    try {
      this.update(dt);
      this.render();
    } catch (err) {
      if (this.frameErrors++ < 5) console.error("[choice-of-life] frame error", err);
    }
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.foodCooldown > 0) this.foodCooldown = Math.max(0, this.foodCooldown - dt);
    if (this.autoHealCd > 0) this.autoHealCd = Math.max(0, this.autoHealCd - dt);
    if (this.mode === "playing") this.tickFoodFreshness(dt);
    if (this.mode === "playing" && this.stageIndex >= 2 && !this.trayTipShown && this.inventory.length === 0) {
      // first playing moment with an empty tray: nudge once — in the sky, not the tray
      this.showSkyTip("🧺 Collect green items — swipe up to eat, or stand by someone to give");
      this.trayTipShown = true;
    }
    // health slipping below average? the tray helps by itself — eat the
    // healthiest collected food automatically
    if (this.mode === "playing" && this.stats.health < 50 && this.autoHealCd <= 0) {
      let best = -1;
      let bestGain = 0;
      for (let i = 0; i < this.inventory.length; i++) {
        const slot = this.inventory[i];
        const gain = slot.opt.category === "food" ? (slot.opt.effects.health ?? 0) : 0;
        if (gain > bestGain) { bestGain = gain; best = i; }
      }
      if (best >= 0) {
        this.autoHealCd = 7;
        this.autoEatFood(best);
        if (this.mode === "playing" && this.skyMessage) {
          this.skyMessage.text = `❤️ Low health — ${this.skyMessage.text}`;
        }
      }
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.ui.hint.textContent = "";
    }

    if (this.skyMessage) {
      this.skyMessage.timer -= dt;
      if (this.skyMessage.timer <= 0) this.skyMessage = null;
    }
    const personReaction = this.personReaction;
    if (
      personReaction &&
      (this.mode !== "playing" ||
        this.renderTime >= personReaction.endsAt ||
        !this.stations.some(
          (station) =>
            station.opt.id === personReaction.targetId &&
            station.opt.person === personReaction.person
        ))
    ) {
      this.personReaction = null;
    }

    // floats animate in every mode
    for (let i = this.floats.length - 1; i >= 0; i--) {
      if ((this.floats[i].life -= dt) <= 0) this.floats.splice(i, 1);
    }
    for (const f of this.floats) f.y -= dt * 26;

    if (this.mode === "transition") {
      this.actQueued = false;
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) this.loadStage(this.transitionNext);
      return;
    }

    if (this.mode !== "playing") {
      this.moving = false;
      this.verticalBias = 0;
      this.actQueued = false; // drop inputs queued while an overlay was open
      return;
    }

    // movement — an analog thumb-stick (any direction, speed scales with tilt)
    // takes over when engaged; otherwise the keyboard drives a unit vector.
    let dx = 0;
    let dy = 0;
    if (this.joyActive) {
      dx = this.joyX;
      dy = this.joyY;
    } else {
      if (this.input.left) dx -= 1;
      if (this.input.right) dx += 1;
      if (this.input.up) dy -= 1;
      if (this.input.down) dy += 1;
    }
    let mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
      mag = 1;
    } // cap keyboard diagonals + stick overshoot at full speed
    // Hysteresis keeps a resting thumb from flickering between idle and walk.
    this.moving = movementIsActive(mag, this.moving);
    if (this.moving) {
      const nx = dx / mag;
      const ny = dy / mag;
      this.verticalBias = ny;
      this.facing = stableFacingForVector(
        this.facing,
        nx,
        ny
      );
      const sp = SPEED * this.speedFactor(); // study & smarts make you nimbler
      this.px += dx * sp * dt; // dx/dy carry the analog magnitude → variable speed
      this.py += dy * sp * dt;
      this.px = Math.max(48, Math.min(W - 36, this.px));
      this.py = Math.max(PY_MIN, Math.min(PY_MAX, this.py));
      this.walkPhase += dt * 10 * Math.min(1, mag * 1.5);
    } else {
      this.verticalBias = 0;
      this.walkPhase += dt * 3;
    }
    this.updatePet(dt);

    // Common good items flee until you touch them, bad items chase, people block,
    // and any un-satiated bad thing that catches you applies automatically.
    this.moveStations(dt);
    this.checkCommonItemContacts();
    this.checkBadContacts();
    this.checkEventContacts();
    if (this.mode !== "playing") return;

    if (this.actQueued) {
      this.actQueued = false;
      this.doAction();
    }
    // doAction may have advanced or ended the life — stop the frame if so
    if (this.mode !== "playing") return;

    this.updateFocus();

    // center gate
    const s = STAGES[this.stageIndex];
    if (this.px > DOOR_X) {
      const nearUtilityGate =
        (this.canShowAssetsGate() && this.nearAssetsGate()) ||
        (this.canShowFamilyTreeGate() && this.nearFamilyTreeGate());
      if (!this.nearGate()) {
        this.px = DOOR_X;
        // the top-right utility gates own this corner — no misleading door hint
        if (!nearUtilityGate) this.hint("Use the right-side gate to grow up.");
      } else if (nearUtilityGate) {
        // a utility-gate ring can overlap the door corridor (short zones /
        // landscape) — walking to the gate must never auto-advance the stage
        this.px = DOOR_X;
      } else if (this.doorOpen()) this.advanceStage();
      else this.hint(`Grow a little more first (age ${Math.floor(this.age)} → ${s.ageEnd}).`);
    }
    // walking through the gate transitioned us — don't also run mortality
    if (this.mode !== "playing") return;

    // continuous mortality
    const le = this.lifeExp();
    if (this.stats.health <= 0) this.finishLife("health", Math.round(this.age));
    else if (this.age >= le) this.finishLife(le < 70 ? "health" : "natural", Math.round(this.age));
  }

  private updateFocus(): void {
    // Only deliberate choices can be focused and pressed. Common green items
    // collect on contact, and bad things apply on contact.
    let best = -1;
    let bestD = 999;
    this.stations.forEach((st, i) => {
      if (st.kind === "bad") return;
      if (this.isCommonCollectible(st)) return;
      if (st.kind === "event" && st.event?.good === false) return;
      const dx = Math.abs(this.px - st.x);
      const dy = Math.abs(this.py - st.y);
      if (dx < 38 && dy < 42 && dx + dy < bestD) {
        best = i;
        bestD = dx + dy;
      }
    });
    if (best !== this.focusIndex) {
      this.focusIndex = best;
      this.renderFocusPanel();
      this.renderInventory();
    }
  }

  /** Doing a good thing makes its bad counterpart freeze + fade for a while. */
  private satiateBad(guard: string): void {
    for (const st of this.stations) {
      if (st.kind === "bad" && st.guard === guard) {
        const text = guard === "diet" ? "🛡️ full!" : guard === "focus" ? "🛡️ focused!" : "🛡️ not now!";
        if (st.satiated <= 0) this.floats.push({ x: st.x, y: st.y - 30, text, color: "#7fd0a0", life: 1.3 });
        st.satiated = SATIATE_TIME;
      }
    }
  }

  /** Move good items away from the player and bad items toward them; people block bad. */
  private moveStations(dt: number): void {
    const people = this.people; // cached people positions (perf)
    for (const st of this.stations) {
      if (st.contactCd > 0) st.contactCd -= dt;
      if (st.kind === "bad" && st.satiated > 0) { st.satiated -= dt; continue; } // satiated → frozen
      const badEvent = st.kind === "event" && st.event?.good === false;
      if (st.kind !== "good" && st.kind !== "bad" && !badEvent) continue;
      const dx = this.px - st.x;
      const dy = this.py - st.y;
      const d = Math.hypot(dx, dy) || 1;
      if (badEvent && d > BAD_EVENT_ALERT_R) continue;
      const dir = st.kind === "bad" || badEvent ? 1 : -1; // bad → toward you, good → away
      const sp = badEvent ? BAD_SPEED * 0.7 : st.kind === "bad" ? BAD_SPEED : GOOD_SPEED;
      let nx = st.x + (dir * dx / d) * sp * dt;
      let ny = st.y + (dir * dy / d) * sp * dt;
      if (st.kind === "bad" || badEvent) {
        for (const p of people) {
          if (Math.hypot(nx - p.x, ny - p.y) < BLOCK_R) {
            nx = st.x; // an NPC stands in the way — the bad thing can't get past
            ny = st.y;
            break;
          }
        }
      }
      st.x = Math.max(80, Math.min(W - 90, nx));
      const bounds = this.zoneBounds(st.zone);
      st.y = Math.max(bounds.min, Math.min(bounds.max, ny));
    }
  }

  /** Common green items are free repeatable choices collected on contact. */
  private isCommonCollectible(st: Station): boolean {
    const opt = st.opt;
    return st.kind === "good" &&
      !opt.person &&
      !opt.once &&
      !opt.permanent &&
      !opt.cost &&
      !opt.opensHousePicker &&
      !opt.opensVehiclePicker &&
      !opt.opensCareerDesk &&
      !opt.gamble &&
      !opt.invest &&
      !opt.moneyMgmt &&
      opt.category !== "special";
  }

  private addInventoryItem(opt: LifeOption): void {
    const existing = this.inventory.find((slot) => slot.opt.id === opt.id);
    const fresh = opt.category === "food" ? FOOD_FRESH : undefined;
    if (existing) {
      existing.count = Math.min(INVENTORY_MAX_COUNT, existing.count + 1);
      if (fresh !== undefined) existing.eatBy = fresh; // refresh the freshness window
      this.selectedInventory = this.inventory.indexOf(existing);
    } else {
      if (this.inventory.length >= INVENTORY_MAX_SLOTS) {
        this.inventory.shift();
        this.selectedInventory = Math.max(0, this.selectedInventory - 1);
      }
      this.inventory.push({ opt, count: 1, eatBy: fresh });
      this.selectedInventory = this.inventory.length - 1;
    }
    this.renderInventory();
  }

  private setInventorySelection(index: number, announce = true): void {
    if (this.inventory.length === 0) {
      this.selectedInventory = 0;
      this.renderInventory();
      if (announce) this.showSkyTip("🧺 Collect green items first — walk over them to pick up");
      return;
    }
    const len = this.inventory.length;
    this.selectedInventory = ((index % len) + len) % len;
    this.renderInventory();
    if (announce) {
      const slot = this.inventory[this.selectedInventory];
      const useText = slot.opt.category === "food" ? "swipe up to eat, or stand by someone to give" : "stand by someone and swipe up to give";
      this.showSkyTip(`${slot.opt.icon} ${slot.opt.label} ready — ${useText}`);
    }
  }

  private stepInventorySelection(delta: number): void {
    this.setInventorySelection(this.selectedInventory + delta);
  }

  private consumeSelectedInventoryItem(): void {
    const slot = this.inventory[this.selectedInventory];
    if (!slot) return;
    slot.count -= 1;
    if (slot.count <= 0) {
      this.inventory.splice(this.selectedInventory, 1);
      this.selectedInventory = Math.max(0, Math.min(this.selectedInventory, this.inventory.length - 1));
    }
  }

  private eatSelectedFoodItem(slot: InventorySlot): void {
    if (slot.opt.category !== "food") {
      this.showSkyTip(`${slot.opt.icon} stand close to a person, then swipe up to give it`);
      return;
    }
    if (this.foodCooldown > 0) {
      this.showSkyTip(`😋 Still full — eat again in ${Math.ceil(this.foodCooldown)}s`);
      return;
    }

    const opt = slot.opt;
    this.cooldown = 0.22;
    this.foodCooldown = FOOD_USE_COOLDOWN;
    this.markGuideSeen();
    const before = { health: this.stats.health, happiness: this.stats.happiness, fun: this.stats.fun, smarts: this.stats.smarts, money: this.money };
    this.consumeSelectedInventoryItem();
    this.applyOption(opt);
    this.floats.push({ x: this.px, y: this.py - 86, text: `${opt.icon} eaten`, color: "#9fe870", life: 1.25 });
    if (this.mode !== "playing") return;
    this.showOptionSky(opt, before);
    this.renderFocusPanel();
    this.renderInventory();
  }

  /** Auto-eat the food at `index` (its freshness ran out) — like eating it, but no
   *  cooldown/selection needed; consumes one unit. */
  private autoEatFood(index: number): void {
    const slot = this.inventory[index];
    if (!slot || slot.opt.category !== "food") return;
    const opt = slot.opt;
    const before = { health: this.stats.health, happiness: this.stats.happiness, fun: this.stats.fun, smarts: this.stats.smarts, money: this.money };
    slot.count -= 1;
    if (slot.count <= 0) {
      this.inventory.splice(index, 1);
      this.selectedInventory = Math.max(0, Math.min(this.selectedInventory, this.inventory.length - 1));
    } else {
      slot.eatBy = FOOD_FRESH; // the next unit gets its own fresh window
    }
    this.applyOption(opt);
    this.floats.push({ x: this.px, y: this.py - 86, text: `${opt.icon} eaten`, color: "#9fe870", life: 1.25 });
    if (this.mode !== "playing") return;
    this.showOptionSky(opt, before);
    this.renderFocusPanel();
    this.renderInventory();
  }

  /** Collected food must be eaten within FOOD_FRESH seconds — or it auto-eats. */
  private tickFoodFreshness(dt: number): void {
    let needsRender = false;
    for (let i = this.inventory.length - 1; i >= 0; i--) {
      const slot = this.inventory[i];
      if (slot.opt.category !== "food" || slot.eatBy === undefined) continue;
      const was = Math.ceil(slot.eatBy);
      slot.eatBy -= dt;
      if (slot.eatBy <= 0) {
        this.autoEatFood(i); // already re-renders + may end the life / open an overlay
        if (this.mode !== "playing") return;
        needsRender = false;
      } else if (Math.ceil(slot.eatBy) !== was) {
        needsRender = true; // the countdown ticked down a second — refresh its badge
      }
    }
    if (needsRender) this.renderInventory();
  }

  private personUseTarget(): Station | null {
    const focused = this.stations[this.focusIndex];
    if (focused?.kind === "person") return focused;
    let best: Station | null = null;
    let bestD = 999;
    for (const st of this.people) {
      const d = Math.hypot(this.px - st.x, this.py - st.y);
      if (d < 56 && d < bestD) {
        best = st;
        bestD = d;
      }
    }
    return best;
  }

  private inventoryReactionEffects(item: LifeOption, person: LifeOption): Partial<Stats> {
    const effects: Partial<Stats> = { happiness: this.isFamilyOption(person) ? 4 : 3 };
    if (item.treat) { effects.happiness = (effects.happiness ?? 0) + 2; effects.fun = 4; } // everyone loves a shared treat
    else if (item.category === "fun") effects.fun = 3;
    else if (item.category === "food") effects.health = 1;
    else if (item.category === "health") effects.health = 2;
    else if (item.category === "rest") effects.health = 1;
    else if (item.category === "smarts") effects.smarts = 1;
    else if (item.category === "social") effects.happiness = (effects.happiness ?? 0) + 2;
    return effects;
  }

  private useSelectedInventoryItem(): void {
    if (this.mode !== "playing" || this.cooldown > 0) return;
    const slot = this.inventory[this.selectedInventory];
    if (!slot) {
      this.showSkyTip("🧺 Collect green items first — walk over them to pick up");
      return;
    }
    const person = this.personUseTarget();
    if (!person) {
      this.eatSelectedFoodItem(slot);
      return;
    }

    if (person.contactCd > 0) return; // one gift per person per ~0.9s — no time-free farming
    this.cooldown = 0.22;
    person.contactCd = 0.9;
    this.markGuideSeen();
    const before = { health: this.stats.health, happiness: this.stats.happiness, fun: this.stats.fun, smarts: this.stats.smarts, money: this.money };
    const effects = this.inventoryReactionEffects(slot.opt, person.opt);
    this.applyEff(effects, "mental");
    this.connections += this.isFamilyOption(person.opt) ? 1 : 3;
    this.consumeSelectedInventoryItem();
    this.floats.push({ x: person.x, y: person.y - 92, text: `${slot.opt.icon} + ${person.opt.icon}`, color: "#ffd23f", life: 1.35 });
    this.spawnFloats(effects);
    this.showOptionSky(person.opt, before, `${person.opt.icon} ${person.opt.label} liked your ${slot.opt.icon} ${slot.opt.label}`);
    // a gift costs a turn of life like any other action — closes the no-time-cost stat/bond farm
    this.age += this.optionAgeCost(slot.opt);
    this.passiveTick();
    this.sampleHealth();
    if (this.mode !== "playing") return;
    this.startPersonReaction(person, "gift", true);
    this.renderFocusPanel();
    this.renderInventory();
  }

  /** Common green items collect by touch, then reappear elsewhere in their zone. */
  private checkCommonItemContacts(): void {
    if (this.cooldown > 0) return;
    for (const st of this.stations) {
      if (!this.isCommonCollectible(st) || st.contactCd > 0) continue;
      if (Math.hypot(this.px - st.x, this.py - st.y) > ITEM_R + 6) continue;
      st.contactCd = 0.45;
      this.cooldown = 0.1;
      this.markGuideSeen();
      this.addInventoryItem(st.opt);
      if (st.opt.category === "food") {
        this.floats.push({ x: st.x, y: st.y - 52, text: `${st.opt.icon} stored`, color: "#9fe870", life: 1.1 });
        this.skyMessage = {
          text: `${st.opt.icon} ${this.cycledLine(st.opt)}`,
          sub: "📦 stored · swipe ↑ to eat or give",
          color: "#bfe0ff",
          timer: 3,
        };
      } else {
        const before = { health: this.stats.health, happiness: this.stats.happiness, fun: this.stats.fun, smarts: this.stats.smarts, money: this.money };
        this.applyOption(st.opt);
        if (this.mode !== "playing") return;
        this.showOptionSky(st.opt, before);
      }
      this.respawnCommonItem(st);
      this.focusIndex = -1;
      this.renderFocusPanel();
      return;
    }
  }

  /** Move a collected common item to a new far-enough place in its own zone. */
  private respawnCommonItem(st: Station): void {
    const bounds = this.zoneBounds(st.zone);
    const spawnLeft = this.px > W / 2;
    for (let tries = 0; tries < 12; tries++) {
      const x = spawnLeft ? 88 + Math.random() * 140 : W - 230 + Math.random() * 140;
      const y = bounds.min + Math.random() * (bounds.max - bounds.min);
      if (Math.hypot(x - this.px, y - this.py) < 120) continue;
      if (this.stations.some((other) => other !== st && Math.hypot(x - other.x, y - other.y) < 54)) continue;
      st.x = x;
      st.y = y;
      return;
    }
    st.x = spawnLeft ? 120 : W - 170;
    st.y = Math.max(bounds.min, Math.min(bounds.max, this.py + (this.py < (bounds.min + bounds.max) / 2 ? 120 : -120)));
  }

  /** A bad item touching the player applies automatically — unless it's satiated. */
  private checkBadContacts(): void {
    for (const st of this.stations) {
      if (st.kind !== "bad" || st.contactCd > 0 || st.satiated > 0) continue;
      if (Math.hypot(this.px - st.x, this.py - st.y) > ITEM_R) continue;
      st.contactCd = 2.6;
      this.applyOption(st.opt); // you "just get" the bad thing
      this.respawnBadItem(st); // it circles back for another go
      if (this.mode !== "playing") return; // applyOption may have ended the life
    }
  }

  /** Bad-luck event objects are hazards; touching one applies it in-world. */
  private checkEventContacts(): void {
    for (let i = this.stations.length - 1; i >= 0; i--) {
      const st = this.stations[i];
      if (st.kind !== "event" || !st.event || st.event.good !== false) continue;
      if (Math.hypot(this.px - st.x, this.py - st.y) > ITEM_R + 4) continue;
      this.collectEventItem(st);
      if (this.mode !== "playing") return;
    }
  }

  /** Send a bad item back to a far edge (clear of people) to chase you down again. */
  private respawnBadItem(st: Station): void {
    const bounds = this.zoneBounds(st.zone);
    for (let tries = 0; tries < 6; tries++) {
      st.x = this.px > W / 2 ? 90 + Math.random() * 70 : W - 170 - Math.random() * 70;
      st.y = bounds.min + Math.random() * (bounds.max - bounds.min);
      if (!this.people.some((p) => Math.hypot(st.x - p.x, st.y - p.y) < BLOCK_R)) break;
    }
  }

  // Assets + Family Tree live at the TOP RIGHT of the social area now
  // (Training keeps its spot on the left).
  private assetsGateY(): number {
    const social = this.zoneBounds("social");
    return Math.round(social.min + 44);
  }

  private familyTreeGateY(): number {
    return this.assetsGateY() + UTILITY_GATE_GAP;
  }

  private trainingGateY(): number {
    const social = this.zoneBounds("social");
    return Math.round(social.max - 26);
  }

  private canShowFamilyTreeGate(): boolean {
    return this.stageIndex >= ELEMENTARY_INDEX;
  }

  private canShowAssetsGate(): boolean {
    return this.stageIndex >= MIDDLE_INDEX ||
      (this.stageIndex >= ELEMENTARY_INDEX && this.money > ELEMENTARY_ASSETS_MONEY);
  }

  private canShowTrainingGate(): boolean {
    return true;
  }

  private hitCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
    return Math.hypot(x - cx, y - cy) <= r;
  }

  private nearFamilyTreeGate(): boolean {
    return this.hitCircle(this.px, this.py - 8, W - 58, this.familyTreeGateY(), FAMILY_TREE_GATE_R + 22);
  }

  private nearAssetsGate(): boolean {
    return this.hitCircle(this.px, this.py - 8, W - 58, this.assetsGateY(), ASSETS_GATE_R + 22);
  }

  private nearTrainingGate(): boolean {
    return this.hitCircle(this.px, this.py - 8, UTILITY_GATE_X, this.trainingGateY(), TRAINING_GATE_R + 22);
  }

  private canvasPoint(e: PointerEvent): { x: number; y: number } {
    const rect = this.ui.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  private drawUtilityGates(ctx: CanvasRenderingContext2D, t: number): void {
    const canFamilyTree = this.canShowFamilyTreeGate();
    const canAssets = this.canShowAssetsGate();
    const canTraining = this.canShowTrainingGate();
    if (!canFamilyTree && !canAssets && !canTraining) return;
    const familyY = this.familyTreeGateY();
    const assetsY = this.assetsGateY();
    const trainingY = this.trainingGateY();
    if (canTraining) this.drawUtilityGate(ctx, UTILITY_GATE_X, trainingY, TRAINING_GATE_R, "Training", "🏫", "#5db8ff", t);
    if (canAssets) this.drawUtilityGate(ctx, W - 58, assetsY, ASSETS_GATE_R, "Assets", "💼", "#7ed957", t);
    if (canFamilyTree) this.drawUtilityGate(ctx, W - 58, familyY, FAMILY_TREE_GATE_R, "Family Tree", "🌳", "#ffd23f", t);
  }

  private drawTrainingSchoolGate(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const color = "#5db8ff";
    const pulse = 0.5 + 0.16 * Math.sin(t * 3 + y * 0.03);
    const w = 46;
    const h = 34;
    const top = y - 18;
    const left = x - w / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 22, 24, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    roundRect(ctx, left - 4, top - 4, w + 8, h + 8, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#f6dd8a";
    roundRect(ctx, left, top + 8, w, h - 8, 4);
    ctx.fill();
    ctx.strokeStyle = "#1b142b";
    ctx.lineWidth = 2;
    roundRect(ctx, left, top + 8, w, h - 8, 4);
    ctx.stroke();

    ctx.fillStyle = "#d94d58";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(left - 3, top + 12);
    ctx.lineTo(x + w / 2 + 3, top + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e8f7ff";
    for (const wx of [left + 10, left + w - 16]) {
      roundRect(ctx, wx, top + 16, 10, 9, 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#5db8ff";
    roundRect(ctx, x - 5, top + 19, 10, 15, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff8df";
    ctx.font = "bold 8px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillText("IQ", x, top + 13);

    const labelW = 58;
    const labelH = 14;
    const labelY = y + 22;
    ctx.fillStyle = "rgba(18,12,30,0.9)";
    roundRect(ctx, x - labelW / 2, labelY, labelW, labelH, 5);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    roundRect(ctx, x - labelW / 2, labelY, labelW, labelH, 5);
    ctx.stroke();
    ctx.font = "bold 7.5px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillStyle = "#fff8df";
    ctx.fillText("Training", x, labelY + labelH / 2);
    ctx.restore();
  }

  private drawUtilityGate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    label: string,
    icon: string,
    color: string,
    t: number
  ): void {
    const pulse = 0.55 + 0.18 * Math.sin(t * 3 + y * 0.03);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath();
    ctx.ellipse(x + 2, y + r + 4, r * 0.82, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const grad = ctx.createRadialGradient(x - 6, y - 7, 3.5, x, y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.18, color);
    grad.addColorStop(1, "#222033");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1b142b";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = "15px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillStyle = "#1b142b";
    ctx.fillText(icon, x, y - 1);

    const labelW = label === "Family Tree" ? 68 : label === "Training" ? 60 : 52;
    const labelH = 14;
    const labelY = y + r + 5;
    ctx.fillStyle = "rgba(18,12,30,0.9)";
    roundRect(ctx, x - labelW / 2, labelY, labelW, labelH, 5);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    roundRect(ctx, x - labelW / 2, labelY, labelW, labelH, 5);
    ctx.stroke();
    ctx.font = "bold 7.5px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillStyle = "#fff8df";
    ctx.fillText(label, x, labelY + labelH / 2);
    ctx.restore();
  }

  // --- rendering ------------------------------------------------------------

  private render(): void {
    const ctx = this.ui.ctx;
    ctx.fillStyle = "#140d24";
    ctx.fillRect(0, 0, W, H);

    const inRoom =
      this.mode === "playing" ||
      this.mode === "transition" ||
      this.mode === "partner" ||
      this.mode === "occupation" ||
      this.mode === "house" ||
      this.mode === "vehicle" ||
      this.mode === "commute" ||
      this.mode === "timetravel" ||
      this.mode === "profile" ||
      this.mode === "familytree" ||
      this.mode === "assets" ||
      this.mode === "training" ||
      this.mode === "careermove" ||
      this.mode === "settings";
    if (inRoom && this.stageIndex < STAGES.length) {
      const s = STAGES[this.stageIndex];
      // Room props and stationary people animate on real scene time. Player
      // movement keeps its own walkPhase so approaching an NPC never speeds up
      // that person's idle breathing or focus pulse.
      const t = this.renderTime;
      const activeReaction = this.currentPersonReaction();
      const doorActive = this.doorOpen();
      const playerBodyVariant = this.currentPlayerBodyVariant();
      const careerUniform =
        playerBodyVariant.kind === "career-uniform"
          ? playerBodyVariant.careerUniform
          : null;
      const lifeSeason = this.currentLifeSeason();
      drawRoom(ctx, s.theme, W, H, FLOOR_Y, doorActive, t, {
        scene: s.scene,
        upperScene: this.upperScene(),
        atHome: !!s.atHome,
        homeQuality: this.homeQuality,
        splitY: this.zoneSplitY(),
        ownedVehicles: this.ownedVehicles(),
        ownedHome: this.liveHome(),
      });

      this.drawUtilityGates(ctx, t);

      // draw stations, people and the avatar together, sorted by depth (y).
      // Reuse a pooled draw-list so we don't allocate an array + N objects each frame.
      const drawables = this.drawList;
      let dn = 0;
      for (const st of this.stations) {
        const o = drawables[dn] ?? (drawables[dn] = { y: 0 });
        o.y = st.y; o.station = st; o.pet = false; dn++;
      }
      if (this.petKind) {
        const o = drawables[dn] ?? (drawables[dn] = { y: 0 });
        o.y = this.petY; o.station = undefined; o.pet = true; dn++;
      }
      {
        const o = drawables[dn] ?? (drawables[dn] = { y: 0 });
        o.y = this.py; o.station = undefined; o.pet = false; dn++; // the avatar
      }
      drawables.length = dn;
      drawables.sort(byDepth);
      for (const d of drawables) {
        if (d.pet && this.petKind) {
          drawPet(ctx, this.petX, this.petY, this.petKind, t, {
            facing: this.petFacing,
            moving: this.petMoving,
            phase: this.petWalkPhase,
            sitting: this.petKind === "cat",
          });
          continue;
        }
        if (!d.station) {
          const playerLook = avatarLook(
            this.stageIndex,
            this.gender,
            this.heritage,
            this.appearance
          );
          const playerMotion = {
            moving: this.moving,
            facing: this.facing,
            verticalBias: this.verticalBias,
          };
          const playerCustomBodySize =
            storybookVisualHeight(playerLook);
          let drewCustomBody = false;
          if (careerUniform) {
            drewCustomBody = drawJobCharacter(
              ctx,
              this.px,
              this.py,
              careerUniform.uniform,
              careerUniform.heritage,
              careerUniform.gender,
              {
                size: playerCustomBodySize,
                facing: this.facing,
                moving: this.moving,
                phase: this.walkPhase,
                season: jobArtSeasonFor(
                  careerUniform.uniform,
                  lifeSeason
                ),
              }
            );
          } else if (
            playerBodyVariant.kind === "summer-casual"
          ) {
            drewCustomBody = drawSummerCharacter(
              ctx,
              this.px,
              this.py,
              this.heritage,
              this.gender,
              {
                size: playerCustomBodySize,
                facing: this.facing,
                moving: this.moving,
                phase: this.walkPhase,
              }
            );
          }
          if (drewCustomBody) {
            drawInteractionExpression(
              ctx,
              this.px,
              this.py,
              playerLook,
              this.walkPhase,
              playerMotion,
              activeReaction?.expressions.player ??
                "neutral"
            );
          } else {
            drawAvatar(
              ctx,
              this.px,
              this.py,
              playerLook,
              this.walkPhase,
              playerMotion,
              activeReaction?.expressions.player
            );
          }
          continue;
        }
        const st = d.station;
        const focused = this.stations[this.focusIndex] === st && this.mode === "playing";
        const used = !!st.opt.once && this.usedOnce.has(st.opt.id);
        // A satiated bad item has backed off. Keep bad-friend people full color so
        // they still read as humans instead of shadow silhouettes.
        const satiated = st.kind === "bad" && st.satiated > 0;
        const fadedSatiated = satiated && !st.opt.person;
        // a ground-ring marks moving items: red = a BAD thing chasing you,
        // green = a common GOOD thing you collect by touch.
        if (!satiated && (st.kind === "bad" || st.kind === "good" || st.kind === "event")) {
          const bad = st.kind === "bad" || st.event?.good === false;
          const eventMoney = st.kind === "event" && !!st.event?.money && st.event.money > 0;
          const pulse = 0.5 + 0.3 * Math.sin(t * (bad ? 6 : 3));
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = bad ? "#ff5d6c" : eventMoney ? "#ffd23f" : "#3ddc84";
          ellipseRing(ctx, st.x, st.y + 16, 22, 7);
          ctx.restore();
        }
        if (fadedSatiated) ctx.globalAlpha = 0.18;
        if (st.kind === "event" && st.event) {
          drawEventItem(ctx, st.x, st.y, st.event.id, st.event.emoji, st.event.title, st.event.good !== false, focused, t);
        } else if (st.opt.person) {
          const profession = st.opt.professionNpc;
          const isParent =
            st.opt.person === "mother" ||
            st.opt.person === "father";
          const seatedNewbornParent =
            isParent && this.shouldSitWithNewborn(st);
          let drewProfession = false;
          if (
            profession &&
            !seatedNewbornParent &&
            (isParent ||
              !careerUniform ||
              !sameProfessionVisual(
                profession,
                careerUniform
              ))
          ) {
            const professionSeason = jobArtSeasonFor(
              profession.uniform,
              lifeSeason
            );
            const professionFrame = jobCharacterFrame(
              profession.uniform,
              profession.heritage,
              profession.gender,
              { season: professionSeason }
            );
            const professionStageIndex =
              professionFrame?.ageBand === "middleAge" ? 9 : 7;
            const professionBodySize = storybookVisualHeight(
              avatarLook(
                professionStageIndex,
                profession.gender,
                profession.heritage
              )
            );
            ctx.save();
            if (used) ctx.globalAlpha = 0.5;
            drewProfession = drawJobCharacter(
              ctx,
              st.x,
              st.y,
              profession.uniform,
              profession.heritage,
              profession.gender,
              {
                size: professionBodySize,
                facing: "front",
                moving: false,
                season: professionSeason,
              }
            );
            ctx.restore();
            if (drewProfession) {
              drawCharacterNamePlate(
                ctx,
                st.x,
                st.y,
                professionBodySize,
                st.opt.label,
                focused,
                used,
                t
              );
              if (activeReaction?.target === st) {
                ctx.font = "16px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(
                  activeReaction.expressions.npc === "smile"
                    ? "😊"
                    : "💬",
                  st.x + 34,
                  st.y - 104
                );
              }
            }
          }
          if (!drewProfession) {
            drawPerson(ctx, st.x, st.y, st.opt.person, this.gender, st.opt.label, focused, used, t, this.stageIndex, st.heritage ?? this.heritage, {
              seated: this.shouldSitWithNewborn(st),
              appearance:
                st.appearance ?? this.appearanceForNpc(st.opt),
              gender:
                st.opt.person === "spouse"
                  ? this.partner?.gender
                  : undefined,
              expression:
                activeReaction?.target === st
                  ? activeReaction.expressions.npc
                  : "neutral",
            });
          }
        } else {
          drawStation(ctx, st.x, st.y, st.opt.icon, st.opt.label, st.opt.category, focused, used, t);
        }
        if (fadedSatiated) ctx.globalAlpha = 1;
      }
    }

    // floats
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 9px 'Trebuchet MS', system-ui, sans-serif";
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // sky-area feedback banner — a nice line about who you met + the point change
    if (inRoom && this.skyMessage) {
      const m = this.skyMessage;
      const alpha = Math.max(0, Math.min(1, m.timer / 0.5));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      // Word-wrap once and cache it on the message — measureText is costly and the
      // banner shows for ~3s, so re-wrapping it every frame was pure waste.
      if (!m.wrapLines || m.wrapW !== W) {
        const maxW = Math.min(W - 32, 540);
        ctx.font = "bold 18px 'Trebuchet MS', system-ui, sans-serif";
        const wl: string[] = [];
        let cur = "";
        for (const word of m.text.split(" ")) {
          const test = cur ? cur + " " + word : word;
          if (ctx.measureText(test).width > maxW && cur) { wl.push(cur); cur = word; }
          else cur = test;
        }
        if (cur) wl.push(cur);
        let cw = 0;
        for (const ln of wl) cw = Math.max(cw, ctx.measureText(ln).width);
        ctx.font = "bold 16px 'Trebuchet MS', system-ui, sans-serif";
        if (m.sub) cw = Math.max(cw, ctx.measureText(m.sub).width);
        m.wrapLines = wl; m.wrapCW = cw; m.wrapW = W;
      }
      const lines = m.wrapLines;
      const contentW = m.wrapCW ?? 0;
      const lineH = 23;
      const subH = m.sub ? 23 : 0;
      const padX = 18;
      const padY = 11;
      const bw = Math.min(W - 10, contentW + padX * 2);
      const bh = lines.length * lineH + subH + padY * 2;
      const bx = (W - bw) / 2;
      const by = 10;
      const cr = ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
      ctx.beginPath();
      if (cr.roundRect) cr.roundRect(bx, by, bw, bh, 14);
      else ctx.rect(bx, by, bw, bh);
      ctx.fillStyle = "rgba(14, 9, 28, 0.85)";
      ctx.fill();
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f4eefb";
      ctx.font = "bold 18px 'Trebuchet MS', system-ui, sans-serif";
      let ty = by + padY + lineH / 2;
      for (const ln of lines) { ctx.fillText(ln, W / 2, ty); ty += lineH; }
      if (m.sub) {
        ctx.font = "bold 16px 'Trebuchet MS', system-ui, sans-serif";
        ctx.fillStyle = m.color;
        ctx.fillText(m.sub, W / 2, ty + 1);
      }
      ctx.restore();
    }

    this.renderHud();
  }

  private renderHud(): void {
    // Most of the HUD changes only on a discrete action / mode change, yet this runs
    // every frame. A cheap numeric signature lets us skip the reflow-causing DOM
    // writes when nothing relevant changed.
    const lifeSeason = this.currentLifeSeason();
    const seasonSig = lifeSeason
      ? LIFE_SEASONS.indexOf(lifeSeason) + 1
      : 0;
    const sig = Math.round(this.money)
      + Math.floor(this.age) * 131
      + this.stageIndex * 100003
      + Math.round(this.stats.health) * 7
      + Math.round(this.stats.happiness) * 13
      + Math.round(this.stats.fun) * 17
      + Math.round(this.stats.smarts) * 19
      + Math.round(this.weight) * 23
      + Math.round(this.muscle) * 29
      + Math.round(this.nutrition) * 31
      + Math.round(this.mental) * 37
      + this.lifeSpeed * 41
      + seasonSig * 43;
    const occId = this.occupation?.id ?? "";
    if (sig !== this.hudSig || this.mode !== this.hudMode || occId !== this.hudOcc) {
    this.hudSig = sig; this.hudMode = this.mode; this.hudOcc = occId;
    for (const k of STAT_KEYS) {
      const v = Math.round(this.stats[k]);
      const bar = this.ui.bars[k];
      // IQ runs 40..160 and Health 0..120 (can exceed 100), so scale those bars
      bar.fill.style.width =
        k === "smarts" ? `${((this.stats[k] - 40) / 120) * 100}%`
        : k === "health" ? `${Math.min(100, (this.stats[k] / 120) * 100)}%`
        : `${this.stats[k]}%`;
      bar.val.textContent = String(v);
      bar.fill.style.opacity = (k === "smarts" ? v < 70 : v < 20) ? "0.6" : "1";
    }
    // the three pillars that compose Health
    const pillars: [keyof typeof this.ui.subBars, number][] = [
      ["muscle", this.muscle], ["nutrition", this.nutrition], ["mental", this.mental],
    ];
    for (const [key, val] of pillars) {
      const sb = this.ui.subBars[key];
      sb.fill.style.width = `${val}%`;
      sb.val.textContent = String(Math.round(val));
    }
    // weight meter: colour reflects healthy / over / under, not "more is better"
    const wb = this.ui.weightBar;
    wb.fill.style.width = `${this.weight}%`;
    wb.fill.style.background = weightColor(this.weight);
    wb.val.textContent = String(Math.round(this.weight));

    // money is a real dollar figure, not a bar
    this.ui.moneyLabel.textContent = `💰 ${formatMoney(this.money)}`;

    const s = STAGES[Math.min(this.stageIndex, STAGES.length - 1)];
    if (this.biography) {
      // a biography shows the (custom) chapter title and whose life it is
      const ch = this.biography.chapters[s.id];
      const title = ch?.title?.trim() || s.name;
      this.ui.stageLabel.textContent = `${s.emoji} ${title} · 📖 ${this.biography.name || "A life"}`;
    } else {
      const occ = this.occupation ? ` · ${this.occupation.emoji} ${this.occupation.name}` : "";
      const season = lifeSeason
        ? ` · ${LIFE_SEASON_DISPLAY[lifeSeason].emoji} ${LIFE_SEASON_DISPLAY[lifeSeason].label}`
        : "";
      this.ui.stageLabel.textContent = `${s.emoji} ${s.name}${season}${occ}`;
    }
    this.ui.ageLabel.textContent = String(Math.floor(this.age));
    this.ui.leLabel.textContent =
      this.mode === "title" || this.mode === "setup" ? "" : ` · ~${this.lifeExp()}y · ${this.lifeSpeedLabel()}`;
    this.ui.warn.style.display =
      this.mode === "playing" && (this.stats.health < 25 || weightStatus(this.weight) === "obese")
        ? "block"
        : "none";
    // time-travel pill appears once you have a past worth revisiting
    const canRewind = this.mode === "playing" && !this.biography && this.timeline.filter(Boolean).length > 1;
    this.ui.timeTravel.style.display = canRewind ? "flex" : "none";
    // career profile pill appears once you've started working
    const canProfile = this.mode === "playing" && this.stageIndex >= CAREER_INDEX;
    this.ui.profileBtn.style.display = canProfile ? "flex" : "none";
    // Keep the escape hatch in Settings, but remove the always-visible skip
    // control so the main HUD reinforces the choice-and-collect loop.
    const playing = this.mode === "playing";
    this.ui.settingsBtn.style.display = playing ? "flex" : "none";
    this.ui.skipBtn.style.display = "none";
    this.ui.touchWrap.style.visibility = playing ? "" : "hidden";
    }
    // Collect-button glow tracks the avatar's position/focus, so refresh it each frame.
    const playing2 = this.mode === "playing";
    const nearGate =
      (this.canShowTrainingGate() && this.nearTrainingGate()) ||
      (this.canShowAssetsGate() && this.nearAssetsGate()) ||
      (this.canShowFamilyTreeGate() && this.nearFamilyTreeGate()) ||
      (this.doorOpen() && this.px > DOOR_X - 36 && this.nearGate());
    this.ui.collectBtn.dataset.ready = playing2 && (this.focusIndex >= 0 || nearGate) ? "true" : "false";
  }

  private renderFocusPanel(): void {
    const panel = this.ui.focusPanel;
    if (this.focusIndex < 0) {
      panel.classList.add("is-hidden");
      panel.innerHTML = "";
      return;
    }
    panel.classList.remove("is-hidden");
    const st = this.stations[this.focusIndex];
    const mk = (text: string, color: string) => `<span class="plj-chip" style="color:${color}">${text}</span>`;
    if (st.kind === "event" && st.event) {
      const e = st.event;
      const good = e.good !== false;
      const money = e.money
        ? mk(`${e.money > 0 ? "+" : "−"}${formatMoney(Math.abs(e.money))}`, e.money > 0 ? "#3ddc84" : "#ff8a8a")
        : "";
      panel.innerHTML =
        `<span class="plj-focus-title">${esc(e.emoji)} ${esc(e.title)}</span>` +
        `<span class="plj-focus-desc">${esc(e.desc)}</span>` +
        `<span class="plj-chips">${effectChips(e.effects)}${money}<b class="plj-press">${good ? "SPACE" : "TOUCH"}</b></span>`;
      return;
    }
    const opt = st.opt;
    const extra: string[] = [];
    if (opt.earn) {
      const est = opt.earn * (opt.scalesWithSmarts ? this.incomeMul() * (this.occupation?.salaryMul ?? 1) : 1);
      extra.push(mk(`+${formatMoney(est)}`, "#3ddc84"));
    }
    const realCost = opt.cost ? Math.round(opt.cost * activityDiscount(this.stats)) : 0;
    if (realCost) extra.push(mk(`−${formatMoney(realCost)}`, "#ff8a8a"));
    if (opt.invest) extra.push(mk(`invest ${formatMoney(opt.invest)} 📈`, "#5db8ff"));
    if (opt.gamble) {
      extra.push(mk(`stake ${formatMoney(opt.gamble.stake)}`, "#ff8a8a"));
      extra.push(mk(`win up to ${formatMoney(opt.gamble.jackpot)}`, "#3ddc84"));
    }
    const price = realCost + (opt.invest ?? 0) + (opt.gamble?.stake ?? 0);
    const broke = price > 0 && this.money < price;
    const press = broke
      ? `<b class="plj-press" style="background:#5a2a33;color:#ffc4c4">💸 can't afford</b>`
      : `<b class="plj-press">${opt.person ? "SPACE / ITEM↑" : "SPACE"}</b>`;
    panel.innerHTML =
      `<span class="plj-focus-title">${esc(opt.icon)} ${esc(opt.label)}</span>` +
      `<span class="plj-focus-desc">${esc(opt.desc)}</span>` +
      `<span class="plj-chips">${effectChips(opt.effects)}${extra.join("")}${press}</span>`;
  }

  private renderInventory(): void {
    const wrap = this.ui.inventoryWrap;
    const track = this.ui.inventoryTrack;
    const selected = this.inventory[this.selectedInventory];
    wrap.classList.toggle("is-locked", this.stageIndex < 2);
    const usable = this.mode === "playing" && this.inventory.length > 0 && (!!this.personUseTarget() || selected?.opt.category === "food");
    wrap.classList.toggle("is-empty", this.inventory.length === 0);
    wrap.classList.toggle("can-use", usable);
    if (this.inventory.length === 0) {
      // the collection area itself stays text-free — a faint basket cue only; all
      // its guidance goes up to the sky (one-time tip lives in update), never the tray
      track.innerHTML = `<span class="plj-inventory-empty" aria-hidden="true">🧺</span>`;
      return;
    }
    track.innerHTML = this.inventory.map((slot, i) => {
      const selected = i === this.selectedInventory ? " is-selected" : "";
      const count = slot.count > 1 ? `<span class="plj-inv-count">${slot.count}</span>` : "";
      const timer = slot.opt.category === "food" && slot.eatBy !== undefined
        ? `<span class="plj-inv-timer${slot.eatBy <= 2 ? " is-low" : ""}">${Math.max(0, Math.ceil(slot.eatBy))}</span>`
        : "";
      return `<button class="plj-inv-item${selected}" data-inv-index="${i}" title="${esc(slot.opt.label)}"><span class="plj-inv-emoji">${esc(slot.opt.icon)}</span>${count}${timer}</button>`;
    }).join("");
  }

  private hint(text: string): void {
    this.ui.hint.textContent = text;
    this.hintTimer = 1.6;
  }

  /**
   * After interacting with a person (via Collect / SPACE), announce who you met
   * and the point changes as a banner in the sky — the social-reaction feedback.
   */
  /** The next rotating flavor line for a person (by kind) or item (by id), looping;
   *  falls back to the option's own desc when no lines are defined for it. */
  private cycledLine(opt: LifeOption): string {
    const pool = linePool(opt.person, opt.id);
    if (!pool || !pool.length) return (opt.desc || opt.label || "").trim();
    const key = opt.person ? "p:" + opt.person : "i:" + opt.id;
    const i = this.lineIndex[key] ?? 0;
    this.lineIndex[key] = i + 1;
    return pool[i % pool.length];
  }

  /** Show a short guidance line in the sky banner (no stat deltas) — used so the
   *  collection tray carries no text of its own; all its prompts go up to the sky. */
  private showSkyTip(text: string, color = "#cfe3ff"): void {
    this.skyMessage = { text, sub: "", color, timer: 2.6 };
  }

  private showOptionSky(opt: LifeOption, before: { health: number; happiness: number; fun: number; smarts: number; money: number }, overrideText?: string): void {
    const parts: string[] = [];
    const add = (now: number, was: number, icon: string): void => {
      const d = Math.round(now - was);
      if (d !== 0) parts.push(`${icon}${d > 0 ? "+" : ""}${d}`);
    };
    add(this.stats.health, before.health, "❤️");
    add(this.stats.happiness, before.happiness, "😊");
    add(this.stats.fun, before.fun, "🎉");
    add(this.stats.smarts, before.smarts, "🧠");
    const dMoney = Math.round(this.money - before.money);
    if (dMoney !== 0) parts.push(`💰${dMoney > 0 ? "+" : "-"}${formatMoney(Math.abs(dMoney)).replace("$", "")}`);
    const desc = overrideText ? "" : this.cycledLine(opt);
    const good = this.stats.happiness - before.happiness + (this.stats.health - before.health) >= 0;
    this.playFeedback(good);
    this.skyMessage = {
      text: overrideText || `${opt.icon} ${desc}`,
      sub: parts.join("   "),
      color: good ? "#bdf0c6" : "#ffb3c0",
      timer: 3.2,
    };
  }

  /** Apply the saved day/night theme to the document + refresh the toggle glyph. */
  private applyTheme(): void {
    document.documentElement.setAttribute("data-theme", this.theme);
    // the button shows the theme you'd switch TO
    this.ui.themeBtn.textContent = this.theme === "night" ? "☀️" : "🌙";
    this.ui.themeBtn.title = this.theme === "night" ? "Switch to day theme" : "Switch to night theme";
  }

  /** Flip between the bright daylight and deep-violet night themes (persisted). */
  private toggleTheme(): void {
    this.theme = this.theme === "night" ? "day" : "night";
    try {
      localStorage.setItem("choice-of-life-v1-theme", this.theme);
    } catch {
      /* ignore */
    }
    this.applyTheme();
  }

  /** The intro guide shows once, then stays tucked away (remembered across lives). */
  private markGuideSeen(): void {
    if (this.guideSeen) return;
    this.guideSeen = true;
    try {
      localStorage.setItem("choice-of-life-v1-guide-seen", "1");
    } catch {
      /* ignore */
    }
  }

  /** Skip the rest of the current chapter and grow up to the next one. */
  private skipStage(): void {
    if (this.mode !== "playing") return;
    this.age = Math.max(this.age, STAGES[this.stageIndex].ageEnd);
    this.hint("⏭ Skipping to the next chapter…");
    this.advanceStage();
  }

  private showSettings(): void {
    if (this.mode !== "playing") return;
    this.mode = "settings";
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title plj-settings-card">
        <h2>⚙️ Settings</h2>
        <div class="plj-speed-box">
          <div class="plj-speed-head">
            <span>Life speed</span>
            <strong id="plj-set-speed-readout">${this.lifeSpeedLabel()}</strong>
          </div>
          <input id="plj-set-speed" type="range" ${this.lifeSpeedInputAttrs()}>
        </div>
        <div class="plj-settings-guide">
          <b>How to play</b>
          <span>Move with the left pad or WASD/arrows. Touch green items to collect them into the tray. Swipe the tray left/right to select, then swipe up to eat or give. Dodge red hazards and use the right gate to grow up.</span>
        </div>
        <div class="plj-set-list">
          <button class="plj-btn" id="plj-set-resume">▶ Resume</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-skip">⏭ Skip this chapter</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-restart">🔄 Start a new life</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-sound">${this.soundEnabled ? "🔊 Sound on" : "🔇 Sound off"}</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-export">📊 Export local playtest data</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-menu">🏠 Main menu</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    const ov = this.ui.overlay;
    const speedInput = ov.querySelector<HTMLInputElement>("#plj-set-speed")!;
    const speedReadout = ov.querySelector<HTMLElement>("#plj-set-speed-readout")!;
    speedInput.oninput = () => {
      this.setLifeSpeedIndex(Number(speedInput.value));
      speedInput.value = String(this.lifeSpeedIndex());
      speedReadout.textContent = this.lifeSpeedLabel();
    };
    ov.querySelector<HTMLButtonElement>("#plj-set-resume")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); };
    ov.querySelector<HTMLButtonElement>("#plj-set-skip")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); this.skipStage(); };
    ov.querySelector<HTMLButtonElement>("#plj-set-restart")!.onclick = () => this.showSetup();
    ov.querySelector<HTMLButtonElement>("#plj-set-sound")!.onclick = (event) => {
      this.soundEnabled = !this.soundEnabled;
      try { localStorage.setItem("choice-of-life-v1-sound", this.soundEnabled ? "on" : "off"); } catch { /* ignore */ }
      (event.currentTarget as HTMLButtonElement).textContent = this.soundEnabled ? "🔊 Sound on" : "🔇 Sound off";
    };
    ov.querySelector<HTMLButtonElement>("#plj-set-export")!.onclick = () => this.exportFunnel();
    ov.querySelector<HTMLButtonElement>("#plj-set-menu")!.onclick = () => this.showTitle();
  }

  // --- overlays -------------------------------------------------------------

  private clearOverlay(): void {
    this.ui.overlay.classList.remove("show");
    this.ui.overlay.innerHTML = "";
  }

  private playerDisplayName(): string {
    return this.playerName.trim() || (this.gender === "female" ? "Alex" : "Sam");
  }

  private resetFamilyGraph(): void {
    const playerIcon = this.gender === "female" ? "👧" : "👦";
    this.familyHiddenIds = new Set();
    this.familyMembers = [
      { id: "grandpa", name: "Grandpa", role: "grandparent", icon: "👴", ageOffset: 66, generation: -2, tone: "elder" },
      { id: "grandma", name: "Grandma", role: "grandparent", icon: "👵", ageOffset: 64, generation: -2, tone: "elder" },
      { id: "daddy", name: "Daddy", role: "parent", icon: "👨", ageOffset: 31, generation: -1, tone: "parent" },
      { id: "mommy", name: "Mommy", role: "parent", icon: "👩", ageOffset: 29, generation: -1, tone: "parent" },
      { id: "bigsib", name: "Big sib", role: "sibling", icon: "🧒", ageOffset: 4, generation: 0, tone: "sibling" },
      { id: "player", name: this.playerDisplayName(), role: "you", icon: playerIcon, ageOffset: 0, generation: 0, tone: "you", locked: true },
    ];
    this.familyEdges = [];
    this.ensureFamilyEdge("grandpa", "daddy", "parent", "parent");
    this.ensureFamilyEdge("grandma", "mommy", "parent", "parent");
    this.ensureFamilyEdge("daddy", "bigsib", "parent", "parent");
    this.ensureFamilyEdge("mommy", "bigsib", "parent", "parent");
    this.ensureFamilyEdge("daddy", "player", "parent", "parent");
    this.ensureFamilyEdge("mommy", "player", "parent", "parent");
    this.familySelectedId = "player";
    this.familyNextId = 1;
  }

  private selectedFamilyMember(): FamilyMember {
    let member = this.familyMembers.find((m) => m.id === this.familySelectedId);
    if (!member) {
      this.familySelectedId = "player";
      member = this.familyMembers.find((m) => m.id === "player") ?? this.familyMembers[0];
    }
    return member;
  }

  private upsertFamilyMember(member: FamilyMember, refresh = false): boolean {
    const existing = this.familyMembers.find((m) => m.id === member.id);
    if (existing) {
      if (refresh) Object.assign(existing, member);
      return false;
    }
    this.familyMembers.push(member);
    return true;
  }

  private familyRelationId(from: string, to: string, kind: FamilyRelationKind): string {
    const pair = kind === "partner" || kind === "sibling" ? [from, to].sort() : [from, to];
    return `${pair[0]}-${pair[1]}-${kind}`;
  }

  private ensureFamilyEdge(from: string, to: string, kind: FamilyRelationKind, label: string = kind): void {
    if (from === to) return;
    const id = this.familyRelationId(from, to, kind);
    const existing = this.familyEdges.find((e) => e.id === id);
    if (existing) {
      existing.label = label;
      return;
    }
    this.familyEdges.push({ id, from, to, kind, label });
  }

  private connectFamilyRelation(baseId: string, otherId: string, relation: FamilyRelationKind): void {
    const base = this.familyMembers.find((m) => m.id === baseId);
    const other = this.familyMembers.find((m) => m.id === otherId);
    if (!base || !other || base.id === other.id) return;
    if (relation === "parent") this.ensureFamilyEdge(other.id, base.id, relation, "parent");
    else if (relation === "child") this.ensureFamilyEdge(base.id, other.id, relation, "child");
    else this.ensureFamilyEdge(base.id, other.id, relation, relation);
  }

  private syncFamilyGraph(): void {
    if (!this.familyMembers.length) this.resetFamilyGraph();
    const playerIcon = this.gender === "female" ? "👧" : "👦";
    const player = this.familyMembers.find((m) => m.id === "player");
    if (player) {
      player.name = this.playerDisplayName();
      player.ageOffset = 0;
      player.generation = 0;
      player.tone = "you";
      player.locked = true;
    } else {
      this.upsertFamilyMember({
        id: "player",
        name: this.playerDisplayName(),
        role: "you",
        icon: playerIcon,
        ageOffset: 0,
        generation: 0,
        tone: "you",
        locked: true,
      });
    }

    const hasBabySibling = this.age >= 1 || this.history.some((h) => h.optionId === "babysib");
    if (hasBabySibling && !this.familyHiddenIds.has("babysib")) {
      const added = this.upsertFamilyMember({ id: "babysib", name: "Baby sib", role: "sibling", icon: "👶", ageOffset: -1, generation: 0, tone: "sibling" });
      if (added) {
        this.ensureFamilyEdge("daddy", "babysib", "parent", "parent");
        this.ensureFamilyEdge("mommy", "babysib", "parent", "parent");
      }
    }

    if (this.partner && !this.familyHiddenIds.has("partner")) {
      const added = this.upsertFamilyMember({
        id: "partner",
        name: this.partner.name,
        role: this.partner.title,
        icon: this.partner.emoji,
        ageOffset: -1,
        generation: 0,
        tone: "partner",
      });
      if (added) this.ensureFamilyEdge("player", "partner", "partner", this.spouseDeceased ? "widowed" : "partner");
    }

    if (this.hadChild && !this.familyHiddenIds.has("child")) {
      const added = this.upsertFamilyMember({ id: "child", name: "Baby", role: "your child", icon: this.age - 30 < 3 ? "👶" : "🧒", ageOffset: -30, generation: 1, tone: "child" });
      if (added) {
        this.ensureFamilyEdge("player", "child", "child", "child");
        if (this.partner && !this.familyHiddenIds.has("partner")) this.ensureFamilyEdge("partner", "child", "child", "child");
      }
    }

    if (this.hadChild && this.familyBond >= 3 && this.age >= 60 && !this.familyHiddenIds.has("grandkid")) {
      const added = this.upsertFamilyMember({ id: "grandkid", name: "Little Star", role: "grandkid", icon: "👶", ageOffset: -60, generation: 2, tone: "child" });
      if (added) this.ensureFamilyEdge("child", "grandkid", "child", "child");
    }

    const ids = new Set(this.familyMembers.map((m) => m.id));
    this.familyEdges = this.familyEdges.filter((e) => ids.has(e.from) && ids.has(e.to));
    if (!ids.has(this.familySelectedId)) this.familySelectedId = "player";
  }

  private familyAgeValue(member: FamilyMember): number {
    return Math.max(0, Math.floor(this.age + member.ageOffset));
  }

  private familyAgeLabel(member: FamilyMember): string {
    const age = this.familyAgeValue(member);
    return age <= 0 ? "newborn" : `age ${age}`;
  }

  private familyMemberOptions(exceptId = ""): string {
    return this.familyMembers
      .filter((m) => m.id !== exceptId)
      .map((m) => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.role)})</option>`)
      .join("");
  }

  private familyRelationOptions(): string {
    return `
      <option value="parent">parent of selected</option>
      <option value="child">child of selected</option>
      <option value="partner">partner of selected</option>
      <option value="sibling">sibling of selected</option>`;
  }

  private familyGraphMarkup(): string {
    const width = 620;
    const nodeW = 84;
    const nodeH = 94;
    const top = 20;
    const rowGap = 120;
    const gens = [...new Set(this.familyMembers.map((m) => m.generation))].sort((a, b) => a - b);
    const minGen = gens[0] ?? -1;
    const order = ["grandpa", "grandma", "daddy", "mommy", "bigsib", "babysib", "player", "partner", "child", "grandkid"];
    const positions = new Map<string, { x: number; y: number; cx: number; cy: number }>();
    for (const gen of gens) {
      const row = this.familyMembers
        .filter((m) => m.generation === gen)
        .sort((a, b) => (order.indexOf(a.id) === -1 ? 999 : order.indexOf(a.id)) - (order.indexOf(b.id) === -1 ? 999 : order.indexOf(b.id)) || a.name.localeCompare(b.name));
      row.forEach((member, index) => {
        const cx = Math.round((width / (row.length + 1)) * (index + 1));
        const y = top + (gen - minGen) * rowGap;
        positions.set(member.id, { x: cx - nodeW / 2, y, cx, cy: y + nodeH / 2 });
      });
    }
    const height = Math.max(360, top * 2 + Math.max(1, gens.length) * rowGap);
    const lines = this.familyEdges.map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return "";
      const mx = Math.round((from.cx + to.cx) / 2);
      const my = Math.round((from.cy + to.cy) / 2);
      return `
        <g class="plj-family-edge ${esc(edge.kind)}">
          <line x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}"></line>
          <text x="${mx}" y="${my - 4}">${esc(edge.label)}</text>
        </g>`;
    }).join("");
    const nodes = this.familyMembers.map((member) => {
      const p = positions.get(member.id);
      if (!p) return "";
      const selected = member.id === this.familySelectedId ? " is-selected" : "";
      const locked = member.locked ? " is-locked" : "";
      return `
        <button class="plj-family-node ${esc(member.tone)}${selected}${locked}" data-family-id="${esc(member.id)}" style="left:${p.x}px;top:${p.y}px">
          <span class="plj-family-name">${esc(member.name)}</span>
          <span class="plj-family-face">${esc(member.icon)}</span>
          <span class="plj-family-role">${esc(member.role)}</span>
          <small>${this.familyAgeLabel(member)}</small>
        </button>`;
    }).join("");
    return `
      <div class="plj-family-graph" style="--family-graph-w:${width}px;--family-graph-h:${height}px">
        <svg class="plj-family-lines" viewBox="0 0 ${width} ${height}" aria-hidden="true">${lines}</svg>
        ${nodes}
      </div>`;
  }

  private familyEditorMarkup(): string {
    const selected = this.selectedFamilyMember();
    const deleteDisabled = selected.locked ? "disabled" : "";
    const related = this.familyEdges
      .filter((edge) => edge.from === selected.id || edge.to === selected.id)
      .map((edge) => {
        const otherId = edge.from === selected.id ? edge.to : edge.from;
        const other = this.familyMembers.find((m) => m.id === otherId);
        return `
          <div class="plj-family-relation-row">
            <span>${esc(edge.label)}: <b>${esc(other?.name ?? "unknown")}</b></span>
            <button class="plj-mini-pill" data-family-unlink="${esc(edge.id)}">Remove</button>
          </div>`;
      }).join("") || `<div class="plj-family-empty">No relation lines yet.</div>`;
    return `
      <div class="plj-family-editor">
        <div class="plj-family-edit-box">
          <h3>Edit selected</h3>
          <div class="plj-family-form-grid">
            <label>Name <input id="plj-family-name" maxlength="20" value="${esc(selected.name)}"></label>
            <label>Role <input id="plj-family-role" maxlength="24" value="${esc(selected.role)}"></label>
            <label>Age <input id="plj-family-age" type="number" min="0" max="120" value="${this.familyAgeValue(selected)}" inputmode="numeric"></label>
            <label>Icon <input id="plj-family-icon" maxlength="4" value="${esc(selected.icon)}"></label>
          </div>
          <div class="plj-family-toolbar">
            <button class="plj-mini-pill is-primary" id="plj-family-save">Save</button>
            <button class="plj-mini-pill" id="plj-family-delete" ${deleteDisabled}>Delete</button>
          </div>
        </div>
        <div class="plj-family-edit-box">
          <h3>Add person</h3>
          <div class="plj-family-form-grid">
            <label>Name <input id="plj-family-add-name" maxlength="20" value="New relative"></label>
            <label>Role <input id="plj-family-add-role" maxlength="24" value="relative"></label>
            <label>Age <input id="plj-family-add-age" type="number" min="0" max="120" value="${Math.max(0, this.familyAgeValue(selected) - 2)}" inputmode="numeric"></label>
            <label>Icon <input id="plj-family-add-icon" maxlength="4" value="🙂"></label>
            <label class="plj-family-wide">Relation <select id="plj-family-add-relation">${this.familyRelationOptions()}</select></label>
          </div>
          <button class="plj-mini-pill is-primary" id="plj-family-add">Add to graph</button>
        </div>
        <div class="plj-family-edit-box">
          <h3>Relationships</h3>
          <div class="plj-family-link-controls">
            <select id="plj-family-link-target">${this.familyMemberOptions(selected.id)}</select>
            <select id="plj-family-link-relation">${this.familyRelationOptions()}</select>
            <button class="plj-mini-pill is-primary" id="plj-family-link">Link</button>
          </div>
          <div class="plj-family-relations">${related}</div>
        </div>
      </div>`;
  }

  private birthHomeLabel(): string {
    if (this.familyFund >= 1200000) return "wealthy villa";
    if (this.familyFund >= 600000) return "large family house";
    if (this.familyFund >= 250000) return "comfortable home";
    if (this.familyFund >= 80000) return "small apartment";
    return "simple rented room";
  }

  private showFamilyTree(): void {
    if (this.mode !== "playing") return;
    if (!this.canShowFamilyTreeGate()) {
      this.hint("Family Tree opens from elementary school.");
      return;
    }
    this.mode = "familytree";
    this.renderFamilyTreeOverlay();
  }

  private renderFamilyTreeOverlay(): void {
    this.syncFamilyGraph();
    const liveHome = this.liveHome();
    const houseCards = [
      `<div class="plj-house-chip"><b>Parents' home</b><span>${esc(this.birthHomeLabel())}</span><small>Family fund ${formatMoney(this.familyFund)}</small></div>`,
      ...(liveHome ? [`<div class="plj-house-chip is-live"><b>${liveHome.emoji} Your house</b><span>${esc(liveHome.name)}</span><small>value ${formatMoney(this.houseAssetValue(liveHome, this.homes.indexOf(liveHome)))}</small></div>`] : []),
      ...this.homes
        .map((h, i) => ({ h, i }))
        .filter(({ h }) => h !== liveHome)
        .map(({ h, i }) => `<div class="plj-house-chip"><b>${h.emoji} Rental house</b><span>${esc(h.name)}</span><small>rent ${formatMoney(h.rentYield)}/yr</small></div>`),
      `<div class="plj-house-chip"><b>Sibling house</b><span>other branch</span><small>browse the family map</small></div>`,
    ].join("");

    const utilityButtons = `
      <div class="plj-mini-actions">
        <button class="plj-mini-pill" id="plj-tree-training">🏫 Training</button>
        ${this.canShowAssetsGate() ? `<button class="plj-mini-pill" id="plj-tree-assets">💼 Assets</button>` : ""}
        <button class="plj-mini-pill" id="plj-tree-friends">👥 Friends</button>
      </div>`;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-family-card">
        <div class="plj-family-head">
          <h2>🌳 Family Tree</h2>
          ${utilityButtons}
        </div>
        <p class="plj-sub">Tap a person to edit them — or use <b>Add person</b> below to put a new relative on the graph (pick parent / child / partner / sibling). Relationships draw the lines between them.</p>
        <div class="plj-family-map">${this.familyGraphMarkup()}</div>
        ${this.familyEditorMarkup()}
        <h3 class="plj-prof-h3">🏘️ Houses</h3>
        <div class="plj-family-houses">${houseCards}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-tree-close">← Back</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.bindFamilyTreeOverlay();
  }

  private bindFamilyTreeOverlay(): void {
    const ov = this.ui.overlay;
    ov.querySelectorAll<HTMLButtonElement>("[data-family-id]").forEach((btn) => {
      btn.onclick = () => {
        this.familySelectedId = btn.dataset.familyId ?? "player";
        this.renderFamilyTreeOverlay();
      };
    });
    ov.querySelector<HTMLButtonElement>("#plj-family-save")!.onclick = () => {
      const selected = this.selectedFamilyMember();
      const name = ov.querySelector<HTMLInputElement>("#plj-family-name")!.value.trim();
      const role = ov.querySelector<HTMLInputElement>("#plj-family-role")!.value.trim();
      const icon = ov.querySelector<HTMLInputElement>("#plj-family-icon")!.value.trim();
      const age = Number(ov.querySelector<HTMLInputElement>("#plj-family-age")!.value);
      selected.name = name || selected.name;
      selected.role = role || selected.role;
      selected.icon = icon || selected.icon;
      if (Number.isFinite(age)) selected.ageOffset = Math.round(Math.max(0, age)) - Math.floor(this.age);
      if (selected.id === "player") this.playerName = selected.name;
      this.captureFamilyEdit("Saved family member.");
      this.renderFamilyTreeOverlay();
    };
    ov.querySelector<HTMLButtonElement>("#plj-family-delete")!.onclick = () => {
      const selected = this.selectedFamilyMember();
      if (selected.locked) {
        this.hint("You stay in your own family tree.");
        return;
      }
      this.familyHiddenIds.add(selected.id);
      this.familyMembers = this.familyMembers.filter((m) => m.id !== selected.id);
      this.familyEdges = this.familyEdges.filter((e) => e.from !== selected.id && e.to !== selected.id);
      this.familySelectedId = "player";
      this.captureFamilyEdit("Removed family member.");
      this.renderFamilyTreeOverlay();
    };
    ov.querySelector<HTMLButtonElement>("#plj-family-add")!.onclick = () => {
      const selected = this.selectedFamilyMember();
      const relation = ov.querySelector<HTMLSelectElement>("#plj-family-add-relation")!.value as FamilyRelationKind;
      const name = ov.querySelector<HTMLInputElement>("#plj-family-add-name")!.value.trim() || "New relative";
      const role = ov.querySelector<HTMLInputElement>("#plj-family-add-role")!.value.trim() || "relative";
      const icon = ov.querySelector<HTMLInputElement>("#plj-family-add-icon")!.value.trim() || "🙂";
      const age = Number(ov.querySelector<HTMLInputElement>("#plj-family-add-age")!.value);
      const generation = relation === "parent" ? selected.generation - 1 : relation === "child" ? selected.generation + 1 : selected.generation;
      const id = `custom-${this.familyNextId++}`;
      this.familyMembers.push({
        id,
        name,
        role,
        icon,
        ageOffset: Number.isFinite(age) ? Math.round(Math.max(0, age)) - Math.floor(this.age) : 0,
        generation,
        tone: "custom",
      });
      this.connectFamilyRelation(selected.id, id, relation);
      this.familySelectedId = id;
      this.captureFamilyEdit("Added family member.");
      this.renderFamilyTreeOverlay();
    };
    ov.querySelector<HTMLButtonElement>("#plj-family-link")!.onclick = () => {
      const selected = this.selectedFamilyMember();
      const otherId = ov.querySelector<HTMLSelectElement>("#plj-family-link-target")!.value;
      const relation = ov.querySelector<HTMLSelectElement>("#plj-family-link-relation")!.value as FamilyRelationKind;
      this.connectFamilyRelation(selected.id, otherId, relation);
      this.captureFamilyEdit("Updated family relationship.");
      this.renderFamilyTreeOverlay();
    };
    ov.querySelectorAll<HTMLButtonElement>("[data-family-unlink]").forEach((btn) => {
      btn.onclick = () => {
        const edgeId = btn.dataset.familyUnlink;
        this.familyEdges = this.familyEdges.filter((edge) => edge.id !== edgeId);
        this.captureFamilyEdit("Removed family relationship.");
        this.renderFamilyTreeOverlay();
      };
    });
    ov.querySelector<HTMLButtonElement>("#plj-tree-close")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
    const assetsLink = ov.querySelector<HTMLButtonElement>("#plj-tree-assets");
    if (assetsLink) assetsLink.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showAssets();
    };
    ov.querySelector<HTMLButtonElement>("#plj-tree-training")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showTraining();
    };
    ov.querySelector<HTMLButtonElement>("#plj-tree-friends")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showFriends();
    };
  }

  private captureFamilyEdit(message: string): void {
    this.familyEdges = this.familyEdges.filter((edge) =>
      this.familyMembers.some((m) => m.id === edge.from) &&
      this.familyMembers.some((m) => m.id === edge.to)
    );
    if (this.timeline[this.stageIndex]) this.timeline[this.stageIndex] = this.snapshot();
    this.hint(message);
    this.persistGame();
  }

  private annualPlayerIncome(): number {
    return this.occupation ? Math.round(28000 * this.incomeMul() * this.occupation.salaryMul) : 0;
  }

  private grandparentSupport(): number {
    if (this.age >= PARENT_SUPPORT_END_AGE) return 0;
    return Math.round(Math.min(24000, Math.max(500, this.familyFund * 0.012)) / 100) * 100;
  }

  private annualExpenseBreakdown(): { label: string; value: number; note: string }[] {
    const discount = activityDiscount(this.stats);
    const adult = this.age >= 18 || !!this.occupation;
    const rent = adult && this.homes.length === 0
      ? Math.round((this.age < 24 ? 9000 : this.age < 65 ? 18000 : 12000) * discount)
      : 0;
    const foodPlay = Math.round((this.age < 4 ? 1800 : this.age < 13 ? 3200 : this.age < 18 ? 5200 : this.age < 65 ? 9600 : 7600) * discount);
    const vehicle = this.ownedVehicles().reduce((sum, v) => sum + Math.round(Math.max(80, v.cost * 0.055)), 0);
    const spouse = this.partner && !this.spouseDeceased ? 4500 : 0;
    const child = this.hadChild ? (this.age < 55 ? 7200 : 1800) : 0;
    const pet = this.petKind ? 900 : 0;
    return [
      { label: "You", value: foodPlay + rent, note: rent > 0 ? "food, play, rent" : "food and play" },
      { label: "House", value: this.houseUpkeep, note: this.homes.length ? "upkeep" : "no owned house" },
      { label: "Vehicle", value: vehicle, note: this.ownedVehicles().length ? "running cost" : "no vehicle" },
      { label: "Partner", value: spouse, note: this.partner && !this.spouseDeceased ? this.partner.name : "none" },
      { label: "Child", value: child, note: this.hadChild ? "care and school" : "none" },
      { label: "Pet", value: pet, note: this.petKind ?? "none" },
    ];
  }

  private ledgerRows(rows: { label: string; value: number; note?: string; positive?: boolean }[]): string {
    return rows.map((r) => `
      <div class="plj-ledger-row">
        <span><b>${esc(r.label)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ""}</span>
        <strong class="${r.positive === false ? "is-cost" : ""}">${formatMoney(r.value)}</strong>
      </div>`).join("");
  }

  private spendTrainingMoment(): void {
    this.age += Math.max(0.01, this.stageStep() * 0.16);
    this.passiveTick();
    this.renderHud();
  }

  private parseTrainingQuestion(value: unknown): TrainingQuestion | null {
    const row = value as Partial<TrainingQuestion> | null;
    if (!row || typeof row.q !== "string" || !Array.isArray(row.answers) || typeof row.correct !== "number" || typeof row.win !== "string") return null;
    const answers = row.answers.filter((answer): answer is string => typeof answer === "string" && answer.trim().length > 0).slice(0, 3);
    const correct = Math.round(row.correct);
    if (answers.length !== 3 || correct < 0 || correct >= answers.length) return null;
    return {
      q: row.q.trim(),
      answers,
      correct,
      win: row.win.trim(),
    };
  }

  private parseTrainingBank(value: unknown): Partial<Record<TrainingCategory, TrainingQuestionBank>> | null {
    const root = value as { categories?: unknown } | null;
    const categories = root?.categories as Partial<Record<TrainingCategory, Partial<Record<TrainingLevel, unknown>>>> | undefined;
    if (!categories) return null;
    const parsed: Partial<Record<TrainingCategory, TrainingQuestionBank>> = {};
    for (const category of TRAINING_CATEGORIES) {
      const categoryRows = categories[category];
      if (!categoryRows) continue;
      const bank = {} as TrainingQuestionBank;
      let complete = true;
      for (const { id: level } of TRAINING_LEVELS) {
        const rows = categoryRows[level];
        if (!Array.isArray(rows)) {
          complete = false;
          break;
        }
        bank[level] = rows.map((row) => this.parseTrainingQuestion(row)).filter((row): row is TrainingQuestion => !!row);
        if (!bank[level].length) {
          complete = false;
          break;
        }
      }
      if (complete) parsed[category] = bank;
    }
    return Object.keys(parsed).length ? parsed : null;
  }

  private async loadTrainingDatabase(): Promise<void> {
    try {
      const response = await fetch(TRAINING_DATABASE_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = this.parseTrainingBank(await response.json());
      if (!parsed) throw new Error("invalid training database");
      this.trainingDatabase = parsed;
      if (this.mode === "training") this.showTraining();
    } catch (err) {
      console.warn("[choice-of-life] using built-in training questions", err);
    }
  }

  private trainingQuestions(category: TrainingCategory): readonly TrainingQuestion[] {
    const level = this.trainingLevel[category];
    const external = this.trainingDatabase?.[category]?.[level];
    if (external?.length) return external;
    if (category === "iq") {
      const [from, to] = TRAINING_IQ_RANGES[level];
      return [...TRAINING_PUZZLES.slice(from, Math.min(to, TRAINING_PUZZLES.length)), ...TRAINING_IQ_EXTRA_BANKS[level]];
    }
    return [...TRAINING_BANKS[category][level], ...TRAINING_EXTRA_BANKS[category][level]];
  }

  private fallbackTrainingCategoryTotal(category: TrainingCategory): number {
    if (category === "iq") {
      return TRAINING_PUZZLES.length + Object.values(TRAINING_IQ_EXTRA_BANKS).reduce((sum, questions) => sum + questions.length, 0);
    }
    return Object.values(TRAINING_BANKS[category]).reduce((sum, questions) => sum + questions.length, 0) +
      Object.values(TRAINING_EXTRA_BANKS[category]).reduce((sum, questions) => sum + questions.length, 0);
  }

  private trainingCategoryTotal(category: TrainingCategory): number {
    const external = this.trainingDatabase?.[category];
    if (external) return TRAINING_LEVELS.reduce((sum, level) => sum + (external[level.id]?.length ?? 0), 0);
    return this.fallbackTrainingCategoryTotal(category);
  }

  private trainingTotalQuestions(): number {
    return TRAINING_CATEGORIES.reduce((sum, category) => sum + this.trainingCategoryTotal(category), 0);
  }

  private setTrainingLevel(category: TrainingCategory, level: TrainingLevel): void {
    this.trainingLevel[category] = level;
    this.trainingQuestionIndex[category] = 0;
    this.showTraining();
  }

  private trainingWin(category: TrainingCategory, win: string): string {
    if (category === "iq") {
      this.applyEff({ smarts: 2, fun: 1 }, "mental");
      this.hint("🧠 IQ question solved. +2 IQ.");
      return win;
    }
    if (category === "eq") {
      this.familyBond += 0.8;
      this.applyEff({ health: 3, happiness: 2 }, "mental");
      this.hint("💛 EQ question solved. +Mental health.");
      return `${win} +Mental health, +Happy, +Family bond.`;
    }
    const bonus = Math.round(this.age < 18 ? 150 + this.stats.smarts * 6 : 500 + this.stats.smarts * 14);
    this.moneyWise = true;
    this.money += bonus;
    this.lifetimeEarned += bonus;
    this.connections += 1;
    this.applyEff({ smarts: 1, happiness: 0.5 }, "mental");
    this.hint(`📈 Strategy solved. +${formatMoney(bonus)}.`);
    return `${win} ${formatMoney(bonus)} earned, +network, moneyWise on.`;
  }

  private solveTrainingPuzzle(category: TrainingCategory, answer: number): void {
    const questions = this.trainingQuestions(category);
    const puzzle = questions[this.trainingQuestionIndex[category] % questions.length];
    if (answer === puzzle.correct) {
      const win = this.trainingWin(category, puzzle.win);
      this.trainingQuestionIndex[category] = (this.trainingQuestionIndex[category] + 1) % questions.length;
      this.spendTrainingMoment();
      this.showTraining(win);
      return;
    }
    let miss = "Not quite. The practice still warmed up your brain. +1 Fun.";
    if (category === "eq") {
      this.applyEff({ happiness: 1 }, "mental");
      miss = "Not quite. Reflection still helps emotional balance. +1 Happy.";
    } else if (category === "strategy") {
      this.applyEff({ smarts: 0.3, fun: 0.5 }, "mental");
      miss = "Not quite. Planning practice still helped a little. +Strategy practice.";
    } else {
      this.applyEff({ fun: 1 }, "mental");
    }
    this.spendTrainingMoment();
    this.hint("Close. Try another angle.");
    this.showTraining(miss);
  }

  private useTrainingVideo(kind: TrainingKind): void {
    window.open(TRAINING_LINKS[kind], "_blank", "noopener,noreferrer");
    if (kind === "iq") {
      this.applyEff({ smarts: 1.5, happiness: 1 }, "mental");
      this.spendTrainingMoment();
      this.hint("🎓 Learning habits watched. +IQ.");
      this.showTraining("You looked up smarter learning habits. +1.5 IQ, +1 Happy.");
      return;
    }
    if (kind === "money") {
      const bonus = Math.round(this.age < 18 ? 200 + this.stats.smarts * 8 : 800 + this.stats.smarts * 18);
      this.moneyWise = true;
      this.money += bonus;
      this.lifetimeEarned += bonus;
      this.applyEff({ smarts: 0.8 }, "mental");
      this.spendTrainingMoment();
      this.hint(`💸 Money lesson. +${formatMoney(bonus)}.`);
      this.showTraining(`Financial education helped you earn ${formatMoney(bonus)} and unlocked wiser money habits.`);
      return;
    }
    this.familyBond += 1;
    this.applyEff({ health: 5, happiness: 3 }, "mental");
    this.spendTrainingMoment();
    this.hint("💛 Family care learning. +Mental health.");
    this.showTraining("You studied how to treat family well. +Mental health, +Happy, +Family bond.");
  }

  private trainingQuizRow(category: TrainingCategory): string {
    const meta = TRAINING_CATEGORY_META[category];
    const level = this.trainingLevel[category];
    const questions = this.trainingQuestions(category);
    const questionNumber = this.trainingQuestionIndex[category] % questions.length;
    const puzzle = questions[questionNumber];
    const levels = TRAINING_LEVELS.map((l) => `
      <button class="plj-training-level${l.id === level ? " is-selected" : ""}" data-training-category="${category}" data-training-level="${l.id}">
        ${esc(l.label)}
      </button>`).join("");
    const answers = stableAnswerOrder(`${category}-${level}-${questionNumber}-${puzzle.q}`, puzzle.answers.length).map((answerIndex) =>
      `<button class="plj-training-answer" data-training-category="${category}" data-answer="${answerIndex}">${esc(puzzle.answers[answerIndex])}</button>`
    ).join("");
    // Questions carry an auto-generated flavor wrapper ending in a code like
    // "...card S008:". Pull that code out as a small index badge at the front so
    // players don't read it as part of the actual question.
    let qIndex = "";
    let qText = puzzle.q;
    const colonAt = puzzle.q.indexOf(": ");
    if (colonAt > 0) {
      const codeMatch = puzzle.q.slice(0, colonAt).match(/\b([A-Z]\d{2,})\b/);
      if (codeMatch) { qIndex = codeMatch[1]; qText = puzzle.q.slice(colonAt + 2).trim(); }
    }
    return `
      <section class="plj-training-puzzle is-${category}">
        <div class="plj-training-row-head">
          <h3>${meta.icon} ${esc(meta.title)} <span class="plj-training-count">Question ${questionNumber + 1} / ${questions.length}</span></h3>
          <div class="plj-training-levels" aria-label="${esc(meta.title)} level">${levels}</div>
        </div>
        <p class="plj-training-summary">${esc(meta.summary)}</p>
        <p class="plj-training-q">${qIndex ? `<span class="plj-q-index">${esc(qIndex)}</span>` : ""}${esc(qText)}</p>
        <div class="plj-training-answers">${answers}</div>
      </section>`;
  }

  private showTraining(message = ""): void {
    if (this.mode !== "playing" && this.mode !== "training") return;
    if (!this.canShowTrainingGate()) {
      this.hint("Training opens from elementary school.");
      return;
    }
    this.mode = "training";
    const quizRows = TRAINING_CATEGORIES.map((category) => this.trainingQuizRow(category)).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-training-card">
        <div class="plj-family-head">
          <h2>🏫 Training</h2>
          <div class="plj-mini-actions">
            ${this.canShowAssetsGate() ? `<button class="plj-mini-pill" id="plj-training-assets">💼 Assets</button>` : ""}
            ${this.canShowFamilyTreeGate() ? `<button class="plj-mini-pill" id="plj-training-tree">🌳 Family Tree</button>` : ""}
            ${this.canShowFamilyTreeGate() ? `<button class="plj-mini-pill" id="plj-training-friends">👥 Friends</button>` : ""}
          </div>
        </div>
        <p class="plj-sub">Practice thinking, EQ, and career strategy. ${this.trainingTotalQuestions()} built-in questions are split across three levels; each session takes a tiny slice of life time.</p>
        ${message ? `<p class="plj-training-result">${esc(message)}</p>` : ""}
        <div class="plj-training-board">${quizRows}</div>
        <div class="plj-training-grid">
          <button class="plj-training-action" data-train="iq">
            <span>🧠 Smarter habits</span>
            <small>Open YouTube search: how to be smarter. Reward: +IQ.</small>
          </button>
          <button class="plj-training-action" data-train="money">
            <span>💸 Money education</span>
            <small>Open YouTube search: earn more money. Reward: cash + moneyWise.</small>
          </button>
          <button class="plj-training-action" data-train="family">
            <span>💛 Treat family well</span>
            <small>Open YouTube search: family care and mental health. Reward: mental health.</small>
          </button>
        </div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-training-close">← Back</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>("[data-answer]").forEach((btn) => {
      const category = btn.dataset.trainingCategory as TrainingCategory | undefined;
      btn.onclick = () => {
        if (category === "iq" || category === "eq" || category === "strategy") this.solveTrainingPuzzle(category, Number(btn.dataset.answer));
      };
    });
    this.ui.overlay.querySelectorAll<HTMLButtonElement>("[data-training-level]").forEach((btn) => {
      const category = btn.dataset.trainingCategory as TrainingCategory | undefined;
      const level = btn.dataset.trainingLevel as TrainingLevel | undefined;
      btn.onclick = () => {
        if ((category === "iq" || category === "eq" || category === "strategy") &&
          (level === "starter" || level === "practice" || level === "advanced")) {
          this.setTrainingLevel(category, level);
        }
      };
    });
    this.ui.overlay.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((btn) => {
      btn.onclick = () => {
        const kind = btn.dataset.train;
        if (kind === "iq" || kind === "money" || kind === "family") this.useTrainingVideo(kind);
      };
    });
    const assetsBtn = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-training-assets");
    if (assetsBtn) assetsBtn.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showAssets();
    };
    const treeBtn = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-training-tree");
    if (treeBtn) treeBtn.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showFamilyTree();
    };
    const friendsBtn = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-training-friends");
    if (friendsBtn) friendsBtn.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showFriends();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-training-close")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  /** Move each market price one chapter forward: drift up with a little randomness. */
  private stepMarket(years: number): void {
    const n = Math.max(1, Math.round(years));
    for (const a of MARKET_ASSETS) {
      let p = this.market[a.key];
      for (let y = 0; y < n; y++) {
        const shock = (Math.random() * 2 - 1) * a.vol;
        p *= 1 + a.drift + shock;
      }
      this.market[a.key] = Math.max(5, Math.round(p * 100) / 100);
    }
  }

  /** Buy a $ amount of an asset, or sell a fraction (1 = all) of a holding. */
  private tradeAsset(key: MarketKey, action: "buy" | "sell", amount: number): void {
    if (this.mode !== "assets") return;
    const price = this.market[key];
    if (action === "buy") {
      const spend = Math.min(amount, this.money);
      if (spend < 1) { this.hint("Not enough cash to invest."); return; }
      this.money -= spend;
      this.holdings[key] += spend / price;
    } else {
      const units = this.holdings[key] * Math.max(0, Math.min(1, amount));
      if (units <= 0) { this.hint("You don't hold any of that yet."); return; }
      this.holdings[key] -= units;
      this.money += units * price;
    }
    if (this.timeline[this.stageIndex]) this.timeline[this.stageIndex] = this.snapshot();
    this.persistGame();
    this.showAssets();
  }

  /** The buy/sell rows for the Assets market. */
  private marketRows(): string {
    return MARKET_ASSETS.map((a) => {
      const price = this.market[a.key];
      const value = this.holdings[a.key] * price;
      const pct = Math.round((price / 100 - 1) * 100);
      const arrow = pct >= 0 ? "▲" : "▼";
      const buy10 = Math.max(1, Math.round(this.money * 0.1));
      const buy50 = Math.max(1, Math.round(this.money * 0.5));
      return `
        <div class="plj-market-row">
          <div class="plj-market-main">
            <span class="plj-market-name">${a.icon} ${esc(a.name)}</span>
            <span class="plj-market-index ${pct >= 0 ? "is-up" : "is-down"}">${price.toFixed(0)} <small>${arrow}${Math.abs(pct)}%</small></span>
          </div>
          <div class="plj-market-hold">hold ${formatMoney(Math.round(value))}</div>
          <div class="plj-market-actions">
            <button class="plj-mini-pill" data-buy="${a.key}" data-amt="${buy10}">Buy ${formatMoney(buy10)}</button>
            <button class="plj-mini-pill" data-buy="${a.key}" data-amt="${buy50}">Buy ${formatMoney(buy50)}</button>
            <button class="plj-mini-pill" data-sell="${a.key}">Sell all</button>
          </div>
        </div>`;
    }).join("");
  }

  /** Generate one friend that fits the moment: age near yours, plausible IQ. */
  private makeFriend(spec: { how: string; iqBias?: number; ageSpread?: number }): Friend {
    const ordinal = this.friendNextId++;
    const gender = friendGenderForOrdinal(
      this.lifeSeed,
      ordinal
    );
    const ordinalWithinGender = this.friends.filter(
      (friend) => friend.gender === gender
    ).length;
    const usedVisualKeys = this.friends
      .filter(
        (friend) =>
          friend.gender === gender &&
          friend.heritage &&
          friend.appearance
      )
      .map((friend) =>
        friendVisualKey({
          heritage: friend.heritage!,
          appearance: friend.appearance!,
        })
      );
    const identity = nextFriendVisualIdentity(
      this.lifeSeed,
      gender,
      usedVisualKeys,
      ordinalWithinGender
    );
    const firsts = gender === "female" ? FRIEND_FIRST_F : FRIEND_FIRST_M;
    const first = firsts[Math.floor(Math.random() * firsts.length)];
    const last = FRIEND_LAST[Math.floor(Math.random() * FRIEND_LAST.length)];
    const spread = spec.ageSpread ?? 2;
    const ageOffset = Math.round((Math.random() * 2 - 1) * spread);
    const iq = Math.max(70, Math.min(145, Math.round(gaussian(100, 12) + (spec.iqBias ?? 0))));
    const bond = Math.max(8, Math.min(96, Math.round((FRIEND_BOND_BASE[spec.how] ?? 44) + (Math.random() * 16 - 8))));
    const vibe = FRIEND_VIBES[Math.floor(Math.random() * FRIEND_VIBES.length)];
    return {
      id: "fr" + ordinal,
      name: `${first} ${last}`,
      gender,
      ...identity,
      ageOffset,
      iq,
      how: spec.how,
      since: STAGES[this.stageIndex]?.name ?? "school",
      bond,
      vibe,
    };
  }

  /** On entering a new chapter (elementary onward), add that stage's new friends. */
  private addFriendsForStage(): void {
    const stage = STAGES[this.stageIndex];
    if (!stage || this.stageIndex < ELEMENTARY_INDEX) return;
    const plan = FRIEND_PLAN[stage.id];
    if (!plan) return;
    for (const spec of plan) {
      if (this.friends.length >= FRIEND_CAP) break;
      this.friends.push(this.makeFriend(spec));
    }
  }

  /** Friendships evolve each chapter — most grow closer, a few quietly drift apart. */
  private growFriends(): void {
    for (const f of this.friends) {
      if (Math.random() < 0.15) f.bond = Math.max(0, f.bond - (3 + Math.floor(Math.random() * 9)));
      else f.bond = Math.min(100, f.bond + (2 + Math.floor(Math.random() * 6)));
    }
  }

  /** Closeness tier (label + css class) for a bond score. */
  private bondTier(b: number): { label: string; cls: string } {
    if (b >= 80) return { label: "inseparable", cls: "is-best" };
    if (b >= 60) return { label: "close", cls: "is-close" };
    if (b >= 35) return { label: "good", cls: "is-good" };
    return { label: "drifting", cls: "is-far" };
  }

  /** Storybook age band for a friend who grows alongside the player. */
  private friendStageIndex(f: Friend): number {
    const age = friendAgeForStage(
      this.age,
      this.stageIndex,
      f.ageOffset
    );
    const index = STAGES.findIndex(
      (stage) =>
        age >= stage.ageStart && age < stage.ageEnd
    );
    return index >= 0 ? index : STAGES.length - 1;
  }

  /** Paint each saved identity as a real, age-correct storybook portrait. */
  private renderFriendFaces(): void {
    const canvases = Array.from(
      this.ui.overlay.querySelectorAll<HTMLCanvasElement>(
        "canvas[data-friend-id]"
      )
    );
    const looks = canvases.flatMap((canvas) => {
      const friend = this.friends.find(
        (candidate) =>
          candidate.id === canvas.dataset.friendId
      );
      if (!friend) return [];
      const heritage = friend.heritage ?? this.heritage;
      const appearance =
        friend.appearance ?? "classic";
      return [
        {
          canvas,
          look: {
            ...avatarLook(
              this.friendStageIndex(friend),
              friend.gender,
              heritage,
              appearance
            ),
            heightPx: 72,
          },
        },
      ];
    });
    void warmStorybookPortraits(
      looks.map(({ look }) => look)
    );
    for (const { canvas, look } of looks) {
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawAvatar(ctx, canvas.width / 2, canvas.height - 4, look, 0, {
        moving: false,
        facing: "front",
        verticalBias: 0,
      });
    }
  }

  private showFriends(): void {
    if (this.mode !== "playing" && this.mode !== "friends") return;
    if (this.stageIndex < ELEMENTARY_INDEX) {
      this.hint("You start making friends at elementary school.");
      return;
    }
    this.mode = "friends";
    this.friends = this.normalizeFriends(this.friends);
    const list = this.friends.length
      ? this.friends.map((f) => {
          const age = friendAgeForStage(
            this.age,
            this.stageIndex,
            f.ageOffset
          );
          const t = this.bondTier(f.bond);
          return `
        <div class="plj-friend-row">
          <canvas class="plj-friend-face" width="72" height="92" data-friend-id="${esc(f.id)}" role="img" aria-label="${esc(f.name)}"></canvas>
          <span class="plj-friend-main"><b>${esc(f.name)}</b><small>${esc(f.vibe)} ${esc(f.how)} · ${age}y · 🧠 ${f.iq} · since ${esc(f.since)}</small></span>
          <span class="plj-friend-bond ${t.cls}"><b>💛 ${f.bond}</b><small>${t.label}</small></span>
        </div>`;
        }).join("")
      : `<p class="plj-sub">No friends yet — you'll meet them as you go through school.</p>`;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-friends-card">
        <div class="plj-family-head">
          <h2>👥 Friends</h2>
          <div class="plj-mini-actions">
            <button class="plj-mini-pill" id="plj-friends-tree">🌳 Family Tree</button>
            ${this.canShowAssetsGate() ? `<button class="plj-mini-pill" id="plj-friends-assets">💼 Assets</button>` : ""}
            <button class="plj-mini-pill" id="plj-friends-training">🏫 Training</button>
          </div>
        </div>
        <p class="plj-sub">The ${this.friends.length} ${this.friends.length === 1 ? "person" : "people"} you've met along the way — they grow up right alongside you.</p>
        <div class="plj-friends-list">${list}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-friends-close">← Back</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.renderFriendFaces();
    const ov = this.ui.overlay;
    ov.querySelector<HTMLButtonElement>("#plj-friends-close")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); };
    ov.querySelector<HTMLButtonElement>("#plj-friends-tree")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); this.showFamilyTree(); };
    ov.querySelector<HTMLButtonElement>("#plj-friends-training")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); this.showTraining(); };
    const a = ov.querySelector<HTMLButtonElement>("#plj-friends-assets");
    if (a) a.onclick = () => { this.mode = "playing"; this.clearOverlay(); this.showAssets(); };
  }

  private showAssets(): void {
    if (this.mode !== "playing" && this.mode !== "assets") return;
    if (!this.canShowAssetsGate()) {
      this.hint(`Assets open from middle school, or elementary with over ${formatMoney(ELEMENTARY_ASSETS_MONEY)}.`);
      return;
    }
    this.mode = "assets";
    const daddy = Math.round(this.parentAnnualSupport * 0.54);
    const mommy = Math.round(this.parentAnnualSupport * 0.46);
    const grandparent = this.grandparentSupport();
    const playerIncome = this.annualPlayerIncome();
    const expenseRows = this.annualExpenseBreakdown();
    const expenseTotal = expenseRows.reduce((sum, r) => sum + r.value, 0);
    const incomeRows = [
      { label: "Daddy income", value: daddy, note: "support flow / yr" },
      { label: "Mommy income", value: mommy, note: "support flow / yr" },
      { label: "Grandparent help", value: grandparent, note: this.age < 18 ? "family help / yr" : "ended at adulthood" },
      { label: "Player income", value: playerIncome, note: this.occupation?.name ?? "not working yet" },
      { label: "Rental income", value: this.rentalIncome, note: this.rentalIncome ? "spare homes / yr" : "no spare rental" },
    ];
    const houseRows = this.homes.map((h, i) => ({
      label: `${h.emoji} ${h.name}`,
      value: this.houseAssetValue(h, i),
      note: `+${Math.round(this.houseAppreciationRate(h) * 100)}%/yr est.`,
    }));
    const vehicleRows = this.ownedVehicles().map((v) => ({
      label: `${v.emoji} ${v.name}`,
      value: this.vehicleAssetValue(v),
      note: `-${Math.round(VEHICLE_DEPRECIATION * 100)}%/yr est.`,
    }));
    const assetRows = [
      { label: "Cash", value: this.money, note: "current money" },
      { label: "Stocks", value: this.investments, note: "current market pot" },
      ...houseRows,
      ...vehicleRows,
    ];

    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-assets-card">
        <div class="plj-family-head">
          <h2>💼 Assets</h2>
          <div class="plj-mini-actions">
            <button class="plj-mini-pill" id="plj-assets-training">🏫 Training</button>
            <button class="plj-mini-pill" id="plj-assets-tree">🌳 Family Tree</button>
            <button class="plj-mini-pill" id="plj-assets-friends">👥 Friends</button>
          </div>
        </div>
        <div class="plj-networth">
          <span>Net worth</span>
          <strong>${formatMoney(this.netWorth())}</strong>
        </div>
        <div class="plj-ledger-grid">
          <section>
            <h3>Income / Year</h3>
            ${this.ledgerRows(incomeRows)}
          </section>
          <section>
            <h3>Assets</h3>
            ${this.ledgerRows(assetRows)}
          </section>
          <section>
            <h3>Expenses / Year</h3>
            ${this.ledgerRows(expenseRows.map((r) => ({ ...r, positive: false })))}
            <div class="plj-ledger-total"><span>Total expense</span><strong>${formatMoney(expenseTotal)}</strong></div>
          </section>
        </div>
        <h3 class="plj-prof-h3">📊 Market — buy &amp; sell</h3>
        <div class="plj-market">${this.marketRows()}</div>
        <p class="plj-sub">Prices drift up over the years (stocks, gold, property) with a little wobble, from real long-run averages — buy in a dip, sell in a high. Houses estimate 3-5% yearly growth by quality. Vehicles lose value over time. Rent appears when you own spare homes.</p>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-assets-close">← Back</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-assets-close")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-assets-tree")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showFamilyTree();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-assets-friends")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showFriends();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-assets-training")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showTraining();
    };
    this.ui.overlay.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => {
      b.onclick = () => this.tradeAsset(b.dataset.buy as MarketKey, "buy", Number(b.dataset.amt));
    });
    this.ui.overlay.querySelectorAll<HTMLButtonElement>("[data-sell]").forEach((b) => {
      b.onclick = () => this.tradeAsset(b.dataset.sell as MarketKey, "sell", 1);
    });
  }

  private showTitle(): void {
    this.mode = "title";
    this.biography = null;
    const meters = STAT_KEYS.map(
      (k) => `<span class="plj-meter-key"><b style="color:${STAT_META[k].color}">${STAT_META[k].icon}</b> ${STAT_META[k].label}</span>`
    ).join("");
    const bioCount = listBios().length;
    const saved = this.readSavedGame();
    const continueButton = saved
      ? `<button class="plj-btn plj-btn-continue" id="plj-continue">▶ Continue at age ${Math.floor(saved.snapshot.age)}</button>`
      : "";
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title">
        <h1>Choice <span>of Life</span></h1>
        <p class="plj-sub">Reference build: explore the inherited life simulation while the new side-scrolling runner is developed.</p>
        <div class="plj-meters">${meters}</div>
        <p class="plj-rules">The redesign will follow a life from a scrolling nursery to retirement using Health, Happiness and Money. See the repository plan for the reviewed stage design.</p>
        ${continueButton}
        <button class="plj-btn" id="plj-start">Start a new life →</button>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-bio-write">✍️ Write a biography</button>
          <button class="plj-btn plj-btn-ghost" id="plj-bio-list">📖 Biographies${bioCount ? ` (${bioCount})` : ""}</button>
        </div>
        <p class="plj-foot">Move first. The game introduces everything else when you need it.</p>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-start")!.onclick = async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Loading characters…";
      const ready = await warmStorybookSetupAtlases(this.heritage);
      if (this.mode !== "title" || !button.isConnected) return;
      if (ready) {
        this.showSetup();
      } else {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = "Retry character download";
        this.hint("Character art could not load. Check your connection and retry.");
      }
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-continue")?.addEventListener("click", (event) => {
      void this.continueSavedGame(event.currentTarget as HTMLButtonElement);
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-bio-write")!.onclick = () => {
      this.editBio = newBiography(this.uid(), "male");
      this.showBioAuthor();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-bio-list")!.onclick = () => this.showBioList();
  }

  private showSetup(): void {
    this.mode = "setup";
    this.biography = null;
    this.setupFamilyFund = backgroundMoney(this.economicBackground);
    const stageOptions = STAGES.map((s, i) =>
      `<option value="${i}">${s.emoji} ${esc(s.name)} · age ${s.ageStart}-${s.ageEnd}</option>`
    ).join("");
    const allCareersIq = Math.max(
      ...OCCUPATIONS.map((occupation) => occupation.minIq)
    );
    const iqOptions = Array.from(
      { length: (160 - 40) / 5 + 1 },
      (_, index) => 40 + index * 5
    ).map((iq) => {
      const note =
        iq === allCareersIq
          ? " · career unlock threshold"
          : iq === 160
            ? " · maximum test headroom"
            : "";
      return `<option value="${iq}">${iq}${note}</option>`;
    }).join("");
    const parentCareerOptions = [
      `<option value="">None / not specified</option>`,
      ...OCCUPATIONS.map(
        (occupation) =>
          `<option value="${esc(occupation.id)}">${occupation.emoji} ${esc(occupation.name)}</option>`
      ),
    ].join("");
    const heritageCards = HERITAGE_OPTIONS.map((h) => `
      <button class="plj-heritage${h.id === this.heritage ? " is-selected" : ""}" data-heritage="${h.id}">
        <span>${esc(h.label)}</span>
      </button>`).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title">
        <h2>A new life begins…</h2>
        <p class="plj-sub">Name your character (optional) — it shows on your career profile.</p>
        <div class="plj-bio-head"><input id="plj-setup-name" placeholder="Name (optional)" maxlength="40"></div>
        <p class="plj-sub">Choose a player. Each look has its own hairstyle, clothes, shoes and bags throughout life.</p>
        <div class="plj-appearance-groups" role="group" aria-label="Player character">
          <section class="plj-appearance-group" aria-label="Boy characters">
            <h3>Boy</h3>
            <div class="plj-genders">
              ${this.setupGenderButton("male", this.heritage, "classic")}
              ${this.setupGenderButton("male", this.heritage, "alternate")}
            </div>
          </section>
          <section class="plj-appearance-group" aria-label="Girl characters">
            <h3>Girl</h3>
            <div class="plj-genders">
              ${this.setupGenderButton("female", this.heritage, "classic")}
              ${this.setupGenderButton("female", this.heritage, "alternate")}
            </div>
          </section>
        </div>
        <button class="plj-btn" id="plj-start-life" disabled>Start life as ${this.appearance === "alternate" ? "New style" : "Classic"} ${this.gender === "female" ? "Girl" : "Boy"} →</button>
        <details class="plj-advanced">
          <summary>Advanced life setup</summary>
          <p class="plj-sub">Appearance, economic background, starting chapter, IQ and pace.</p>
          <div class="plj-heritage-grid">${heritageCards}</div>
          <label class="plj-setup-field plj-setup-field-wide">
            <span>Economic background</span>
            <select id="plj-economic-background">${ECONOMIC_BACKGROUNDS.map((b) => `<option value="${b.id}"${b.id === this.economicBackground ? " selected" : ""}>${b.label} · ${formatMoney(b.money)}</option>`).join("")}</select>
          </label>
          <div class="plj-setup-grid">
          <label class="plj-setup-field">
            <span>Start stage</span>
            <select id="plj-start-stage">${stageOptions}</select>
          </label>
          <label class="plj-setup-field">
            <span>Starting IQ</span>
            <select id="plj-start-iq">
              <option value="">Automatic · match starting age</option>
              ${iqOptions}
            </select>
            <small>University testing: use 160 so every Career option stays available.</small>
          </label>
          <label class="plj-setup-field">
            <span>Mother job</span>
            <select id="plj-mother-job">${parentCareerOptions}</select>
            <small>Visual and label only; it does not change family money or support.</small>
          </label>
          <label class="plj-setup-field">
            <span>Father job</span>
            <select id="plj-father-job">${parentCareerOptions}</select>
            <small>Choose independently, or leave as None.</small>
          </label>
          <label class="plj-setup-field plj-setup-field-wide">
            <span>Life speed <b id="plj-life-speed-readout">${this.lifeSpeedLabel()}</b></span>
            <input id="plj-life-speed" type="range" ${this.lifeSpeedInputAttrs()}>
          </label>
          </div>
        </details>
        <p class="plj-foot">Advanced settings are optional; the default is balanced.</p>
      </div>`;
    this.ui.overlay.classList.add("show");
    const speedInput = this.ui.overlay.querySelector<HTMLInputElement>("#plj-life-speed")!;
    const speedReadout = this.ui.overlay.querySelector<HTMLElement>("#plj-life-speed-readout")!;
    const backgroundInput = this.ui.overlay.querySelector<HTMLSelectElement>("#plj-economic-background")!;
    const startStageInput =
      this.ui.overlay.querySelector<HTMLSelectElement>(
        "#plj-start-stage"
      )!;
    const startIqInput =
      this.ui.overlay.querySelector<HTMLSelectElement>(
        "#plj-start-iq"
      )!;
    const motherJobInput =
      this.ui.overlay.querySelector<HTMLSelectElement>(
        "#plj-mother-job"
      )!;
    const fatherJobInput =
      this.ui.overlay.querySelector<HTMLSelectElement>(
        "#plj-father-job"
      )!;
    speedInput.oninput = () => {
      this.setLifeSpeedIndex(Number(speedInput.value));
      speedInput.value = String(this.lifeSpeedIndex());
      speedReadout.textContent = this.lifeSpeedLabel();
    };
    backgroundInput.onchange = () => {
      this.economicBackground = backgroundInput.value;
      this.setupFamilyFund = backgroundMoney(this.economicBackground);
    };
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-heritage").forEach((btn) => {
      btn.onclick = () => {
        this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-heritage").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        this.heritage = this.normalizeHeritage(btn.dataset.heritage);
        void this.prepareSetupCharacterPair(this.heritage);
      };
    });
    const startLifeButton =
      this.ui.overlay.querySelector<HTMLButtonElement>("#plj-start-life")!;
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-gender").forEach((btn) => {
      btn.onclick = () => {
        this.gender = btn.dataset.g === "female" ? "female" : "male";
        this.appearance = this.normalizeAppearance(
          btn.dataset.appearance
        );
        this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-gender").forEach((choice) => {
          const selected = choice === btn;
          choice.classList.toggle("is-selected", selected);
          choice.setAttribute("aria-pressed", String(selected));
        });
        startLifeButton.textContent = `Start life as ${
          this.appearance === "alternate" ? "New style" : "Classic"
        } ${this.gender === "female" ? "Girl" : "Boy"} →`;
      };
    });
    startLifeButton.onclick = async () => {
        this.playerName = (this.ui.overlay.querySelector<HTMLInputElement>("#plj-setup-name")?.value ?? "").slice(0, 40);
        this.heritage = this.normalizeHeritage(this.ui.overlay.querySelector<HTMLButtonElement>(".plj-heritage.is-selected")?.dataset.heritage);
        const selectedHeritage = this.heritage;
        const startIndex = this.normalizeStageIndex(
          Number(startStageInput.value)
        );
        const startingIqOverride =
          normalizeStartingIq(startIqInput.value);
        const selectedParentCareerIds =
          normalizeParentCareerIds({
            mother: motherJobInput.value || null,
            father: fatherJobInput.value || null,
          });
        this.setLifeSpeedIndex(Number(speedInput.value));
        this.setupFamilyFund = backgroundMoney(this.economicBackground);
        const genderButtons = Array.from(this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-gender"));
        const heritageButtons = Array.from(
          this.ui.overlay.querySelectorAll<HTMLButtonElement>(
            ".plj-heritage"
          )
        );
        const setupControls = [
          backgroundInput,
          startStageInput,
          startIqInput,
          motherJobInput,
          fatherJobInput,
          speedInput,
        ];
        genderButtons.forEach((choice) => {
          choice.disabled = true;
          choice.setAttribute("aria-busy", "true");
        });
        heritageButtons.forEach((choice) => {
          choice.disabled = true;
        });
        setupControls.forEach((control) => {
          control.disabled = true;
        });
        startLifeButton.disabled = true;
        startLifeButton.setAttribute("aria-busy", "true");
        startLifeButton.textContent = "Loading this life…";
        const startLifeSeason = lifeSeasonAt(
          STAGES[startIndex]?.id ?? "",
          STAGES[startIndex]?.ageStart ?? 0
        );
        const parentWarmers: Promise<boolean>[] = [];
        for (const role of ["mother", "father"] as const) {
          const profession = parentProfessionSpec(
            role,
            selectedParentCareerIds,
            selectedHeritage
          );
          if (!profession) continue;
          parentWarmers.push(
            warmJobCharacterAtlases(
              profession.heritage,
              profession.gender,
              profession.uniform,
              jobArtSeasonFor(
                profession.uniform,
                startLifeSeason
              )
            )
          );
        }
        const [ready] = await Promise.all([
          warmStorybookCharacterAtlases(selectedHeritage),
          ...parentWarmers,
        ]);
        if (this.mode !== "setup" || this.heritage !== selectedHeritage) return;
        if (!ready) {
          genderButtons.forEach((choice) => {
            choice.disabled = false;
            choice.removeAttribute("aria-busy");
          });
          heritageButtons.forEach((choice) => {
            choice.disabled = false;
          });
          setupControls.forEach((control) => {
            control.disabled = false;
          });
          startLifeButton.disabled = false;
          startLifeButton.removeAttribute("aria-busy");
          startLifeButton.textContent = "Retry character download";
          this.hint("Character art could not load. Check your connection and retry.");
          return;
        }
        this.newGame(
          false,
          startIndex,
          this.setupFamilyFund,
          startingIqOverride,
          selectedParentCareerIds
        );
    };
    void this.prepareSetupCharacterPair(this.heritage);
  }

  private setupGenderButton(
    gender: Gender,
    heritage: HeritageStyle,
    appearance: CharacterAppearanceId
  ): string {
    const selected =
      gender === this.gender && appearance === this.appearance;
    const appearanceLabel =
      appearance === "alternate" ? "New style" : "Classic";
    return `<button class="plj-gender${selected ? " is-selected" : ""}" type="button" data-g="${gender}" data-appearance="${appearance}" aria-pressed="${selected}" aria-label="${gender === "female" ? "Girl" : "Boy"}, ${appearanceLabel}">${this.setupGenderAvatar(gender, heritage, appearance)}<span>${appearanceLabel}</span></button>`;
  }

  private setupGenderAvatar(
    gender: Gender,
    heritage: HeritageStyle,
    appearance: CharacterAppearanceId
  ): string {
    // Render the REAL in-game character (teen stage, front view) to a small
    // canvas — the Boy/Girl choices now look exactly like the person you play.
    const look = avatarLook(5, gender, heritage, appearance);
    const cw = 96;
    const ch = 172;
    const cv = document.createElement("canvas");
    cv.width = cw * 2;
    cv.height = ch * 2;
    const cctx = cv.getContext("2d")!;
    cctx.scale(2, 2);
    drawAvatar(cctx, cw / 2, ch - 6, look, 0, { moving: false, facing: "front", verticalBias: 0 });
    return `<img class="plj-setup-avatar-img" alt="" src="${cv.toDataURL("image/png")}">`;
  }

  private refreshSetupGenderPreviews(heritage: HeritageStyle): void {
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-gender").forEach((btn) => {
      const gender: Gender = btn.dataset.g === "female" ? "female" : "male";
      const appearance = this.normalizeAppearance(
        btn.dataset.appearance
      );
      const avatar = btn.querySelector<HTMLElement>(".plj-setup-avatar-img");
      if (avatar) {
        avatar.outerHTML = this.setupGenderAvatar(
          gender,
          heritage,
          appearance
        );
      }
    });
  }

  private normalizeAppearance(
    value: string | null | undefined
  ): CharacterAppearanceId {
    return value === "alternate" ? "alternate" : "classic";
  }

  private createLifeSeed(): string {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch {
      // A deterministic fallback is unnecessary; the result is persisted.
    }
    return `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 12)}`;
  }

  /** Assign one full identity per NPC and keep it stable for the whole life. */
  private appearanceForNpc(opt: LifeOption): CharacterAppearanceId {
    if (opt.person === "spouse" && this.partner) {
      return this.partner.appearance;
    }
    if (opt.person && isSameStagePeerKind(opt.person)) {
      return peerVisualIdentity(
        this.lifeSeed,
        opt.person
      ).appearance;
    }
    // The opening family always demonstrates both looks, independent of luck.
    if (opt.person === "mother" || opt.person === "grandpa") {
      return "alternate";
    }
    if (opt.person === "father" || opt.person === "grandma") {
      return "classic";
    }
    if (opt.person === "sibling" || opt.person === "babySibling") {
      return this.appearance === "classic" ? "alternate" : "classic";
    }
    // Option IDs change between chapters ("studyFriend", "exams", ...), but
    // PersonKind is the recurring identity contract and therefore stays stable.
    const identity = `${this.lifeSeed}:${opt.person ?? opt.id}`;
    return stableHash(identity) % 2 === 0 ? "classic" : "alternate";
  }

  /** School and campus peers can differ in heritage without changing age. */
  private heritageForNpc(opt: LifeOption): HeritageStyle {
    if (opt.person === "spouse" && this.partner) {
      return this.partner.heritage;
    }
    if (!opt.person || !isSameStagePeerKind(opt.person)) {
      return this.heritage;
    }
    return peerVisualIdentity(
      this.lifeSeed,
      opt.person
    ).heritage;
  }

  /** Add reviewed portrait identities to legacy friends without changing gender. */
  private normalizeFriends(friends: readonly Friend[]): Friend[] {
    const safe = friends.map((friend) => ({
      ...friend,
      gender:
        friend.gender === "female"
          ? "female" as const
          : "male" as const,
    }));
    return normalizeFriendVisualIdentities(
      this.lifeSeed,
      safe
    );
  }

  /**
   * Load both explicitly gendered sheets for the selected heritage, then
   * rebuild the setup thumbnails from the same raster frames used in-game.
   * The selection can change while decoding, so only the newest choice is
   * allowed to update or unlock the controls.
   */
  private async prepareSetupCharacterPair(heritage: HeritageStyle): Promise<void> {
    const genderButtons = Array.from(this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-gender"));
    const startButton =
      this.ui.overlay.querySelector<HTMLButtonElement>("#plj-start-life");
    if (startButton) {
      startButton.disabled = true;
      startButton.title = "Loading character art…";
    }
    genderButtons.forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.title = "Loading character art…";
      const avatar = button.querySelector<HTMLElement>(".plj-setup-avatar-img");
      if (avatar) avatar.style.opacity = "0.32";
    });
    const ready = await warmStorybookSetupAtlases(heritage);
    if (this.mode !== "setup" || this.heritage !== heritage) return;
    if (!ready) {
      genderButtons.forEach((button) => {
        button.title = "Character art failed to load";
        button.removeAttribute("aria-busy");
      });
      if (startButton) {
        startButton.textContent = "Character download failed — retry";
        startButton.title = "Check your connection, then choose this heritage again";
      }
      this.hint("Character art could not load. Check your connection and retry.");
      return;
    }
    this.refreshSetupGenderPreviews(heritage);
    genderButtons.forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.removeAttribute("title");
    });
    if (startButton) {
      startButton.disabled = false;
      startButton.removeAttribute("title");
      startButton.textContent = `Start life as ${
        this.appearance === "alternate" ? "New style" : "Classic"
      } ${this.gender === "female" ? "Girl" : "Boy"} →`;
    }
  }

  // --- biography mode -------------------------------------------------------

  /** Start replaying an authored (or recorded) life. */
  private async startBiographyPlay(bio: Biography): Promise<boolean> {
    const sourceMode = this.mode;
    const ready = await warmStorybookCharacterAtlases(bio.heritage);
    if (!ready) {
      this.hint("Character art could not load. Check your connection and retry.");
      return false;
    }
    if (this.mode !== sourceMode) return false;
    this.biography = bio;
    this.gender = bio.gender;
    this.heritage = bio.heritage;
    this.appearance = bio.appearance;
    this.lifeSeed = `biography-${bio.id}`;
    this.newGame(true); // keep the biography; loadStage(0) builds its moments
    this.playerName = bio.name; // the profile shows whose life this is
    return true;
  }

  private showBioList(): void {
    this.mode = "biolist";
    const bios = listBios();
    const items = bios.length
      ? bios.map((b) => `
        <div class="plj-bio-item">
          <div class="plj-bio-item-main">
            <span class="plj-bio-item-name">${b.gender === "female" ? "👧" : "👦"} ${esc(b.name || "Untitled life")}</span>
            <span class="plj-bio-item-sub">${esc(b.subtitle || "")}${b.subtitle ? " · " : ""}${bioMomentCount(b)} moments</span>
          </div>
          <div class="plj-bio-item-btns">
            <button class="plj-btn plj-bio-play2" data-id="${esc(b.id)}">▶ Play</button>
            <button class="plj-btn plj-btn-ghost plj-bio-edit" data-id="${esc(b.id)}" title="Edit">✎</button>
            <button class="plj-btn plj-btn-ghost plj-bio-del2" data-id="${esc(b.id)}" title="Delete">🗑</button>
          </div>
        </div>`).join("")
      : `<p class="plj-sub">No biographies yet. Write one — or live a life and save it at the end.</p>`;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-bio-list">
        <h2>📖 Biographies</h2>
        <div class="plj-bio-items">${items}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-bio-back2">← Menu</button>
          <button class="plj-btn" id="plj-bio-new">✍️ Write new</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    const ov = this.ui.overlay;
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-play2").forEach((b) => {
      b.onclick = async () => {
        const bio = getBio(b.dataset.id!);
        if (!bio) return;
        b.disabled = true;
        b.setAttribute("aria-busy", "true");
        b.textContent = "Loading character…";
        await this.startBiographyPlay(bio);
        if (this.mode === "biolist" && b.isConnected) {
          b.disabled = false;
          b.removeAttribute("aria-busy");
          b.textContent = "▶ Play";
        }
      };
    });
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-edit").forEach((b) => {
      b.onclick = () => { const bio = getBio(b.dataset.id!); if (bio) { this.editBio = bio; this.showBioAuthor(); } };
    });
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-del2").forEach((b) => {
      b.onclick = () => { deleteBio(b.dataset.id!); this.showBioList(); };
    });
    ov.querySelector<HTMLButtonElement>("#plj-bio-back2")!.onclick = () => this.showTitle();
    ov.querySelector<HTMLButtonElement>("#plj-bio-new")!.onclick = () => { this.editBio = newBiography(this.uid(), "male"); this.showBioAuthor(); };
  }

  /** Read the author's text fields back into the draft before any re-render. */
  private syncBioFields(): void {
    const b = this.editBio;
    if (!b) return;
    const ov = this.ui.overlay;
    const name = ov.querySelector<HTMLInputElement>("#plj-bio-name");
    if (name) b.name = name.value;
    const sub = ov.querySelector<HTMLInputElement>("#plj-bio-sub");
    if (sub) b.subtitle = sub.value;
    const heritage = ov.querySelector<HTMLSelectElement>(
      "#plj-bio-heritage"
    );
    if (heritage) b.heritage = this.normalizeHeritage(heritage.value);
    const appearance = ov.querySelector<HTMLSelectElement>(
      "#plj-bio-appearance"
    );
    if (appearance) {
      b.appearance = this.normalizeAppearance(appearance.value);
    }
    ov.querySelectorAll<HTMLInputElement>(".plj-bio-title").forEach((inp) => {
      const sid = inp.dataset.stage!;
      const v = inp.value.trim();
      if (v) {
        if (!b.chapters[sid]) b.chapters[sid] = { moments: [] };
        b.chapters[sid].title = v;
      } else if (b.chapters[sid]) {
        b.chapters[sid].title = undefined;
      }
    });
  }

  private showBioAuthor(): void {
    this.mode = "bioauthor";
    const b = this.editBio!;
    const presetOpts = MOMENT_PRESETS.map((p) => `<option value="${p.key}">${p.emoji} ${p.label}</option>`).join("");
    const heritageOpts = HERITAGE_OPTIONS.map(
      (option) =>
        `<option value="${option.id}"${
          option.id === b.heritage ? " selected" : ""
        }>${esc(option.label)}</option>`
    ).join("");
    const chapters = STAGES.map((s) => {
      const ch = b.chapters[s.id] ?? { moments: [] };
      const moments = ch.moments.length
        ? ch.moments.map((m, i) => `
          <div class="plj-bio-moment">
            <span>${esc(m.icon)} ${esc(m.desc)}</span>
            <button class="plj-bio-del" data-stage="${s.id}" data-i="${i}">✕</button>
          </div>`).join("")
        : `<div class="plj-bio-empty">— a quiet chapter —</div>`;
      return `
        <details class="plj-bio-chapter">
          <summary><span class="plj-bio-ch-emoji">${s.emoji}</span><input class="plj-bio-title" data-stage="${s.id}" value="${esc(ch.title ?? "")}" placeholder="${esc(s.name)}"><span class="plj-bio-age">${s.ageStart}+</span></summary>
          <div class="plj-bio-moments">${moments}</div>
          <div class="plj-bio-add">
            <input class="plj-bio-text" data-stage="${s.id}" placeholder="What happened? e.g. 'Born in Hanoi'" maxlength="80">
            <select class="plj-bio-preset" data-stage="${s.id}">${presetOpts}</select>
            <button class="plj-btn plj-bio-addbtn" data-stage="${s.id}">+ Add</button>
          </div>
        </details>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-bio-author">
        <h2>✍️ ${b.createdAt ? "Edit biography" : "Write a biography"}</h2>
        <div class="plj-bio-head">
          <input id="plj-bio-name" placeholder="Whose life? (a name)" value="${esc(b.name)}" maxlength="40">
          <input id="plj-bio-sub" placeholder="Subtitle — e.g. 'My grandfather · 1938–2016'" value="${esc(b.subtitle)}" maxlength="60">
          <div class="plj-genders plj-genders-sm">
            <button class="plj-gender${b.gender === "male" ? " sel" : ""}" data-g="male">👦 Boy</button>
            <button class="plj-gender${b.gender === "female" ? " sel" : ""}" data-g="female">👧 Girl</button>
          </div>
          <div class="plj-setup-grid">
            <label class="plj-setup-field">
              <span>Heritage</span>
              <select id="plj-bio-heritage">${heritageOpts}</select>
            </label>
            <label class="plj-setup-field">
              <span>Character look</span>
              <select id="plj-bio-appearance">
                <option value="classic"${b.appearance === "classic" ? " selected" : ""}>Classic</option>
                <option value="alternate"${b.appearance === "alternate" ? " selected" : ""}>New style</option>
              </select>
            </label>
          </div>
        </div>
        <p class="plj-sub">Add the moments that happened in each chapter — pick a feeling, write what happened. Then play it to walk through their life.</p>
        <div class="plj-bio-chapters">${chapters}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-bio-back">← Save & back</button>
          <button class="plj-btn" id="plj-bio-play">▶ Save & play</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    const ov = this.ui.overlay;
    ov.querySelectorAll<HTMLButtonElement>(".plj-gender").forEach((btn) => {
      btn.onclick = () => { this.syncBioFields(); b.gender = btn.dataset.g === "female" ? "female" : "male"; this.showBioAuthor(); };
    });
    ov.querySelector<HTMLSelectElement>("#plj-bio-heritage")!.onchange =
      (event) => {
        this.syncBioFields();
        b.heritage = this.normalizeHeritage(
          (event.currentTarget as HTMLSelectElement).value
        );
        this.showBioAuthor();
      };
    ov.querySelector<HTMLSelectElement>("#plj-bio-appearance")!.onchange =
      () => this.syncBioFields();
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-addbtn").forEach((btn) => {
      btn.onclick = () => {
        this.syncBioFields();
        const sid = btn.dataset.stage!;
        const text = ov.querySelector<HTMLInputElement>(`.plj-bio-text[data-stage="${sid}"]`)?.value.trim() ?? "";
        const key = ov.querySelector<HTMLSelectElement>(`.plj-bio-preset[data-stage="${sid}"]`)?.value ?? "memory";
        if (!text) { this.flashBioHint(); return; }
        if (!b.chapters[sid]) b.chapters[sid] = { moments: [] };
        b.chapters[sid].moments.push(makeMoment(this.uid(), text, key));
        this.showBioAuthor();
      };
    });
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-del").forEach((btn) => {
      btn.onclick = () => {
        this.syncBioFields();
        const sid = btn.dataset.stage!;
        const i = Number(btn.dataset.i);
        b.chapters[sid]?.moments.splice(i, 1);
        this.showBioAuthor();
      };
    });
    ov.querySelector<HTMLButtonElement>("#plj-bio-back")!.onclick = () => { this.persistDraft(); this.showBioList(); };
    ov.querySelector<HTMLButtonElement>("#plj-bio-play")!.onclick = async (event) => {
      this.persistDraft();
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Loading character…";
      const started = await this.startBiographyPlay(this.editBio!);
      if (!started && this.mode === "bioauthor" && button.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = "▶ Save & play";
      }
    };
  }

  private flashBioHint(): void {
    const el = this.ui.overlay.querySelector<HTMLElement>(".plj-bio-author > .plj-sub");
    if (el) { el.textContent = "✏️ Write what happened first, then press + Add."; el.style.color = "#ffd27a"; }
  }

  /** Stamp + save the draft being edited. */
  private persistDraft(): void {
    this.syncBioFields();
    const b = this.editBio;
    if (!b) return;
    if (!b.name.trim()) b.name = "Someone";
    if (!b.createdAt) b.createdAt = Date.now();
    saveBio(b);
  }

  // --- recording a played life into a biography -----------------------------

  private cleanMoment(label: string, icon: string, desc: string, category: OptionCategory, effects: Partial<Stats>, earn?: number, person?: PersonKind): LifeOption {
    return {
      id: "bm_" + this.uid(),
      label,
      icon,
      desc,
      category,
      effects: { ...effects },
      ...(earn ? { earn } : {}),
      ...(person ? { person } : {}),
      storyTag: "bio_moment",
    };
  }

  /** Turn one recorded choice into a clean, replayable moment. */
  private historyEntryToMoment(h: HistoryEntry): LifeOption | null {
    const stage = STAGES.find((s) => s.id === h.stageId);
    const opt = stage?.options.find((o) => o.id === h.optionId);
    if (opt) return this.cleanMoment(opt.label, opt.icon, opt.desc, opt.category, opt.effects, opt.earn, opt.person);
    if (h.optionId.startsWith("job_")) {
      const o = OCCUPATIONS.find((x) => "job_" + x.id === h.optionId);
      if (o) return this.cleanMoment(`Became a ${o.name}`, o.emoji, `Worked as a ${o.name.toLowerCase()}.`, "wealth", { happiness: 3 });
    }
    if (h.optionId.startsWith("wed_")) {
      const p = PARTNERS.find((x) => "wed_" + x.id === h.optionId);
      if (p) return this.cleanMoment(`Married ${p.name}`, "💍", `Married ${p.name}, ${p.title}.`, "social", { happiness: 10, health: 2 });
    }
    if (h.optionId.startsWith("house_")) {
      const ht = HOUSE_TIERS.find((x) => "house_" + x.id === h.optionId);
      if (ht) return this.cleanMoment(`Bought a ${ht.name.toLowerCase()}`, ht.emoji, `Settled into a ${ht.name.toLowerCase()}.`, "special", { happiness: ht.happiness });
    }
    if (h.optionId.startsWith("veh_")) {
      const v = VEHICLES.find((x) => "veh_" + x.id === h.optionId);
      if (v) return this.cleanMoment(`Got a ${v.name.toLowerCase()}`, v.emoji, `Bought a ${v.name.toLowerCase()}.`, "fun", v.effects);
    }
    if (h.optionId.startsWith("commute_")) {
      const c = COMMUTES.find((x) => "commute_" + x.id === h.optionId);
      if (c) return this.cleanMoment(c.name, c.emoji, c.blurb, "special", c.effects);
    }
    return null;
  }

  /** Build a replayable biography from the life that was just lived. */
  private buildBioFromPlaythrough(name: string, subtitle: string): Biography {
    const chapters: Record<string, BioChapter> = {};
    for (const h of this.history) {
      const m = this.historyEntryToMoment(h);
      if (!m) continue;
      if (!chapters[h.stageId]) chapters[h.stageId] = { moments: [] };
      chapters[h.stageId].moments.push(m);
    }
    return {
      id: "bio_" + this.uid(),
      name: name.trim() || "My life",
      gender: this.gender,
      heritage: this.heritage,
      appearance: this.appearance,
      subtitle: subtitle.trim(),
      chapters,
      createdAt: Date.now(),
    };
  }

  private showTransition(lines: string[]): void {
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-grow">
        <div class="plj-grow-emoji">✨</div>
        ${lines.map((l) => `<p>${l}</p>`).join("")}
      </div>`;
    this.ui.overlay.classList.add("show");
  }

  /** Why a partner is out of your league right now (or null if you qualify). */
  private partnerLockReason(p: Partner): string | null {
    const r = p.requires;
    if (!r) return null;
    if (r.minIq && this.stats.smarts < r.minIq) return `needs 🧠 ${r.minIq}`;
    if (r.minMoney && this.netWorth() < r.minMoney) return `needs 💰 ${formatMoney(r.minMoney)}`;
    if (r.minHealth && this.stats.health < r.minHealth) return `wants you fit (❤️ ${r.minHealth})`;
    if (r.maxWeight && this.weight > r.maxWeight) return `wants you fit (⚖️ ≤ ${r.maxWeight})`;
    return null;
  }

  private showPartner(): void {
    const candidates =
      marriageCandidatesForPlayer(this.gender);
    const spouseGender =
      spouseGenderForPlayer(this.gender);
    const playerNoun =
      this.gender === "male" ? "man" : "woman";
    const peopleNoun =
      spouseGender === "female" ? "women" : "men";
    const spouseNoun =
      spouseGender === "female" ? "wives" : "husbands";
    const mk = (text: string, color: string) => `<span class="plj-chip" style="color:${color}">${text}</span>`;
    const cards = candidates.map((p) => {
      const reason = this.partnerLockReason(p);
      const locked = !!reason;
      const money = p.moneyMod
        ? mk(`${p.moneyMod > 0 ? "+" : "−"}${formatMoney(Math.abs(p.moneyMod))}/yr`, p.moneyMod > 0 ? "#3ddc84" : "#ff8a8a")
        : "";
      const chips = locked ? mk(`🔒 ${reason}`, "#ff8a8a") : effectChips(p.modifiers) + money;
      return `
      <button class="plj-partner plj-wedding-candidate${locked ? " locked" : ""}" data-id="${esc(p.id)}" aria-label="Meet ${esc(p.name)}, ${esc(p.title)}" ${locked ? "disabled" : ""}>
        <span class="plj-partner-avatar-wrap">
          <canvas class="plj-partner-avatar" width="144" height="168" data-partner-id="${esc(p.id)}" role="img" aria-label="${esc(p.name)}, ${spouseGender === "female" ? "woman" : "man"}"></canvas>
          <span class="plj-partner-job" aria-hidden="true">${p.emoji}</span>
        </span>
        <span class="plj-partner-name">${esc(p.name)}</span>
        <span class="plj-partner-gender">${spouseGender === "female" ? "Woman" : "Man"} · ${esc(p.title)}</span>
        <span class="plj-partner-blurb">${esc(p.blurb)}</span>
        <span class="plj-chips">${chips}</span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card plj-wedding-card">
        <div class="plj-wedding-kicker">SHORT STAGE · WEDDING INTERLUDE</div>
        <h2>💞 Meet your future spouse</h2>
        <div class="plj-wedding-progress" aria-label="Wedding interlude progress">
          <span class="active">1 · Meet</span>
          <span>2 · Choose</span>
          <span>3 · Married life</span>
        </div>
        <p class="plj-sub">You are a ${playerNoun}, so this stage introduces ${candidates.length} ${peopleNoun} as possible ${spouseNoun}. Everyone is available; choose one person to know better.</p>
        <div class="plj-partners plj-wedding-grid">${cards}</div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-wedding-candidate:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const p = marriageCandidateById(
          this.gender,
          btn.dataset.id ?? ""
        );
        if (p) this.showPartnerMeet(p);
      };
    });
    this.preparePartnerFaces();
  }

  /** Draw the exact storybook identity that will later appear in the room. */
  private partnerPortraitLook(
    partner: Partner
  ): ReturnType<typeof personLook> {
    return personLook(
      "spouse",
      this.gender,
      this.stageIndex,
      partner.heritage,
      partner.appearance,
      partner.gender
    );
  }

  private renderPartnerFaces(): void {
    this.ui.overlay
      .querySelectorAll<HTMLCanvasElement>(
        "canvas[data-partner-id]"
      )
      .forEach((canvas) => {
        const partner = PARTNERS.find(
          (candidate) =>
            candidate.id === canvas.dataset.partnerId
        );
        if (!partner) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.clearRect(
          0,
          0,
          canvas.width,
          canvas.height
        );
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        drawAvatar(
          context,
          canvas.width / 2,
          canvas.height - 5,
          this.partnerPortraitLook(partner),
          0,
          {
            moving: false,
            facing: "front",
            verticalBias: 0,
          }
        );
      });
  }

  private preparePartnerFaces(): void {
    this.renderPartnerFaces();
    const partners = Array.from(
      this.ui.overlay.querySelectorAll<HTMLCanvasElement>(
        "canvas[data-partner-id]"
      )
    ).flatMap((canvas) => {
      const partner = PARTNERS.find(
        (candidate) =>
          candidate.id === canvas.dataset.partnerId
      );
      return partner ? [partner] : [];
    });
    void warmStorybookPortraits(
      partners.map((partner) =>
        this.partnerPortraitLook(partner)
      )
    ).then(() => {
      if (this.mode === "partner") {
        this.renderPartnerFaces();
      }
    });
  }

  /** Step two keeps the decision intentional and lets the player go back. */
  private showPartnerMeet(p: Partner): void {
    const partner = marriageCandidateById(
      this.gender,
      p.id
    );
    if (!partner) {
      this.showPartner();
      return;
    }
    const mk = (text: string, color: string) => `<span class="plj-chip" style="color:${color}">${text}</span>`;
    const money = partner.moneyMod
      ? mk(
          `${partner.moneyMod > 0 ? "+" : "−"}${formatMoney(Math.abs(partner.moneyMod))}/yr`,
          partner.moneyMod > 0 ? "#3ddc84" : "#ff8a8a"
        )
      : "";
    const genderLabel =
      partner.gender === "female" ? "Woman" : "Man";
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-wedding-card plj-wedding-meet-card">
        <div class="plj-wedding-kicker">SHORT STAGE · WEDDING INTERLUDE</div>
        <h2>💗 Get to know ${esc(partner.name)}</h2>
        <div class="plj-wedding-progress" aria-label="Wedding interlude progress">
          <span>1 · Meet</span>
          <span class="active">2 · Choose</span>
          <span>3 · Married life</span>
        </div>
        <div class="plj-wedding-meet">
          <span class="plj-partner-avatar-wrap plj-partner-avatar-wrap-large">
            <canvas class="plj-partner-avatar" width="144" height="168" data-partner-id="${esc(partner.id)}" role="img" aria-label="${esc(partner.name)}, ${genderLabel.toLowerCase()}"></canvas>
            <span class="plj-partner-job" aria-hidden="true">${partner.emoji}</span>
          </span>
          <div>
            <h3>${esc(partner.name)} · ${esc(partner.title)}</h3>
            <p class="plj-partner-gender">${genderLabel}</p>
            <p>${esc(partner.blurb)}</p>
            <span class="plj-chips">${effectChips(partner.modifiers)}${money}</span>
          </div>
        </div>
        <p class="plj-wedding-note">This choice becomes your spouse for the chapters ahead.</p>
        <div class="plj-wedding-actions">
          <button class="plj-btn" id="plj-partner-confirm">Marry ${esc(partner.name)}</button>
          <button class="plj-btn plj-btn-ghost" id="plj-partner-back">Meet someone else</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>(
      "#plj-partner-confirm"
    )!.onclick = () => this.pickPartner(partner);
    this.ui.overlay.querySelector<HTMLButtonElement>(
      "#plj-partner-back"
    )!.onclick = () => this.showPartner();
    this.preparePartnerFaces();
  }

  private showCommute(): void {
    const cards = COMMUTES.map((c) => {
      const afford = this.netWorth() >= c.minNet;
      return `
      <button class="plj-partner${afford ? "" : " locked"}" data-id="${c.id}" ${afford ? "" : "disabled"}>
        <span class="plj-partner-face">${c.emoji}</span>
        <span class="plj-partner-name">${c.name}</span>
        <span class="plj-partner-title">${c.cost ? "−" + formatMoney(c.cost) : "free"}</span>
        <span class="plj-partner-blurb">${c.blurb}</span>
        <span class="plj-chips">${afford ? effectChips(c.effects) : `<span class="plj-chip" style="color:#ff8a8a">🔒 needs 💰 ${formatMoney(c.minNet)}</span>`}</span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>🚦 Getting to work</h2>
        <p class="plj-sub">How will you commute? You can always walk, but the comfier options open up as your net worth grows.</p>
        <div class="plj-partners">${cards}</div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const c = COMMUTES.find((x) => x.id === btn.dataset.id);
        if (c) this.pickCommute(c);
      };
    });
  }

  /** Decode the exact custom body needed by the current adult chapter. */
  private warmPlayerBodyVariant(): void {
    const bodyVariant = this.currentPlayerBodyVariant();
    if (bodyVariant.kind === "career-uniform") {
      void warmJobCharacterAtlases(
        bodyVariant.careerUniform.heritage,
        bodyVariant.careerUniform.gender,
        bodyVariant.careerUniform.uniform,
        jobArtSeasonFor(
          bodyVariant.careerUniform.uniform,
          this.currentLifeSeason()
        )
      );
      return;
    }
    const stageId = STAGES[this.stageIndex]?.id ?? "";
    if (
      bodyVariant.kind === "summer-casual" ||
      (SEASONAL_LIFE_STAGE_IDS.includes(
        stageId as (typeof SEASONAL_LIFE_STAGE_IDS)[number]
      ) &&
        !!this.occupation &&
        !this.occupation.uniform)
    ) {
      void warmSummerCharacterAtlases(
        this.heritage,
        this.gender
      );
    }
  }

  private showOccupation(): void {
    const cards = OCCUPATIONS.map((o) => {
      const locked = this.stats.smarts < o.minIq;
      const pay = o.salaryMul >= 1.4 ? "💰💰💰" : o.salaryMul >= 1.0 ? "💰💰" : "💰";
      return `
      <button class="plj-partner${locked ? " locked" : ""}" data-id="${o.id}" ${locked ? "disabled" : ""}>
        ${this.occupationCardFace(o)}
        <span class="plj-partner-name">${o.name}</span>
        <span class="plj-partner-title">Pay ${pay}</span>
        <span class="plj-partner-blurb">${o.blurb}</span>
        <span class="plj-chips">${locked ? `<span class="plj-chip" style="color:#ff8a8a">🔒 needs 🧠 ${o.minIq}</span>` : effectChips(o.perks ?? {})}</span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>💼 Choose your career</h2>
        <p class="plj-sub">Your salary = the job × your IQ. A higher IQ unlocks (and is paid more by) the best jobs.</p>
        <div class="plj-partners">${cards}</div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const o = OCCUPATIONS.find((x) => x.id === btn.dataset.id);
        if (o) this.pickOccupation(o);
      };
    });
    this.prepareOccupationCardFaces();
  }

  private occupationCardFace(o: Occupation): string {
    if (!o.uniform || !jobArtHeritage(this.heritage)) {
      return `<span class="plj-partner-face">${o.emoji}</span>`;
    }
    return `<canvas class="plj-occupation-face" width="144" height="168" data-uniform="${o.uniform}" data-emoji="${o.emoji}" role="img" aria-label="${esc(o.name)} representative"></canvas>`;
  }

  private renderOccupationCardFaces(): void {
    this.ui.overlay
      .querySelectorAll<HTMLCanvasElement>(".plj-occupation-face")
      .forEach((canvas) => {
        const uniform = canvas.dataset.uniform;
        if (
          !uniform ||
          !JOB_UNIFORMS.includes(
            uniform as JobUniform
          )
        ) {
          return;
        }
        const jobUniform = uniform as JobUniform;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const drawn = drawJobCharacter(
          context,
          canvas.width / 2,
          canvas.height - 5,
          jobUniform,
          this.heritage,
          this.gender,
          {
            facing: "front",
            size: 160,
            shadow: false,
            season: jobArtSeasonFor(
              jobUniform,
              this.currentLifeSeason()
            ),
          }
        );
        if (drawn) return;
        context.fillStyle = "#fff8df";
        context.font = "52px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          canvas.dataset.emoji ?? "💼",
          canvas.width / 2,
          canvas.height / 2
        );
      });
  }

  private prepareOccupationCardFaces(): void {
    this.renderOccupationCardFaces();
    if (!jobArtHeritage(this.heritage)) return;
    const uniforms = [
      ...new Set(
        OCCUPATIONS.map(
          (occupation) => occupation.uniform
        ).filter(
          (uniform): uniform is JobUniform => !!uniform
        )
      ),
    ];
    void Promise.all(
      uniforms.map((uniform) =>
        warmJobCharacterAtlases(
          this.heritage,
          this.gender,
          uniform,
          jobArtSeasonFor(
            uniform,
            this.currentLifeSeason()
          )
        )
      )
    ).then(() => {
      if (
        this.mode === "occupation" ||
        this.mode === "careermove"
      ) {
        this.renderOccupationCardFaces();
      }
    });
  }

  /** The 💼 Career desk: change jobs or climb the ladder (IQ-gated). */
  private showCareerMove(): void {
    const cur = this.occupation;
    const cards = OCCUPATIONS.map((o) => {
      const locked = this.stats.smarts < o.minIq;
      const isCur = cur?.id === o.id;
      const better = cur ? o.salaryMul > cur.salaryMul : false;
      const pay = formatMoney(Math.round(28000 * this.incomeMul() * o.salaryMul));
      const tag = isCur ? "✓ current" : locked ? `🔒 needs 🧠 ${o.minIq}` : better ? "Promote ↑" : "Switch";
      const tagColor = isCur ? "#9fe0b8" : locked ? "#ff8a8a" : better ? "#ffd23f" : "#7fc9ff";
      return `
      <button class="plj-partner${isCur || locked ? " locked" : ""}" data-id="${o.id}" ${isCur || locked ? "disabled" : ""}>
        ${this.occupationCardFace(o)}
        <span class="plj-partner-name">${o.name}</span>
        <span class="plj-partner-title">${TIER_LABELS[o.tier]} · ${o.field}</span>
        <span class="plj-partner-blurb">${o.blurb}</span>
        <span class="plj-chips"><span class="plj-chip" style="color:#3ddc84">${pay}/yr</span><span class="plj-chip" style="color:${tagColor}">${tag}</span></span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>💼 Make a career move</h2>
        <p class="plj-sub">Change jobs or climb the ladder. Salary = the job × your IQ, so better roles need a higher IQ.${cur ? ` You're a ${esc(cur.name)} now.` : ""}</p>
        <div class="plj-partners">${cards}</div>
        <button class="plj-btn plj-btn-ghost" id="plj-cm-cancel">Stay put</button>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const o = OCCUPATIONS.find((x) => x.id === btn.dataset.id);
        if (o) this.changeJob(o);
      };
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-cm-cancel")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
    this.prepareOccupationCardFaces();
  }

  private changeJob(o: Occupation): void {
    const prev = this.occupation;
    this.occupation = o;
    // Rebuild the deterministic profession cast against the new reserved
    // player visual now. Otherwise a matching NPC would fall back to a generic
    // body until reload, when the rebuilt room would suddenly look different.
    this.buildStations();
    this.warmPlayerBodyVariant();
    // One-off perks + the "fresh start" happiness only the FIRST time you hold a
    // job this life — otherwise toggling A→B→A→B farms free stats every switch.
    if (!this.jobsTaken.has(o.id)) {
      if (o.perks) this.applyEff(o.perks, "split");
      this.applyEff({ happiness: 4 }, "mental");
      this.jobsTaken.add(o.id);
    }
    this.history.push({
      stageId: STAGES[this.stageIndex].id,
      stageName: STAGES[this.stageIndex].name,
      optionId: "job_" + o.id,
      storyTag: o.storyTag,
      ageAt: this.age,
    });
    this.timeline[this.stageIndex] = this.snapshot(); // re-capture so rewind keeps the move
    this.mode = "playing";
    this.clearOverlay();
    this.hint(prev && o.salaryMul > prev.salaryMul ? `📈 You were promoted to ${o.name}!` : `${o.emoji} You're now a ${o.name}.`);
    this.persistGame();
  }

  /** A LinkedIn-style career profile: headline, salary, lifetime earnings, history. */
  private showProfile(): void {
    if (this.mode !== "playing" || this.stageIndex < CAREER_INDEX) return;
    this.mode = "profile";
    const o = this.occupation;
    const name = this.playerName.trim() || (this.gender === "female" ? "Alex" : "Sam");
    const iq = Math.round(this.stats.smarts);
    const salary = o ? formatMoney(Math.round(28000 * this.incomeMul() * o.salaryMul)) : "—";
    const headline = o ? `${o.name} · ${o.field}` : "Finding my path";
    const badges: string[] = [];
    if (o) badges.push(`📊 ${TIER_LABELS[o.tier]}`);
    if (this.netWorth() > 1000000) badges.push("⭐ Premium");
    if (iq >= 130) badges.push("✔️ verified");
    if (o && o.tier >= 6) badges.push("💼 Hiring");
    // experience timeline from every job ever held
    const jobs = this.history
      .filter((h) => h.optionId.startsWith("job_"))
      .map((h) => OCCUPATIONS.find((x) => "job_" + x.id === h.optionId) && { occ: OCCUPATIONS.find((x) => "job_" + x.id === h.optionId)!, from: Math.floor(h.ageAt) })
      .filter(Boolean) as { occ: Occupation; from: number }[];
    const tl = jobs
      .map((j, i) => ({ ...j, to: i < jobs.length - 1 ? jobs[i + 1].from : Math.floor(this.age) }))
      .reverse();
    const timeline = tl.length
      ? tl.map((j) => `<div class="plj-prof-job"><span>${j.occ.emoji} <b>${esc(j.occ.name)}</b> · ${j.occ.field}</span><span class="plj-prof-yrs">age ${j.from}–${j.to}</span></div>`).join("")
      : `<p class="plj-sub">No jobs held yet.</p>`;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-profile">
        <div class="plj-prof-head">
          <div class="plj-prof-avatar">${o ? o.emoji : "🧑"}</div>
          <div class="plj-prof-id">
            <h2>${esc(name)}</h2>
            <p class="plj-prof-headline">${esc(headline)} · 🧠 ${iq}</p>
            ${badges.length ? `<p class="plj-prof-badges">${badges.join(" · ")}</p>` : ""}
          </div>
        </div>
        <div class="plj-prof-stats">
          <span><b>${salary}</b><small>per year</small></span>
          <span><b>${formatMoney(this.lifetimeEarned)}</b><small>earned</small></span>
          <span><b>${this.connections >= 500 ? "500+" : this.connections}</b><small>connections</small></span>
          <span><b>${formatMoney(this.netWorth())}</b><small>net worth</small></span>
        </div>
        <h3 class="plj-prof-h3">💼 Experience</h3>
        <div class="plj-prof-timeline">${timeline}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-prof-close">← Back</button>
          ${o ? `<button class="plj-btn" id="plj-prof-move">📈 Make a move</button>` : ""}
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-prof-close")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
    const mv = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-prof-move");
    if (mv) mv.onclick = () => this.showCareerMove();
  }

  private showHouse(): void {
    const stars = (q: number) => "★".repeat(q) + "☆".repeat(5 - q);
    const cards = HOUSE_TIERS.map((h) => {
      const afford = this.money >= h.cost;
      const upkeep = h.upkeep > 0 ? `<span class="plj-chip" style="color:#ffb4b4">−${formatMoney(h.upkeep)}/yr</span>` : "";
      return `
      <button class="plj-partner${afford ? "" : " locked"}" data-id="${h.id}" ${afford ? "" : "disabled"}>
        <span class="plj-partner-face">${h.emoji}</span>
        <span class="plj-partner-name">${h.name}</span>
        <span class="plj-partner-title">${stars(h.quality)} · ${formatMoney(h.cost)}</span>
        <span class="plj-partner-blurb">${h.blurb}</span>
        <span class="plj-chips"><span class="plj-chip" style="color:#ffd23f">+${h.happiness} 😊</span>${upkeep}<span class="plj-chip" style="color:#3ddc84">rent ${formatMoney(h.rentYield)}</span></span>
      </button>`;
    }).join("");
    const owned = this.homes.length;
    const portfolio = owned
      ? `<p class="plj-sub" style="color:#9fe0b8">You own ${owned} ${owned === 1 ? "property" : "properties"} · live-in quality ${"★".repeat(this.homeQuality)}${this.rentalIncome > 0 ? ` · rent ${formatMoney(this.rentalIncome)}/yr` : ""}. Buy another to rent it out.</p>`
      : "";
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>🏠 Buy property</h2>
        <p class="plj-sub">You live in the grandest place you own — that sets your home's look. Pricier homes cost upkeep every year, but a spare place earns rent. Buy only what you can afford.</p>
        ${portfolio}
        <div class="plj-partners">${cards}</div>
        <button class="plj-btn plj-btn-ghost" id="plj-house-cancel">Not now</button>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const h = HOUSE_TIERS.find((x) => x.id === btn.dataset.id);
        if (h) this.buyHouse(h);
      };
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-house-cancel")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  private showVehicle(): void {
    const cards = VEHICLES.map((v) => {
      const owned = this.owned.has("veh_" + v.id);
      const afford = this.money >= v.cost;
      const usable = !owned && afford;
      return `
      <button class="plj-partner${usable ? "" : " locked"}" data-id="${v.id}" ${usable ? "" : "disabled"}>
        <span class="plj-partner-face">${v.emoji}</span>
        <span class="plj-partner-name">${v.name}</span>
        <span class="plj-partner-title">${owned ? "✓ owned" : formatMoney(v.cost)}</span>
        <span class="plj-partner-blurb">${v.blurb}</span>
        <span class="plj-chips"><span class="plj-chip" style="color:#ff8a8a">−${formatMoney(v.cost)}</span>${effectChips(v.effects)}</span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>🛵 Buy a vehicle</h2>
        <p class="plj-sub">Your own set of wheels — yours for life. A bicycle keeps you fit; a motorbike thrills; a car is comfort; a sports car is pure status. Pricier rides leave less for everything else.</p>
        <div class="plj-partners">${cards}</div>
        <button class="plj-btn plj-btn-ghost" id="plj-veh-cancel">Not now</button>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const v = VEHICLES.find((x) => x.id === btn.dataset.id);
        if (v) this.buyVehicle(v);
      };
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-veh-cancel")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  private showTimeTravel(): void {
    if (this.mode !== "playing" || this.biography) return;
    const past: { snap: Snapshot; i: number }[] = [];
    this.timeline.forEach((snap, i) => {
      if (snap && i <= this.stageIndex) past.push({ snap, i });
    });
    if (past.length < 2) return;
    this.mode = "timetravel";
    const cards = past
      .map(({ snap, i }) => {
        const st = STAGES[i];
        return `
      <button class="plj-partner" data-i="${i}">
        <span class="plj-partner-face">${st.emoji}</span>
        <span class="plj-partner-name">${st.name}</span>
        <span class="plj-partner-title">Age ${Math.floor(snap.age)}</span>
      </button>`;
      })
      .join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>⏳ Time-Travel Pill</h2>
        <p class="plj-sub">Jump back to any age and re-live from there — a chance to change everything that came after.</p>
        <div class="plj-partners">${cards}</div>
        <button class="plj-btn plj-btn-ghost" id="plj-tt-cancel">Stay in the present</button>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner").forEach((btn) => {
      btn.onclick = () => this.rewind(Number(btn.dataset.i));
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-tt-cancel")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  private showEnding(): void {
    const story = this.story!;
    const summary = STAT_KEYS.map(
      (k) => `<span class="plj-end-stat"><b style="color:${STAT_META[k].color}">${STAT_META[k].icon}</b> ${Math.round(this.stats[k])}</span>`
    ).join("") + `<span class="plj-end-stat"><b style="color:#3ddc84">💰</b> ${formatMoney(this.netWorth())}</span>`;
    // a freshly LIVED life (not a replay) can be saved as a replayable biography
    const recordBtn = this.biography ? "" : `<button class="plj-btn plj-btn-ghost" id="plj-record">💾 Save as a biography</button>`;
    const bioHead = this.biography
      ? `<p class="plj-sub" style="margin-top:-6px">📖 ${esc(this.biography.name || "A life")}${this.biography.subtitle ? " · " + esc(this.biography.subtitle) : ""}</p>`
      : "";
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-end">
        <h2>${story.title}</h2>
        ${bioHead}
        <p class="plj-epitaph">“${story.epitaph}”</p>
        <div class="plj-story">${story.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>
        <div class="plj-end-stats">${summary}</div>
        <div class="plj-title-row">
          <button class="plj-btn" id="plj-restart">Live another life ↺</button>
          ${recordBtn}
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-restart")!.onclick = () => {
      this.recordFunnel("replay_clicked");
      this.showTitle();
    };
    const rec = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-record");
    if (rec) rec.onclick = () => this.showRecordForm();
  }

  /** A little form to name + save the life you just lived as a biography. */
  private showRecordForm(): void {
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title">
        <h2>💾 Save this life</h2>
        <p class="plj-sub">Give it a name and it becomes a biography you can replay and share.</p>
        <div class="plj-bio-head">
          <input id="plj-rec-name" placeholder="Whose life was this? (a name)" maxlength="40">
          <input id="plj-rec-sub" placeholder="Subtitle (optional)" maxlength="60">
        </div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-rec-cancel">← Back</button>
          <button class="plj-btn" id="plj-rec-save">💾 Save biography</button>
        </div>
      </div>`;
    const ov = this.ui.overlay;
    ov.querySelector<HTMLButtonElement>("#plj-rec-cancel")!.onclick = () => this.showEnding();
    ov.querySelector<HTMLButtonElement>("#plj-rec-save")!.onclick = () => {
      const name = ov.querySelector<HTMLInputElement>("#plj-rec-name")?.value ?? "";
      const sub = ov.querySelector<HTMLInputElement>("#plj-rec-sub")?.value ?? "";
      const bio = this.buildBioFromPlaythrough(name, sub);
      saveBio(bio);
      this.editBio = bio;
      this.showBioList();
    };
  }

  // --- input ----------------------------------------------------------------

  /** Map a thumb-stick drag to a normalized (-1..1) vector + move the knob. */
  private updateStick(e: PointerEvent): void {
    const rect = this.ui.stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.min(rect.width, rect.height) * 0.34;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR && dist > 0) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    this.ui.stickKnob.style.setProperty("--stick-x", `${dx.toFixed(1)}px`);
    this.ui.stickKnob.style.setProperty("--stick-y", `${dy.toFixed(1)}px`);
    this.joyX = maxR > 0 ? dx / maxR : 0;
    this.joyY = maxR > 0 ? dy / maxR : 0;
  }

  private bindInput(): void {
    const setDir = (e: KeyboardEvent, down: boolean): void => {
      switch (e.key) {
        case "ArrowLeft": case "a": case "A": this.input.left = down; break;
        case "ArrowRight": case "d": case "D": this.input.right = down; break;
        case "ArrowUp": case "w": case "W": this.input.up = down; break;
        case "ArrowDown": case "s": case "S": this.input.down = down; break;
        case " ": case "Enter": case "e": case "E":
          if (down) this.actQueued = true;
          break;
        case "t": case "T":
          if (down) this.showTimeTravel();
          break;
        case "p": case "P":
          if (down) this.showProfile();
          break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", (e) => setDir(e, true));
    window.addEventListener("keyup", (e) => setDir(e, false));
    this.ui.canvas.addEventListener("pointerdown", (e) => {
      if (this.mode !== "playing") return;
      const p = this.canvasPoint(e);
      if (this.canShowTrainingGate() && this.hitCircle(p.x, p.y, UTILITY_GATE_X, this.trainingGateY(), TRAINING_GATE_R + 8)) {
        e.preventDefault();
        this.showTraining();
        return;
      }
      if (this.canShowAssetsGate() && this.hitCircle(p.x, p.y, W - 58, this.assetsGateY(), ASSETS_GATE_R + 8)) {
        e.preventDefault();
        this.showAssets();
        return;
      }
      if (this.canShowFamilyTreeGate() && this.hitCircle(p.x, p.y, W - 58, this.familyTreeGateY(), FAMILY_TREE_GATE_R + 8)) {
        e.preventDefault();
        this.showFamilyTree();
      }
    });

    // --- analog thumb-stick (Rambo-style): drag in any direction; speed scales
    // with how far you push. Pointer events → works with touch AND mouse. ---
    const stick = this.ui.stick;
    const releaseStick = (e?: PointerEvent): void => {
      if (e && e.pointerId !== this.joyPointerId) return;
      if (e && this.joyPointerId !== null && stick.hasPointerCapture(this.joyPointerId)) {
        stick.releasePointerCapture(this.joyPointerId);
      }
      this.joyPointerId = null;
      this.joyActive = false;
      this.joyX = 0;
      this.joyY = 0;
      stick.dataset.engaged = "false";
      this.ui.stickKnob.style.setProperty("--stick-x", "0px");
      this.ui.stickKnob.style.setProperty("--stick-y", "0px");
    };
    stick.addEventListener("pointerdown", (e) => {
      if (this.joyPointerId !== null) return; // first finger owns the stick
      e.preventDefault();
      this.joyPointerId = e.pointerId;
      this.joyActive = true;
      stick.dataset.engaged = "true";
      stick.setPointerCapture(e.pointerId);
      this.updateStick(e);
    });
    stick.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      e.preventDefault();
      this.updateStick(e);
    });
    stick.addEventListener("pointerup", releaseStick);
    stick.addEventListener("pointercancel", releaseStick);
    stick.addEventListener("lostpointercapture", () => {
      if (this.joyPointerId !== null) releaseStick();
    });
    stick.addEventListener("contextmenu", (e) => e.preventDefault());

    let inventoryDrag: { x: number; y: number; index: number | null; pointerId: number } | null = null;
    const inventoryIndexFrom = (target: EventTarget | null): number | null => {
      const item = target instanceof HTMLElement ? target.closest<HTMLElement>("[data-inv-index]") : null;
      if (!item?.dataset.invIndex) return null;
      const index = Number(item.dataset.invIndex);
      return Number.isFinite(index) ? index : null;
    };
    this.ui.inventoryWrap.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      inventoryDrag = { x: e.clientX, y: e.clientY, index: inventoryIndexFrom(e.target), pointerId: e.pointerId };
      this.ui.inventoryWrap.setPointerCapture?.(e.pointerId);
    });
    this.ui.inventoryWrap.addEventListener("pointerup", (e) => {
      e.preventDefault();
      if (!inventoryDrag || inventoryDrag.pointerId !== e.pointerId) return;
      const dx = e.clientX - inventoryDrag.x;
      const dy = e.clientY - inventoryDrag.y;
      const index = inventoryIndexFrom(e.target) ?? inventoryDrag.index;
      inventoryDrag = null;
      if (dy < -28 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        this.useSelectedInventoryItem();
      } else if (dx < -24) {
        this.stepInventorySelection(1);
      } else if (dx > 24) {
        this.stepInventorySelection(-1);
      } else if (index !== null) {
        this.setInventorySelection(index);
      }
    });
    this.ui.inventoryWrap.addEventListener("pointercancel", () => {
      inventoryDrag = null;
    });
    this.ui.inventoryWrap.addEventListener("wheel", (e) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 10) return;
      e.preventDefault();
      this.stepInventorySelection(delta > 0 ? 1 : -1);
    });
    // double-click an item → use it now: give to a nearby person, else eat (if food)
    this.ui.inventoryWrap.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const index = inventoryIndexFrom(e.target);
      if (index === null) return;
      this.setInventorySelection(index, false);
      this.useSelectedInventoryItem();
    });
    this.ui.timeTravel.addEventListener("click", () => this.showTimeTravel());
    this.ui.profileBtn.addEventListener("click", () => this.showProfile());
    this.ui.settingsBtn.addEventListener("click", () => this.showSettings());
    this.ui.skipBtn.addEventListener("click", () => this.skipStage());
    this.ui.themeBtn.addEventListener("click", () => this.toggleTheme());
    // Collect / interact button — same as pressing SPACE (acts on the focused
    // person / desk / gate). pointerdown so touch feels instant.
    this.ui.collectBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.actQueued = true;
    });
    this.ui.collectBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}

function effectChips(effects: Partial<Stats>): string {
  return (Object.entries(effects) as [StatKey, number][])
    .filter(([k, v]) => v && STAT_META[k])
    .map(
      ([k, v]) =>
        `<span class="plj-chip" style="color:${v > 0 ? STAT_META[k].color : "#ff8a8a"}">${
          v > 0 ? "+" : ""
        }${Math.round(v)} ${STAT_META[k].icon}</span>`
    )
    .join("");
}

/** Draw a glowing ground-ring under a moving item (green = touch, red = chase). */
function ellipseRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = ctx.fillStyle as string;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Escape user text for safe insertion into HTML (attributes + content). */
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** A normally-distributed sample (Box–Muller), used to roll IQ potential at birth. */
function gaussian(mean: number, sd: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Pick one event from a pool by its `weight`. */
function weightedPick(pool: RandomEvent[]): RandomEvent {
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return pool[pool.length - 1];
}
