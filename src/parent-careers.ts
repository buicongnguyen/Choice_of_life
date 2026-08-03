import { OCCUPATIONS } from "./occupations";
import type {
  HeritageStyle,
  Occupation,
  ProfessionNpcSpec,
} from "./types";

export type ParentRole = "mother" | "father";

/**
 * Parent careers are independent, visual-only details. They deliberately store
 * stable occupation ids rather than salary, perks, or a mutable occupation
 * object, so choosing a parent job cannot affect game balance.
 */
export interface ParentCareerIds {
  readonly mother: string | null;
  readonly father: string | null;
}

export const EMPTY_PARENT_CAREERS: ParentCareerIds = Object.freeze({
  mother: null,
  father: null,
});

function normalizedOccupationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return OCCUPATIONS.some((occupation) => occupation.id === value)
    ? value
    : null;
}

/**
 * Normalize untrusted setup/save data without allowing one parent's value to
 * leak into the other. Missing and retired occupation ids safely become null.
 */
export function normalizeParentCareerIds(
  value: unknown
): ParentCareerIds {
  if (!value || typeof value !== "object") {
    return EMPTY_PARENT_CAREERS;
  }
  const candidate = value as Record<string, unknown>;
  return {
    mother: normalizedOccupationId(candidate.mother),
    father: normalizedOccupationId(candidate.father),
  };
}

export function parentOccupation(
  role: ParentRole,
  ids: ParentCareerIds
): Occupation | null {
  const id = ids[role];
  return id
    ? OCCUPATIONS.find((occupation) => occupation.id === id) ?? null
    : null;
}

/**
 * Return only the visual profession identity used by the room renderer.
 * Mother and Father have fixed, explicit genders. Exact occupation art exists
 * only for Asian and Western identities; unsupported heritages retain the
 * normal storybook parent instead of borrowing another person's appearance.
 */
export function parentProfessionSpec(
  role: ParentRole,
  ids: ParentCareerIds,
  heritage: HeritageStyle
): ProfessionNpcSpec | null {
  if (heritage !== "western" && heritage !== "asian") return null;
  const occupation = parentOccupation(role, ids);
  if (!occupation?.uniform) return null;
  return {
    id: occupation.id,
    uniform: occupation.uniform,
    gender: role === "mother" ? "female" : "male",
    heritage,
  };
}
