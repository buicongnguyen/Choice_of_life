import {
  createAdultState,
  defaultAttractionForGender,
  getAdultJob,
  reduceAdult,
  type AdultAction,
  type AdultAttraction,
  type AdultCulture,
  type AdultFact,
  type AdultGender,
  type AdultJobId,
  type AdultSeason,
  type AdultSetup,
  type AdultState,
} from "../core/adult/index";
import type { CareerState } from "../core/career/index";
import type { CoreScores } from "../core/score-model";

export interface AdultChapterRunInput {
  readonly runId: string;
  readonly runSeed: string;
  readonly scores: CoreScores;
  readonly identity?: Readonly<{ gender: AdultGender }>;
  readonly appearance?: Readonly<{ heritageStyleId?: string }>;
}

/** Accepts either a small player handoff or the structurally compatible shell player profile. */
export interface AdultChapterPlayerInput {
  readonly name?: string;
  readonly gender?: AdultGender;
  readonly attraction?: AdultAttraction;
  readonly culture?: AdultCulture;
  readonly jobId?: AdultJobId;
  readonly appearance?: Readonly<{ heritageStyleId?: string }>;
}

/** Optional chapter metadata used when a completed Career state is not available. */
export interface AdultChapterProfileInput {
  readonly name?: string;
  readonly ageYears?: number;
  readonly gender?: AdultGender;
  readonly attraction?: AdultAttraction;
  readonly culture?: AdultCulture;
  readonly jobId?: AdultJobId;
  readonly scores?: CoreScores;
  readonly season?: AdultSeason;
  readonly facts?: readonly AdultFact[];
}

export interface AdultChapterSessionOptions {
  readonly run: AdultChapterRunInput;
  readonly player?: AdultChapterPlayerInput;
  readonly profile?: AdultChapterProfileInput;
  /** A matching Career state is the authoritative score, job, age, and outfit handoff. */
  readonly career?: CareerState | null;
}

export type AdultChapterSessionAction = AdultAction;

export type AdultChapterSessionResult =
  | Readonly<{
      kind: "ready";
      state: AdultState;
      action: AdultChapterSessionAction | null;
      changed: boolean;
    }>
  | Readonly<{
      kind: "invalid";
      state: AdultState;
      action: AdultChapterSessionAction;
      changed: false;
      message: string;
    }>;

export interface AdultChapterSession {
  getState(): AdultState;
  dispatch(action: AdultChapterSessionAction): AdultChapterSessionResult;
  reset(): AdultChapterSessionResult;
}

const CULTURE_BY_HERITAGE: Readonly<Record<string, AdultCulture>> = Object.freeze({
  asian: "east-asian",
  western: "western",
  black: "african-diaspora",
  "middle-eastern": "south-asian",
});

const DEFAULT_NAMES: Readonly<Record<AdultGender, readonly string[]>> = Object.freeze({
  female: Object.freeze(["Ari", "Mina", "Lina", "Nora"]),
  male: Object.freeze(["Ari", "Kai", "Theo", "Noah"]),
});

function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function fallbackName(runSeed: string, gender: AdultGender): string {
  const names = DEFAULT_NAMES[gender];
  return names[stableHash(`${runSeed}:adult-player-name`) % names.length];
}

function cultureFromHeritage(heritageStyleId: string | undefined): AdultCulture {
  return heritageStyleId === undefined
    ? "western"
    : (CULTURE_BY_HERITAGE[heritageStyleId] ?? "western");
}

function careerAge(career: CareerState): number {
  const role = career.selectedRole;
  return role === null
    ? career.profile.ageYears
    : role.startedAgeYears + role.monthsCompleted / 12;
}

function careerHandoffFacts(
  career: CareerState | null,
  jobId: AdultJobId,
  season: AdultSeason,
  explicitJob: boolean,
): readonly AdultFact[] {
  if (career === null && !explicitJob) return [];
  const job = getAdultJob(jobId);
  const facts: AdultFact[] = [
    {
      factId: "adult-career-handoff-job-v1",
      label: "Career carried forward",
      value: job.roleTitle,
      source: "career",
    },
    {
      factId: "adult-career-handoff-outfit-v1",
      label: "Current work outfit",
      value: job.outfits[season].label,
      source: "career",
    },
  ];
  if (career?.ending !== null && career?.ending !== undefined) {
    facts.push({
      factId: "adult-career-handoff-ending-v1",
      label: "First career chapter",
      value: career.ending.headline,
      source: "career",
    });
  }
  return facts;
}

function createSetup(options: AdultChapterSessionOptions): AdultSetup {
  const { run, player, profile } = options;
  const career = options.career?.runId === run.runId ? options.career : null;
  const gender = player?.gender ?? profile?.gender ?? run.identity?.gender ?? "female";
  const heritage =
    player?.appearance?.heritageStyleId ?? run.appearance?.heritageStyleId;
  const explicitJobId = player?.jobId ?? profile?.jobId;
  const jobId = career?.selectedRole?.careerId ?? explicitJobId ?? "barista";
  const season = career?.season ?? profile?.season ?? "standard";
  const ageYears = Math.max(18, career === null
    ? (profile?.ageYears ?? 28)
    : careerAge(career));
  const facts = [
    ...(profile?.facts ?? []),
    ...careerHandoffFacts(career, jobId, season, explicitJobId !== undefined),
  ];

  return {
    runId: run.runId,
    runSeed: run.runSeed,
    scores: career?.scores ?? profile?.scores ?? run.scores,
    player: {
      name: player?.name ?? profile?.name ?? fallbackName(run.runSeed, gender),
      gender,
      attraction:
        player?.attraction ?? profile?.attraction ?? defaultAttractionForGender(gender),
      culture:
        player?.culture ?? profile?.culture ?? cultureFromHeritage(heritage),
      jobId,
    },
    ageYears,
    season,
    facts,
  };
}

function actionError(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "That adult-life action is not available right now.";
}

/**
 * Creates an in-memory adult chapter. It has no browser, storage, clock, or random
 * dependencies; identical options and action sequences always produce identical state.
 */
export function createAdultChapterSession(
  options: AdultChapterSessionOptions,
): AdultChapterSession {
  const initialState = createAdultState(createSetup(options));
  let state = initialState;

  return {
    getState(): AdultState {
      return state;
    },
    dispatch(action: AdultChapterSessionAction): AdultChapterSessionResult {
      try {
        const next = reduceAdult(state, action);
        const changed = next !== state;
        state = next;
        return { kind: "ready", state, action, changed };
      } catch (error) {
        return {
          kind: "invalid",
          state,
          action,
          changed: false,
          message: actionError(error),
        };
      }
    },
    reset(): AdultChapterSessionResult {
      const changed = state !== initialState;
      state = initialState;
      return { kind: "ready", state, action: null, changed };
    },
  };
}
