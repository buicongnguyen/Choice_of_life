import type { Stats } from "./types";

// ---------------------------------------------------------------------------
// Random "Easter egg" events. Every so often after an action, life throws a
// surprise. They are TIERED by magnitude (Research C): frequent small windfalls
// for flavour, rare run-defining jackpots. The engine enforces per-life caps:
//   • tier "big"     → at most ONCE per life (adults only)
//   • tier "jackpot" → at most ONCE per life total across ALL jackpots
//   • tier "pet"     → at most ONCE per life (the puppy OR the kitten)
// `money` is a real dollar delta (+windfall / -setback); `effects` are the
// non-money stat deltas. Add an event by dropping an entry in EVENTS.
// ---------------------------------------------------------------------------

export type EventTier = "tiny" | "small" | "big" | "jackpot" | "pet";

export interface RandomEvent {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  /** Non-money stat deltas. */
  effects: Partial<Stats>;
  /** Real dollar change (positive windfall or negative setback). */
  money?: number;
  /** Magnitude tier — drives the per-life caps (see above). */
  tier?: EventTier;
  /** Relative frequency within its eligibility (higher = more common). */
  weight: number;
  /** Can only ever happen once per life (on top of any tier cap). */
  once?: boolean;
  minAge?: number;
  maxAge?: number;
  /** false = a setback (styled differently). Defaults to true. */
  good?: boolean;
  /** Short clause for the life story's "twists of fate" line. */
  storyClause: string;
}

export const EVENTS: RandomEvent[] = [
  // --- TINY: little lucky-money flavour, repeatable -------------------------
  {
    id: "wallet", emoji: "👛", title: "Lucky find!",
    desc: "You handed in a lost wallet and the grateful owner gave you a $2,000 reward!",
    money: 2000, effects: { happiness: 3 }, tier: "tiny", weight: 5, minAge: 8,
    storyClause: "found a wallet and pocketed a tidy reward",
  },
  {
    id: "busk", emoji: "🎸", title: "Street talent",
    desc: "You played a few songs on the corner and a crowd showered you with notes.",
    money: 1200, effects: { happiness: 5, fun: 3 }, tier: "tiny", weight: 4, minAge: 12,
    storyClause: "made a happy crowd (and a few bucks) busking",
  },
  {
    id: "refund", emoji: "🧾", title: "Tax refund",
    desc: "The taxman owed YOU for once — a welcome refund landed.",
    money: 3500, effects: {}, tier: "tiny", weight: 4, minAge: 22,
    storyClause: "got a cheering tax refund",
  },
  {
    id: "cashback", emoji: "💳", title: "Cashback windfall",
    desc: "A forgotten cashback card quietly paid out.",
    money: 1500, effects: {}, tier: "tiny", weight: 3, minAge: 18,
    storyClause: "stumbled on a forgotten cashback payout",
  },
  {
    id: "redenvelope", emoji: "🧧", title: "Lucky money",
    desc: "Relatives slipped you a red envelope of lucky money at a celebration.",
    money: 2500, effects: { happiness: 4 }, tier: "tiny", weight: 3, minAge: 5, maxAge: 40,
    storyClause: "received lucky money from family",
  },
  {
    id: "rebate", emoji: "📨", title: "Mystery rebate",
    desc: "An overcharge you never noticed came back as a rebate.",
    money: 1800, effects: {}, tier: "tiny", weight: 3, minAge: 20,
    storyClause: "got money back from a mystery rebate",
  },
  {
    id: "coin", emoji: "🪙", title: "A rare coin",
    desc: "A coin in your change turned out to be a collectible!",
    money: 4000, effects: { smarts: 1 }, tier: "tiny", weight: 2, minAge: 8,
    storyClause: "found a rare collectible coin in your change",
  },
  // --- SMALL: modest prizes, soft 2-3 per life -----------------------------
  {
    id: "gift", emoji: "🎁", title: "A generous gift",
    desc: "Your grandparents slipped you a fat envelope 'just because'.",
    money: 5000, effects: { happiness: 5 }, tier: "small", weight: 3, minAge: 6, maxAge: 30,
    storyClause: "received a generous gift from family",
  },
  {
    id: "contest", emoji: "🏆", title: "You won a contest!",
    desc: "You entered a contest just for fun — and actually won!",
    money: 5000, effects: { happiness: 7 }, tier: "small", weight: 3, minAge: 8,
    storyClause: "won a contest you entered on a whim",
  },
  {
    id: "dividend", emoji: "🏦", title: "Dividend day",
    desc: "A stock you forgot you owned paid out a tidy dividend.",
    money: 6000, effects: { happiness: 2 }, tier: "small", weight: 3, minAge: 22,
    storyClause: "collected a surprise dividend",
  },
  {
    id: "garagesale", emoji: "🛒", title: "Garage-sale flip",
    desc: "You flipped a thrift-shop find online for a tidy profit.",
    money: 2200, effects: { fun: 2 }, tier: "small", weight: 3, minAge: 16,
    storyClause: "flipped a thrift find for a profit",
  },
  {
    id: "referral", emoji: "🤝", title: "Referral bonus",
    desc: "A friend's referral finally paid out.",
    money: 3500, effects: {}, tier: "small", weight: 3, minAge: 20,
    storyClause: "cashed in a referral bonus",
  },
  {
    id: "raffle", emoji: "🎟️", title: "Office raffle!",
    desc: "Your raffle ticket finally hit.",
    money: 6000, effects: { fun: 3 }, tier: "small", weight: 2, minAge: 18,
    storyClause: "won the office raffle",
  },
  // --- BIG: one per life, adults only --------------------------------------
  {
    id: "bonus", emoji: "🎉", title: "Surprise bonus",
    desc: "Your hard work paid off with an unexpected bonus.",
    money: 8000, effects: { happiness: 3 }, tier: "big", weight: 4, minAge: 22,
    storyClause: "landed a surprise bonus at work",
  },
  {
    id: "viral", emoji: "🌟", title: "You went viral!",
    desc: "Something you posted blew up online overnight — a little fame and fortune.",
    money: 15000, effects: { happiness: 6 }, tier: "big", weight: 3, minAge: 18,
    storyClause: "had a moment of internet fame",
  },
  {
    id: "loan", emoji: "💵", title: "Paid back!",
    desc: "An old friend finally repaid a loan you'd written off years ago.",
    money: 20000, effects: { happiness: 2 }, tier: "big", weight: 3, minAge: 20,
    storyClause: "got back money from a long-forgotten loan",
  },
  {
    id: "scholarship", emoji: "🎓", title: "Scholarship!",
    desc: "Your grades earned you a generous scholarship.",
    money: 30000, effects: { smarts: 3, happiness: 5 }, tier: "big", weight: 2, minAge: 16, maxAge: 24,
    storyClause: "earned a generous scholarship",
  },
  {
    id: "promo", emoji: "📈", title: "Promotion!",
    desc: "Your boss pulled you aside — you're being promoted, with a raise to match.",
    money: 40000, effects: { happiness: 6 }, tier: "big", weight: 3, minAge: 24,
    storyClause: "earned a well-deserved promotion",
  },
  // --- JACKPOT: one per life TOTAL across all four -------------------------
  {
    id: "lottery", emoji: "🎰", title: "JACKPOT!!",
    desc: "On a whim you bought a lottery ticket — and hit the jackpot for half a million!",
    money: 500000, effects: { happiness: 10 }, tier: "jackpot", weight: 1, minAge: 18,
    storyClause: "won half a million on a lottery ticket",
  },
  {
    id: "crypto", emoji: "🪙", title: "Early bet pays off",
    desc: "A tiny punt on a new coin years ago suddenly mooned. You cashed out in time!",
    money: 200000, effects: { happiness: 8 }, tier: "jackpot", weight: 1, minAge: 18,
    storyClause: "struck gold on an early crypto bet",
  },
  {
    id: "inherit", emoji: "📜", title: "An inheritance",
    desc: "A distant relative remembered you fondly and left you a small fortune.",
    money: 250000, effects: { happiness: 3 }, tier: "jackpot", weight: 2, minAge: 25,
    storyClause: "inherited a small fortune from family",
  },
  {
    id: "gameshow", emoji: "📺", title: "TV game show!",
    desc: "You went on a quiz show and your smarts won you the grand prize!",
    money: 120000, effects: { happiness: 9, smarts: 2 }, tier: "jackpot", weight: 1, minAge: 18,
    storyClause: "won big on a TV quiz show",
  },
  // --- PET: one per life (the puppy OR the kitten) -------------------------
  {
    id: "puppy", emoji: "🐶", title: "A new friend",
    desc: "A stray puppy followed you home. Who could say no to that face?",
    money: -800, effects: { happiness: 9, health: 2 }, tier: "pet", weight: 4, minAge: 5,
    storyClause: "adopted a stray puppy who adored you",
  },
  {
    id: "kitten", emoji: "🐱", title: "A new friend",
    desc: "A little cat adopted YOU, curling up on your doorstep for good.",
    money: -600, effects: { happiness: 8, health: 1 }, tier: "pet", weight: 4, minAge: 5,
    storyClause: "took in a cat who chose you",
  },
  // --- the occasional setback, to keep luck honest -------------------------
  {
    id: "phone", emoji: "💥", title: "Cracked screen",
    desc: "You dropped your phone on the pavement. A small but annoying expense.",
    money: -500, effects: { happiness: -2 }, weight: 2, minAge: 12, good: false,
    storyClause: "smashed a phone screen at the worst moment",
  },
  {
    id: "theft", emoji: "🥷", title: "Pickpocketed!",
    desc: "Someone lifted your wallet in a crowd. Cancel the cards…",
    money: -2000, effects: { happiness: -3 }, weight: 2, minAge: 14, good: false,
    storyClause: "got pickpocketed in a busy crowd",
  },
  {
    id: "carrepair", emoji: "🔧", title: "It's the gearbox…",
    desc: "Your car broke down and the repair bill made your eyes water.",
    money: -3000, effects: { happiness: -3 }, weight: 2, minAge: 18, good: false,
    storyClause: "got stung by a brutal car repair bill",
  },
  {
    id: "medbill", emoji: "🏥", title: "Surprise bill",
    desc: "An unexpected medical bill landed on your doormat.",
    money: -10000, effects: { health: -3 }, weight: 2, minAge: 30, good: false,
    storyClause: "got hit with a surprise medical bill",
  },
  {
    id: "scam", emoji: "⚠️", title: "Scammed!",
    desc: "A too-good-to-be-true investment turned out to be a scam. Ouch.",
    money: -40000, effects: { happiness: -5 }, weight: 2, minAge: 25, good: false,
    storyClause: "lost money to a clever scammer",
  },
  {
    id: "crash", emoji: "📉", title: "Market crash",
    desc: "The markets tumbled and took a chunk of your savings with them.",
    money: -80000, effects: { happiness: -5 }, weight: 1, once: true, minAge: 28, good: false,
    storyClause: "rode out a nasty market crash",
  },
];
