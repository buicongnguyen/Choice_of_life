import { deepFreeze } from "../immutable";
import { getCareerDefinition } from "./catalog";
import type {
  CareerEndingScoreLine,
  CareerProvisionalEnding,
  CareerState,
  FinancialSecurityOutcome,
  OverallSuccessOutcome,
} from "./types";

function financialSecurityFor(money: number): FinancialSecurityOutcome {
  if (money >= 70) return "secure";
  if (money >= 38) return "steady";
  return "fragile";
}

function overallSuccessFor(state: CareerState): OverallSuccessOutcome {
  const { health, happiness, money } = state.scores;
  const purposeLevel = state.selectedRole === null
    ? 1
    : getCareerDefinition(state.selectedRole.careerId).labels.purposeAutonomy.level;

  if (health >= 65 && happiness >= 65 && money >= 42) return "thriving";
  if (money >= 72 && (health < 45 || happiness < 45)) {
    return "secure-but-strained";
  }
  if (happiness >= 62 && purposeLevel >= 4 && health >= 42) {
    return "purpose-led";
  }
  if (health < 35 || happiness < 35 || money < 25) return "resilient";
  return "still-building";
}

function scoreReflection(
  scoreId: "health" | "happiness" | "money",
  value: number,
): string {
  if (scoreId === "money") {
    if (value >= 70) return "You built a strong financial cushion.";
    if (value >= 38) return "Your finances can support a steady next chapter.";
    return "Financial security still needs attention and support.";
  }
  if (scoreId === "health") {
    if (value >= 70) return "Your energy and physical wellbeing stayed strong.";
    if (value >= 40) return "Your health held steady through the demands of work.";
    return "Your body is asking for recovery and a gentler pace.";
  }
  if (value >= 70) return "Joy and connection remained a clear source of strength.";
  if (value >= 40) return "You found meaningful moments alongside the pressure.";
  return "Happiness needs more room in the choices ahead.";
}

function scoreLines(state: CareerState): readonly CareerEndingScoreLine[] {
  return [
    {
      scoreId: "health",
      label: "Health",
      value: state.scores.health,
      reflection: scoreReflection("health", state.scores.health),
    },
    {
      scoreId: "happiness",
      label: "Happiness",
      value: state.scores.happiness,
      reflection: scoreReflection("happiness", state.scores.happiness),
    },
    {
      scoreId: "money",
      label: "Financial security (Money)",
      value: state.scores.money,
      reflection: scoreReflection("money", state.scores.money),
    },
  ];
}

const SUCCESS_HEADLINES: Readonly<Record<OverallSuccessOutcome, string>> = {
  thriving: "A strong beginning with room to keep growing",
  "purpose-led": "A meaningful path shaped by what matters to you",
  "secure-but-strained": "Financially secure, with wellbeing asking for care",
  resilient: "A difficult chapter met with resilience",
  "still-building": "A foundation for the life still ahead",
};

export function createCareerProvisionalEnding(
  state: CareerState,
): CareerProvisionalEnding {
  if (state.selectedRole === null) {
    throw new Error("A provisional career ending requires a selected career");
  }

  const career = getCareerDefinition(state.selectedRole.careerId);
  const financialSecurity = financialSecurityFor(state.scores.money);
  const overallSuccess = overallSuccessFor(state);
  const namedFacts = state.facts.slice(-4).map((fact) => `${fact.label}: ${fact.value}`);
  const namedPeople = state.people.slice(-4).map((person) => `${person.name} (${person.role})`);
  const factText = namedFacts.length > 0
    ? `The chapter remembers ${namedFacts.join("; ")}.`
    : "The chapter remembers the choices that brought you here.";
  const peopleText = namedPeople.length > 0
    ? `${namedPeople.join(", ")} were part of this chapter.`
    : "The next chapter still has room for new people and relationships.";

  return deepFreeze({
    endingId: "first-career-provisional-ending-v1" as const,
    title: `Your first chapter as ${career.title}`,
    financialSecurity,
    overallSuccess,
    headline: SUCCESS_HEADLINES[overallSuccess],
    narrative:
      `Health is ${state.scores.health}, Happiness is ${state.scores.happiness}, ` +
      `and Financial security (Money) is ${state.scores.money}. ` +
      `Your financial position is ${financialSecurity}, while your overall life outcome is ${overallSuccess}; ` +
      "money is one part of success, not its definition. " +
      `${factText} ${peopleText}`,
    scoreLines: scoreLines(state),
    namedFacts,
    namedPeople,
  });
}
