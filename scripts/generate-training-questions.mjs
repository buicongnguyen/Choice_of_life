import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUT_FILE = resolve("public/data/training-questions.json");
const LEVEL_COUNTS = { starter: 334, practice: 333, advanced: 333 };
const levels = Object.keys(LEVEL_COUNTS);

const sourceThemes = [
  "Mensa-style brainteasers: number, verbal, spatial, logic, and pattern puzzles.",
  "Lateral/situation puzzle styles: wording traps, hidden assumptions, and unexpected constraints.",
  "CASEL SEL competencies: self-awareness, self-management, social awareness, relationship skills, responsible decisions.",
  "Financial literacy themes: compound interest, inflation, diversification, budgeting, debt, credit, insurance, and risk.",
  "Career-center themes: interviews, networking, negotiation, mentors, resumes, career fit, and opportunity cost.",
];

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const fruits = ["apples", "pears", "peaches", "plums", "mangos", "oranges", "berries", "lemons", "kiwis", "grapes"];
const objects = ["book", "coin", "key", "cup", "pencil", "ticket", "button", "shell", "card", "marble", "sock", "stamp"];
const tools = ["hammer", "ladder", "broom", "wrench", "spoon", "pencil", "chair", "clock", "lamp", "basket"];
const colors = ["red", "blue", "green", "yellow", "purple", "orange", "black", "white", "silver", "pink"];
const animals = ["cat", "dog", "horse", "rabbit", "tiger", "panda", "eagle", "shark", "goat", "fox"];
const names = ["Maya", "Leo", "Nina", "Omar", "Ari", "Lena", "Sofia", "Noah", "Iris", "Kai", "Mina", "Jin", "Ravi", "Zara", "Tara", "Ben"];
const madeWords = ["Mips", "Nops", "Lums", "Zibs", "Ravs", "Tovs", "Peks", "Daws", "Fens", "Gols", "Havs", "Kims"];
const places = ["school", "library", "park", "office", "clinic", "studio", "market", "train station", "kitchen", "workshop"];
const contexts = ["school project", "family dinner", "team meeting", "group chat", "sports practice", "study group", "work shift", "birthday party", "club meeting", "group call", "family trip", "test week"];
const people = ["friend", "sibling", "classmate", "teammate", "coworker", "parent", "partner", "neighbor", "cousin", "teacher", "mentor", "child"];
const feelings = ["hurt", "nervous", "angry", "left out", "embarrassed", "jealous", "overwhelmed", "sad", "proud", "worried", "confused", "ignored"];
const goals = ["saving for a house", "starting a career", "paying school costs", "building a side hustle", "buying a car", "supporting family", "changing jobs", "renting a home", "starting university", "opening a small shop"];
const careers = ["designer", "developer", "teacher", "nurse", "manager", "chef", "mechanic", "analyst", "marketer", "engineer", "accountant", "artist"];
const skills = ["communication", "coding", "writing", "sales", "data analysis", "public speaking", "planning", "design", "budgeting", "leadership", "negotiation", "research"];
const cardAdjectives = ["bright", "quiet", "silver", "morning", "rainy", "lucky", "garden", "train", "studio", "market", "family", "library", "puzzle", "sunset", "school", "office", "festival"];
const scenePlaces = ["library", "playground", "office", "school hall", "family room", "train", "park", "market", "study desk", "career fair", "kitchen", "workshop", "community center"];

function pick(list, i) {
  return list[((i % list.length) + list.length) % list.length];
}

function uniqueAnswers(correct, wrongs) {
  const out = [String(correct)];
  for (const wrong of wrongs) {
    const value = String(wrong);
    if (!out.includes(value)) out.push(value);
    if (out.length === 3) break;
  }
  let n = 1;
  while (out.length < 3) {
    const value = `${correct} ${n}`;
    if (!out.includes(value)) out.push(value);
    n += 1;
  }
  return out;
}

function q(style, text, correct, wrongs, win) {
  return { style, q: text, answers: uniqueAnswers(correct, wrongs), correct: 0, win };
}

function letter(n) {
  return String.fromCharCode(65 + ((n % 26) + 26) % 26);
}

function dayAfter(start, offset) {
  return days[(days.indexOf(start) + offset) % days.length];
}

function money(n) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function pct(n) {
  return `${Math.round(n * 10) / 10}%`;
}

function rotateWrong(correct, a, b) {
  return [a === correct ? `${a} more` : a, b === correct ? `${b} less` : b];
}

const iqStyles = [
  ["number-double", (level, i) => {
    const start = 2 + (i % 11);
    const factor = level === "advanced" ? 3 : 2;
    const seq = [start, start * factor, start * factor ** 2, start * factor ** 3];
    return q("number-double", `Which number comes next: ${seq.join(", ")}, ?`, start * factor ** 4, [start * factor ** 3 + factor, start * factor ** 4 - factor], "Geometric sequence solved. +2 IQ.");
  }],
  ["number-growing-gap", (level, i) => {
    const start = 1 + (i % 9);
    const gap = 2 + (i % 5);
    const grow = 1 + (level === "advanced" ? (i % 4) : (i % 2));
    const seq = [start];
    for (let k = 1; k < 5; k++) seq.push(seq[k - 1] + gap + grow * (k - 1));
    return q("number-growing-gap", `Which number comes next: ${seq.join(", ")}, ?`, seq[4] + gap + grow * 4, [seq[4] + gap + grow * 3, seq[4] + gap + grow * 5], "Growing gaps solved. +2 IQ.");
  }],
  ["number-alternating", (level, i) => {
    const a = 2 + (i % 8);
    const plus = 3 + (i % 5);
    const times = level === "starter" ? 2 : 3;
    const seq = [a, a + plus, (a + plus) * times, (a + plus) * times + plus];
    return q("number-alternating", `What comes next: ${seq.join(", ")}, ?`, seq[3] * times, [seq[3] + plus, seq[2] * times], "Alternating rule detected. +2 IQ.");
  }],
  ["fibonacci", (level, i) => {
    const a = 1 + (i % 4);
    const b = 1 + ((i + 2) % 6);
    const seq = [a, b];
    while (seq.length < 6) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
    return q("fibonacci", `What comes next: ${seq.join(", ")}, ?`, seq[5] + seq[4], [seq[5] + 1, seq[5] + seq[3]], "Fibonacci-style pattern found. +2 IQ.");
  }],
  ["arithmetic-order", (level, i) => {
    const a = 3 + (i % 12);
    const b = 2 + ((i * 2) % 9);
    const c = 2 + ((i * 3) % 7);
    const text = level === "advanced" ? `What is (${a} + ${b}) x ${c} - ${b}?` : `What is ${a} + ${b} x ${c}?`;
    const ans = level === "advanced" ? (a + b) * c - b : a + b * c;
    return q("arithmetic-order", text, ans, rotateWrong(ans, (a + b) * c, a * b + c), "Order of operations stayed clear. +2 IQ.");
  }],
  ["calendar", (level, i) => {
    const start = pick(days, i * 2);
    const offset = 3 + ((i * 5) % (level === "starter" ? 18 : 44));
    return q("calendar", `If today is ${start}, what day is ${offset} days from now?`, dayAfter(start, offset), [dayAfter(start, offset + 1), dayAfter(start, offset + 2)], "Calendar reasoning improved. +2 IQ.");
  }],
  ["category-odd", (level, i) => {
    const sets = [
      [colors, tools, "color"],
      [animals, objects, "animal"],
      [fruits, tools, "fruit"],
      [tools, animals, "tool"],
    ];
    const [main, oddList] = pick(sets, i);
    const odd = pick(oddList, i + 3);
    const opts = [pick(main, i), pick(main, i + 4), odd, pick(main, i + 7)];
    return q("category-odd", `Which word does not belong: ${opts.join(", ")}?`, odd, [opts[0], opts[1]], "Category sorting sharpened. +2 IQ.");
  }],
  ["analogy", (level, i) => {
    const pairs = [
      ["hand", "glove", "foot", "shoe"],
      ["bird", "wing", "fish", "fin"],
      ["key", "lock", "pen", "paper"],
      ["seed", "plant", "egg", "bird"],
      ["chef", "kitchen", "teacher", "classroom"],
      ["author", "book", "painter", "canvas"],
      ["doctor", "clinic", "mechanic", "garage"],
    ];
    const p = pick(pairs, i);
    return q("analogy", `${p[0]} is to ${p[1]} as ${p[2]} is to what?`, p[3], [pick(tools, i + 1), pick(animals, i + 2)], "Analogy solved. +2 IQ.");
  }],
  ["set-logic", (level, i) => {
    const a = pick(madeWords, i);
    const b = pick(madeWords, i + 1);
    const c = pick(madeWords, i + 2);
    if (level === "starter") return q("set-logic", `All ${a} are ${b}. All ${b} are ${c}. Are all ${a} definitely ${c}?`, "yes", ["no", "only some"], "Chain logic clicked. +2 IQ.");
    if (level === "practice") return q("set-logic", `All ${a} are ${b}. Some ${b} are ${c}. Are all ${a} definitely ${c}?`, "no", ["yes", "only at night"], "Logic trap avoided. +2 IQ.");
    return q("set-logic", `No ${a} are ${b}. Some ${c} are ${a}. What must be true?`, `some ${c} are not ${b}`, [`all ${c} are ${b}`, `no ${c} exist`], "Set overlap solved. +2 IQ.");
  }],
  ["rate-work", (level, i) => {
    const workers = 2 + (i % 9);
    const hours = 2 + ((i * 3) % 6);
    const scale = 2 + (i % 5);
    return q("rate-work", `If ${workers} workers make ${workers} toys in ${hours} hours, how long do ${workers * scale} workers need for ${workers * scale} toys?`, `${hours} hours`, [`${hours * scale} hours`, `${hours + scale} hours`], "Rate scaling stayed clean. +2 IQ.");
  }],
  ["geometry", (level, i) => {
    const side = 3 + (i % 18);
    if (level === "starter") return q("geometry", `A square has side length ${side}. What is its perimeter?`, side * 4, [side * side, side * 2], "Geometry basics are strong. +2 IQ.");
    if (level === "practice") return q("geometry", `A rectangle is ${side} wide and ${side + 4} long. What is its area?`, side * (side + 4), [2 * side + 8, side * side], "Area reasoning improved. +2 IQ.");
    return q("geometry", `A square's area is ${side * side}. What is its side length?`, side, [side * 2, side + 2], "Reverse geometry solved. +2 IQ.");
  }],
  ["code-shift", (level, i) => {
    const value = 1 + (i % (level === "advanced" ? 8 : 5));
    const word = pick(["CAT", "DOG", "SUN", "MAP", "PEN", "BAG", "JOB"], i);
    const ans = [...word].map((ch) => letter(ch.charCodeAt(0) - 65 + value)).join("");
    return q("code-shift", `A code shifts each letter forward by ${value}. What does ${word} become?`, ans, [ans.slice(0, 2) + letter(value), word], "Letter-code pattern cracked. +2 IQ.");
  }],
  ["ordering", (level, i) => {
    const a = pick(names, i);
    const b = pick(names, i + 1);
    const c = pick(names, i + 2);
    const d = pick(names, i + 3);
    if (level === "advanced") return q("ordering", `${a} is older than ${b}. ${c} is younger than ${b}. ${d} is older than ${a}. Who is oldest?`, d, [a, b], "Multi-step ordering solved. +2 IQ.");
    return q("ordering", `${a} is older than ${b}. ${b} is older than ${c}. Who is youngest?`, c, [a, b], "Ordering logic stayed clean. +2 IQ.");
  }],
  ["pigeonhole", (level, i) => {
    const buckets = 3 + (i % (level === "starter" ? 4 : 8));
    return q("pigeonhole", `A drawer has ${buckets} sock colors. How many socks guarantee a matching pair?`, buckets + 1, [buckets, buckets + 2], "Worst-case reasoning unlocked. +2 IQ.");
  }],
  ["clock-drift", (level, i) => {
    const drift = 2 + (i % 12);
    const hours = 2 + ((i * 2) % 9);
    const dir = i % 2 === 0 ? "gains" : "loses";
    return q("clock-drift", `A clock ${dir} ${drift} minutes every hour. After ${hours} real hours, how many minutes ${dir === "gains" ? "fast" : "slow"} is it?`, drift * hours, [drift + hours, drift * (hours - 1)], "Accumulated drift calculated. +2 IQ.");
  }],
  ["letter-sequence", (level, i) => {
    const start = i % 8;
    const gaps = level === "starter" ? [1, 2, 3, 4] : [2, 3, 5, 8];
    const seq = [start];
    for (const g of gaps) seq.push(seq[seq.length - 1] + g);
    return q("letter-sequence", `What letter comes next: ${seq.slice(0, 5).map(letter).join(", ")}, ?`, letter(seq[4] + gaps[gaps.length - 1] + (level === "advanced" ? 5 : 1)), [letter(seq[4] + 1), letter(seq[4] + 2)], "Letter pattern found. +2 IQ.");
  }],
  ["wordplay", (level, i) => {
    const rows = [
      ["Which word becomes shorter when you add two letters?", "short", ["long", "wide"]],
      ["A word is hidden here: SILENT can be rearranged into what?", "listen", ["stone", "silent only"]],
      ["How many letters are in the phrase 'the alphabet'?", "11", ["8", "26"]],
      ["Which number's English spelling has letters in alphabetical order?", "forty", ["sixty", "ninety"]],
    ];
    const row = pick(rows, i);
    return q("wordplay", row[0], row[1], row[2], "Wordplay trap solved. +2 IQ.");
  }],
  ["spatial-direction", (level, i) => {
    const start = pick(["north", "east", "south", "west"], i);
    const turns = 1 + (i % 4);
    const lefts = level === "advanced" ? 1 + ((i + 2) % 3) : i % 2;
    const dirs = ["north", "east", "south", "west"];
    const idx = (dirs.indexOf(start) + turns - lefts + 40) % 4;
    return q("spatial-direction", `You face ${start}. Turn right ${turns} time(s), then left ${lefts} time(s). Which way are you facing?`, dirs[idx], [dirs[(idx + 1) % 4], dirs[(idx + 2) % 4]], "Mental rotation worked. +2 IQ.");
  }],
  ["formula", (level, i) => {
    const a = 2 + (i % 9);
    const b = 3 + ((i * 3) % 11);
    const m = level === "advanced" ? 4 : 2;
    const n = level === "starter" ? 1 : 3;
    const ans = m * a + n * b;
    return q("formula", `If score = ${m} x A + ${n} x B, what is the score when A=${a} and B=${b}?`, ans, [n * a + m * b, m * (a + b)], "Formula substitution solved. +2 IQ.");
  }],
];

const eqStyles = [
  ["self-awareness", (level, i) => q("self-awareness", `You feel ${pick(feelings, i)} before a ${pick(contexts, i)}. What helps first?`, "name the feeling and notice the trigger", ["pretend nothing happened", "blame someone nearby"], "Self-awareness got stronger. +EQ.")],
  ["self-management", (level, i) => q("self-management", `During a ${pick(contexts, i)}, your body gets tense. What is the best pause?`, "breathe and slow your reply", ["raise your voice", "send a sharp message"], "Self-management cooled the moment. +EQ.")],
  ["empathy", (level, i) => q("empathy", `A ${pick(people, i)} seems ${pick(feelings, i + 2)} after a ${pick(contexts, i + 3)}. What is kind?`, "ask gently and listen", ["tell them to stop feeling it", "make a joke about them"], "Empathy noticed the signal. +EQ.")],
  ["active-listening", (level, i) => q("active-listening", `Someone says, 'You are not hearing me' in a ${pick(contexts, i)}. What should you try?`, "repeat their main point in your words", ["explain why they are wrong", "change the subject"], "Reflection showed you heard them. +EQ.")],
  ["apology-repair", (level, i) => q("apology-repair", `You hurt a ${pick(people, i)} by accident. What apology works best?`, "own the action and ask how to repair", ["sorry you feel that way", "avoid them forever"], "Repair became clearer. +EQ.")],
  ["boundary", (level, i) => q("boundary", `A ${pick(people, i)} asks for help when you are exhausted. What is honest and kind?`, "I care, but I need rest before I can help", ["say yes and resent it", "vanish without words"], "Kind boundaries protected trust. +EQ.")],
  ["conflict", (level, i) => q("conflict", `Two people argue during a ${pick(contexts, i)}. What lowers the heat?`, "separate facts, feelings, and needs", ["pick a side instantly", "raise old grudges"], "Conflict slowed down. +EQ.")],
  ["inclusion", (level, i) => q("inclusion", `One quiet person is affected most by a group choice. What should you do?`, "invite their view before deciding", ["decide without them", "speak over them"], "Inclusive decisions are stronger. +EQ.")],
  ["privacy-trust", (level, i) => q("privacy-trust", `A ${pick(people, i)} shares a private worry. What protects trust?`, "keep it private unless safety is at risk", ["share it for gossip", "laugh it off"], "Trust stayed protected. +EQ.")],
  ["pressure", (level, i) => q("pressure", `A ${pick(people, i)} pressures you into a risky choice. What is strongest?`, "set a boundary and leave", ["prove you are brave", "say yes to fit in"], "Boundaries protected your future. +EQ.")],
  ["feedback", (level, i) => q("feedback", `Your feedback hurt a ${pick(people, i)} more than expected. What comes first?`, "listen and repair the impact", ["defend your intent only", "say they are too sensitive"], "Impact got attention. +EQ.")],
  ["gratitude", (level, i) => q("gratitude", `Someone thanks you after a ${pick(contexts, i)}. What strengthens the bond?`, "receive it warmly", ["reject the thanks", "make it awkward"], "Warm receiving improved connection. +EQ.")],
  ["perspective", (level, i) => q("perspective", `A ${pick(people, i)} disagrees about a ${pick(contexts, i)}. What question helps perspective?`, "what matters most to you here?", ["why are you always wrong?", "can you stop talking?"], "Perspective-taking opened a door. +EQ.")],
  ["grief-support", (level, i) => q("grief-support", `A ${pick(people, i)} is grieving. What helps most early on?`, "listen and stay present", ["force them to cheer up", "rank whose pain is worse"], "Presence can be powerful. +EQ.")],
  ["responsible-decision", (level, i) => q("responsible-decision", `Before posting an angry reply online, what should you check?`, "impact, safety, and long-term consequences", ["only whether it feels good now", "how many people will clap"], "Responsible decision-making improved. +EQ.")],
  ["repair-after-yes", (level, i) => q("repair-after-yes", `You said yes too quickly and regret it. What is best?`, "renegotiate early and clearly", ["miss the promise silently", "blame the calendar"], "Repair came before failure. +EQ.")],
  ["leadership", (level, i) => q("leadership", `You are leading a ${pick(contexts, i)} while stressed. What builds trust?`, "name the pressure and clarify next steps", ["hide everything", "snap at people"], "Honest leadership steadied the group. +EQ.")],
  ["fairness", (level, i) => q("fairness", `A group excludes one person by habit. What is leadership?`, "create a real chance for them to join", ["join the exclusion", "pretend it is invisible"], "Inclusive leadership rose. +EQ.")],
];

const strategyStyles = [
  ["budgeting", (level, i) => q("budgeting", `Before ${pick(goals, i)}, what should you check first?`, "needs, budget, and trade-offs", ["what friends bought", "only the color"], "Purchase planning improved. +Strategy.")],
  ["income-expense", (level, i) => q("income-expense", `For a ${pick(careers, i)} budget, what does income mean?`, "money coming in", ["money already spent", "money owed"], "Money vocabulary sharpened. +Strategy.")],
  ["cash-flow", (level, i) => q("cash-flow", `A small business is profitable on paper but cannot pay bills. What failed?`, "cash-flow planning", ["font choice", "office decoration"], "Cash flow became visible. +Strategy.")],
  ["emergency-fund", (level, i) => q("emergency-fund", `What should usually come before risky investing?`, "emergency savings", ["a luxury upgrade", "a rumor"], "Risk order improved. +Strategy.")],
  ["debt-interest", (level, i) => q("debt-interest", `Which debt is usually best to attack first?`, "highest interest debt", ["prettiest logo", "smallest font"], "Interest-cost strategy improved. +Strategy.")],
  ["compound-interest", (level, i) => {
    const start = 100 + (i % 9) * 50;
    const rate = 2 + (i % 7);
    return q("compound-interest", `Why can ${money(start)} saved early beat more money saved late?`, "more compounding years", ["older money is heavier", "late money is illegal"], "Compounding clicked. +Strategy.");
  }],
  ["inflation", (level, i) => {
    const rate = 2 + (i % 7);
    return q("inflation", `If prices rise about ${rate}% each year, what happens to cash buying power?`, "it usually buys less over time", ["it always buys more", "it never changes"], "Inflation effect understood. +Strategy.");
  }],
  ["diversification", (level, i) => q("diversification", `Why can one single stock be risky?`, "one company can fail", ["markets close forever", "shares weigh too much"], "Concentration risk spotted. +Strategy.")],
  ["credit", (level, i) => q("credit", `Paying bills on time usually helps what?`, "credit strength", ["height", "shoe quality"], "Credit habits improved. +Strategy.")],
  ["insurance", (level, i) => q("insurance", `What is insurance mainly for while ${pick(goals, i)}?`, "protecting against big losses", ["guaranteed profit", "avoiding budgets"], "Risk protection clicked. +Strategy.")],
  ["negotiation", (level, i) => q("negotiation", `A job offer for a ${pick(careers, i)} is lower than expected. What helps negotiation?`, "market data and value proof", ["anger only", "accept silently always"], "Negotiation got grounded. +Strategy.")],
  ["batna", (level, i) => q("batna", `What is a BATNA in negotiation?`, "best alternative if no deal", ["a bank code", "a tax penalty"], "Negotiation fallback identified. +Strategy.")],
  ["resume", (level, i) => q("resume", `A strong resume for ${pick(skills, i)} usually shows what?`, "measured results", ["only duties", "favorite snacks"], "Career evidence improved. +Strategy.")],
  ["interview", (level, i) => q("interview", `Before an interview for a ${pick(careers, i)} role, what should you prepare?`, "role research and examples", ["only your outfit", "nothing"], "Preparation raised your odds. +Strategy.")],
  ["networking", (level, i) => q("networking", `What is networking in a healthy career?`, "building helpful relationships", ["begging strangers", "collecting cards only"], "Career relationships got clearer. +Strategy.")],
  ["mentor", (level, i) => q("mentor", `Why find a mentor while learning ${pick(skills, i)}?`, "learn from experience faster", ["copy their life exactly", "avoid all work"], "Mentor strategy unlocked. +Strategy.")],
  ["career-fit", (level, i) => q("career-fit", `Before choosing a ${pick(careers, i)} path, what should you compare?`, "interest, skill, and market demand", ["only popularity", "only room color"], "Career fit got sharper. +Strategy.")],
  ["opportunity-cost", (level, i) => q("opportunity-cost", `You can work overtime or study ${pick(skills, i)}. What should you compare?`, "opportunity cost", ["shoe size", "weather only"], "Trade-off thinking improved. +Strategy.")],
  ["asset-return", (level, i) => q("asset-return", `A rental house has income and repairs. What matters most?`, "net cash flow after costs", ["paint color only", "rent before expenses"], "Rental math improved. +Strategy.")],
  ["depreciation", (level, i) => q("depreciation", `A normal car loses value over time. What is this called?`, "depreciation", ["appreciation", "promotion"], "Asset behavior learned. +Strategy.")],
  ["risk-return", (level, i) => q("risk-return", `What is risk-adjusted return?`, "reward compared with risk taken", ["return after lunch", "a guaranteed win"], "Smarter return comparison unlocked. +Strategy.")],
  ["margin-safety", (level, i) => q("margin-safety", `A plan works only in perfect conditions. What should you add?`, "margin of safety", ["more optimism only", "a louder slogan"], "Resilient planning unlocked. +Strategy.")],
  ["lifestyle-creep", (level, i) => q("lifestyle-creep", `You get a raise while ${pick(goals, i)}. What protects your future?`, "increase saving before lifestyle grows", ["spend it all instantly", "hide it"], "Lifestyle creep avoided. +Strategy.")],
  ["side-hustle", (level, i) => q("side-hustle", `A side hustle earns money. What grows it best long-term?`, "reinvest in what works", ["spend all instantly", "never track results"], "Growth loop identified. +Strategy.")],
];

function makeRawRows(generators, level, count) {
  return Array.from({ length: count }, (_, i) => {
    const [style, make] = generators[i % generators.length];
    const styleRound = Math.floor(i / generators.length);
    const row = make(level, styleRound * 37 + i);
    const cardId = `${level.slice(0, 1).toUpperCase()}${String(i + 1).padStart(3, "0")}`;
    const name = pick(names, i + styleRound);
    const place = pick(scenePlaces, i * 5 + styleRound);
    const lead = pick([
      `${name}'s ${pick(cardAdjectives, i * 3 + styleRound)} ${pick(objects, i * 7 + styleRound)} card ${cardId}`,
      `At the ${place}, ${name} asks on card ${cardId}`,
      `Round ${cardId} from the ${place}`,
      `A ${pick(cardAdjectives, i * 4 + styleRound)} note ${cardId} on the ${pick(objects, i * 7 + 3)} says`,
      `${name}'s ${pick(contexts, i + styleRound)} challenge ${cardId}`,
      `The ${place} puzzle ${cardId}`,
    ], i + styleRound);
    return { ...row, q: `${lead}: ${row.q}`, style };
  });
}

function spreadByStyle(rows) {
  const buckets = new Map();
  rows.forEach((row, sourceIndex) => {
    const bucket = buckets.get(row.style) ?? [];
    bucket.push({ ...row, sourceIndex });
    buckets.set(row.style, bucket);
  });
  const lastUsed = new Map([...buckets.keys()].map((style) => [style, -100000]));
  const out = [];
  let previous = "";
  while (out.length < rows.length) {
    const index = out.length;
    const candidates = [...buckets.entries()]
      .filter(([style, bucket]) => bucket.length && (style !== previous || buckets.size === 1));
    candidates.sort((a, b) => {
      const gapA = index - (lastUsed.get(a[0]) ?? -100000);
      const gapB = index - (lastUsed.get(b[0]) ?? -100000);
      return gapB - gapA || b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
    const [style, bucket] = candidates[0];
    out.push(bucket.shift());
    lastUsed.set(style, index);
    previous = style;
  }
  return out.map(({ sourceIndex, ...row }) => row);
}

function makeBank(generators) {
  const bank = {};
  for (const level of levels) {
    bank[level] = spreadByStyle(makeRawRows(generators, level, LEVEL_COUNTS[level]));
  }
  return bank;
}

function validateBank(categories) {
  for (const [category, bank] of Object.entries(categories)) {
    const allQuestions = Object.values(bank).flat();
    const prompts = allQuestions.map((row) => row.q);
    const unique = new Set(prompts);
    if (unique.size !== prompts.length) {
      throw new Error(`${category} has duplicate prompt strings: ${prompts.length - unique.size}`);
    }
    for (const [level, rows] of Object.entries(bank)) {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].style === rows[i - 1].style) {
          throw new Error(`${category}/${level} has adjacent style ${rows[i].style} at ${i}`);
        }
      }
    }
  }
}

const categories = {
  iq: makeBank(iqStyles),
  eq: makeBank(eqStyles),
  strategy: makeBank(strategyStyles),
};

validateBank(categories);

const counts = Object.fromEntries(Object.entries(categories).map(([category, bank]) => [
  category,
  Object.values(bank).reduce((sum, questions) => sum + questions.length, 0),
]));

const styleCounts = Object.fromEntries(Object.entries(categories).map(([category, bank]) => [
  category,
  Object.fromEntries(Object.values(bank).flat().reduce((map, row) => {
    map.set(row.style, (map.get(row.style) ?? 0) + 1);
    return map;
  }, new Map())),
]));

const db = {
  version: 2,
  generatedAt: "2026-06-22",
  counts,
  sourceThemes,
  styleCounts,
  categories,
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(db));
console.log(`Wrote ${OUT_FILE}`);
console.log(counts);
