import { canonicalizeJson, fnv1a64Hex } from "./canonical-json";
import { deepFreeze } from "./immutable";
import { stateHashV1 } from "./run-state-hash";
import {
  RUN_STATE_CONTENT_VERSION,
  RUN_STATE_SCHEMA_VERSION,
  STARTING_PROFILE_SCORES,
  zeroSourceTotals,
  type ControlMode,
  type Difficulty,
  type RunStateV1,
  type StartingProfileId,
} from "./run-state";

export interface DeterministicRunSetup {
  readonly startingProfileId: StartingProfileId;
  readonly difficulty: Difficulty;
  readonly controlMode: ControlMode;
  readonly identity: RunStateV1["identity"];
}

export interface InitialRunSetup extends DeterministicRunSetup {
  readonly appearance: RunStateV1["appearance"];
  readonly accessibility: RunStateV1["accessibility"];
}

export interface RetainedProtectedRunSetupV1 {
  readonly identity: RunStateV1["identity"];
  readonly appearance: RunStateV1["appearance"];
  readonly accessibility: RunStateV1["accessibility"];
}

export type RunPresentationMergeV1 =
  | Readonly<{ kind: "unchanged"; state: RunStateV1 }>
  | Readonly<{ kind: "updated"; state: RunStateV1 }>
  | Readonly<{ kind: "conflict" }>;

const RUN_SEED_PATTERN = /^[0-9a-f]{16}$/;
const RUN_ID_V1_DOMAIN_MASK = 0x3722_d15b_a7ac_0865n;

function assertExactKeys(value: object, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unexpected fields`);
  }
}

function assertProtectedRunSetup(setup: RetainedProtectedRunSetupV1): void {
  assertExactKeys(setup.identity, Object.keys({ gender: 0 }), "Identity");
  if (setup.identity.gender !== "female" && setup.identity.gender !== "male") throw new TypeError("Unknown gender");
  assertExactKeys(
    setup.appearance,
    Object.keys({
      heritageStyleId: 0,
      hairStyleId: 0,
      hairColorId: 0,
      clothingPaletteId: 0,
    }),
    "Appearance",
  );
  if (!(new Set<string>(["asian", "western", "black", "middle-eastern"])).has(setup.appearance.heritageStyleId)) throw new TypeError("Unknown heritage style");
  if (!(new Set<string>(["short-soft", "wavy-bob", "curly-crown", "tied-back"])).has(setup.appearance.hairStyleId)) throw new TypeError("Unknown hair style");
  if (!(new Set<string>(["black", "dark-brown", "warm-brown", "silver"])).has(setup.appearance.hairColorId)) throw new TypeError("Unknown hair color");
  if (!(new Set<string>(["sunrise", "meadow", "ocean", "berry"])).has(setup.appearance.clothingPaletteId)) throw new TypeError("Unknown clothing palette");
  assertExactKeys(
    setup.accessibility,
    Object.keys({
      highContrast: 0,
      reducedMotion: 0,
      textScale: 0,
      screenReaderAnnouncements: 0,
    }),
    "Accessibility settings",
  );
  if (
    typeof setup.accessibility.highContrast !== "boolean" ||
    typeof setup.accessibility.reducedMotion !== "boolean" ||
    typeof setup.accessibility.screenReaderAnnouncements !== "boolean" ||
    !(new Set<number>([100, 125, 150, 200])).has(setup.accessibility.textScale)
  ) throw new TypeError("Invalid accessibility settings");
}

function assertInitialRunSetup(setup: InitialRunSetup): void {
  assertExactKeys(
    setup,
    Object.keys({
      startingProfileId: 0,
      difficulty: 0,
      controlMode: 0,
      identity: 0,
      appearance: 0,
      accessibility: 0,
    }),
    "Initial run setup",
  );
  if (!Object.hasOwn(STARTING_PROFILE_SCORES, setup.startingProfileId)) throw new TypeError("Unknown starting profile");
  if (!(new Set<string>(["story", "normal", "challenge"])).has(setup.difficulty)) throw new TypeError("Unknown difficulty");
  if (!(new Set<string>(["manual", "semantic-assist", "automatic-assist"])).has(setup.controlMode)) throw new TypeError("Unknown control mode");
  assertProtectedRunSetup(setup);
}

export function deriveRunIdV1(runSeed: string, setup: DeterministicRunSetup): string {
  if (!RUN_SEED_PATTERN.test(runSeed)) {
    throw new RangeError("Run seed must be exactly 16 lowercase hexadecimal characters");
  }
  const canonicalIdentity = canonicalizeJson({
    "contentVersion": RUN_STATE_CONTENT_VERSION,
    "controlMode": setup.controlMode,
    "difficulty": setup.difficulty,
    "identity": { "gender": setup.identity.gender },
    "runSeed": runSeed,
    "startingProfileId": setup.startingProfileId,
  });
  const rawHash = BigInt(`0x${fnv1a64Hex(canonicalIdentity)}`);
  const domainSeparated = BigInt.asUintN(64, rawHash ^ RUN_ID_V1_DOMAIN_MASK);
  return `run-${domainSeparated.toString(16).padStart(16, "0")}`;
}

/**
 * Copies the protected setup only for exact state reconstruction/retention.
 * Gameplay callers should spread this value into a retained-state projection,
 * never branch on its fields.
 */
export function retainedProtectedRunSetupV1(
  state: RunStateV1,
): RetainedProtectedRunSetupV1 {
  const retained = {
    identity: { ...state.identity },
    appearance: { ...state.appearance },
    accessibility: { ...state.accessibility },
  };
  assertProtectedRunSetup(retained);
  return deepFreeze(retained);
}

/** Reconstructs setup while changing only the requested control mode. */
export function initialRunSetupFromStateV1(
  state: RunStateV1,
  controlMode: ControlMode = state.controlMode,
): InitialRunSetup {
  const setup = deepFreeze({
    startingProfileId: state.startingProfileId,
    difficulty: state.difficulty,
    controlMode,
    ...retainedProtectedRunSetupV1(state),
  });
  assertInitialRunSetup(setup);
  return setup;
}

/** Derives a run ID without exposing protected identity fields to mechanics. */
export function deriveRunIdFromStateV1(
  state: RunStateV1,
  controlMode: ControlMode = state.controlMode,
): string {
  return deriveRunIdV1(state.runSeed, {
    startingProfileId: state.startingProfileId,
    difficulty: state.difficulty,
    controlMode,
    identity: state.identity,
  });
}

export function runIdMatchesRetainedIdentityV1(state: RunStateV1): boolean {
  return state.runId === deriveRunIdFromStateV1(state);
}

/** Opaque exact identity token for authentication, never gameplay branching. */
export function retainedRunIdentityTokenV1(state: RunStateV1): string {
  return canonicalizeJson({ "identity": { "gender": state.identity.gender } });
}

function samePresentationSettings(
  left: RunStateV1,
  right: RunStateV1,
): boolean {
  return left.appearance.heritageStyleId === right.appearance.heritageStyleId &&
    left.appearance.hairStyleId === right.appearance.hairStyleId &&
    left.appearance.hairColorId === right.appearance.hairColorId &&
    left.appearance.clothingPaletteId === right.appearance.clothingPaletteId &&
    left.accessibility.highContrast === right.accessibility.highContrast &&
    left.accessibility.reducedMotion === right.accessibility.reducedMotion &&
    left.accessibility.textScale === right.accessibility.textScale &&
    left.accessibility.screenReaderAnnouncements ===
      right.accessibility.screenReaderAnnouncements;
}

/**
 * Adopts only presentation settings after the complete gameplay hash matches.
 * Identity and every mechanics field remain authoritative and unchanged.
 */
export function mergeRetainedPresentationSettingsV1(
  authoritativeGameplay: RunStateV1,
  external: RunStateV1,
): RunPresentationMergeV1 {
  let externalSetup: InitialRunSetup;
  try {
    initialRunSetupFromStateV1(authoritativeGameplay);
    externalSetup = initialRunSetupFromStateV1(external);
    if (stateHashV1(authoritativeGameplay) !== stateHashV1(external)) {
      return Object.freeze({ kind: "conflict" as const });
    }
  } catch {
    return Object.freeze({ kind: "conflict" as const });
  }
  if (samePresentationSettings(authoritativeGameplay, external)) {
    return Object.freeze({
      kind: "unchanged" as const,
      state: authoritativeGameplay,
    });
  }
  return deepFreeze({
    kind: "updated" as const,
    state: {
      ...authoritativeGameplay,
      appearance: { ...externalSetup.appearance },
      accessibility: { ...externalSetup.accessibility },
    },
  });
}

export function createInitialRunState(runSeed: string, setup: InitialRunSetup): RunStateV1 {
  if (!RUN_SEED_PATTERN.test(runSeed)) {
    throw new RangeError("Run seed must be exactly 16 lowercase hexadecimal characters");
  }
  assertInitialRunSetup(setup);
  const scores = STARTING_PROFILE_SCORES[setup.startingProfileId];
  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    contentVersion: RUN_STATE_CONTENT_VERSION,
    runId: deriveRunIdV1(runSeed, setup),
    runSeed,
    runStatus: "setup",
    difficulty: setup.difficulty,
    controlMode: setup.controlMode,
    identity: { ...setup.identity },
    appearance: { ...setup.appearance },
    accessibility: { ...setup.accessibility },
    startingProfileId: setup.startingProfileId,
    scores: { ...scores },
    effectLedger: { recent: [], totalsBySource: zeroSourceTotals() },
    storyState: { facts: [], memories: [], credentials: [], relationships: [], conditions: [] },
    stage: {
      stageId: "setup-shell-v1",
      phase: "shell",
      ageMonths: 0,
      activeTicks: 0,
      worldDistanceMilli: 0,
      durationTicks: 0,
      settlement: null,
    },
    runner: null,
    recovery: null,
    encounter: null,
    consequences: { pending: [], resolved: [], terminal: [] },
    simulationTick: 0,
  };
}
