// ---------------------------------------------------------------------------
// Core type definitions inherited by the Choice of Life reference build.
// The whole game is data-driven: stages and their options are plain data
// (see stages.ts), so adding content = adding an entry, no engine changes.
// ---------------------------------------------------------------------------

/**
 * The four life meters. Health, Happiness and Fun are 0..100; `smarts` is the
 * IQ meter on a 40..160 scale (see stats.ts). MONEY is NOT here — it's a real
 * dollar amount tracked separately by the engine.
 */
export type StatKey = "health" | "happiness" | "fun" | "smarts";

export type Stats = Record<StatKey, number>;

/**
 * A complete, gender-separated storybook identity across every age and pose.
 * "classic" preserves all existing saves; "alternate" supplies the new hair,
 * wardrobe, footwear, and bag designs.
 */
export type CharacterAppearanceId = "classic" | "alternate";

/** Reviewed adult occupation costume with separate heritage and gender art. */
export type JobUniform =
  | "doctor"
  | "trainer"
  | "dancer"
  | "soldier"
  | "farmer"
  | "teacher"
  | "chef"
  | "barista"
  | "athlete"
  | "entrepreneur"
  | "generalengineer"
  | "softwareengineer"
  | "manager"
  | "analyst"
  | "artist"
  | "police"
  | "lawyer"
  | "ceo";

/**
 * A reviewed, explicitly gendered profession character that can appear as an
 * interactable adult NPC. Occupation art currently covers Asian and Western
 * character families; the renderer never infers or swaps the stored gender.
 */
export interface ProfessionNpcSpec {
  id: string;
  uniform: JobUniform;
  gender: Gender;
  heritage: Extract<HeritageStyle, "western" | "asian">;
}

/** Loose grouping used for icon tinting and balance reasoning. */
export type OptionCategory =
  | "health"
  | "food"
  | "fun"
  | "smarts"
  | "wealth"
  | "social"
  | "rest"
  | "special";

/** A person you can interact with in a room — drawn as a little character. */
export type PersonKind =
  | "mother"
  | "father"
  | "grandma"
  | "grandpa"
  | "babySibling"
  | "sibling"
  | "playmate"
  | "studyFriend"
  | "bestFriend"
  | "crush"
  | "smokerFriend"
  | "gangster"
  | "playboy"
  | "roommate"
  | "coworker"
  | "boss"
  | "gymBuddy"
  | "spouse"
  | "baby"
  | "child"
  | "grandkid"
  | "oldFriend";

/** The scenery drawn behind a stage's room. */
export type SceneKind =
  | "nursery"
  | "playroom"
  | "school"
  | "campus"
  | "office"
  | "home"
  | "sunset";

/** The upper/social playable area's scenery. */
export type UpperSceneKind =
  | "park"
  | "amusementPark"
  | "schoolIndoor"
  | "schoolOutdoor"
  | "campusIndoor"
  | "campusOutdoor"
  | "officeIndoor"
  | "officeOutdoor"
  | "mountain"
  | "beach"
  | "ship"
  | "flowerField";

/** A "try your luck" choice: spend a stake for a chance at a payout (all in $). */
export interface GambleSpec {
  /** Dollars spent to play. Gated — you can't play if you can't afford the stake. */
  stake: number;
  /** Chance (0..1) of the big win. */
  jackpotChance: number;
  /** Dollars won on the jackpot. */
  jackpot: number;
  /** Chance (0..1) of a small win (checked after the jackpot). */
  prizeChance: number;
  /** Dollars won on a small win. */
  prize: number;
  /** Story clause when you hit the jackpot. */
  jackpotStory: string;
  /** Story clause for a small win. */
  prizeStory: string;
  /** Story clause when you lose the stake. */
  bustStory: string;
}

export interface LifeOption {
  id: string;
  /** Short label drawn under the station. */
  label: string;
  /** Emoji icon drawn on the station (ignored when `person` is set). */
  icon: string;
  /** If set, this choice is a PERSON drawn as a little character, not a pedestal. */
  person?: PersonKind;
  /** Optional reviewed occupation costume for an adult person station. */
  professionNpc?: ProfessionNpcSpec;
  /** One-line description shown in the focus panel. */
  desc: string;
  category: OptionCategory;
  /** Stat deltas applied when chosen (health/happiness/fun/IQ). */
  effects: Partial<Stats>;
  /** Money EARNED in dollars (work, chores…). Scaled by IQ when scalesWithSmarts. */
  earn?: number;
  /** Years this action costs (defaults to the stage's per-action age step). */
  ageCost?: number;
  /** If true, can only be chosen once per stage (e.g. "Have a baby"). */
  once?: boolean;
  /** If true, the earnings are scaled by IQ × occupation pay (study pays off). */
  scalesWithSmarts?: boolean;
  /** Explicit body-weight delta (else it's derived from category — see engine). */
  weight?: number;
  /** Choosing this opens the house-buying picker instead of a normal action. */
  opensHousePicker?: boolean;
  /** Choosing this opens the career-move picker (change job / get promoted). */
  opensCareerDesk?: boolean;
  /** Choosing this opens the vehicle-buying picker (bike / motorbike / car…). */
  opensVehiclePicker?: boolean;
  /** A repeatable "good habit" — reading it 5+ times across life pays off in health. */
  habit?: boolean;
  /**
   * Money (dollars) this choice costs. The action is GATED: if you can't afford
   * it, nothing happens ("not enough money"). The cost is reduced a little when
   * your Health/Happiness/IQ are high (see activityDiscount). Use for things you
   * pay to do (games, parties, travel…).
   */
  cost?: number;
  /**
   * A once-in-a-life purchase (a vehicle, a learned skill). Owned forever once
   * bought, so it stops appearing in later rooms. Almost always paired with cost.
   */
  permanent?: boolean;
  /**
   * Choosing this moves this many dollars into your investment pot (gated by
   * affordability like `cost`). The pot compounds over the stages that follow.
   */
  invest?: number;
  /** Learning money management — switches on smarter, steadier investment returns. */
  moneyMgmt?: boolean;
  /** A "try your luck" station — spend a stake for a chance at a windfall. */
  gamble?: GambleSpec;
  /** Key into the story comment bank (see story.ts). */
  storyTag?: string;
  /** A sweet treat (e.g. candy): collectible & giftable, only mildly unhealthy. */
  treat?: boolean;
}

export interface RoomTheme {
  wall: string;
  wallShade: string;
  floor: string;
  floorShade: string;
  accent: string;
}

export interface Stage {
  id: string;
  name: string;
  emoji: string;
  /** Age the player is at when the stage starts. */
  ageStart: number;
  /** The stage gate opens once age >= ageEnd. */
  ageEnd: number;
  blurb: string;
  theme: RoomTheme;
  /** Scenery drawn behind this room (school, office, home…). */
  scene: SceneKind;
  /** Optional rotating scenery for the upper/social playable area. */
  upperScenes?: UpperSceneKind[];
  options: LifeOption[];
  /** Marriage stage shows a partner picker before the room loads. */
  isMarriage?: boolean;
  /** Career stage shows the occupation picker before the room loads. */
  isCareer?: boolean;
  /** Home stages render the player's house quality (cracks vs decor) behind them. */
  atHome?: boolean;
}

/** What you must bring to the table to win a given partner. */
export interface PartnerReq {
  /** Minimum IQ. */
  minIq?: number;
  /** Minimum money (dollars) — a high-status partner expects you to be doing well. */
  minMoney?: number;
  /** Maximum body weight — an athletic/attractive partner wants a fit match. */
  maxWeight?: number;
  /** Minimum health/fitness. */
  minHealth?: number;
}

export interface Partner {
  id: string;
  name: string;
  /** Short archetype, e.g. "the Doctor". */
  title: string;
  /** The partner's own gender (men tend to pass earlier — see spouse mortality). */
  gender: Gender;
  /** Stable storybook identity used in the picker and every later room. */
  heritage: HeritageStyle;
  appearance: CharacterAppearanceId;
  emoji: string;
  blurb: string;
  /** Applied passively at every stage transition after the wedding. */
  modifiers: Partial<Stats>;
  /** Money (dollars) this partner adds (or costs) each stage after the wedding. */
  moneyMod?: number;
  /** Stat requirements to be ABLE to choose this partner (else shown locked). */
  requires?: PartnerReq;
  storyTag: string;
}

/** One recorded choice, used to write the life story at the end. */
export interface HistoryEntry {
  stageId: string;
  stageName: string;
  optionId: string;
  storyTag?: string;
  ageAt: number;
}

export type Gender = "male" | "female";

/** Visual-only avatar family style chosen on the setup screen. */
export type HeritageStyle = "western" | "asian" | "middleEastern" | "black";

/** Adopted room pet, chosen by the puppy/kitten surprise event. */
export type PetKind = "dog" | "cat";

/** A job chosen at the start of the Career stage. */
export interface Occupation {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  /** Industry/field, e.g. "Tech", "Medicine" — groups the career ladder. */
  field: string;
  /** Seniority tier 1..9 (1 Intern … 9 C-Suite), shown on the profile. */
  tier: number;
  /** Multiplier on the money earned from work-style options. */
  salaryMul: number;
  /** IQ required to unlock this career. */
  minIq: number;
  /** Small one-off boost applied when you take the job. */
  perks?: Partial<Stats>;
  /** Optional reviewed career outfit shown in the picker and worn in adult play. */
  uniform?: JobUniform;
  storyTag: string;
}

/** A house tier the player can buy once they're working. */
export interface HouseTier {
  id: string;
  name: string;
  emoji: string;
  /** Wealth cost. */
  cost: number;
  /** 1 (run-down, cracked) .. 5 (luxury villa). Drives the home background. */
  quality: number;
  /** Happiness gained from buying it. */
  happiness: number;
  /**
   * Passive wealth drained per action while you live here (mortgage / upkeep).
   * Pricier homes cost more to keep — so an expensive home quietly taxes your
   * other plans. 0 for the cheapest places.
   */
  upkeep: number;
  /** Wealth earned per stage when this property is rented out (a 2nd+ home). */
  rentYield: number;
  blurb: string;
}

/** A vehicle the player can buy — a one-off, owned-for-life purchase. */
export interface VehicleTier {
  id: string;
  name: string;
  emoji: string;
  /** Wealth cost (gated by affordability). */
  cost: number;
  /** One-off stat boost when bought. */
  effects: Partial<Stats>;
  blurb: string;
  storyTag: string;
}
