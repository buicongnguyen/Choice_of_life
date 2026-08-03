import { STAGES } from "./stages";
import type {
  CharacterAppearanceId,
  Gender,
  HeritageStyle,
  PersonKind,
} from "./types";

export const SAME_STAGE_PEER_KINDS = [
  "playmate",
  "studyFriend",
  "bestFriend",
  "crush",
  "smokerFriend",
  "gangster",
  "playboy",
  "roommate",
  "gymBuddy",
] as const satisfies readonly PersonKind[];

const SAME_STAGE_PEERS = new Set<PersonKind>(
  SAME_STAGE_PEER_KINDS
);
const SCHOOL_STAGE_IDS = new Set([
  "elementary",
  "middle",
  "high",
  "university",
]);
const PEER_HERITAGES: readonly HeritageStyle[] = [
  "western",
  "asian",
  "middleEastern",
  "black",
];
const APPEARANCES: readonly CharacterAppearanceId[] = [
  "classic",
  "alternate",
];

export interface FriendVisualIdentity {
  heritage: HeritageStyle;
  appearance: CharacterAppearanceId;
}

interface FriendVisualRecord {
  gender: Gender;
  heritage?: HeritageStyle;
  appearance?: CharacterAppearanceId;
}

/**
 * Roles that can share one chapter receive different slots. Reuse happens only
 * between roles that never coexist (for example playmate and roommate).
 */
const PEER_VISUAL_ORDINAL: Record<
  (typeof SAME_STAGE_PEER_KINDS)[number],
  number
> = {
  studyFriend: 0,
  bestFriend: 1,
  crush: 2,
  smokerFriend: 3,
  gangster: 4,
  playboy: 5,
  roommate: 6,
  playmate: 6,
  gymBuddy: 7,
};

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function identityFromSlot(slot: number): FriendVisualIdentity {
  const normalized = ((slot % 8) + 8) % 8;
  return {
    heritage: PEER_HERITAGES[Math.floor(normalized / 2)],
    appearance: APPEARANCES[normalized % 2],
  };
}

export function friendVisualKey(
  identity: FriendVisualIdentity
): string {
  return `${identity.heritage}:${identity.appearance}`;
}

export function isSameStagePeerKind(
  kind: PersonKind
): boolean {
  return SAME_STAGE_PEERS.has(kind);
}

/** Keep legacy and newly generated school friends inside the current stage. */
export function friendAgeForStage(
  playerAge: number,
  stageIndex: number,
  ageOffset: number
): number {
  const rounded = Math.max(
    0,
    Math.round(playerAge + ageOffset)
  );
  const stage = STAGES[stageIndex];
  if (!stage || !SCHOOL_STAGE_IDS.has(stage.id)) return rounded;
  return Math.max(
    stage.ageStart,
    Math.min(stage.ageEnd - 1, rounded)
  );
}

/**
 * Give recurring peer roles one combined stable identity. Allocating heritage
 * and appearance together avoids the correlated hash collisions that made
 * several university classmates render as the same person.
 */
export function peerVisualIdentity(
  lifeSeed: string,
  kind: PersonKind
): FriendVisualIdentity {
  const peerKind = kind as (typeof SAME_STAGE_PEER_KINDS)[number];
  const ordinal = PEER_VISUAL_ORDINAL[peerKind];
  if (ordinal === undefined) {
    return identityFromSlot(
      stableHash(`${lifeSeed}:${kind}:peer-visual`)
    );
  }
  const rotation =
    stableHash(`${lifeSeed}:peer-visual-rotation`) % 8;
  return identityFromSlot(rotation + ordinal);
}

/** Compatibility helper for callers that only need the heritage component. */
export function peerHeritage(
  lifeSeed: string,
  kind: PersonKind
): HeritageStyle {
  return peerVisualIdentity(lifeSeed, kind).heritage;
}

/** Alternate genders so a full 16-person roster never exceeds 8 per gender. */
export function friendGenderForOrdinal(
  lifeSeed: string,
  ordinal: number
): Gender {
  const first =
    stableHash(`${lifeSeed}:friend-gender-order`) % 2;
  return (first + Math.max(0, Math.floor(ordinal))) % 2 === 0
    ? "male"
    : "female";
}

/**
 * Permute all eight reviewed looks for one gender before any repeat. The odd
 * stride is coprime with eight, so ordinal 0..7 always produces eight keys.
 */
export function friendVisualIdentity(
  lifeSeed: string,
  gender: Gender,
  ordinalWithinGender: number
): FriendVisualIdentity {
  const rotation =
    stableHash(`${lifeSeed}:${gender}:friend-visual-rotation`) %
    8;
  const strides = [1, 3, 5, 7] as const;
  const stride =
    strides[
      stableHash(`${lifeSeed}:${gender}:friend-visual-stride`) %
        strides.length
    ];
  return identityFromSlot(
    rotation +
      Math.max(0, Math.floor(ordinalWithinGender)) * stride
  );
}

/** Choose the next reviewed look that is not already used by this gender. */
export function nextFriendVisualIdentity(
  lifeSeed: string,
  gender: Gender,
  usedVisualKeys: Iterable<string>,
  preferredOrdinal = 0
): FriendVisualIdentity {
  const used = new Set(usedVisualKeys);
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = friendVisualIdentity(
      lifeSeed,
      gender,
      preferredOrdinal + offset
    );
    if (!used.has(friendVisualKey(candidate))) return candidate;
  }
  // Eight reviewed identity sheets are available per gender. A legacy roster
  // may exceed that; preserve its gender and repeat only after the pool is full.
  return friendVisualIdentity(
    lifeSeed,
    gender,
    preferredOrdinal
  );
}

/**
 * Migrate legacy friends without changing their recorded gender. Existing
 * valid, non-colliding identities stay untouched; missing/colliding looks take
 * the next unused reviewed slot for that gender.
 */
export function normalizeFriendVisualIdentities<
  T extends FriendVisualRecord,
>(lifeSeed: string, friends: readonly T[]): Array<
  T & FriendVisualIdentity
> {
  const used: Record<Gender, Set<string>> = {
    male: new Set<string>(),
    female: new Set<string>(),
  };
  const counts: Record<Gender, number> = {
    male: 0,
    female: 0,
  };

  return friends.map((friend) => {
    const gender = friend.gender;
    const existing =
      PEER_HERITAGES.includes(
        friend.heritage as HeritageStyle
      ) &&
      APPEARANCES.includes(
        friend.appearance as CharacterAppearanceId
      )
        ? {
            heritage: friend.heritage as HeritageStyle,
            appearance:
              friend.appearance as CharacterAppearanceId,
          }
        : null;
    let identity =
      existing &&
      !used[gender].has(friendVisualKey(existing))
        ? existing
        : null;

    if (!identity) {
      const start = counts[gender];
      identity = nextFriendVisualIdentity(
        lifeSeed,
        gender,
        used[gender],
        start
      );
    }

    counts[gender] += 1;
    used[gender].add(friendVisualKey(identity));
    return { ...friend, ...identity };
  });
}
