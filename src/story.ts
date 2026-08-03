import type { Gender, HistoryEntry, Occupation, Partner, Stats } from "./types";
import { verdict, iqVerdict, moneyVerdict, formatMoney, weightStatus } from "./stats";

// ---------------------------------------------------------------------------
// The life-story writer. At the end of the game we turn the recorded choices
// into a short, personal narrative — with pre-written comments that explain
// WHY each habit mattered (e.g. milk -> "a strong, healthy start"). Add a new
// behaviour by giving its option a storyTag and an entry in the banks below.
// ---------------------------------------------------------------------------

export type CauseOfEnd = "oldage" | "health" | "natural";

export interface StoryInput {
  history: HistoryEntry[];
  finalStats: Stats;
  partner: Partner | null;
  deathAge: number;
  cause: CauseOfEnd;
  hadChild: boolean;
  gender: Gender;
  weight: number;
  occupation: Occupation | null;
  homeQuality: number;
  widowed: boolean;
  /** Short clauses for lucky/unlucky events that happened (see events.ts). */
  events: string[];
  /** Read the good-habits book 5+ times. */
  habitMaster: boolean;
  /** Vehicles owned, pre-formatted ("a car", "a bicycle"). */
  vehicles: string[];
  /** Learned money management. */
  moneyWise: boolean;
  /** How many properties were owned in total (>1 = a little landlord). */
  propertiesOwned: number;
  /** Cash in the bank at the end (dollars). */
  money: number;
  /** Total net worth at the end (cash + investments + property). */
  netWorth: number;
}

export interface LifeStory {
  title: string;
  paragraphs: string[];
  epitaph: string;
}

/** What the player DID, in plain words. */
const TAG_CLAUSES: Record<string, string> = {
  milk: "drank plenty of milk",
  sleep_baby: "slept long and soundly",
  cuddle: "were showered with cuddles",
  babble: "babbled at everyone who would listen",
  play_baby: "giggled at every rattle and toy",
  veggies: "ate your fruit and vegetables",
  junkfood: "loved sugary, greasy treats",
  play_learn: "loved building things and figuring them out",
  screen: "watched a lot of screens",
  play_active: "were always running around outside",
  family_love: "grew up wrapped in family love",
  read: "always had your nose in a book",
  sports: "threw yourself into sports",
  music: "filled your days with music",
  gaming: "spent long hours gaming",
  friends: "were surrounded by good friends",
  study: "studied hard",
  work_teen: "earned your own pocket money",
  party: "never missed a party",
  love: "fell head over heels in love",
  smoker_friend: "hung around smokers after school",
  cigarette: "experimented with cigarettes",
  beer: "had beers with friends",
  wine: "let wine become a habit",
  whisky: "leaned too hard on whisky",
  gangster_friend: "ran with a dangerous crowd",
  playboy_friend: "chased flashy romance and drama",
  internship: "got a head start through internships",
  exercise: "kept your body strong",
  travel: "chased horizons and travelled",
  work: "built a steady career",
  overtime: "poured yourself into your work",
  baby: "welcomed a child into the world",
  family: "put family first",
  date: "kept the romance alive",
  provide: "worked to provide for your family",
  home: "made a home of your own",
  invest: "planned and invested for the future",
  hobby: "found real joy in your hobbies",
  checkup: "looked after your health",
  mentor: "mentored the next generation",
  grandkids: "doted on your grandchildren",
  sedentary: "spent your days in front of the TV",
  community: "stayed close to your community",
  volunteer: "gave back by volunteering",
  reflect: "reflected on a life well lived",
  rest: "rested and savoured the calm",
  toy_car: "raced your toy cars everywhere",
  toy_doll: "treasured your dolls and toys",
  toy_phone: "were always on your phone",
  upskill: "kept learning new skills at work",
  chores: "earned your own pocket money with odd jobs",
  invest_stocks: "put your money to work in the markets",
  moneywise: "got smart about money",
  commute_walk: "walked or cycled to work",
  commute_transit: "rode the bus and train to work",
  commute_car: "drove yourself to work",
  commute_luxury: "were chauffeured to work in style",
  gamble: "couldn't resist a flutter now and then",
  veh_bike: "pedalled everywhere on your bicycle",
  veh_moto: "felt the wind on your motorbike",
  veh_car: "drove yourself wherever life called",
  veh_sports: "turned heads in your sports car",
};

/** The pre-written "why it mattered" notes — the heart of the storytelling. */
const TAG_NOTE: Record<string, string> = {
  milk: " — a strong, healthy start",
  sleep_baby: " — the quiet secret to growing up well",
  cuddle: " — and that love made you secure and happy",
  veggies: " — and your body thanked you for it",
  junkfood: " — which slowly wore your health down",
  play_active: " — building healthy habits early",
  family_love: " — a foundation that lasted a lifetime",
  read: " — quietly making you wiser",
  sports: " — keeping you fit and confident",
  study: " — and it opened real doors later",
  exercise: " — the habit that added years to your life",
  sleep: " — the quiet secret to a long life",
  overtime: " — though it quietly cost you your health and joy",
  party: " — fun you would never trade, even if it cost some sleep",
  smoker_friend: " — it felt grown-up for a moment, but your health and focus paid for it",
  cigarette: " — tobacco gave a tiny thrill and took far more back",
  beer: " — mostly harmless in small moments, but still not free",
  wine: " — a classy-looking habit that quietly dulled your edge",
  whisky: " — strong fun with a heavy cost",
  gangster_friend: " — excitement that pulled you away from safer paths",
  playboy_friend: " — thrilling, distracting, and hard on your future",
  travel: " — collecting memories worth more than money",
  friends: " — and those bonds kept you healthy and whole",
  checkup: " — catching trouble before it grew",
  sedentary: " — and the stillness slowly took its toll",
  grandkids: " — the sweetest happiness of all",
  community: " — because connection keeps people alive and well",
  gaming: " — though the hours added up",
  toy_phone: " — though the screen ate your hours",
  upskill: " — and it steadily lifted your earnings",
};

interface Era {
  stages: string[];
  phrase: string;
}

const ERAS: Era[] = [
  { stages: ["newborn", "toddler", "early"], phrase: "your earliest years" },
  { stages: ["elementary", "middle", "high"], phrase: "your school years" },
  { stages: ["university", "career"], phrase: "your twenties" },
  { stages: ["marriage", "midlife"], phrase: "your middle years" },
  { stages: ["senior", "retirement"], phrase: "your later years" },
];

function dominantTags(history: HistoryEntry[], stageIds: string[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const h of history) {
    if (!h.storyTag) continue;
    if (!stageIds.includes(h.stageId)) continue;
    // job, house & rentals are narrated by their own paragraph — keep them out of eras
    if (h.storyTag.startsWith("job_") || h.storyTag === "home" || h.storyTag === "rental") continue;
    counts.set(h.storyTag, (counts.get(h.storyTag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map((e) => e[0]);
}

function clauseFor(tag: string): string {
  return (TAG_CLAUSES[tag] ?? "found your own way") + (TAG_NOTE[tag] ?? "");
}

function joinClauses(tags: string[]): string {
  const clauses = tags.map(clauseFor);
  if (clauses.length === 0) return "drifted along without leaving much of a mark";
  if (clauses.length === 1) return clauses[0];
  return clauses.slice(0, -1).join(", ") + ", and you " + clauses[clauses.length - 1];
}

/** Join verb-phrase clauses into "a, b and c" (the leading "you" is in the sentence). */
function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

export function generateStory(input: StoryInput): LifeStory {
  const { history, finalStats, partner, deathAge, cause, hadChild } = input;
  const { gender, weight, occupation, homeQuality, widowed, events, habitMaster } = input;
  const { vehicles, moneyWise, propertiesOwned, netWorth } = input;
  const paragraphs: string[] = [];

  // Opening
  const child = gender === "female" ? "girl" : "boy";
  const yrs = Math.round(deathAge);
  paragraphs.push(
    `A baby ${child} was born one ordinary morning, small and full of promise. Over the ${yrs} years that followed, this is the life you lived — and the thousand little choices that quietly shaped it.`
  );

  // One richer paragraph per era that actually had choices (up to 3 habits each)
  const intros = [
    "As a small child,",
    "Through your school years,",
    "In your eventful twenties,",
    "Settling into your middle years,",
    "And in your later years,",
  ];
  ERAS.forEach((era, i) => {
    const tags = dominantTags(history, era.stages, 3);
    if (tags.length === 0) return;
    paragraphs.push(`${intros[i] ?? "Then"} you ${joinClauses(tags)}.`);
  });

  // Work + home
  const work = workHomeParagraph(occupation, homeQuality, propertiesOwned);
  if (work) paragraphs.push(work);

  // Money, wheels and possessions
  const money = moneyParagraph(vehicles, moneyWise, propertiesOwned);
  if (money) paragraphs.push(money);

  // Partner + family
  if (partner) {
    const childLine = hadChild
      ? " Together you raised a child of your own."
      : " You built a life together as a pair.";
    paragraphs.push(
      `You married ${partner.name}, ${partner.title}.${childLine} ${partnerLine(
        partner
      )}`
    );
    if (widowed) {
      const who = gender === "female" ? "husband" : "wife";
      paragraphs.push(
        `In your later years you lost your ${who}, and learned to carry their memory forward.`
      );
    }
  } else {
    paragraphs.push(
      "You walked through life as your own person, never marrying — free, and on your own terms."
    );
  }

  // Lucky/unlucky twists of fate
  if (events.length) {
    const uniq = [...new Set(events)];
    paragraphs.push(`Fate threw you some surprises along the way: you ${joinList(uniq)}.`);
  }
  if (habitMaster) {
    paragraphs.push(
      "And through it all you kept reading about good habits — book after book — which gave you a clear mind and a body that stayed strong."
    );
  }

  // The verdict on the meters (incl. fitness + lifetime net worth)
  paragraphs.push(verdictParagraph(finalStats, weight, netWorth));

  // A reflective look at what you leave behind
  paragraphs.push(legacyParagraph(finalStats, hadChild));

  // How it ended
  paragraphs.push(endingParagraph(cause, deathAge, finalStats));

  return {
    title: titleFor(finalStats, netWorth, cause),
    paragraphs,
    epitaph: epitaphFor(finalStats, netWorth, cause),
  };
}

function workHomeParagraph(occupation: Occupation | null, homeQuality: number, properties: number): string | null {
  if (!occupation && homeQuality === 0) return null;
  const parts: string[] = [];
  if (occupation) {
    const art = /^[aeiou]/i.test(occupation.name) ? "an" : "a";
    parts.push(`You made your living as ${art} ${occupation.name.toLowerCase()}`);
  }
  if (homeQuality > 0) {
    const homes: Record<number, string> = {
      1: "and lived in a cramped little studio with cracks in the walls",
      2: "and made a tidy city condo your home",
      3: "and settled into a bright, roomy townhouse",
      4: "and lived in a lovely family house with a garden",
      5: "and lived in a magnificent luxury villa befitting your success",
    };
    parts.push((occupation ? "" : "You ") + homes[homeQuality]);
  }
  let para = parts.join(" ").replace(/^You and/, "You") + ".";
  if (properties > 1) {
    para += ` In time you built up ${properties === 2 ? "a second property" : `a little portfolio of ${properties} properties`}, renting out the rest for a steady income.`;
  }
  return para;
}

function moneyParagraph(vehicles: string[], moneyWise: boolean, properties: number): string | null {
  const bits: string[] = [];
  if (vehicles.length) bits.push(`got around on ${joinList(vehicles)}`);
  if (moneyWise) bits.push("learned to handle money wisely, and watched your savings grow");
  if (!bits.length) return null;
  const lead = properties > 1 ? "You had a real head for money: you " : "When it came to money and things, you ";
  return lead + joinList(bits) + ".";
}

function partnerLine(p: Partner): string {
  const top = Object.entries(p.modifiers).sort(
    (a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number)
  )[0];
  const key = top?.[0];
  const map: Record<string, string> = {
    health: "They kept you healthy and active for years.",
    fun: "They filled your days with colour and adventure.",
    happiness: "They brought you steady, lasting happiness.",
    smarts: "They made you and your family a little wiser.",
  };
  return (key && map[key]) ?? "They were by your side through it all.";
}

function verdictParagraph(s: Stats, weight: number, netWorth: number): string {
  const parts: string[] = [];
  const wv = moneyVerdict(netWorth);
  const hv = verdict(s.happiness);
  const sv = iqVerdict(s.smarts);
  parts.push(
    wv === "great"
      ? `You ended your days wealthy and secure (worth ${formatMoney(netWorth)})`
      : wv === "good"
      ? `You were comfortable, never wanting for much (worth ${formatMoney(netWorth)})`
      : wv === "ok"
      ? "Money was sometimes tight, but you got by"
      : "You were never rich — life was a financial struggle"
  );
  parts.push(
    hv === "great"
      ? "and remarkably happy"
      : hv === "good"
      ? "and content with your lot"
      : hv === "ok"
      ? "with happiness that came and went"
      : "though happiness often felt out of reach"
  );
  parts.push(
    sv === "great"
      ? "— and wise beyond your years."
      : sv === "good"
      ? "— with hard-won wisdom."
      : sv === "ok"
      ? "— learning as you went."
      : "— your strengths were practical and lived rather than academic."
  );
  // the smarts clause always begins with "—"; tidy the comma before it
  let para = parts.join(", ").replace(", —", " —");
  // a note on how you carried your body through life
  const ws = weightStatus(weight);
  const fit: Record<string, string> = {
    healthy: " You kept yourself fit and well-fed throughout.",
    overweight: " The years of rich food showed on your frame.",
    obese: " Your body carried long-term strain, which affected your health.",
    underweight: " You stayed thin, sometimes too thin for your own good.",
  };
  return para + fit[ws];
}

function legacyParagraph(s: Stats, hadChild: boolean): string {
  const bits: string[] = [];
  bits.push(
    hadChild
      ? "you leave behind children — and the warm, noisy family you built around them"
      : "you leave behind no children of your own, but a long trail of people whose lives you brushed against"
  );
  if (s.smarts >= 120) bits.push("a sharp, brilliant mind that never stopped learning");
  else if (s.smarts < 85) bits.push("few books read, but plenty of living done");
  if (s.happiness >= 70) bits.push("and far more good days than bad");
  else if (s.happiness < 35) bits.push("and a heart that knew its share of hard days");
  else bits.push("and a fair mix of laughter and tears");
  return "Looking back over it all, " + bits.join(", ") + ".";
}

function endingParagraph(cause: CauseOfEnd, age: number, s: Stats): string {
  const a = Math.round(age);
  if (cause === "health") {
    return `Years of neglected health caught up with you. Your journey ended early, at just ${a}. A reminder that without health, nothing else has time to matter.`;
  }
  if (verdict(s.health) === "great" || verdict(s.happiness) === "great") {
    return `At ${a}, you slipped away peacefully — strong and smiling to the very end, surrounded by those you loved. A life well lived.`;
  }
  return `At ${a}, your long journey came gently to a close. You looked back on a full life, with no regrets worth keeping.`;
}

/** A money/IQ-aware 0..100 score per facet, so the title/epitaph weigh them fairly. */
function facetScores(s: Stats, netWorth: number): Record<string, number> {
  const moneyScore = { poor: 18, ok: 50, good: 76, great: 94 }[moneyVerdict(netWorth)];
  return {
    health: s.health,
    happiness: s.happiness,
    fun: s.fun,
    smarts: Math.max(0, Math.min(100, (s.smarts - 40) / 1.2)), // IQ 40..160 → 0..100
    wealth: moneyScore,
  };
}

function titleFor(s: Stats, netWorth: number, cause: CauseOfEnd): string {
  if (cause === "health") return "A Life Cut Short";
  const f = facetScores(s, netWorth);
  const avg = (f.health + f.happiness + f.fun + f.smarts + f.wealth) / 5;
  if (avg >= 75) return "A Life Truly Well Lived";
  if (avg >= 55) return "A Good, Full Life";
  if (avg >= 35) return "An Ordinary Life, Quietly Lived";
  return "A Hard Road Travelled";
}

function epitaphFor(s: Stats, netWorth: number, cause: CauseOfEnd): string {
  if (cause === "health") return "Gone too soon — health is the wealth we forget to keep.";
  const f = facetScores(s, netWorth);
  const top = (Object.entries(f) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0];
  const map: Record<string, string> = {
    health: "Lived strong, every single day.",
    happiness: "Loved much, and was much loved.",
    wealth: "Built something that lasted.",
    fun: "Never stopped finding the joy.",
    smarts: "Forever curious, forever learning.",
  };
  return map[top] ?? "A life lived in full.";
}
