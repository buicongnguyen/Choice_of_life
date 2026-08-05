import { deepFreeze } from "../immutable";
import type { CoreScores, ScoreId } from "../score-model";
import {
  LIFE_STAGE_IDS,
  type BiographyBalanceProfile,
  type BiographyChapter,
  type BiographyChapterInput,
  type BiographyPerson,
  type BiographyScoreReflection,
  type EndingTitle,
  type EndingTitleContext,
  type FullBiography,
  type LaterLifeChapterRecord,
  type LaterLifeState,
  type LifeDecisionRecord,
  type LifeFact,
  type LifeStageId,
} from "./types";

const PRIOR_STAGE_IDS = [
  "newborn-v1",
  "toddler-v1",
  "early-childhood-v1",
  "elementary-school-v1",
  "middle-school-v1",
  "education-v1",
  "first-career-v1",
  "relationships-home-v1",
  "midlife-v1",
] as const;

const PRIOR_CHAPTER_COPY: Readonly<
  Record<
    (typeof PRIOR_STAGE_IDS)[number],
    Readonly<{ title: string; decisionId: string; choiceLabel: string; summary: string }>
  >
> = {
  "newborn-v1": {
    title: "Newborn",
    decisionId: "biography-newborn-choice-v1",
    choiceLabel: "How care should begin",
    summary: "Care, comfort, and curiosity shaped the first small steps into the world.",
  },
  "toddler-v1": {
    title: "Toddler",
    decisionId: "biography-toddler-choice-v1",
    choiceLabel: "How to explore",
    summary: "The world grew larger through movement, play, and the first brave experiments.",
  },
  "early-childhood-v1": {
    title: "Early Childhood",
    decisionId: "biography-early-childhood-choice-v1",
    choiceLabel: "How to meet a new friend",
    summary: "Small acts of trust began turning familiar faces into lasting relationships.",
  },
  "elementary-school-v1": {
    title: "Elementary School",
    decisionId: "biography-elementary-choice-v1",
    choiceLabel: "How to learn with others",
    summary: "School made room for questions, teamwork, and an early sense of capability.",
  },
  "middle-school-v1": {
    title: "Middle School",
    decisionId: "biography-middle-school-choice-v1",
    choiceLabel: "What kind of courage to practice",
    summary: "Growing independence brought choices about belonging, effort, and self-respect.",
  },
  "education-v1": {
    title: "Education and Training",
    decisionId: "biography-education-choice-v1",
    choiceLabel: "Which path to prepare for",
    summary: "Study, practical training, or direct work opened a route into adult life.",
  },
  "first-career-v1": {
    title: "First Career",
    decisionId: "biography-first-career-choice-v1",
    choiceLabel: "Which work to begin",
    summary: "A first working chapter tested the balance between income, pressure, and purpose.",
  },
  "relationships-home-v1": {
    title: "Relationships and Home",
    decisionId: "biography-home-choice-v1",
    choiceLabel: "How to build a home life",
    summary: "Partnership, friendship, family, or community gave home its particular shape.",
  },
  "midlife-v1": {
    title: "Midlife",
    decisionId: "biography-midlife-choice-v1",
    choiceLabel: "What deserved care now",
    summary: "Responsibilities changed, and support became something both given and received.",
  },
};

const PRIOR_AGE_BOUNDARIES = [0, 12, 36, 72, 132, 168, 276, 384, 480] as const;

function chapterEnd(index: number, laterLifeStartAgeMonths: number): number {
  const nextBoundary = PRIOR_AGE_BOUNDARIES[index + 1];
  return nextBoundary ?? laterLifeStartAgeMonths;
}

export function createDefaultPriorChapters(
  laterLifeStartAgeMonths: number,
): readonly BiographyChapterInput[] {
  if (!Number.isInteger(laterLifeStartAgeMonths) || laterLifeStartAgeMonths < 480) {
    throw new RangeError("later-life start age must be an integer of at least 480 months");
  }

  return deepFreeze(
    PRIOR_STAGE_IDS.map((stageId, index) => {
      const copy = PRIOR_CHAPTER_COPY[stageId];
      return {
        stageId,
        title: copy.title,
        ageStartMonths: PRIOR_AGE_BOUNDARIES[index],
        ageEndMonths: chapterEnd(index, laterLifeStartAgeMonths),
        summary: copy.summary,
        majorDecisionId: copy.decisionId,
        majorChoiceLabel: copy.choiceLabel,
        namedFactIds: [],
        namedPersonIds: [],
        callbackIds: [],
      };
    }),
  );
}

export function mergePriorBiographyChapters(
  supplied: readonly BiographyChapterInput[] | undefined,
  laterLifeStartAgeMonths: number,
): readonly BiographyChapterInput[] {
  const defaults = createDefaultPriorChapters(laterLifeStartAgeMonths);
  if (supplied === undefined || supplied.length === 0) return defaults;

  const suppliedByStage = new Map<LifeStageId, BiographyChapterInput>();
  for (const chapter of supplied) {
    if ((PRIOR_STAGE_IDS as readonly LifeStageId[]).includes(chapter.stageId)) {
      suppliedByStage.set(chapter.stageId, chapter);
    }
  }

  return deepFreeze(
    defaults.map((fallback) => suppliedByStage.get(fallback.stageId) ?? fallback),
  );
}

function balanceProfile(scores: CoreScores): BiographyBalanceProfile {
  const values = [scores.health, scores.happiness, scores.money];
  const lowestScore = Math.min(...values);
  const highestScore = Math.max(...values);
  const spread = highestScore - lowestScore;
  return deepFreeze({
    lowestScore,
    highestScore,
    spread,
    balanced: spread <= 20,
  });
}

function hasRelationshipSignal(
  context: EndingTitleContext,
  relationships: readonly BiographyPerson["relationship"][],
): boolean {
  return context.people.some((person) => relationships.includes(person.relationship)) ||
    context.facts.some((fact) => fact.kind === "relationship");
}

function hasDecisionSignal(context: EndingTitleContext, fragment: string): boolean {
  return context.decisions.some(
    (decision) =>
      decision.optionId.includes(fragment) ||
      decision.optionLabel.toLowerCase().includes(fragment),
  );
}

export function deriveLifeEndingTitle(context: EndingTitleContext): EndingTitle {
  const balance = balanceProfile(context.scores);
  const relationshipRich = hasRelationshipSignal(context, [
    "family",
    "partner",
    "friend",
  ]);
  const communityRich = hasRelationshipSignal(context, ["community", "mentor"]);
  const resilienceNamed = context.facts.some((fact) => fact.kind === "resilience");

  if (
    balance.balanced &&
    balance.lowestScore >= 58 &&
    context.people.length >= 2 &&
    context.decisions.length >= 9
  ) {
    return deepFreeze({
      titleId: "full-hearted-builder",
      title: "The Full-Hearted Builder",
      reason:
        "Health, happiness, and financial security stayed in conversation while people and choices gave the life its shape.",
    });
  }

  if (
    context.legacyRoute === "family" &&
    context.scores.happiness >= 52 &&
    relationshipRich
  ) {
    return deepFreeze({
      titleId: "beloved-storykeeper",
      title: "The Beloved Storykeeper",
      reason:
        "A family-and-friend legacy, strong connection, and remembered relationships made shared stories the lasting work.",
    });
  }

  if (
    context.legacyRoute === "community" &&
    context.scores.happiness >= 48 &&
    (communityRich || hasDecisionSignal(context, "community"))
  ) {
    return deepFreeze({
      titleId: "community-light",
      title: "A Light in the Community",
      reason:
        "The ending reflects a community route, meaningful connection, and choices that widened the circle of care.",
    });
  }

  if (
    context.legacyRoute === "craft" &&
    context.scores.health >= 45 &&
    hasDecisionSignal(context, "craft")
  ) {
    return deepFreeze({
      titleId: "curious-craftsperson",
      title: "The Curious Craftsperson",
      reason:
        "A lifelong practice, enough wellbeing to keep sharing it, and the decision to teach gave curiosity a future.",
    });
  }

  if (
    context.scores.money >= 60 &&
    context.scores.health >= 42 &&
    context.scores.happiness >= 38 &&
    context.decisions.some((decision) => decision.stageId === "retirement-v1")
  ) {
    return deepFreeze({
      titleId: "steadfast-steward",
      title: "The Steadfast Steward",
      reason:
        "Financial security supported—not replaced—health, connection, and a deliberate retirement choice.",
    });
  }

  if (balance.lowestScore < 35 || resilienceNamed) {
    return deepFreeze({
      titleId: "resilient-pathmaker",
      title: "The Resilient Pathmaker",
      reason:
        "The life carried real strain, yet named people, consequential choices, and recovery kept opening a path forward.",
    });
  }

  return deepFreeze({
    titleId: "life-still-rippling",
    title: "A Life Still Rippling Outward",
    reason:
      "No single score defines this ending; its meaning lives across the balance of wellbeing, security, people, and decisions.",
  });
}

function scoreBand(value: number): "tender" | "steady" | "strong" {
  if (value >= 67) return "strong";
  if (value >= 38) return "steady";
  return "tender";
}

function reflectionFor(scoreId: ScoreId, value: number): BiographyScoreReflection {
  const band = scoreBand(value);
  const copy: Readonly<Record<ScoreId, Readonly<Record<typeof band, string>>>> = {
    health: {
      tender: "Your body carried strain and made rest, care, and support important parts of the story.",
      steady: "Your health supported the life while still asking for thoughtful limits.",
      strong: "Physical wellbeing gave you energy to stay present across many chapters.",
    },
    happiness: {
      tender: "Joy was sometimes difficult to reach, but meaningful people and choices kept it from disappearing.",
      steady: "Contentment came in reliable moments rather than one permanent mood.",
      strong: "Connection, purpose, and delight remained visible sources of strength.",
    },
    money: {
      tender: "Financial security remained delicate and made community and support especially valuable.",
      steady: "Your resources offered a workable foundation for the life you chose.",
      strong: "A strong financial cushion created options without becoming the measure of the whole life.",
    },
  };
  const labels: Readonly<Record<ScoreId, string>> = {
    health: "Health",
    happiness: "Happiness",
    money: "Financial security",
  };
  return deepFreeze({ scoreId, label: labels[scoreId], value, band, reflection: copy[scoreId][band] });
}

function asBiographyChapter(
  chapter: BiographyChapterInput,
  chapterNumber: number,
): BiographyChapter {
  return deepFreeze({
    chapterNumber,
    stageId: chapter.stageId,
    title: chapter.title,
    ageStartMonths: chapter.ageStartMonths,
    ageEndMonths: chapter.ageEndMonths,
    summary: chapter.summary,
    majorDecisionId: chapter.majorDecisionId,
    majorChoiceLabel: chapter.majorChoiceLabel,
    namedFactIds: [...(chapter.namedFactIds ?? [])],
    namedPersonIds: [...(chapter.namedPersonIds ?? [])],
    callbackIds: [...(chapter.callbackIds ?? [])],
  });
}

function laterChapterInput(chapter: LaterLifeChapterRecord): BiographyChapterInput {
  return {
    stageId: chapter.stageId,
    title: chapter.title,
    ageStartMonths: chapter.ageStartMonths,
    ageEndMonths: chapter.ageEndMonths,
    summary: chapter.resultText,
    majorDecisionId: chapter.decisionId,
    majorChoiceLabel: chapter.optionLabel,
    namedFactIds: [chapter.factId],
    namedPersonIds: [],
    callbackIds: [chapter.callbackId],
  };
}

function decisionsForChapters(
  chapters: readonly BiographyChapter[],
  recorded: readonly LifeDecisionRecord[],
): readonly LifeDecisionRecord[] {
  const byId = new Map(recorded.map((decision) => [decision.decisionId, decision]));
  return deepFreeze(
    chapters.map((chapter) =>
      byId.get(chapter.majorDecisionId) ?? {
        decisionId: chapter.majorDecisionId,
        stageId: chapter.stageId,
        choiceTitle: chapter.majorChoiceLabel,
        optionId: `${chapter.majorDecisionId}-recorded`,
        optionLabel: chapter.majorChoiceLabel,
        resultText: chapter.summary,
        factIds: chapter.namedFactIds,
        personIds: chapter.namedPersonIds,
        callbackId: chapter.callbackIds[0] ?? null,
      },
    ),
  );
}

function chooseImportantFacts(facts: readonly LifeFact[]): readonly LifeFact[] {
  const weighted = [...facts].sort((left, right) => {
    const stageDifference = LIFE_STAGE_IDS.indexOf(right.sourceStageId) - LIFE_STAGE_IDS.indexOf(left.sourceStageId);
    if (stageDifference !== 0) return stageDifference;
    return left.factId.localeCompare(right.factId);
  });
  return deepFreeze(weighted.slice(0, 10));
}

function chooseImportantPeople(people: readonly BiographyPerson[]): readonly BiographyPerson[] {
  const relationshipOrder: Readonly<Record<BiographyPerson["relationship"], number>> = {
    family: 0,
    partner: 1,
    friend: 2,
    mentor: 3,
    community: 4,
    colleague: 5,
  };
  return deepFreeze(
    [...people]
      .sort((left, right) =>
        relationshipOrder[left.relationship] - relationshipOrder[right.relationship] ||
        left.personId.localeCompare(right.personId),
      )
      .slice(0, 8),
  );
}

function closingNarrative(
  title: EndingTitle,
  people: readonly BiographyPerson[],
  decisions: readonly LifeDecisionRecord[],
  facts: readonly LifeFact[],
): string {
  const peopleText = people.length > 0
    ? people.slice(0, 3).map((person) => person.name).join(", ")
    : "the people met along the way";
  const decisionText = decisions
    .slice(-3)
    .map((decision) => decision.optionLabel)
    .join(", ");
  const factText = facts.slice(0, 3).map((fact) => fact.label).join(", ");
  return (
    `${title.title} is not a rank or a victory score. ` +
    `It is the name this particular life earned through ${decisionText}; ` +
    `through ${peopleText}; and through what the years remembered: ${factText}. ` +
    "Health, happiness, and financial security each tell a different truth, and none tells the whole story alone."
  );
}

export function assembleFullBiography(state: LaterLifeState): FullBiography {
  if (state.laterLifeChapters.length !== 3) {
    throw new Error("A full biography requires all three later-life chapters");
  }

  const chapterInputs = [
    ...state.priorChapters,
    ...state.laterLifeChapters.map(laterChapterInput),
  ];
  const chapters = chapterInputs.map((chapter, index) =>
    asBiographyChapter(chapter, index + 1));
  const allDecisions = decisionsForChapters(chapters, state.decisions);
  const importantFacts = chooseImportantFacts(state.facts);
  const importantPeople = chooseImportantPeople(state.people);
  const title = deriveLifeEndingTitle({
    scores: state.scores,
    facts: state.facts,
    people: state.people,
    decisions: allDecisions,
    legacyRoute: state.legacyRoute,
  });
  const scoreReflections = (["health", "happiness", "money"] as const).map(
    (scoreId) => reflectionFor(scoreId, state.scores[scoreId]),
  );
  const sceneCallbacks = deepFreeze(
    state.callbacks.filter((callback) => callback.status === "resolved"),
  );

  return deepFreeze({
    biographyId: "complete-life-biography-v1" as const,
    title,
    lifespanMonths: state.ageMonths,
    chapters,
    scoreReflections,
    balance: balanceProfile(state.scores),
    importantFacts,
    importantPeople,
    importantDecisions: allDecisions,
    sceneCallbacks,
    closingNarrative: closingNarrative(title, importantPeople, allDecisions, importantFacts),
  });
}
