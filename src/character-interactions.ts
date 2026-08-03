import type { PersonKind } from "./types";

/**
 * Short-lived, face-adjacent expression cues for the otherwise static
 * storybook art. They are cosmetic only: no interaction state is persisted.
 */
export type CharacterExpression =
  | "neutral"
  | "smile"
  | "talk"
  | "wary"
  | "stern";

export type NpcRoleCue =
  | "none"
  | "smokePressure"
  | "riskyCrowd"
  | "flashyCharmer";

export type NpcDisposition = "friendly" | "risky" | "hostile";

export interface NpcRoleStyle {
  cue: NpcRoleCue;
  disposition: NpcDisposition;
}

export interface InteractionExpressions {
  player: CharacterExpression;
  npc: CharacterExpression;
}

export const PERSON_REACTION_SECONDS = 1.35;

const FRIENDLY_STYLE: NpcRoleStyle = {
  cue: "none",
  disposition: "friendly",
};

const ROLE_STYLES: Partial<Record<PersonKind, NpcRoleStyle>> = {
  smokerFriend: {
    cue: "smokePressure",
    disposition: "risky",
  },
  gangster: {
    cue: "riskyCrowd",
    disposition: "hostile",
  },
  playboy: {
    cue: "flashyCharmer",
    disposition: "risky",
  },
};

/**
 * Role is deliberately independent of gender, heritage, body shape, and
 * wardrobe identity. A behavior label never changes somebody's ethnicity.
 */
export function npcRoleStyle(kind: PersonKind): NpcRoleStyle {
  return ROLE_STYLES[kind] ?? FRIENDLY_STYLE;
}

export function interactionExpressionsAt(
  elapsedSeconds: number,
  kind: PersonKind,
  positive = true
): InteractionExpressions {
  const elapsed = Math.max(0, elapsedSeconds);
  const beat = Math.floor(elapsed / 0.38) % 4;
  const disposition = npcRoleStyle(kind).disposition;

  if (!positive || disposition !== "friendly") {
    if (beat === 1) {
      return {
        player: "talk",
        npc: disposition === "hostile" ? "stern" : "wary",
      };
    }
    return {
      player: "wary",
      npc: beat === 3 ? "stern" : "talk",
    };
  }

  if (beat === 1) return { player: "talk", npc: "smile" };
  if (beat === 3) return { player: "smile", npc: "smile" };
  return { player: "smile", npc: "talk" };
}
