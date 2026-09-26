import { bond, careerFor, has } from "../life";
import type { Dream, LifeState } from "../types";
import type { EncounterDef, Line, OptionDef, PersonId } from "./model";

const nar = (text: string): Line => ({ who: "narrator", text });
const say = (who: PersonId, text: string): Line => ({ who, text });

const continueOption = (effects: OptionDef["effects"], result: OptionDef["result"] = []): OptionDef => ({
  id: "continue",
  label: "Continue",
  detail: "",
  effects,
  result,
});

const DREAM_ITEM: Record<Dream, string> = {
  healer: "a drawing of you in a white coat",
  maker: "the little boat you and Dad built",
  storyteller: "your notebook of stories",
  explorer: "a map with a big red X",
};
export const dreamItem = (s: LifeState) => DREAM_ITEM[s.dream ?? "explorer"];

const FINALS: Record<Dream, string> = {
  healer: "the junior science finals",
  maker: "the regional boat-building regatta",
  storyteller: "the young writers' prize",
  explorer: "the coastal orienteering championship",
};

const WORKPLACE: Record<string, string> = {
  doctor: "hospital",
  engineer: "office",
  journalist: "newsroom",
  "marine biologist": "research centre",
  shipwright: "shipyard",
  boatwright: "workshop",
  "travel writer": "publisher",
};
const workplace = (s: LifeState) => WORKPLACE[careerFor(s) ?? "engineer"];

const firstFriendship = (s: LifeState) =>
  has(s, "kite_fixed")
    ? "the broken kite"
    : has(s, "tidepools")
      ? "the tide pools"
      : has(s, "ghost_story")
        ? "the lighthouse ghost"
        : "the day you almost walked past her";

export const ENCOUNTERS: EncounterDef[] = [
  // ======================================================================= 1 FIRST LIGHT
  {
    id: "night-shift",
    chapter: 1,
    at: 0.2,
    kind: "choice",
    title: "Night Shift",
    speaker: "mom",
    lines: [
      say("mom", "Shh, little light. Mama's home."),
      nar("Mom has worked all night at the hospital. Her eyes keep closing. Yours are wide open."),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "cuddle",
        label: "Reach up for a cuddle",
        detail: "Warm, close, and very sure she's real.",
        effects: { happiness: 4, bonds: { family: 1 }, memory: "Mom's scrubs smelled of soap and night air." },
        result: [nar("She laughs into your hair. Her scrubs smell of soap and night air.")],
      },
      {
        id: "sunrise",
        label: "Babble at the sunrise",
        detail: "Point at the window like you invented it.",
        effects: { happiness: 2, health: 2, flags: ["curious"], memory: "You and Mom watched the sun come up over the bay." },
        result: [nar("You both watch the sun come up over the bay. She forgets to be tired for a whole minute.")],
      },
      {
        id: "nap",
        label: "Snuggle down and nap together",
        detail: "Rest is a gift you can give, even now.",
        effects: { health: 6, bonds: { family: 1 }, memory: "The morning you and Mom slept until noon." },
        result: [nar("You both sleep until noon. Dad makes pancakes shaped like boats.")],
      },
    ],
  },
  {
    id: "first-word",
    chapter: 1,
    at: 0.47,
    kind: "choice",
    title: "Your First Word",
    speaker: "dad",
    cast: ["mom", "nana"],
    lines: [
      say("dad", "Everyone quiet. I think it's happening."),
      say("nana", "Go on, little light. Say something magnificent."),
    ],
    prompt: "Your first word is…",
    options: [
      {
        id: "mama",
        label: "“Mama!”",
        detail: "A classic for a reason.",
        effects: { happiness: 2, bonds: { family: 1 }, flags: ["word_mama"], memory: "Your first word was “Mama”." },
        result: [say("mom", "Did everyone hear that? I'm having it framed.")],
      },
      {
        id: "dada",
        label: "“Dada!”",
        detail: "He has been rehearsing you for weeks.",
        effects: { happiness: 2, bonds: { family: 1 }, flags: ["word_dada"], memory: "Your first word was “Dada”." },
        result: [say("dad", "Yes! YES! Somebody write down the time!")],
      },
      {
        id: "nana",
        label: "“Nana!”",
        detail: "She has been bribing you with biscuits.",
        effects: { happiness: 2, bonds: { family: 1 }, flags: ["word_nana"], memory: "Your first word was “Nana”." },
        result: [say("nana", "Well. Clearly the child has taste.")],
      },
      {
        id: "boat",
        label: "“Boat!”",
        detail: "You mean it with your whole chest.",
        effects: { happiness: 3, flags: ["word_boat"], memory: "Your first word was “boat”." },
        result: [
          nar("Dad laughs so hard he has to sit on the floor."),
          nar("He will tell this story at every one of your birthdays for the rest of his life."),
        ],
      },
    ],
  },
  {
    id: "nanas-gift",
    chapter: 1,
    at: 0.9,
    kind: "keystone",
    title: "Nana's Gift",
    speaker: "nana",
    cast: ["mom", "dad"],
    lines: [
      say("nana", "Five years old. Old enough for a real present from a real lighthouse keeper."),
      say("nana", "My old trunk has four treasures in it. Choose one. Choose with your heart, not your eyes."),
    ],
    prompt: "Which treasure do you take?",
    options: [
      {
        id: "spyglass",
        label: "The brass spyglass",
        detail: "It makes far things feel close.",
        effects: { happiness: 2, spark: "explorer", memory: "Nana gave you her brass spyglass." },
        result: [say("nana", "I used it to watch for boats coming home. Now you can watch for whatever's out there.")],
      },
      {
        id: "book",
        label: "The book of sea stories",
        detail: "Its pages smell of salt and pipe smoke.",
        effects: { happiness: 2, spark: "storyteller", memory: "Nana gave you her book of sea stories." },
        result: [say("nana", "Every story in there is true. Some of them even happened.")],
      },
      {
        id: "toolbox",
        label: "The little toolbox",
        detail: "Real tools, just small.",
        effects: { happiness: 2, spark: "maker", memory: "Nana gave you Grandad Will's little toolbox." },
        result: [say("nana", "Your grandad fixed half the boats in this bay with those. Mind your fingers.")],
      },
      {
        id: "first-aid",
        label: "The first-aid tin",
        detail: "Plasters, a tiny torch, and peppermints.",
        effects: { happiness: 2, spark: "healer", memory: "Nana gave you her first-aid tin." },
        result: [say("nana", "Your mother had one just like it at your age. Look how she turned out.")],
      },
    ],
    after: [nar("You carry it everywhere for a year. You sleep with it under your pillow. It's the start of something.")],
  },

  // ======================================================================= 2 THE TIN
  {
    id: "new-kid",
    chapter: 2,
    at: 0.14,
    kind: "choice",
    title: "The New Kid",
    speaker: "juno",
    lines: [
      nar("A girl you've never seen is sitting on the seawall, holding a kite with a snapped spine."),
      say("juno", "It was my dad's. He's not… coming with us. To here, I mean."),
      say("juno", "I'm Juno. Juno Park. We just moved in above the bakery."),
    ],
    prompt: "The school bell is ringing. What do you do?",
    options: [
      {
        id: "kite",
        label: "Fix the kite together",
        detail: "Tape, string, and one of your pencils.",
        star: ["maker", "healer"],
        effects: {
          happiness: 3,
          bonds: { juno: 2 },
          flags: ["kite_fixed"],
          memory: "You and Juno fixed the kite with tape and a pencil. It flew crooked. It flew.",
        },
        result: [nar("It flies crooked. It flies. Juno laughs for the first time since she got here.")],
      },
      {
        id: "tidepools",
        label: "Show her the tide pools",
        detail: "The best secret in Marigold Bay.",
        star: ["explorer"],
        effects: {
          health: 3,
          happiness: 2,
          bonds: { juno: 2 },
          flags: ["tidepools"],
          memory: "You showed Juno the tide pools, and you both got soaked.",
        },
        result: [nar("You're both late for school and soaking wet, and it is the best morning of the year.")],
      },
      {
        id: "ghost",
        label: "Tell her the lighthouse ghost story",
        detail: "Nana swears it's true.",
        star: ["storyteller"],
        effects: {
          happiness: 2,
          bonds: { juno: 2 },
          flags: ["ghost_story"],
          memory: "You told Juno about the lighthouse ghost. She wanted to go and check.",
        },
        result: [say("juno", "That's not real."), nar("A long pause."), say("juno", "…Can we go and check?")],
      },
      {
        id: "hurry",
        label: "Wave, and hurry to class",
        detail: "You can't get another late mark.",
        effects: { health: 1, bonds: { juno: 1 }, flags: ["almost_walked_past"], memory: "You almost walked past Juno. Almost." },
        result: [
          nar("You're on time. At lunch, Juno sits alone by the window."),
          nar("The next day, you sit next to her anyway. It takes a bit longer, but it takes."),
        ],
      },
    ],
  },
  {
    id: "the-storm-night",
    chapter: 2,
    at: 0.36,
    kind: "event",
    title: "The Storm",
    speaker: "dad",
    lines: [
      nar("That autumn, the worst storm in forty years comes in off the sea."),
      nar("In the morning, Dad's boat shed has no roof."),
      say("dad", "Well. At least the boats are fine. It's only… everything else."),
    ],
    options: [continueOption({ money: -8, flags: ["storm_shed"], memory: "The storm that took the roof off Dad's shed." })],
  },
  {
    id: "pup",
    chapter: 2,
    at: 0.5,
    kind: "choice",
    title: "A Pup in the Rain",
    speaker: "biscuit",
    lines: [
      nar("Under the fish market stall, something small and muddy is shivering."),
      nar("It has one ear up and one ear down, and it is looking at you like you're the answer to a question."),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "home",
        label: "Take him home",
        detail: "You'll convince Mom and Dad. Probably.",
        hint: "He'll run with you and fetch what you miss.",
        effects: {
          happiness: 5,
          money: -4,
          flags: ["biscuit", "biscuit_home"],
          memory: "You brought Biscuit home inside your jumper.",
        },
        result: [
          nar("Mom says absolutely not. Dad says “Biscuit” out loud, by accident."),
          nar("That's his name now."),
        ],
      },
      {
        id: "nana",
        label: "Carry him up to Nana's lighthouse",
        detail: "She's got room. She's been lonely.",
        hint: "He'll live with Nana, and run with you.",
        effects: {
          happiness: 3,
          health: 2,
          bonds: { family: 1 },
          flags: ["biscuit", "biscuit_nana"],
          memory: "You gave Nana a watchdog called Biscuit.",
        },
        result: [say("nana", "I suppose the lighthouse could use a watchdog."), nar("She has already found him a blanket.")],
      },
      {
        id: "owner",
        label: "Find his owner",
        detail: "Someone must be missing him.",
        effects: { money: 5, happiness: 1, flags: ["found_owner"], memory: "You found Pepper's owner and earned a jar of pickled onions." },
        result: [
          nar("His name is Pepper. He belongs to old Mr Ferris, who gives you a whole five pounds and a jar of pickled onions."),
        ],
      },
    ],
  },
  {
    id: "dads-shed",
    chapter: 2,
    at: 0.68,
    kind: "choice",
    title: "Dad's Shed",
    speaker: "dad",
    lines: [
      say("dad", "Insurance says the storm was “an act of God”. I'd like a word with Him."),
      say("dad", "We might have to sell the good boat to fix the roof."),
    ],
    prompt: "How do you help?",
    options: [
      {
        id: "rebuild",
        label: "Help him rebuild every weekend",
        detail: "Hammers, nails, and a lot of sandwiches.",
        star: ["maker"],
        effects: {
          health: 3,
          money: 4,
          bonds: { family: 2 },
          flags: ["helped_dad"],
          memory: "You and Dad rebuilt the shed roof, one weekend at a time.",
        },
        result: [nar("By spring the shed has a roof, and you know which end of a hammer to hold.")],
      },
      {
        id: "lemonade",
        label: "Sell lemonade on the pier",
        detail: "Tourists are thirsty. You are persuasive.",
        star: ["storyteller", "explorer"],
        effects: { money: 6, happiness: 1, flags: ["lemonade"], memory: "Your lemonade stand paid for four roof tiles." },
        result: [nar("You make forty-one pounds and one lifelong enemy (a seagull).")],
      },
      {
        id: "ask-nana",
        label: "Ask Nana for help",
        detail: "She always knows what to do.",
        star: ["healer"],
        effects: { money: 8, bonds: { family: 1 }, flags: ["nana_lamp"], memory: "Nana sold her brass lamp to fix Dad's roof." },
        result: [nar("Nana sells the old brass lamp from the lighthouse kitchen. She says she never liked it. She is lying.")],
      },
    ],
  },
  {
    id: "the-tin",
    chapter: 2,
    at: 0.93,
    kind: "keystone",
    title: "The Tin",
    speaker: "nana",
    cast: ["juno"],
    lines: [
      nar("Sunset at the lighthouse. Nana has brought a biscuit tin and a spade."),
      say("nana", "A time capsule. Sealed tight, buried deep, and opened only when you're both seventy."),
      say("juno", "Seventy? That's basically a hundred."),
      say("nana", "Then it had better be something you'll still care about. Choose carefully."),
    ],
    prompt: "What do you put in the tin?",
    options: [
      {
        id: "healer",
        label: "A drawing: you, in a white coat",
        detail: (s) => `“Doctor ${s.name}.” The stethoscope is enormous.`,
        star: (s) => s.spark === "healer",
        effects: { happiness: 3, dream: "healer", flags: ["tin_buried"] },
        result: [say("juno", "You'll be good at that. You always know when I'm sad.")],
      },
      {
        id: "maker",
        label: "The little boat you and Dad built",
        detail: "It floats. Mostly.",
        star: (s) => s.spark === "maker",
        effects: { happiness: 3, dream: "maker", flags: ["tin_buried"] },
        result: [say("juno", "Put your initials on the bottom. So future you knows it's yours.")],
      },
      {
        id: "storyteller",
        label: "Your notebook of stories",
        detail: "Forty-three pages. Six dragons.",
        star: (s) => s.spark === "storyteller",
        effects: { happiness: 3, dream: "storyteller", flags: ["tin_buried"] },
        result: [say("juno", "Promise you'll write one about me.")],
      },
      {
        id: "explorer",
        label: "A map with a big red X",
        detail: "The X means “everywhere else”.",
        star: (s) => s.spark === "explorer",
        effects: { happiness: 3, dream: "explorer", flags: ["tin_buried"] },
        result: [say("juno", "Take me with you. Okay? Wherever it is.")],
      },
    ],
    after: [
      nar("Juno puts in her father's compass. Nana puts in a sealed envelope and won't say what's inside."),
      say("nana", "Promises are like lighthouses. They don't move. People do. That's what makes them useful."),
      say("juno", "Seventy. Promise?"),
      say("you", "Promise."),
    ],
  },

  // ======================================================================= 3 CROSSCURRENTS
  {
    id: "bus-stop",
    chapter: 3,
    at: 0.1,
    kind: "choice",
    title: "The Bus Stop",
    speaker: "juno",
    lines: [
      nar("Juno's mum got a job in Brightwater, three hours up the coast. The bus leaves at four."),
      say("juno", "It's only three hours. That's nothing. Right?"),
      say("juno", "…Right?"),
    ],
    prompt: "What do you give her?",
    options: [
      {
        id: "letters",
        label: "A promise to write every week",
        detail: "Real letters. With stamps.",
        hint: "Her letters will find you on the road.",
        effects: { happiness: -2, bonds: { juno: 2 }, flags: ["letters"], memory: "You promised Juno a letter every week." },
        result: [say("juno", "Every week. Miss one and I'm coming back to shout at you.")],
      },
      {
        id: "key",
        label: "Nana's spare lighthouse key",
        detail: "On its faded blue ribbon.",
        effects: { bonds: { juno: 3 }, flags: ["gave_key"], memory: "You gave Juno the lighthouse key to keep until seventy." },
        result: [say("juno", "I'll bring it back when we're seventy. That's the deal.")],
      },
      {
        id: "joke",
        label: "A joke, so neither of you cries",
        detail: "It's a very bad joke.",
        effects: { happiness: 2, bonds: { juno: 1 }, memory: "The worst joke you ever told, at the bus stop." },
        result: [nar("It works for eleven seconds. Then you both cry anyway.")],
      },
    ],
  },
  {
    id: "the-answers",
    chapter: 3,
    at: 0.34,
    kind: "choice",
    title: "The Answers",
    speaker: "dex",
    lines: (s) => [
      say("dex", "Finals answers. The whole paper. My cousin's mate works in the print room."),
      say("dex", `Everyone's got them, ${s.name}. Don't be the only one who doesn't.`),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "look",
        label: "Take a look",
        detail: "Just a look.",
        hint: "Shortcuts remember you.",
        effects: { money: 5, happiness: 1, bonds: { dex: 2 }, flags: ["shortcut"], memory: "You looked at Dex's stolen answers." },
        result: [nar("Top marks. Nobody finds out. Dex grins at you across the hall like you share a secret. You do.")],
      },
      {
        id: "study",
        label: "Study with Ms Okafor after school",
        detail: "Harder. Slower. Yours.",
        hint: "Teachers remember the ones who stay late.",
        effects: { health: -3, money: 3, bonds: { okafor: 2 }, flags: ["mentor"], memory: "Ms Okafor's after-school study sessions." },
        result: [say("okafor", "You think in straight lines and then you bend them. Keep doing that.")],
      },
      {
        id: "report",
        label: "Tell a teacher",
        detail: "Someone should.",
        effects: { happiness: -2, bonds: { dex: -3, okafor: 1 }, flags: ["reported"], memory: "You reported the stolen answers." },
        result: [nar("The exam is rewritten. Dex doesn't speak to you for two years. You're not sure you were wrong.")],
      },
    ],
  },
  {
    id: "nanas-last-summer",
    chapter: 3,
    at: 0.7,
    kind: "keystone",
    title: "Nana's Last Summer",
    speaker: "nana",
    lines: (s) => [
      nar("Nana is ill. The doctors use careful words. Nana uses plain ones."),
      say("nana", "I'm dying, love. Not today. But soon enough that we should stop wasting afternoons."),
      nar(`The same week is ${FINALS[s.dream ?? "explorer"]}: the thing you have worked toward all year.`),
    ],
    prompt: "Where do you spend that week?",
    options: [
      {
        id: "stay",
        label: "At the lighthouse, with Nana",
        detail: "She tells stories. You listen.",
        hint: "Some stories only get told once.",
        effects: {
          happiness: 4,
          money: -2,
          bonds: { family: 2 },
          flags: ["nana_story"],
          memory: "Nana told you about the storm of '71.",
        },
        result: [
          nar("On the last night she tells you about the storm of '71: the boat she kept the light on for, all night,"),
          nar("and the promise she made to someone who never came home."),
        ],
      },
      {
        id: "finals",
        label: "At the finals. She insists.",
        detail: "“Go. Win. Tell me everything.”",
        star: () => true,
        effects: { money: 8, happiness: -3, flags: ["finals_won"], memory: "You won the finals and ran the medal up to Nana." },
        result: [
          nar("You win. You run the whole cliff path with the medal in your fist."),
          nar("She's asleep. She wakes up just long enough to say “I knew it.”"),
        ],
      },
      {
        id: "both",
        label: "Both: work at her bedside",
        detail: "Sleep is for later.",
        effects: { health: -4, money: 4, happiness: 2, flags: ["finals_bedside"], memory: "You finished your finals project at Nana's bedside." },
        result: [
          nar("You finish your project at the foot of her bed. She reads over your shoulder and fixes one thing."),
          nar("It was the right thing."),
        ],
      },
    ],
  },
  {
    id: "light-goes-dark",
    chapter: 3,
    at: 0.92,
    kind: "event",
    title: "The Light Goes Dark",
    speaker: "dad",
    cast: ["mom"],
    lines: [
      nar("The lighthouse has never been so quiet."),
      say("dad", "She'd have hated this. Well. She'd have said she didn't mind, and then hated it."),
      say("mom", "She left you something. It's in the tin, apparently. She said you'd know when."),
    ],
    options: [continueOption({ happiness: -6, flags: ["nana_gone"], memory: "The autumn Nana died and the light went dark." })],
  },

  // ======================================================================= 4 LEAVING HARBOUR
  {
    id: "the-fork",
    chapter: 4,
    at: 0.05,
    kind: "keystone",
    title: "The 7:14",
    speaker: "mom",
    cast: ["dad"],
    lines: [
      nar("Platform one. The 7:14 is on time, for once in its life."),
      say("mom", "Whatever you choose, you can always come home. That's what home is for."),
      say("dad", "And if you choose the shed, I'll pretend I'm not thrilled."),
    ],
    prompt: "What comes next?",
    options: [
      {
        id: "uni",
        label: "University in Brightwater",
        detail: "Lectures, libraries, and a loan you'll pay off at forty.",
        star: ["healer", "storyteller", "explorer"],
        effects: { money: -10, happiness: 2, path: "uni", flags: ["uni"], memory: "You caught the 7:14 to university." },
        result: [nar("The letter comes in August. Mom cries in the kitchen. Dad says he has something in his eye.")],
      },
      {
        id: "apprentice",
        label: "An apprenticeship at the shipyard",
        detail: "Paid to learn. Steel-toe boots.",
        star: ["maker"],
        effects: { money: 6, health: 2, path: "apprentice", flags: ["apprentice"], memory: "You started at the Brightwater shipyard." },
        result: [nar("The foreman looks at your hands and says, “You've done this before.” You have.")],
      },
      {
        id: "shop",
        label: "Stay, and take on Dad's shed",
        detail: "Marigold Bay still needs a boatwright.",
        star: ["maker"],
        effects: {
          money: 2,
          happiness: 2,
          bonds: { family: 3 },
          path: "shop",
          flags: ["stayed"],
          memory: "You stayed in Marigold Bay and took on Dad's shed.",
        },
        result: (s) => [
          nar(`Dad paints a new sign: THEO & ${s.name.toUpperCase()}. He gets your name right on the second try.`),
          nar("You still hear the 7:14 every morning. Now you wave at it."),
        ],
      },
      {
        id: "travel",
        label: "A year on the road",
        detail: "One backpack. No plan.",
        star: ["explorer", "storyteller"],
        effects: { happiness: 5, money: -6, health: 2, path: "travel", flags: ["traveled"], memory: "A year on the road with one backpack." },
        result: [
          nar("Mountains. Deserts. A very rude goat. You send postcards to Nana's old address, just because."),
          nar("When you come back, you write it all down, and someone pays you for it."),
        ],
      },
    ],
  },
  {
    id: "juno-in-the-city",
    chapter: 4,
    at: 0.3,
    kind: "choice",
    title: "Juno, Again",
    speaker: "juno",
    lines: (s) => [
      s.path === "shop"
        ? nar("Juno turns up in Marigold Bay for a weekend and doesn't leave for three days. She has three jobs in the city and a sofa she doesn't own.")
        : nar("You find Juno working the late shift at a café by the station. She has three jobs and a sofa she doesn't own."),
      say("juno", "The travel company thing fell through. Turns out you need money to make money. Who knew."),
      ...(has(s, "letters") ? [say("juno", "I kept every letter, you know. Even the one about the seagull.")] : []),
      ...(has(s, "gave_key") ? [nar("The lighthouse key hangs on its blue ribbon around her neck."), say("juno", "Still got it. Still seventy.")] : []),
    ],
    prompt: "How do you help?",
    options: [
      {
        id: "sofa",
        label: "Offer her your sofa",
        detail: "It's lumpy, but it's free.",
        effects: { happiness: 2, money: -3, bonds: { juno: 3 }, flags: ["juno_sofa"], memory: "Juno lived on your sofa for four months." },
        result: [nar("She stays four months. You learn she sings in the shower, badly, with total confidence.")],
      },
      {
        id: "plan",
        label: "Help her write a real business plan",
        detail: "Spreadsheets. Coffee. More spreadsheets.",
        hint: "Plans have a way of paying off later.",
        star: ["storyteller", "maker"],
        effects: { health: -1, bonds: { juno: 2 }, flags: ["juno_plan"], memory: "You and Juno wrote her business plan at your kitchen table." },
        result: [nar("Two weeks later a bank says yes. Juno sends you a photo of the letter with forty exclamation marks.")],
      },
      {
        id: "later",
        label: "Meet up when you can",
        detail: "You're both so busy.",
        effects: { health: 2, flags: ["juno_distant"] },
        result: [nar("You mean it. Somehow “when you can” turns into twice a year.")],
      },
    ],
  },
  {
    id: "sam",
    chapter: 4,
    at: 0.55,
    kind: "choice",
    title: "One Small Umbrella",
    speaker: "sam",
    lines: [
      nar("Rain. The bus is late. The stranger next to you is losing a fight with their umbrella."),
      say("sam", "It's fine. This is fine. I'm Sam, by the way. I'm normally more… waterproof."),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "share",
        label: "Share your umbrella",
        detail: "It's a small umbrella.",
        effects: { happiness: 2, bonds: { sam: 2 }, flags: ["met_sam"], memory: "You met Sam under one small umbrella." },
        result: [nar("The bus is forty minutes late. You don't notice.")],
      },
      {
        id: "jacket",
        label: "Lend Sam your jacket and run",
        detail: "Heroic. Also cold.",
        effects: { health: -2, happiness: 1, bonds: { sam: 1 }, flags: ["met_sam", "jacket"], memory: "You lent Sam your jacket in the rain." },
        result: [nar("Three days later, Sam finds you to return the jacket. And again the next week, to return nothing at all.")],
      },
      {
        id: "phone",
        label: "Keep your eyes on your phone",
        detail: "It's been a long day.",
        effects: { health: 1, flags: ["missed_sam"] },
        result: [nar("The bus comes. The stranger gets on the other one. That's all.")],
      },
    ],
  },
  {
    id: "biscuits-summer",
    chapter: 4,
    at: 0.8,
    kind: "choice",
    title: "Biscuit's Last Summer",
    speaker: "dad",
    cast: ["biscuit"],
    when: (s) => has(s, "biscuit"),
    lines: [say("dad", "He's slowing down, love. Sleeps by the door all day. Waiting for you, I think.")],
    prompt: "What do you do?",
    options: [
      {
        id: "summer",
        label: "Go home for the whole summer",
        detail: "Everything else can wait.",
        effects: { happiness: 4, money: -4, bonds: { family: 1 }, flags: ["biscuit_goodbye"], memory: "Biscuit's last summer at the tide pools." },
        result: [nar("You take him to the tide pools every morning. He doesn't swim any more. He watches you swim, and that's enough for him.")],
      },
      {
        id: "weekends",
        label: "Visit every weekend",
        detail: "The 7:14, both ways.",
        effects: { happiness: 2, health: -2, money: -2 },
        result: [nar("Every Friday he's at the door before you knock.")],
      },
      {
        id: "calls",
        label: "Video-call him every night",
        detail: "He tilts his head at your voice.",
        effects: { money: 2, happiness: -3 },
        result: [nar("Dad holds the phone to Biscuit's ear. His tail thumps twice. It's something.")],
      },
    ],
  },
  {
    id: "dads-visit",
    chapter: 4,
    at: 0.8,
    kind: "choice",
    title: "Dad Takes the Train",
    speaker: "dad",
    when: (s) => !has(s, "biscuit"),
    lines: (s) => [
      s.path === "shop"
        ? say("dad", "You've changed the shed around. I hate it. I love it. Show me.")
        : say("dad", "Took the 7:14. First time in twenty years. Your city's very… tall."),
    ],
    prompt: "How do you spend the day?",
    options: [
      {
        id: "day-off",
        label: "Take the day off and show him around",
        detail: "The harbour, the market, the good chips.",
        effects: { happiness: 3, money: -2, bonds: { family: 2 }, memory: "The day Dad came to see your world." },
        result: [nar("He likes the harbour best. Of course he does.")],
      },
      {
        id: "work",
        label: "Show him where you work",
        detail: "He wants to meet everyone.",
        effects: { money: 2, bonds: { family: 1 } },
        result: [nar("He shakes everyone's hand. Everyone. Including a delivery driver who was just passing.")],
      },
    ],
  },

  // ======================================================================= 5 THE CLIMB
  {
    id: "the-offer",
    chapter: 5,
    at: 0.16,
    kind: "choice",
    title: "The Offer",
    speaker: (s) => (has(s, "mentor") ? "okafor" : "hale"),
    lines: (s) =>
      has(s, "mentor")
        ? [
            say("okafor", `${s.name}. I remember a student who bent straight lines. I run the Northport project now.`),
            say("okafor", "I need someone to lead the new team. It's a big job. It's also four hundred miles away."),
          ]
        : [
            say("hale", `You're good, ${s.name}. Northport needs someone good.`),
            say("hale", "It's a big step. And a long way from here."),
          ],
    prompt: "What do you say?",
    options: [
      {
        id: "northport",
        label: "Take Northport",
        detail: "More money, more pressure, fewer weekends.",
        effects: { money: 12, health: -5, happiness: -2, flags: ["northport"], memory: "You led the Northport team." },
        result: [nar("You pack your life into nine boxes. It fits. That's the worrying part.")],
      },
      {
        id: "stay",
        label: "Stay where you are",
        detail: "You like your life. Mostly.",
        effects: { health: 3, happiness: 1 },
        result: (s) => [
          has(s, "mentor")
            ? say("okafor", "Knowing what you want is rarer than talent. Don't lose it.")
            : say("hale", "Suit yourself. Offer stands till Friday."),
        ],
      },
      {
        id: "own",
        label: "Pitch your own idea instead",
        detail: "The thing you've been sketching on napkins for years.",
        star: () => true,
        because: (s) => (has(s, "mentor") ? "Ms Okafor remembers you" : ""),
        effects: (s) => ({
          money: has(s, "mentor") ? -2 : -5,
          happiness: 4,
          flags: ["own_venture"],
          memory: "You started something of your own.",
        }),
        result: (s) =>
          has(s, "mentor")
            ? [say("okafor", "Now that, I'd back."), nar("She does. Not with much money. But with her name.")]
            : [nar("Hale laughs. Then he reads it again and stops laughing. It's a start.")],
      },
    ],
  },
  {
    id: "dex-idea",
    chapter: 5,
    at: 0.36,
    kind: "choice",
    title: "Dex's Big Idea",
    speaker: "dex",
    lines: (s) => [
      say("dex", `${s.name}! Look at you. Look at me! Look at us!`),
      say("dex", "LifeHack. An app that makes every decision for you. Investors are circling. I'm letting a few old friends in first."),
      ...(has(s, "shortcut") ? [say("dex", "You and me, we understand how the world actually works.")] : []),
      ...(has(s, "reported") ? [say("dex", "No hard feelings about school. Water under the bridge. Very expensive bridge.")] : []),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "invest",
        label: "Invest your savings",
        detail: "He's very convincing.",
        hint: "Nothing grows without risk. Some things don't grow at all.",
        because: (s) => (has(s, "shortcut") ? "You looked at his answers once" : ""),
        effects: { money: -10, bonds: { dex: 2 }, flags: ["dex_invest"], memory: "You invested your savings in LifeHack." },
        result: [nar("Dex hugs you. His watch costs more than your car.")],
      },
      {
        id: "decline",
        label: "Politely decline",
        detail: "Not for you.",
        effects: { bonds: { dex: -1 } },
        result: [say("dex", "Your loss. Genuinely."), nar("He means it both ways.")],
      },
      {
        id: "warn",
        label: "Tell him what's wrong with it",
        detail: "Three things. Four, actually.",
        effects: { bonds: { dex: -1 }, flags: ["warned_dex"], memory: "You told Dex the four things wrong with LifeHack." },
        result: [nar("He laughs. But he writes one of them down.")],
      },
    ],
  },
  {
    id: "sams-question",
    chapter: 5,
    at: 0.58,
    kind: "choice",
    title: "Sam's Question",
    speaker: "sam",
    when: (s) => has(s, "met_sam"),
    lines: [
      nar("A rooftop at dusk. The city hums underneath you."),
      say("sam", "I've been thinking about the next ten years. I keep putting you in them."),
      say("sam", "So. What do you want?"),
    ],
    prompt: "What do you want?",
    options: [
      {
        id: "family",
        label: "A family: kids, noise, all of it",
        detail: "Sleep is overrated anyway.",
        hint: "Sam will have your back when things go wrong.",
        effects: { happiness: 5, money: -6, bonds: { sam: 3, family: 1 }, flags: ["partner", "kids"], memory: "You and Sam chose a family." },
        result: [nar("Two years later Mika arrives, furious about everything, and instantly the centre of the universe.")],
      },
      {
        id: "together",
        label: "A life together, just us",
        detail: "Two chairs on a small balcony.",
        hint: "Sam will have your back when things go wrong.",
        effects: { happiness: 4, bonds: { sam: 3 }, flags: ["partner"], memory: "You and Sam built a life for two." },
        result: [nar("You get a flat with a balcony too small for two chairs. You fit two chairs on it anyway.")],
      },
      {
        id: "not-ready",
        label: "“I'm not ready.”",
        detail: "It's true. That's the problem.",
        effects: { happiness: -4, bonds: { sam: -2 }, flags: ["sam_left"], memory: "The night you told Sam you weren't ready." },
        result: [say("sam", "Okay."), nar("It's the saddest “okay” you've ever heard.")],
      },
    ],
  },
  {
    id: "second-chance",
    chapter: 5,
    at: 0.58,
    kind: "choice",
    title: "The Stapler",
    speaker: "sam",
    when: (s) => !has(s, "met_sam"),
    lines: [
      nar("Someone at work keeps stealing your stapler. Their name is Sam."),
      say("sam", "In my defence, it's a very good stapler."),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "dinner",
        label: "Ask Sam to dinner",
        detail: "Bring the stapler as a chaperone.",
        hint: "Sam will have your back when things go wrong.",
        effects: { happiness: 3, bonds: { sam: 2 }, flags: ["met_sam", "partner"], memory: "Dinner with Sam turned into the rest of your life." },
        result: [nar("Dinner turns into a walk. The walk turns into the rest of your life.")],
      },
      {
        id: "stapler",
        label: "Buy a second stapler",
        detail: "Problem solved.",
        effects: { happiness: 1, flags: ["single"] },
        result: [nar("Problem solved. Some problems you slightly wish you hadn't solved.")],
      },
    ],
  },
  {
    id: "junos-wedding",
    chapter: 5,
    at: 0.78,
    kind: "choice",
    title: "Juno's Wedding",
    speaker: "juno",
    lines: (s) => [
      nar("An envelope with a pressed flower inside: Juno is getting married. On a beach on the other side of the world."),
      nar("It's the same week as the biggest deadline of your year."),
      ...(has(s, "juno_plan") ? [nar("Her travel company is doing well enough that she's flying everyone out.")] : []),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "toast",
        label: "Fly out and give the toast",
        detail: "You'll write it on the plane.",
        because: (s) => (has(s, "juno_plan") ? "Juno's company is flying everyone out" : ""),
        effects: (s) => ({
          happiness: 3,
          health: -1,
          money: has(s, "juno_plan") ? 0 : -4,
          bonds: { juno: 3 },
          flags: ["toast"],
          memory: "You gave the toast at Juno's wedding.",
        }),
        result: (s) => [
          nar(`You tell the story of ${firstFriendship(s)}. Her new husband cries harder than she does.`),
        ],
      },
      {
        id: "video",
        label: "Send a video toast",
        detail: "Recorded in a stairwell at midnight.",
        effects: { happiness: 1, bonds: { juno: 1 } },
        result: [nar("She plays it on a big screen. The sound is off for the first minute. Everyone claps anyway.")],
      },
      {
        id: "deadline",
        label: "Stay for the deadline",
        detail: "People are counting on you.",
        effects: { money: 4, bonds: { juno: -2 }, flags: ["missed_wedding"] },
        result: [nar("The project ships on time. Juno's wedding photos are beautiful. You look at them more than once.")],
      },
    ],
  },
  {
    id: "what-you-give",
    chapter: 5,
    at: 0.95,
    kind: "keystone",
    title: "Forty",
    speaker: (s) => (has(s, "partner") ? "sam" : null),
    cast: (s) => (has(s, "kids") ? ["mika"] : []),
    lines: [nar("Forty is coming. You can feel it in your knees and your inbox.")],
    prompt: "What will you give the next ten years?",
    options: [
      {
        id: "top",
        label: "Push for the top",
        detail: "Corner office or bust.",
        effects: { money: 10, health: -8, flags: ["top"], memory: "You pushed for the top in your forties." },
        result: [nar("You get the corner office. It has an excellent view of the building next door.")],
      },
      {
        id: "balance",
        label: "Guard your evenings",
        detail: "The phone goes in a drawer at seven.",
        effects: { health: 6, happiness: 2, money: -2, flags: ["balanced"], memory: "You guarded your evenings." },
        result: [nar("Your phone stays in the drawer after seven. Somehow the world keeps turning.")],
      },
      {
        id: "people",
        label: "Pour yourself into your people",
        detail: "Birthdays, recitals, bad karaoke.",
        effects: (s) => ({
          happiness: 5,
          money: -4,
          bonds: { family: 2, juno: 1, ...(has(s, "partner") ? { sam: 1 } : {}) },
          flags: ["people"],
          memory: "You poured yourself into your people.",
        }),
        result: [nar("Birthdays, recitals, bad karaoke. You're there for all of it.")],
      },
    ],
  },

  // ======================================================================= 6 THE STORM
  {
    id: "restructuring",
    chapter: 6,
    at: 0.1,
    kind: "event",
    title: "Weather",
    speaker: null,
    lines: (s) => [
      has(s, "own_venture")
        ? nar("A slow year. Clients vanish, then invoices vanish, then sleep vanishes.")
        : s.path === "shop"
          ? nar("Three winters in a row, the tourists don't come. Nobody needs a boat fixed if nobody's sailing.")
          : has(s, "top")
            ? nar("The company restructures. You survive it. Half your team doesn't. You start grinding your teeth at night.")
            : nar("The company restructures. Your job is “no longer required”. Your badge stops working at 4 p.m."),
      ...(has(s, "dex_invest")
        ? [nar("And LifeHack collapses. The news calls it “a cautionary tale”. Your savings call it gone.")]
        : []),
    ],
    options: [
      continueOption((s) => {
        const hit = has(s, "top") ? { health: -6, money: -2 } : has(s, "own_venture") || s.path === "shop" ? { money: -6 } : { money: -8, happiness: -3 };
        return {
          ...hit,
          money: (hit.money ?? 0) + (has(s, "dex_invest") ? -6 : 0),
          flags: ["restructured"],
          memory: "The year the work dried up.",
        };
      }),
    ],
  },
  {
    id: "the-call",
    chapter: 6,
    at: 0.28,
    kind: "choice",
    title: "The Call",
    speaker: "dad",
    cast: ["mom"],
    lines: [
      say("dad", "It's your mum. She's had a stroke. She's all right, she's… she's all right."),
      say("dad", "But I can't lift her, love. I tried."),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "move-home",
        label: "Move home to care for them",
        detail: "Back to Gull Lane.",
        effects: { happiness: 1, money: -8, health: -4, bonds: { family: 3 }, flags: ["moved_home"], memory: "You moved home to care for Mom and Dad." },
        result: [nar("Your old bedroom is exactly as you left it. Mom squeezes your hand with the side that still works.")],
      },
      {
        id: "carer",
        label: "Hire a carer and visit every weekend",
        detail: "It costs what it costs.",
        effects: { money: -10, health: -2, bonds: { family: 1 }, memory: "Bea, the carer Mom loved more than you." },
        result: [nar("Her name is Bea, and Mom loves her more than you. Which is fine. Mostly.")],
      },
      {
        id: "juno",
        label: "Ask Juno for help",
        detail: "She moved back to Marigold Bay last year.",
        because: "Because you never let go of Juno",
        when: (s) => bond(s, "juno") >= 7,
        effects: { money: -3, bonds: { juno: 2, family: 2 }, flags: ["juno_helped"], memory: "Juno helped you care for Mom." },
        result: [
          nar("Juno is at the door within the hour with soup and a spreadsheet."),
          say("juno", "You helped me once. Shut up and let me."),
        ],
      },
      {
        id: "sam",
        label: "Bring them to live with you and Sam",
        detail: "The spare room becomes Mom's room.",
        because: "Because you and Sam built a life together",
        when: (s) => has(s, "partner"),
        effects: { happiness: 1, money: -6, bonds: { sam: 1, family: 2 }, flags: ["parents_with_us"], memory: "Mom and Dad came to live with you and Sam." },
        result: [nar("Dad and Sam argue about football every single night. Both of them love it.")],
      },
    ],
  },
  {
    id: "dex-soaked",
    chapter: 6,
    at: 0.48,
    kind: "choice",
    title: "Dex, Soaked",
    speaker: "dex",
    lines: (s) => [
      nar("In a bus shelter, out of the rain: Dex Moreau. No suit. No watch."),
      has(s, "warned_dex")
        ? say("dex", "You told me. Three things. Four, actually. I should have listened to all four.")
        : has(s, "dex_invest")
          ? say("dex", "I lost your money. I lost everybody's money. I can't even look at you.")
          : say("dex", "Don't. I know how it looks. It looks exactly how it is."),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "room",
        label: "Give him somewhere to start over",
        detail: "A spare room. A second chance.",
        effects: { money: -3, happiness: 1, bonds: { dex: 3 }, flags: ["helped_dex"], memory: "You gave Dex a room when he had nothing." },
        result: [nar("He stays six weeks and leaves the place cleaner than he found it. There's a note: “I owe you one. Or several.”")],
      },
      {
        id: "dinner",
        label: "Buy him dinner and listen",
        detail: "Just listen.",
        effects: { money: -1, happiness: 1, bonds: { dex: 2 }, memory: "Three hours of Dex, not selling anything." },
        result: [nar("He talks for three hours. For the first time since you were twelve, he doesn't try to sell you anything.")],
      },
      {
        id: "walk",
        label: "Keep walking",
        detail: "You don't owe him anything.",
        effects: { health: 1, bonds: { dex: -1 } },
        result: [nar("You don't look back. You think about it for a long time anyway.")],
      },
    ],
  },
  {
    id: "doctors-chair",
    chapter: 6,
    at: 0.66,
    kind: "choice",
    title: "The Doctor's Chair",
    speaker: "doctor",
    lines: (s) => [
      s.scores.health < 40
        ? say("doctor", "Your blood pressure is a horror film and your sleep is a crime scene. We need to talk.")
        : say("doctor", "You're doing all right. But fifty is coming, and fifty doesn't negotiate."),
    ],
    prompt: "What changes?",
    options: [
      {
        id: "walks",
        label: "Walks, sleep, real food",
        detail: "Boring. Works.",
        effects: { health: 10, happiness: 1, money: -2, flags: ["healthy_habits"], memory: "The year you started noticing birds." },
        result: [nar("It's boring. It works. You start noticing birds.")],
      },
      {
        id: "pills",
        label: "Take the pills and keep going",
        detail: "Numbers are numbers.",
        effects: { health: 4, money: -1 },
        result: [nar("The numbers improve. You don't, really.")],
      },
      {
        id: "ignore",
        label: "Ignore it",
        detail: "You feel fine. Mostly.",
        effects: { health: -4, money: 2 },
        result: [nar("You tell yourself you're fine. Your knees file a formal complaint.")],
      },
    ],
  },
  {
    id: "save-the-light",
    chapter: 6,
    at: 0.88,
    kind: "keystone",
    title: "Save the Light",
    speaker: null,
    cast: (s) => (bond(s, "juno") >= 7 ? ["juno"] : []),
    lines: (s) => [
      nar("The storm cracks the old lighthouse from lantern to door. The council votes to knock it down and sell the cliff."),
      nar("Somewhere under that cliff, a tin is waiting."),
      ...(has(s, "moved_home") || s.path === "shop" ? [nar("You can see the tower from Mom's window.")] : []),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "campaign",
        label: "Lead the campaign to save it",
        detail: "Petitions, bake sales, one very loud meeting.",
        effects: { happiness: 5, money: -6, health: -3, flags: ["saved_light"], memory: "You led the campaign that saved the lighthouse." },
        result: [nar("Four hundred people turn up to the council meeting. Mr Ferris brings pickled onions. The vote is overturned.")],
      },
      {
        id: "buy",
        label: "Buy the lighthouse yourself",
        detail: "Every penny you have.",
        lock: (s) => (s.scores.money >= 45 ? null : "Needs Money 45"),
        effects: { money: -20, happiness: 4, flags: ["own_light"], memory: "You bought Nana's lighthouse." },
        result: [nar("You now own a cracked lighthouse, a view, and a roof bill. Nana would laugh until she cried.")],
      },
      {
        id: "dig",
        label: "Dig up the tin before they knock it down",
        detail: "Keep the promise safe, even if the tower goes.",
        effects: { happiness: -2, flags: ["dug_tin"], memory: "You dug up the tin in the rain and didn't open it." },
        result: [nar("You dig at night, in the rain, like a burglar. The tin is lighter than you remember. You don't open it.")],
      },
      {
        id: "let-go",
        label: "Let it go",
        detail: "It's only a building.",
        effects: { money: 2, happiness: -4, flags: ["let_go"] },
        result: [nar("You tell yourself that. The tin stays in the ground, under a cliff that someone else will own.")],
      },
    ],
  },

  // ======================================================================= 7 GOLDEN HOUR
  {
    id: "linas-kite",
    chapter: 7,
    at: 0.14,
    kind: "choice",
    title: "Lina's Kite",
    speaker: "lina",
    lines: [
      nar("A girl is sitting on the seawall, holding a kite with a snapped spine."),
      nar("For a second, you are eleven years old."),
      say("lina", "It was my grandad's. He's… not coming to the festival this year."),
    ],
    prompt: "What do you do?",
    options: [
      {
        id: "fix",
        label: "Fix the kite together",
        detail: "Tape, string and a pencil. Some things don't change.",
        effects: { happiness: 4, flags: ["lina_kite"], memory: "You fixed Lina's kite. It flew crooked. It flew." },
        result: [nar("It flies crooked. It flies. Somewhere, a very old part of you is very happy.")],
      },
      {
        id: "teach",
        label: (s) =>
          ({
            healer: "Teach her to splint a broken wing",
            maker: "Teach her to carve a new spine",
            storyteller: "Teach her to turn a bad day into a story",
            explorer: "Teach her to read the wind",
          })[s.dream ?? "explorer"],
        detail: "The thing you know best.",
        star: () => true,
        effects: { happiness: 3, flags: ["lina_taught"], memory: "You taught Lina the thing you know best." },
        result: [nar("She listens the way you used to listen to Nana. It's a lot of responsibility, being someone's Nana Pearl.")],
      },
      {
        id: "story",
        label: "Tell her about the storm of '71",
        detail: "Nana's story, passed on.",
        because: "Because you stayed with Nana that last summer",
        when: (s) => has(s, "nana_story"),
        effects: { happiness: 4, flags: ["passed_story"], memory: "You passed Nana's story on to Lina." },
        result: [say("lina", "Is that true?"), say("you", "Every word. Some of it even happened.")],
      },
      {
        id: "buy",
        label: "Buy her a new kite from the stall",
        detail: "The dragon one.",
        effects: { happiness: 2, money: -2, flags: ["lina_dragon"] },
        result: (s) => [nar(`It's shaped like a dragon. She names it ${s.name}.`)],
      },
    ],
  },
  {
    id: "last-shift",
    chapter: 7,
    at: 0.34,
    kind: "choice",
    title: "The Last Shift",
    speaker: (s) => (has(s, "partner") ? "sam" : null),
    lines: (s) => [nar(`Sixty-two. The ${workplace(s)} throws you a retirement party you're not sure you want.`)],
    prompt: "When do you stop?",
    options: [
      {
        id: "more",
        label: "A few more years. You're not done.",
        detail: "They still need you. You still need them.",
        effects: { money: 8, health: -3, flags: ["kept_working"] },
        result: [nar("They were right: you're still good at it. You were right too: you're tired.")],
      },
      {
        id: "garden",
        label: "Retire to the garden",
        detail: "Tomatoes. So many tomatoes.",
        effects: { health: 6, happiness: 2, flags: ["garden"], memory: "The tomato years." },
        result: [nar("You give tomatoes to everyone on Gull Lane, whether they want them or not.")],
      },
      {
        id: "travel",
        label: "Retire, and finally travel",
        detail: "The red X on the map.",
        star: ["explorer"],
        effects: { happiness: 5, money: -6, health: 1, flags: ["retired_travel"], memory: "You finally went to the places on the map." },
        result: [nar("You see the places on the map in the tin. Some of them, anyway. The rest can wait for the next life.")],
      },
    ],
  },
  {
    id: "dads-last-sail",
    chapter: 7,
    at: 0.54,
    kind: "choice",
    title: "Dad's Last Sail",
    speaker: "dad",
    lines: [
      say("dad", "Ninety-one. Doctor says no more sailing. Doctor's never been sailing."),
      say("dad", "One more time round the bay. What do you say?"),
    ],
    prompt: "What do you say?",
    options: [
      {
        id: "sail",
        label: "Take him out on the water",
        detail: "Life jackets. Both of you.",
        effects: { happiness: 4, health: -1, bonds: { family: 2 }, flags: ["last_sail"], memory: "Dad's last sail round the bay." },
        result: [
          nar("The wind is perfect. He steers the whole way."),
          say("dad", "Your Nana would have loved this."),
          nar("You both pretend it's the spray."),
        ],
      },
      {
        id: "pier",
        label: "Walk him to the end of the pier instead",
        detail: "Close enough to smell it.",
        effects: { happiness: 2, health: 1, bonds: { family: 1 } },
        result: [nar("He points out every boat he ever fixed. It's most of them.")],
      },
      {
        id: "no",
        label: "Say no. It's too risky.",
        detail: "Someone has to be sensible.",
        effects: { happiness: -2, health: 1, bonds: { family: -1 } },
        result: [nar("He sulks for a day, forgives you, then tells everyone you're “very sensible”, which is the worst thing he has ever called you.")],
      },
    ],
  },
  {
    id: "old-friends",
    chapter: 7,
    at: 0.74,
    kind: "choice",
    title: "The Best Fish in the Bay",
    speaker: "dex",
    when: (s) => bond(s, "dex") >= 1,
    lines: (s) => [
      nar("At the festival, an old man is selling the best grilled fish in Marigold Bay. It's Dex."),
      say("dex", "Turns out I'm good at one honest thing. Took me sixty years to find it."),
      ...(has(s, "helped_dex") ? [say("dex", "Your spare room. Your note. I kept the note.")] : []),
    ],
    prompt: "What do you say?",
    options: [
      {
        id: "forgive",
        label: "Forgive him. For all of it.",
        detail: "It's been long enough.",
        effects: { happiness: 3, bonds: { dex: 3 }, flags: ["forgave_dex"], memory: "You forgave Dex at the lantern festival." },
        result: [nar("He wraps you a fish you didn't pay for."), say("dex", "Consider it interest.")],
      },
      {
        id: "fish",
        label: "Buy some fish and move on",
        detail: "It does smell very good.",
        effects: { happiness: 1, money: -1 },
        result: [nar("It really is very good fish.")],
      },
    ],
  },
  {
    id: "okafor-again",
    chapter: 7,
    at: 0.74,
    kind: "choice",
    title: "Ms Okafor",
    speaker: "okafor",
    when: (s) => bond(s, "dex") < 1,
    lines: [
      nar("Ms Okafor is ninety, in a folding chair at the front of the lantern parade, with a blanket and opinions."),
      say("okafor", "I taught four thousand children. I remember nine. You're one of them."),
    ],
    prompt: "What do you say?",
    options: [
      {
        id: "thank",
        label: "Thank her, properly",
        detail: "Forty years late.",
        effects: { happiness: 3, bonds: { okafor: 2 }, memory: "You finally thanked Ms Okafor." },
        result: [say("okafor", "Took you long enough. Sit down, the good lanterns are coming.")],
      },
      {
        id: "ask",
        label: "Ask what she'd do differently",
        detail: "She's never been shy.",
        effects: { happiness: 2, health: 1 },
        result: [say("okafor", "Less marking. More swimming. Now go and swim.")],
      },
    ],
  },
  {
    id: "the-letter",
    chapter: 7,
    at: 0.92,
    kind: "keystone",
    title: "The Letter",
    speaker: null,
    lines: (s) => [
      nar("One year until you're seventy. You sit down to write to Juno."),
      bond(s, "juno") >= 9
        ? nar("You still write to her every month. This one only needs a line.")
        : bond(s, "juno") >= 5
          ? nar("It's been a while. Longer than it should have been.")
          : nar("You haven't written in years. You're not sure the address is right."),
    ],
    prompt: "What do you write?",
    options: [
      {
        id: "remind",
        label: "“The lighthouse. Next summer. You promised.”",
        detail: "Short and stubborn.",
        effects: { bonds: { juno: 1 }, flags: ["wrote_juno"] },
        result: [nar("You post it before you can change your mind.")],
      },
      {
        id: "ticket",
        label: "Send a train ticket home with it",
        detail: "First class. She's earned the legroom.",
        effects: { money: -4, bonds: { juno: 2 }, flags: ["wrote_juno", "sent_ticket"] },
        result: [nar("A first-class ticket on the 7:14, with a note: “Window seat. Sea on the left.”")],
      },
      {
        id: "thanks",
        label: "“Thank you. For all of it.”",
        detail: "The shortest letter you've ever written.",
        effects: { happiness: 2, bonds: { juno: 2 }, flags: ["wrote_juno"] },
        result: [nar("It's the shortest letter you've ever written. It takes you three days.")],
      },
    ],
  },
];

export function encountersFor(chapter: number): EncounterDef[] {
  return ENCOUNTERS.filter((e) => e.chapter === chapter).sort((a, b) => a.at - b.at);
}

/** The encounters that will actually happen in this chapter for this life. */
export function activeEncounters(s: LifeState, chapter = s.chapter): EncounterDef[] {
  return encountersFor(chapter).filter((e) => !e.when || e.when(s));
}
