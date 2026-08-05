import { DEFAULT_CAREER_CATALOG } from "../career";
import { deepFreeze } from "../immutable";
import type {
  AdultAppearance,
  AdultAttraction,
  AdultCallbackKind,
  AdultCulture,
  AdultDecisionOption,
  AdultGender,
  AdultHomeChoiceId,
  AdultJobId,
  AdultJobMetadata,
  AdultRouteId,
} from "./types";

export interface AdultNameRecord {
  readonly name: string;
  readonly gender: AdultGender;
  readonly culture: AdultCulture;
}

export interface AdultRouteDefinition {
  readonly routeId: AdultRouteId;
  readonly label: string;
  readonly summary: string;
  readonly homeChoices: readonly AdultHomeChoiceId[];
}

export interface AdultCallbackDefinition {
  readonly callbackId: string;
  readonly kind: AdultCallbackKind;
  readonly dueCycle: number;
  readonly title: string;
  readonly prompt: string;
  readonly options: readonly AdultDecisionOption[];
}

const NAMES: readonly AdultNameRecord[] = [
  { name: "Hana", gender: "female", culture: "east-asian" },
  { name: "Mei", gender: "female", culture: "east-asian" },
  { name: "Sora", gender: "female", culture: "east-asian" },
  { name: "Asha", gender: "female", culture: "south-asian" },
  { name: "Priya", gender: "female", culture: "south-asian" },
  { name: "Sofia", gender: "female", culture: "western" },
  { name: "Emma", gender: "female", culture: "western" },
  { name: "Nia", gender: "female", culture: "african-diaspora" },
  { name: "Amara", gender: "female", culture: "african-diaspora" },
  { name: "Lucia", gender: "female", culture: "latin" },
  { name: "Maya", gender: "female", culture: "latin" },
  { name: "Minho", gender: "male", culture: "east-asian" },
  { name: "Ren", gender: "male", culture: "east-asian" },
  { name: "Kenji", gender: "male", culture: "east-asian" },
  { name: "Arjun", gender: "male", culture: "south-asian" },
  { name: "Ravi", gender: "male", culture: "south-asian" },
  { name: "Noah", gender: "male", culture: "western" },
  { name: "Leo", gender: "male", culture: "western" },
  { name: "Malik", gender: "male", culture: "african-diaspora" },
  { name: "Kwame", gender: "male", culture: "african-diaspora" },
  { name: "Mateo", gender: "male", culture: "latin" },
  { name: "Diego", gender: "male", culture: "latin" },
] as const;

export const ADULT_JOB_CATALOG: Readonly<Record<AdultJobId, AdultJobMetadata>> =
  deepFreeze(
    Object.fromEntries(
      DEFAULT_CAREER_CATALOG.orderedCareerIds.map((jobId) => {
        const definition = DEFAULT_CAREER_CATALOG.careers[jobId];
        return [
          jobId,
          {
            jobId,
            title: definition.title,
            roleTitle: definition.qualifiedRoleTitle,
            outfits: definition.outfits,
          },
        ];
      }),
    ) as Record<AdultJobId, AdultJobMetadata>,
  );

export const ADULT_ROUTE_DEFINITIONS: Readonly<Record<AdultRouteId, AdultRouteDefinition>> =
  deepFreeze<Readonly<Record<AdultRouteId, AdultRouteDefinition>>>({
    partnered: {
      routeId: "partnered",
      label: "Explore partnership",
      summary: "Meet several compatible people, with marriage remaining an option rather than a requirement.",
      homeChoices: ["make-shared-home", "keep-independent-homes"],
    },
    "single-friends": {
      routeId: "single-friends",
      label: "Build life with friends",
      summary: "Invest in friendship, mutual support, and a home shaped on your own terms.",
      homeChoices: ["friend-household", "independent-home"],
    },
    community: {
      routeId: "community",
      label: "Root in community",
      summary: "Create belonging through neighbors, shared projects, and intergenerational support.",
      homeChoices: ["community-household", "neighborhood-root"],
    },
  });

export const ADULT_CALLBACK_DEFINITIONS: readonly AdultCallbackDefinition[] =
  deepFreeze<readonly AdultCallbackDefinition[]>([
    {
      callbackId: "adult-promotion-callback-v1",
      kind: "promotion",
      dueCycle: 2,
      title: "A promotion arrives",
      prompt: "The role offers more income and influence, but it will reshape your time. What do you choose?",
      options: [
        {
          optionId: "accept-promotion",
          label: "Accept the promotion",
          description: "Advance quickly and accept a heavier schedule.",
          effects: [
            { scoreId: "money", requestedDelta: 8 },
            { scoreId: "health", requestedDelta: -4 },
            { scoreId: "happiness", requestedDelta: -1 },
          ],
          resultText: "Your responsibilities and income grew together.",
        },
        {
          optionId: "negotiate-promotion",
          label: "Negotiate the role",
          description: "Take a slower step upward with clearer boundaries.",
          effects: [
            { scoreId: "money", requestedDelta: 4 },
            { scoreId: "health", requestedDelta: 1 },
            { scoreId: "happiness", requestedDelta: 2 },
          ],
          resultText: "The role changed enough to fit the life around it.",
        },
        {
          optionId: "decline-promotion",
          label: "Decline for now",
          description: "Keep your current role and protect time outside work.",
          effects: [
            { scoreId: "money", requestedDelta: -1 },
            { scoreId: "health", requestedDelta: 4 },
            { scoreId: "happiness", requestedDelta: 3 },
          ],
          resultText: "You kept your pace and made space for the rest of life.",
        },
      ],
    },
    {
      callbackId: "adult-caregiver-callback-v1",
      kind: "caregiver",
      dueCycle: 4,
      title: "A caregiver now needs care",
      prompt: "Someone who supported you is aging and needs regular help. How will you arrange it?",
      options: [
        {
          optionId: "take-care-leave",
          label: "Take a caregiving leave",
          description: "Pause work for a season and provide care directly.",
          effects: [
            { scoreId: "money", requestedDelta: -7 },
            { scoreId: "health", requestedDelta: -1 },
            { scoreId: "happiness", requestedDelta: 4 },
          ],
          resultText: "Work paused while daily care became the center of your schedule.",
        },
        {
          optionId: "share-care",
          label: "Build a shared care rota",
          description: "Reduce work hours and divide care with trusted people.",
          effects: [
            { scoreId: "money", requestedDelta: -3 },
            { scoreId: "health", requestedDelta: 2 },
            { scoreId: "happiness", requestedDelta: 3 },
          ],
          resultText: "A shared plan made care more sustainable for everyone.",
        },
        {
          optionId: "hire-care-help",
          label: "Arrange professional help",
          description: "Spend more to keep your career rhythm and add skilled support.",
          effects: [
            { scoreId: "money", requestedDelta: -9 },
            { scoreId: "health", requestedDelta: 3 },
            { scoreId: "happiness", requestedDelta: 1 },
          ],
          resultText: "Reliable professional support joined the family care circle.",
        },
      ],
    },
    {
      callbackId: "adult-support-callback-v1",
      kind: "support",
      dueCycle: 5,
      title: "Midlife feels crowded",
      prompt: "Work, home, and changing relationships all need attention. Where do you look for support?",
      options: [
        {
          optionId: "ask-inner-circle",
          label: "Ask your inner circle",
          description: "Be honest with the people already close to you.",
          effects: [
            { scoreId: "money", requestedDelta: -1 },
            { scoreId: "health", requestedDelta: 2 },
            { scoreId: "happiness", requestedDelta: 5 },
          ],
          resultText: "A direct conversation turned private strain into shared care.",
        },
        {
          optionId: "join-support-network",
          label: "Join a support network",
          description: "Find people with similar responsibilities and practical advice.",
          effects: [
            { scoreId: "money", requestedDelta: -2 },
            { scoreId: "health", requestedDelta: 3 },
            { scoreId: "happiness", requestedDelta: 4 },
          ],
          resultText: "New connections brought practical help and perspective.",
        },
        {
          optionId: "manage-alone",
          label: "Handle it alone",
          description: "Keep control and preserve short-term resources at a personal cost.",
          effects: [
            { scoreId: "money", requestedDelta: 2 },
            { scoreId: "health", requestedDelta: -3 },
            { scoreId: "happiness", requestedDelta: -3 },
          ],
          resultText: "You kept everything moving, but carried the full weight yourself.",
        },
      ],
    },
  ]);

export function defaultAttractionForGender(gender: AdultGender): AdultAttraction {
  return gender === "male" ? "women" : "men";
}

export function attractionIncludesGender(
  attraction: AdultAttraction,
  gender: AdultGender,
): boolean {
  return (
    attraction === "any" ||
    (attraction === "women" && gender === "female") ||
    (attraction === "men" && gender === "male")
  );
}

export function listAdultNames(
  attraction: AdultAttraction,
): readonly AdultNameRecord[] {
  return NAMES.filter((record) => attractionIncludesGender(attraction, record.gender));
}

export function getAdultJob(jobId: AdultJobId): AdultJobMetadata {
  return ADULT_JOB_CATALOG[jobId];
}

export function adultAppearanceAt(index: number, gender: AdultGender): AdultAppearance {
  const femaleHair = ["soft bob", "high bun", "long braid", "curly shoulder cut", "wavy ponytail"] as const;
  const maleHair = ["textured crop", "short curls", "side part", "soft undercut", "wavy medium cut"] as const;
  const skinTones = ["#F3C7A5", "#D99A72", "#B8744F", "#895438", "#613A2B"] as const;
  const hairColors = ["#2B201B", "#4A2F24", "#7A432B", "#1C1A1A", "#B16C3B"] as const;
  const accessories = [null, "round glasses", "small earrings", "fitness watch", "canvas bag"] as const;
  const builds: readonly AdultAppearance["bodyBuild"][] = ["average", "athletic", "slim", "broad"];
  const hair = gender === "female" ? femaleHair : maleHair;
  return deepFreeze({
    skinTone: skinTones[index % skinTones.length]!,
    hairStyle: hair[index % hair.length]!,
    hairColor: hairColors[(index * 3 + 1) % hairColors.length]!,
    bodyBuild: builds[(index * 5 + 2) % builds.length]!,
    accessory: accessories[(index * 7 + 1) % accessories.length]!,
  });
}

export { NAMES as ADULT_NAME_CATALOG };
