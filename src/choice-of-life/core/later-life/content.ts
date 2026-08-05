import { deepFreeze } from "../immutable";
import type {
  LaterCareerChoiceOption,
  LaterLifeMajorChoice,
  LegacyChoiceOption,
  RetirementChoiceOption,
} from "./types";

export const LATER_CAREER_CHOICE = deepFreeze({
  choiceId: "later-career-direction-choice-v1",
  stageId: "later-career-v1",
  title: "What should the next working chapter become?",
  prompt:
    "Your experience now carries weight. Decide where to place it before the shape of retirement becomes clear.",
  options: [
    {
      optionId: "later-career-mentor-v1",
      label: "Mentor the next generation",
      summary: "Share hard-won knowledge and help someone else find their footing.",
      tradeoff: "Connection and purpose grow, while work still asks for some energy.",
      direction: "mentor",
      effects: [
        { scoreId: "health", requestedDelta: -2 },
        { scoreId: "happiness", requestedDelta: 7 },
        { scoreId: "money", requestedDelta: 3 },
      ],
      ageAdvanceMonths: 30,
      factId: "fact-later-career-mentor-v1",
      factLabel: "Became a trusted mentor",
      callbackId: "callback-mentee-returns-v1",
      callbackTitle: "What your guidance set in motion",
      callbackText:
        "A younger colleague returns with news of a brave step they took because your patient guidance made it feel possible.",
      resultText:
        "You made experience useful by giving it away, and a new colleague carried part of your story forward.",
    },
    {
      optionId: "later-career-lead-v1",
      label: "Lead one ambitious chapter",
      summary: "Take responsibility for a demanding project while your expertise is at its peak.",
      tradeoff: "Financial security grows, but the pace costs health and quiet time.",
      direction: "lead",
      effects: [
        { scoreId: "health", requestedDelta: -7 },
        { scoreId: "happiness", requestedDelta: -2 },
        { scoreId: "money", requestedDelta: 10 },
      ],
      ageAdvanceMonths: 36,
      factId: "fact-later-career-led-v1",
      factLabel: "Led a defining final project",
      callbackId: "callback-final-project-v1",
      callbackTitle: "The project finds its feet",
      callbackText:
        "The team gathers after the work is done. They remember the standard you set—and the moments when you trusted them to lead too.",
      resultText:
        "You accepted one more demanding responsibility and left behind work sturdy enough to continue without you.",
    },
    {
      optionId: "later-career-rebalance-v1",
      label: "Rebalance work and life",
      summary: "Reduce the pace and make room for health, relationships, and neglected interests.",
      tradeoff: "Wellbeing improves while income grows more slowly.",
      direction: "rebalance",
      effects: [
        { scoreId: "health", requestedDelta: 8 },
        { scoreId: "happiness", requestedDelta: 5 },
        { scoreId: "money", requestedDelta: -4 },
      ],
      ageAdvanceMonths: 24,
      factId: "fact-later-career-rebalanced-v1",
      factLabel: "Made room beyond work",
      callbackId: "callback-rebalanced-week-v1",
      callbackTitle: "A week with breathing room",
      callbackText:
        "Someone close notices that you are present again—not only available between obligations, but genuinely there.",
      resultText:
        "You loosened work's hold on the calendar and rediscovered parts of life that had waited patiently.",
    },
  ],
} satisfies LaterLifeMajorChoice<LaterCareerChoiceOption>);

export const RETIREMENT_CHOICE = deepFreeze({
  choiceId: "retirement-timing-choice-v1",
  stageId: "retirement-v1",
  title: "When does retirement begin?",
  prompt:
    "Retirement is a timing choice, not an age command. Choose the transition that fits the life you have built.",
  options: [
    {
      optionId: "retirement-now-v1",
      label: "Retire now",
      summary: "Close the working chapter and protect time for health and the people you love.",
      tradeoff: "Freedom arrives sooner, with less time to strengthen financial reserves.",
      timing: "earlier",
      effects: [
        { scoreId: "health", requestedDelta: 7 },
        { scoreId: "happiness", requestedDelta: 6 },
        { scoreId: "money", requestedDelta: -8 },
      ],
      ageAdvanceMonths: 18,
      factId: "fact-retired-earlier-v1",
      factLabel: "Chose time sooner",
      callbackId: "callback-first-free-morning-v1",
      callbackTitle: "The first unhurried morning",
      callbackText:
        "The old alarm stays silent. A familiar person joins you for breakfast, and the day belongs to no timetable but your own.",
      resultText:
        "You chose an earlier retirement and accepted a smaller cushion in exchange for more healthy, unclaimed time.",
    },
    {
      optionId: "retirement-gradual-v1",
      label: "Step down gradually",
      summary: "Work part-time, transfer responsibilities, and learn the rhythm of a slower week.",
      tradeoff: "The transition takes longer but protects both continuity and wellbeing.",
      timing: "gradual",
      effects: [
        { scoreId: "health", requestedDelta: 3 },
        { scoreId: "happiness", requestedDelta: 4 },
        { scoreId: "money", requestedDelta: 2 },
      ],
      ageAdvanceMonths: 42,
      factId: "fact-retired-gradually-v1",
      factLabel: "Built a gradual bridge into retirement",
      callbackId: "callback-last-part-time-day-v1",
      callbackTitle: "The handover is complete",
      callbackText:
        "On your last part-time day, the people taking over know what to do. You leave without the feeling that anything was abandoned.",
      resultText:
        "You made retirement a bridge instead of a cliff, sharing responsibility while practicing a different pace.",
    },
    {
      optionId: "retirement-later-v1",
      label: "Keep working longer",
      summary: "Stay in the work that still feels unfinished and add to your financial cushion.",
      tradeoff: "Security grows, but time and energy remain committed to work.",
      timing: "later",
      effects: [
        { scoreId: "health", requestedDelta: -6 },
        { scoreId: "happiness", requestedDelta: -2 },
        { scoreId: "money", requestedDelta: 9 },
      ],
      ageAdvanceMonths: 66,
      factId: "fact-retired-later-v1",
      factLabel: "Worked into a later season",
      callbackId: "callback-late-retirement-farewell-v1",
      callbackTitle: "A farewell on your own terms",
      callbackText:
        "When you finally close the door, colleagues mark not just the years you stayed, but the steadiness you offered during them.",
      resultText:
        "You worked longer by choice, trading some energy for a stronger cushion and a carefully finished farewell.",
    },
  ],
} satisfies LaterLifeMajorChoice<RetirementChoiceOption>);

export const LEGACY_CHOICE = deepFreeze({
  choiceId: "legacy-route-choice-v1",
  stageId: "legacy-v1",
  title: "What will carry your story forward?",
  prompt:
    "Legacy is not a final score. Choose where to place your time, attention, and memory in the years ahead.",
  options: [
    {
      optionId: "legacy-family-stories-v1",
      label: "Keep family and friendship stories",
      summary: "Gather the people closest to you and preserve the stories only you can tell.",
      tradeoff: "Deep connection takes time and a little of the security you saved.",
      route: "family",
      effects: [
        { scoreId: "health", requestedDelta: 1 },
        { scoreId: "happiness", requestedDelta: 10 },
        { scoreId: "money", requestedDelta: -3 },
      ],
      ageAdvanceMonths: 84,
      factId: "fact-legacy-family-stories-v1",
      factLabel: "Became the keeper of shared stories",
      callbackId: "callback-story-table-v1",
      callbackTitle: "The story comes back in another voice",
      callbackText:
        "At a crowded table, someone younger retells one of your stories. They change a detail, everyone laughs, and you realize it belongs to them now too.",
      resultText:
        "You placed your legacy in the people who knew you, making memory a living conversation rather than a monument.",
    },
    {
      optionId: "legacy-community-project-v1",
      label: "Build something for the community",
      summary: "Give time and resources to a local place where people can keep meeting after you step back.",
      tradeoff: "The project asks for effort and money, but widens the circle of people helped.",
      route: "community",
      effects: [
        { scoreId: "health", requestedDelta: -2 },
        { scoreId: "happiness", requestedDelta: 8 },
        { scoreId: "money", requestedDelta: -2 },
      ],
      ageAdvanceMonths: 78,
      factId: "fact-legacy-community-project-v1",
      factLabel: "Created a lasting community place",
      callbackId: "callback-community-opening-v1",
      callbackTitle: "The doors open",
      callbackText:
        "The new space fills with people who may never know every detail of your life, but whose lives are easier because you helped make room for them.",
      resultText:
        "You turned experience into a shared place, leaving a practical welcome for people beyond your immediate circle.",
    },
    {
      optionId: "legacy-lifelong-craft-v1",
      label: "Pass on a lifelong craft",
      summary: "Teach, write, make, or grow something that carries your curiosity into another generation.",
      tradeoff: "Patient practice supports health and meaning, even when its reach is quiet.",
      route: "craft",
      effects: [
        { scoreId: "health", requestedDelta: 6 },
        { scoreId: "happiness", requestedDelta: 5 },
        { scoreId: "money", requestedDelta: -1 },
      ],
      ageAdvanceMonths: 90,
      factId: "fact-legacy-lifelong-craft-v1",
      factLabel: "Passed on a lifelong craft",
      callbackId: "callback-craft-continues-v1",
      callbackTitle: "A new pair of hands continues",
      callbackText:
        "A learner shows you their own version of what you taught. It is not a copy—and that is how you know the craft will live.",
      resultText:
        "You gave your curiosity a future by teaching the practice, not demanding that anyone repeat your exact path.",
    },
  ],
} satisfies LaterLifeMajorChoice<LegacyChoiceOption>);

export const LATER_LIFE_CHOICES = deepFreeze([
  LATER_CAREER_CHOICE,
  RETIREMENT_CHOICE,
  LEGACY_CHOICE,
] as const);
