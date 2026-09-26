import { bond, capitalise, careerFor, careerMatchesDream, has, lighthouseLit } from "../life";
import type { LifeState, ScoreKey } from "../types";
import { CHAPTERS } from "./chapters";
import { dreamItem, ENCOUNTERS } from "./encounters";
import { resolve, type Line, type PersonId } from "./model";

export type JunoArrival = "waiting" | "ferry" | "letter";

export interface Finale {
  lit: boolean;
  tinCarried: boolean;
  juno: JunoArrival;
  /** Everyone standing at the lighthouse with you (for the final shot). */
  company: PersonId[];
  scene: Line[];
  letter: string[];
  reflection: string;
}

export function junoArrival(s: LifeState): JunoArrival {
  const b = bond(s, "juno");
  return b >= 9 ? "waiting" : b >= 5 ? "ferry" : "letter";
}

export function finale(s: LifeState): Finale {
  const lit = lighthouseLit(s);
  const tinCarried = has(s, "dug_tin");
  const juno = junoArrival(s);
  const company: PersonId[] = [];
  if (juno !== "letter") company.push("juno");
  else company.push("ada");
  if (has(s, "partner")) company.push("sam");
  if (has(s, "kids")) company.push("mika", "pip");
  if (has(s, "lina_kite") || has(s, "lina_taught") || has(s, "passed_story")) company.push("lina");
  if (has(s, "forgave_dex")) company.push("dex");

  const scene: Line[] = [];
  const n = (text: string) => scene.push({ who: "narrator", text });
  const say = (who: PersonId, text: string) => scene.push({ who, text });

  if (lit) {
    n(
      has(s, "own_light")
        ? "Your lighthouse is lit tonight. You climbed up at six to switch it on yourself, the way Nana did for fifty years."
        : has(s, "juno_saved_light")
          ? "The lighthouse Juno saved is lit tonight, its beam sweeping the bay like it never stopped."
          : "The lighthouse you saved is lit tonight, its beam sweeping the bay like it never stopped.",
    );
  } else {
    n("The lighthouse stands dark behind a construction fence. The demolition has been postponed four times. It is still here. So are you.");
  }
  if (has(s, "partner")) say("sam", tinCarried ? "Go on. I'll carry the tin. I always carry something." : "Go on. I'll carry the spade. I always carry the spade.");
  if (has(s, "kids")) n("Mika has brought Pip, who is seven and wants to know if there is treasure.");
  if (company.includes("lina"))
    n(has(s, "lina_kite") ? "Lina is here too, grown up now, with a crooked kite under her arm." : "Lina is here too, grown up now. She still does the thing you taught her, without noticing.");
  if (company.includes("dex")) n("Dex has brought grilled fish, because of course he has.");

  if (juno === "waiting") {
    n("Someone is already sitting on the bench by the door.");
    say("juno", "You're late.");
    if (has(s, "gave_key")) say("juno", "I brought the key. Fifty-seven years on a ribbon. I want that noted.");
    else say("juno", "Fifty-nine years and you're still late.");
  } else if (juno === "ferry") {
    n(
      has(s, "sent_ticket")
        ? "The evening train is just pulling in below the cliff. Someone is running up the path far too fast for seventy."
        : "The evening ferry is just coming in. Someone is running up the cliff path far too fast for seventy.",
    );
    say("juno", "Don't you dare open that without me!");
    if (has(s, "gave_key")) say("juno", "I've got the key. I've got the key! Give me a minute.");
  } else {
    n("A young woman you don't know is waiting by the door, holding an envelope.");
    say("ada", "I'm Ada. Juno's granddaughter. She's not well enough to travel. She talked about you every summer.");
    say("ada", "She said you'd know what to do. And she said to tell you: “Still seventy. Promise.”");
  }

  if (juno !== "letter") {
    if (has(s, "letter_thanks")) say("juno", "Three days for six words. I timed it.");
    else if (has(s, "letter_remind")) say("juno", "You didn't have to write it in capitals.");
    else if (has(s, "sent_ticket")) say("juno", "Window seat. Sea on the right. You remembered.");
  }

  if (tinCarried) n("You don't need to dig. The tin has been on your kitchen shelf since the storm, unopened. You carried it up the hill.");
  else n("You dig where Nana told you to dig: three steps from the door, toward the sea. The spade hits metal.");

  n("The lid is stiff. Then it isn't.");
  n(`Inside: ${dreamItem(s)}. Juno's father's compass, still pointing home. And Nana's envelope, yellow with age.`);

  const letter = nanaLetter(s);
  return { lit, tinCarried, juno, company, scene, letter, reflection: reflection(s) };
}

export function nanaLetter(s: LifeState): string[] {
  const lines = [
    `My darling ${s.name},`,
    "If you are reading this, you kept a promise for fifty-nine years. That is longer than most lighthouses stand. I am proud of you already, and I haven't even met the person you became.",
    "Here is what fifty years of keeping a light taught me. The light was never for the ships that came home safe. They'd have found their way. It was for the ones out in the dark, who needed to know someone was still watching the water.",
  ];
  if (has(s, "nana_story")) {
    lines.push(
      "You know about the storm of '71. I kept the light burning all night for your grandad's boat. It never came back. I kept it burning anyway, for fifty more years, for everybody else's.",
    );
  }
  lines.push(
    "You have been somebody's light. I don't need to know the details to know that. It runs in the family.",
    "Now go and eat something. You've climbed a hill.",
    "Nana Pearl",
  );
  return lines;
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

function reflection(s: LifeState): string {
  const career = careerFor(s) ?? "someone";
  const item = dreamItem(s);
  if (careerMatchesDream(s)) {
    return `At eleven, you put ${item} in this tin. You became ${article(career)} ${career}. You did exactly what you said you would do. Most people never do.`;
  }
  return `At eleven, you put ${item} in this tin. You became ${article(career)} ${career} instead. The tin was never a contract. It was a question, and you answered it your own way.`;
}

// --------------------------------------------------------------------------- Book of Life
export interface BookChapter {
  number: string;
  title: string;
  ages: string;
  lines: string[];
}

export interface Book {
  title: string;
  subtitle: string;
  scores: { key: ScoreKey; value: number; line: string }[];
  chapters: BookChapter[];
  people: string[];
  keepsakes: { found: number; total: number; items: string[] };
  stats: string[];
}

export function lifeTitle(s: LifeState): string {
  if (has(s, "own_light")) return "Keeper of the Light";
  if (has(s, "saved_light")) return "The One Who Saved the Light";
  if (careerMatchesDream(s) && s.scores.happiness >= 60) {
    return {
      healer: "The Healer of Gull Lane",
      maker: "The Builder of Small Boats",
      storyteller: "The Storyteller of Marigold Bay",
      explorer: "The Wanderer Who Came Home",
    }[s.dream ?? "explorer"];
  }
  if (has(s, "moved_home") && bond(s, "family") >= 8) return "The Heart of Gull Lane";
  if (bond(s, "juno") >= 12) return "The Faithful Friend";
  if (s.scores.money >= 75 && has(s, "top")) return "The Climber";
  if (s.scores.happiness >= 70) return "The Glad Heart";
  if (s.scores.health >= 70) return "The Long Walker";
  return "A Life Well Travelled";
}

const SCORE_LINES: Record<ScoreKey, [number, string][]> = {
  health: [
    [70, "You reached seventy able to climb a cliff path without stopping. Your knees send their regards."],
    [40, "Your body carried you all the way here, complaining most of the way."],
    [0, "It was a hard road on your body. You made it up the hill anyway."],
  ],
  happiness: [
    [70, "Most days, if someone had asked, you would have said: yes, this. This is good."],
    [40, "There were grey years and golden ones. More golden than you expected."],
    [0, "It was not an easy life to be happy in. You kept looking for the light anyway."],
  ],
  money: [
    [70, "You never had to worry about the bills, and you were generous with what you had."],
    [40, "Enough, most of the time. Tight, some of the time. Never nothing."],
    [0, "Money was always short. The things that mattered didn't cost much."],
  ],
};

export function book(s: LifeState): Book {
  const scores = (["health", "happiness", "money"] as ScoreKey[]).map((key) => ({
    key,
    value: s.scores[key],
    line: SCORE_LINES[key].find(([min]) => s.scores[key] >= min)![1],
  }));
  const chapters: BookChapter[] = CHAPTERS.filter((c) => c.index >= 1 && c.index <= 7).map((c) => {
    const lines: string[] = [];
    for (const record of s.choices.filter((r) => r.chapter === c.index)) {
      const enc = ENCOUNTERS.find((e) => e.id === record.encounter);
      if (!enc) continue;
      const option = enc.options.find((o) => o.id === record.option);
      lines.push(record.memory ?? `${resolve(enc.title, s)}: ${option ? resolve(option.label, s) : record.option}`);
    }
    return { number: c.number, title: c.title, ages: `${c.ages[0]}–${c.ages[1]}`, lines };
  });
  const people: string[] = [];
  const b = s.bonds;
  people.push(
    b.juno >= 9
      ? "Juno Park — your oldest friend, for sixty-four years. The promise held."
      : b.juno >= 5
        ? "Juno Park — the friend you drifted from and found again."
        : "Juno Park — the friend the years pulled away. She never forgot you.",
  );
  if (has(s, "partner")) {
    people.push(
      has(s, "kids")
        ? "Sam — your partner, and Mika's other parent. Always carried something."
        : has(s, "stapler_sam")
          ? "Sam — your partner. Still has your stapler."
          : "Sam — your partner. Two chairs on a very small balcony.",
    );
  } else if (has(s, "met_sam")) {
    people.push(has(s, "jacket") ? "Sam — the one who brought your jacket back, twice. You think about them sometimes." : "Sam — the one under the small umbrella. You think about them sometimes.");
  }
  people.push(b.family >= 8 ? "Mom and Dad — you were there when it counted." : "Mom and Dad — they were proud of you. They said so less than they meant.");
  people.push(
    has(s, "passed_story")
      ? "Nana Pearl — you know her story. Now Lina does too."
      : has(s, "nana_story")
        ? "Nana Pearl — you know her story, and you kept it safe."
        : "Nana Pearl — the keeper of the light, and of you.",
  );
  if (has(s, "biscuit")) people.push("Biscuit — one ear up, one ear down. The best dog in Marigold Bay.");
  if (has(s, "forgave_dex")) people.push("Dex Moreau — it took sixty years. He got there.");
  else if (b.dex <= -2) people.push("Dex Moreau — some roads never crossed back.");
  if (has(s, "mentor")) people.push("Ms Okafor — who saw you bend the straight lines.");

  const found = s.keepsakes.length;
  const items = s.keepsakes
    .map((id) => {
      const [ch, i] = id.split(":").map(Number);
      return CHAPTERS[ch]?.keepsakes[i] ?? "";
    })
    .filter(Boolean);
  const stats = [
    `${s.stats.pickups} small good things collected`,
    `${s.stats.bumps} stumbles`,
    `${s.stats.letters} letters from Juno`,
    `Best streak: ${s.stats.bestStreak}`,
  ];
  const career = careerFor(s);
  return {
    title: lifeTitle(s),
    subtitle: `${s.name}${career ? `, ${career}` : ""}. Born in Marigold Bay. Kept a promise for fifty-nine years.`,
    scores,
    chapters,
    people,
    keepsakes: { found, total: 21, items },
    stats,
  };
}

export const describeDream = (s: LifeState) => capitalise(dreamItem(s));
