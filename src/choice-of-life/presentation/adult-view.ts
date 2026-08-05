import {
  ADULT_ROUTE_DEFINITIONS,
  ADULT_STAGE_CYCLES,
  adultAppearanceAt,
  availableAdultHomeChoices,
  currentAdultNpcOutfit,
  currentAdultOutfit,
  type AdultAction,
  type AdultAppearance,
  type AdultCulture,
  type AdultFamilyPlanId,
  type AdultGender,
  type AdultHomeChoiceId,
  type AdultJobMetadata,
  type AdultNpcProfile,
  type AdultOutfitVariant,
  type AdultRouteId,
  type AdultState,
} from "../core/adult/index";
import { createElement } from "./elements";
import "./adult.css";

export interface AdultViewCallbacks {
  readonly dispatch: (action: AdultAction) => void;
  readonly onContinueToLaterCareer: () => void;
  readonly onReturnToReady?: () => void;
}

export interface AdultView {
  readonly section: HTMLElement;
  render(state: AdultState): void;
  dispose(): void;
}

interface AdultFigureProfile {
  readonly personId: string;
  readonly name: string;
  readonly gender: AdultGender;
  readonly culture: AdultCulture;
  readonly ageYears: number;
  readonly appearance: AdultAppearance;
  readonly job: AdultJobMetadata;
}

const SCORE_COPY = Object.freeze({
  health: { label: "Healthy", icon: "♥" },
  happiness: { label: "Happy", icon: "☀" },
  money: { label: "Money", icon: "◆" },
});

const ROUTE_ICONS: Readonly<Record<AdultRouteId, string>> = Object.freeze({
  partnered: "♡",
  "single-friends": "✦",
  community: "⌂",
});

const HOME_COPY: Readonly<Record<AdultHomeChoiceId, {
  readonly label: string;
  readonly summary: string;
  readonly effects: string;
}>> = Object.freeze({
  "make-shared-home": {
    label: "Make a shared home",
    summary: "Choose one place and shape the daily rhythm together.",
    effects: "Money −5 · Happy +5",
  },
  "keep-independent-homes": {
    label: "Keep independent homes",
    summary: "Stay close while protecting space and personal routines.",
    effects: "Money −2 · Healthy +2 · Happy +2",
  },
  "friend-household": {
    label: "Share with friends",
    summary: "Build a lively household around trust and mutual support.",
    effects: "Money +2 · Happy +4",
  },
  "independent-home": {
    label: "Create an independent home",
    summary: "Make a calm base that belongs fully to you.",
    effects: "Money −2 · Healthy +3 · Happy +1",
  },
  "community-household": {
    label: "Join a community household",
    summary: "Share resources, meals, and care across generations.",
    effects: "Money +1 · Healthy +2 · Happy +4",
  },
  "neighborhood-root": {
    label: "Put down neighborhood roots",
    summary: "Create a private home with deep local connections.",
    effects: "Money −3 · Healthy +2 · Happy +3",
  },
});

const FAMILY_COPY: Readonly<Record<AdultFamilyPlanId, {
  readonly icon: string;
  readonly label: string;
  readonly summary: string;
  readonly effects: string;
}>> = Object.freeze({
  "no-children": {
    icon: "◇",
    label: "A life without children",
    summary: "Focus care and time on the people and purpose already in your life.",
    effects: "Healthy +2 · Money +2",
  },
  "one-child": {
    icon: "●",
    label: "Welcome one child",
    summary: "Grow the household while keeping some room for rest and work.",
    effects: "Money −5 · Healthy −1 · Happy +5",
  },
  "two-children": {
    icon: "●●",
    label: "Welcome two children",
    summary: "Choose a fuller family life with more joy, cost, and responsibility.",
    effects: "Money −8 · Healthy −2 · Happy +7",
  },
  undecided: {
    icon: "…",
    label: "Leave the question open",
    summary: "Continue this chapter without forcing a permanent answer today.",
    effects: "Happy +1",
  },
});

const CULTURE_COPY: Readonly<Record<AdultCulture, string>> = Object.freeze({
  "east-asian": "East Asian",
  "south-asian": "South Asian",
  western: "Western",
  "african-diaspora": "African diaspora",
  latin: "Latin",
});

const CALLBACK_ICONS = Object.freeze({
  promotion: "↗",
  caregiver: "♥",
  support: "◎",
});

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function scoreEffects(
  effects: readonly { readonly scoreId: keyof typeof SCORE_COPY; readonly requestedDelta: number }[],
): string {
  return effects
    .map((effect) => `${SCORE_COPY[effect.scoreId].label} ${signed(effect.requestedDelta)}`)
    .join(" · ");
}

function stableNumber(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (Math.imul(result, 31) + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function ageLabel(ageYears: number): string {
  return `Age ${Math.floor(ageYears)}`;
}

function cycleProgress(state: AdultState): number {
  if (state.phase === "complete") return 100;
  const openingProgress: Partial<Record<AdultState["phase"], number>> = {
    "route-choice": 5,
    "partner-choice": 10,
    "commitment-choice": 14,
    "home-choice": 18,
    "family-choice": 23,
  };
  return openingProgress[state.phase] ?? Math.min(95, 25 + (state.cycleIndex / ADULT_STAGE_CYCLES) * 70);
}

function createChoiceButton(
  document: Document,
  options: {
    readonly title: string;
    readonly copy: string;
    readonly meta?: string;
    readonly icon?: string;
    readonly className?: string;
    readonly onClick: () => void;
  },
): HTMLButtonElement {
  const button = createElement(document, "button", {
    className: `col-adult-choice${options.className ? ` ${options.className}` : ""}`,
  });
  button.type = "button";
  if (options.icon) {
    button.append(createElement(document, "span", {
      className: "col-adult-choice__icon",
      text: options.icon,
      attributes: { "aria-hidden": "true" },
    }));
  }
  const copy = createElement(document, "span", { className: "col-adult-choice__copy" });
  copy.append(
    createElement(document, "strong", { text: options.title }),
    createElement(document, "span", { text: options.copy }),
  );
  if (options.meta) {
    copy.append(createElement(document, "small", { text: options.meta }));
  }
  button.append(copy);
  button.addEventListener("click", options.onClick);
  return button;
}

function outfitLabel(outfit: AdultOutfitVariant): string {
  const season = outfit.season === "summer" ? "Summer" : "Standard";
  return `${season}: ${outfit.label}`;
}

function createAdultFigure(
  document: Document,
  person: AdultFigureProfile,
  outfit: AdultOutfitVariant,
  options: { readonly compact?: boolean; readonly hero?: boolean } = {},
): HTMLElement {
  const figure = createElement(document, "div", {
    className: [
      "col-adult-figure",
      `col-adult-figure--${person.gender}`,
      `col-adult-figure--${outfit.season}`,
      person.ageYears >= 58 ? "col-adult-figure--senior" : "",
      options.compact ? "col-adult-figure--compact" : "",
      options.hero ? "col-adult-figure--hero" : "",
    ].filter(Boolean).join(" "),
    attributes: {
      "data-hair": slug(person.appearance.hairStyle),
      "data-job": person.job.jobId,
      role: "img",
      "aria-label": `${person.name}, ${person.job.roleTitle}, wearing ${outfitLabel(outfit)}`,
    },
  });
  figure.style.setProperty("--adult-skin", person.appearance.skinTone);
  figure.style.setProperty("--adult-hair", person.appearance.hairColor);
  figure.style.setProperty("--adult-outfit-primary", outfit.palette[0]);
  figure.style.setProperty("--adult-outfit-secondary", outfit.palette[1]);
  figure.style.setProperty("--adult-outfit-accent", outfit.palette[2]);

  const body = createElement(document, "span", {
    className: "col-adult-figure__body",
    attributes: { "aria-hidden": "true" },
  });
  body.append(
    createElement(document, "span", { className: "col-adult-figure__leg col-adult-figure__leg--left" }),
    createElement(document, "span", { className: "col-adult-figure__leg col-adult-figure__leg--right" }),
    createElement(document, "span", { className: "col-adult-figure__torso" }),
    createElement(document, "span", { className: "col-adult-figure__arm col-adult-figure__arm--left" }),
    createElement(document, "span", { className: "col-adult-figure__arm col-adult-figure__arm--right" }),
    createElement(document, "span", { className: "col-adult-figure__neck" }),
    createElement(document, "span", { className: "col-adult-figure__head" }),
    createElement(document, "span", { className: "col-adult-figure__hair-back" }),
    createElement(document, "span", { className: "col-adult-figure__hair" }),
    createElement(document, "span", { className: "col-adult-figure__eye col-adult-figure__eye--left" }),
    createElement(document, "span", { className: "col-adult-figure__eye col-adult-figure__eye--right" }),
    createElement(document, "span", { className: "col-adult-figure__smile" }),
    createElement(document, "span", { className: "col-adult-figure__badge" }),
  );
  figure.append(
    createElement(document, "span", {
      className: "col-adult-figure__shadow",
      attributes: { "aria-hidden": "true" },
    }),
    body,
  );
  return figure;
}

function npcProfile(npc: AdultNpcProfile): AdultFigureProfile {
  return npc;
}

function playerProfile(state: AdultState): AdultFigureProfile {
  return {
    personId: `adult-player-${state.runId}`,
    name: state.player.name,
    gender: state.player.gender,
    culture: state.player.culture,
    ageYears: state.ageYears,
    appearance: adultAppearanceAt(stableNumber(`${state.runSeed}:${state.player.name}`), state.player.gender),
    job: state.career.job,
  };
}

function createPersonCard(
  document: Document,
  state: AdultState,
  npc: AdultNpcProfile,
  options: { readonly actionLabel?: string; readonly onChoose?: () => void } = {},
): HTMLElement {
  const card = createElement(document, "article", {
    className: "col-adult-person-card",
    attributes: { "data-person-id": npc.personId },
  });
  const outfit = currentAdultNpcOutfit(npc, state.season);
  const portrait = createElement(document, "div", { className: "col-adult-person-card__portrait" });
  portrait.append(createAdultFigure(document, npcProfile(npc), outfit, { compact: true }));
  const identity = createElement(document, "div", { className: "col-adult-person-card__identity" });
  identity.append(
    createElement(document, "strong", { text: npc.name }),
    createElement(document, "span", { text: `${npc.job.roleTitle} · ${ageLabel(npc.ageYears)}` }),
    createElement(document, "small", {
      text: `${CULTURE_COPY[npc.culture]} · ${npc.appearance.hairStyle}`,
    }),
    createElement(document, "small", {
      className: "col-adult-outfit-label",
      text: outfitLabel(outfit),
    }),
  );
  card.append(portrait, identity);
  if (options.onChoose) {
    const button = createElement(document, "button", {
      className: "col-button col-button--primary col-adult-person-card__button",
      text: options.actionLabel ?? `Choose ${npc.name}`,
    });
    button.type = "button";
    button.addEventListener("click", options.onChoose);
    card.append(button);
  }
  return card;
}

function createScene(document: Document, state: AdultState): HTMLElement {
  const scene = createElement(document, "div", {
    className: `col-adult-scene col-adult-scene--${state.chapter}`,
    attributes: {
      role: "img",
      "aria-label": "A warm side-view neighborhood showing adult life, work, family, and community",
    },
  });
  const background = createElement(document, "div", {
    className: "col-adult-scene__background",
    attributes: { "aria-hidden": "true" },
  });
  background.append(
    createElement(document, "span", { className: "col-adult-scene__sun" }),
    createElement(document, "span", { className: "col-adult-scene__cloud col-adult-scene__cloud--one" }),
    createElement(document, "span", { className: "col-adult-scene__cloud col-adult-scene__cloud--two" }),
    createElement(document, "span", { className: "col-adult-scene__home" }),
    createElement(document, "span", { className: "col-adult-scene__office" }),
    createElement(document, "span", { className: "col-adult-scene__tree col-adult-scene__tree--one" }),
    createElement(document, "span", { className: "col-adult-scene__tree col-adult-scene__tree--two" }),
    createElement(document, "span", { className: "col-adult-scene__ground" }),
  );

  const people = createElement(document, "div", { className: "col-adult-scene__people" });
  const player = playerProfile(state);
  const playerSpot = createElement(document, "div", { className: "col-adult-scene__person col-adult-scene__person--player" });
  playerSpot.append(
    createAdultFigure(document, player, currentAdultOutfit(state), { hero: true }),
    createElement(document, "span", { text: state.player.name }),
  );
  people.append(playerSpot);

  const supportingPeople: AdultNpcProfile[] = [];
  if (state.partner) supportingPeople.push(state.partner);
  const routePeople = state.routeId === "community" ? state.community : state.friends;
  supportingPeople.push(...routePeople.slice(0, state.partner ? 1 : 2));
  for (const npc of supportingPeople.slice(0, 2)) {
    const spot = createElement(document, "div", { className: "col-adult-scene__person" });
    spot.append(
      createAdultFigure(document, npcProfile(npc), currentAdultNpcOutfit(npc, state.season), { compact: true }),
      createElement(document, "span", { text: npc.name }),
    );
    people.append(spot);
  }

  const caption = createElement(document, "p", { className: "col-adult-scene__caption" });
  caption.textContent = state.phase === "route-choice"
    ? "Adulthood begins with more than one good way to build belonging."
    : state.phase === "partner-choice"
      ? "Meet distinct people with lives, cultures, careers, and styles of their own."
      : state.phase === "commitment-choice"
        ? "Partnership can include marriage, but commitment has more than one shape."
        : state.chapter === "midlife"
          ? "Midlife brings changing work, growing children, and caregivers who may need support."
          : "Home, relationships, health, happiness, and money keep moving together.";
  scene.append(background, people, caption);
  return scene;
}

function createTimeline(document: Document, state: AdultState): HTMLElement {
  const timeline = createElement(document, "div", {
    className: "col-adult-timeline",
    attributes: { "aria-label": `${state.cycleIndex} of ${ADULT_STAGE_CYCLES} adult life cycles complete` },
  });
  for (let cycle = 1; cycle <= ADULT_STAGE_CYCLES; cycle += 1) {
    const step = createElement(document, "span", {
      className: cycle <= state.cycleIndex
        ? "col-adult-timeline__step is-complete"
        : cycle === state.cycleIndex + 1
          ? "col-adult-timeline__step is-next"
          : "col-adult-timeline__step",
      text: String(cycle),
    });
    timeline.append(step);
  }
  return timeline;
}

function renderRouteChoice(
  document: Document,
  tray: HTMLElement,
  callbacks: AdultViewCallbacks,
): void {
  tray.append(
    createElement(document, "span", { className: "col-adult-kicker", text: "Relationships & Home" }),
    createElement(document, "h3", { text: "What kind of adult life will you build first?" }),
    createElement(document, "p", {
      text: "Each route can create a rich life. Your choice changes who shares the journey and which homes become available.",
    }),
  );
  const choices = createElement(document, "div", { className: "col-adult-choice-grid col-adult-choice-grid--routes" });
  for (const routeId of ["partnered", "single-friends", "community"] as const) {
    const route = ADULT_ROUTE_DEFINITIONS[routeId];
    choices.append(createChoiceButton(document, {
      title: route.label,
      copy: route.summary,
      icon: ROUTE_ICONS[routeId],
      onClick: () => callbacks.dispatch({ type: "choose-route", routeId }),
    }));
  }
  tray.append(choices);
}

function attractionCopy(state: AdultState): string {
  if (state.player.attraction === "women") return "Showing women compatible with your relationship preference.";
  if (state.player.attraction === "men") return "Showing men compatible with your relationship preference.";
  if (state.player.attraction === "any") return "Showing people compatible with your open relationship preference.";
  return "Partnership is not part of this character's current preference.";
}

function renderPartnerChoice(
  document: Document,
  tray: HTMLElement,
  state: AdultState,
  callbacks: AdultViewCallbacks,
): void {
  tray.append(
    createElement(document, "span", { className: "col-adult-kicker", text: "A short season of meeting people" }),
    createElement(document, "h3", { text: "Who might become your partner?" }),
    createElement(document, "p", { text: attractionCopy(state) }),
  );
  const grid = createElement(document, "div", { className: "col-adult-person-grid col-adult-person-grid--candidates" });
  for (const candidate of state.partnerCandidates) {
    grid.append(createPersonCard(document, state, candidate, {
      actionLabel: `Choose ${candidate.name}`,
      onChoose: () => callbacks.dispatch({ type: "choose-partner", personId: candidate.personId }),
    }));
  }
  tray.append(grid);
  const skip = createElement(document, "button", {
    className: "col-button col-button--quiet col-adult-skip",
    text: "Continue single and invest in friends",
  });
  skip.type = "button";
  skip.addEventListener("click", () => callbacks.dispatch({ type: "skip-partnering" }));
  tray.append(skip);
}

function renderCommitmentChoice(
  document: Document,
  tray: HTMLElement,
  state: AdultState,
  callbacks: AdultViewCallbacks,
): void {
  const partnerName = state.partner?.name ?? "your partner";
  tray.append(
    createElement(document, "span", { className: "col-adult-kicker", text: "Commitment" }),
    createElement(document, "h3", { text: `How will you and ${partnerName} move forward?` }),
    createElement(document, "p", {
      text: "Marriage is optional. Either choice keeps the relationship and the person you chose.",
    }),
  );
  if (state.partner) {
    const couple = createElement(document, "div", { className: "col-adult-couple-card" });
    couple.append(
      createAdultFigure(document, playerProfile(state), currentAdultOutfit(state), { compact: true }),
      createElement(document, "span", { className: "col-adult-couple-card__heart", text: "♡" }),
      createAdultFigure(document, state.partner, currentAdultNpcOutfit(state.partner, state.season), { compact: true }),
    );
    tray.append(couple);
  }
  const choices = createElement(document, "div", { className: "col-adult-choice-grid" });
  choices.append(
    createChoiceButton(document, {
      title: "Choose marriage",
      copy: "Mark this partnership with a warm, simple wedding chapter.",
      icon: "♡",
      onClick: () => callbacks.dispatch({ type: "choose-commitment", choiceId: "marry" }),
    }),
    createChoiceButton(document, {
      title: "Stay partnered",
      copy: "Build a committed life together without getting married.",
      icon: "∞",
      onClick: () => callbacks.dispatch({ type: "choose-commitment", choiceId: "stay-partnered" }),
    }),
  );
  tray.append(choices);
}

function renderHomeChoice(
  document: Document,
  tray: HTMLElement,
  state: AdultState,
  callbacks: AdultViewCallbacks,
): void {
  tray.append(
    createElement(document, "span", { className: "col-adult-kicker", text: "A place to live" }),
    createElement(document, "h3", { text: "What will home mean in this chapter?" }),
    createElement(document, "p", { text: "Housing changes daily support, privacy, expenses, and joy." }),
  );
  const choices = createElement(document, "div", { className: "col-adult-choice-grid" });
  for (const choiceId of availableAdultHomeChoices(state)) {
    const choice = HOME_COPY[choiceId];
    choices.append(createChoiceButton(document, {
      title: choice.label,
      copy: choice.summary,
      meta: choice.effects,
      icon: "⌂",
      onClick: () => callbacks.dispatch({ type: "choose-home", choiceId }),
    }));
  }
  tray.append(choices);
}

function renderFamilyChoice(
  document: Document,
  tray: HTMLElement,
  callbacks: AdultViewCallbacks,
): void {
  tray.append(
    createElement(document, "span", { className: "col-adult-kicker", text: "Family decisions" }),
    createElement(document, "h3", { text: "Would you like children in this version of your life?" }),
    createElement(document, "p", {
      text: "This is a life-path choice, not a score of what makes a family complete.",
    }),
  );
  const choices = createElement(document, "div", { className: "col-adult-choice-grid col-adult-choice-grid--family" });
  for (const planId of ["no-children", "one-child", "two-children", "undecided"] as const) {
    const plan = FAMILY_COPY[planId];
    choices.append(createChoiceButton(document, {
      title: plan.label,
      copy: plan.summary,
      meta: plan.effects,
      icon: plan.icon,
      onClick: () => callbacks.dispatch({ type: "choose-family-plan", planId }),
    }));
  }
  tray.append(choices);
}

function createSnapshotCard(
  document: Document,
  title: string,
  icon: string,
  lines: readonly string[],
): HTMLElement {
  const card = createElement(document, "article", { className: "col-adult-snapshot" });
  card.append(
    createElement(document, "span", { className: "col-adult-snapshot__icon", text: icon }),
    createElement(document, "h4", { text: title }),
  );
  for (const line of lines) card.append(createElement(document, "p", { text: line }));
  return card;
}

function routeLabel(state: AdultState): string {
  return state.routeId ? ADULT_ROUTE_DEFINITIONS[state.routeId].label : "Still choosing";
}

function familyLabel(state: AdultState): string {
  return state.familyPlanId ? FAMILY_COPY[state.familyPlanId].label : "Family plan open";
}

function homeLabel(state: AdultState): string {
  return state.homeChoiceId ? HOME_COPY[state.homeChoiceId].label : "Home choice open";
}

function renderAdultRoster(document: Document, tray: HTMLElement, state: AdultState): void {
  const people: AdultNpcProfile[] = [];
  if (state.partner) people.push(state.partner);
  const social = state.routeId === "community" ? state.community : state.friends;
  people.push(...social.slice(0, state.partner ? 3 : 4));
  if (people.length === 0) return;
  tray.append(createElement(document, "h4", { className: "col-adult-subheading", text: "People in this chapter" }));
  const grid = createElement(document, "div", { className: "col-adult-person-grid col-adult-person-grid--roster" });
  for (const person of people.slice(0, 4)) grid.append(createPersonCard(document, state, person));
  tray.append(grid);
}

function renderCaregivers(document: Document, tray: HTMLElement, state: AdultState): void {
  const panel = createElement(document, "section", { className: "col-adult-caregiver-panel" });
  panel.append(
    createElement(document, "div", { className: "col-adult-panel-heading" }),
  );
  const heading = panel.firstElementChild as HTMLElement;
  heading.append(
    createElement(document, "span", { text: "♥", attributes: { "aria-hidden": "true" } }),
    createElement(document, "h4", { text: "Caregivers are aging too" }),
  );
  const list = createElement(document, "div", { className: "col-adult-caregiver-list" });
  for (const caregiver of state.caregivers) {
    const item = createElement(document, "article", { className: "col-adult-caregiver" });
    const condition = caregiver.condition === "independent"
      ? "Independent"
      : caregiver.condition === "needs-support"
        ? "Needs some support"
        : "Needs regular care";
    item.append(
      createElement(document, "strong", { text: caregiver.name }),
      createElement(document, "span", {
        text: `${caregiver.relationship} · ${ageLabel(caregiver.ageYears)}`,
      }),
      createElement(document, "small", {
        text: `${condition}${caregiver.retired ? " · retired" : ` · ${caregiver.job.title}`}`,
      }),
    );
    list.append(item);
  }
  panel.append(list);
  tray.append(panel);
}

function renderActiveLife(
  document: Document,
  tray: HTMLElement,
  state: AdultState,
  callbacks: AdultViewCallbacks,
): void {
  tray.append(
    createElement(document, "span", {
      className: "col-adult-kicker",
      text: state.chapter === "midlife" ? "Midlife" : "Relationships & Home",
    }),
    createElement(document, "h3", {
      text: state.chapter === "midlife" ? "Life is changing shape" : "Build the rhythm of adult life",
    }),
    createTimeline(document, state),
  );
  const snapshot = createElement(document, "div", { className: "col-adult-snapshot-grid" });
  snapshot.append(
    createSnapshotCard(document, "Relationships", "♡", [
      routeLabel(state),
      state.partner ? `${state.relationshipStatus} with ${state.partner.name}` : "A life anchored beyond romance",
    ]),
    createSnapshotCard(document, "Home & family", "⌂", [homeLabel(state), familyLabel(state)]),
    createSnapshotCard(document, "Career", "↗", [
      `${state.career.job.roleTitle} · level ${state.career.level}`,
      state.career.status === "active"
        ? "Working regular hours"
        : state.career.status === "reduced-hours"
          ? "Working reduced hours for care"
          : `Career pause · ${state.career.interruptionMonthsRemaining} months`,
      outfitLabel(currentAdultOutfit(state)),
    ]),
  );
  tray.append(snapshot);

  if (state.children.length > 0) {
    const children = createElement(document, "div", { className: "col-adult-children" });
    children.append(createElement(document, "strong", { text: "Growing family" }));
    for (const child of state.children) {
      children.append(createElement(document, "span", {
        text: `${child.gender === "female" ? "●" : "◆"} ${child.name}, ${ageLabel(child.ageYears).toLowerCase()}`,
      }));
    }
    tray.append(children);
  }

  if (state.cycleIndex >= 3) renderCaregivers(document, tray, state);
  renderAdultRoster(document, tray, state);

  const advance = createElement(document, "button", {
    className: "col-button col-button--primary col-adult-cycle-button",
    text: state.cycleIndex + 1 >= 4
      ? `Live the next midlife cycle (${state.cycleIndex + 1}/${ADULT_STAGE_CYCLES})`
      : `Live the next two years (${state.cycleIndex + 1}/${ADULT_STAGE_CYCLES})`,
  });
  advance.type = "button";
  advance.addEventListener("click", () => callbacks.dispatch({ type: "settle-cycle" }));
  tray.append(
    createElement(document, "p", {
      className: "col-adult-cycle-note",
      text: "Each cycle balances income, living costs, wellbeing, relationships, and family responsibilities.",
    }),
    advance,
  );
}

function renderCallback(
  document: Document,
  tray: HTMLElement,
  state: AdultState,
  callbacks: AdultViewCallbacks,
): void {
  const decision = state.pendingDecision;
  if (!decision) return;
  tray.classList.add(`col-adult-tray--callback-${decision.kind}`);
  tray.append(
    createElement(document, "span", {
      className: "col-adult-callback-icon",
      text: CALLBACK_ICONS[decision.kind],
      attributes: { "aria-hidden": "true" },
    }),
    createElement(document, "span", {
      className: "col-adult-kicker",
      text: decision.kind === "promotion"
        ? "Career turning point"
        : decision.kind === "caregiver"
          ? "Caregiving turning point"
          : "Wellbeing turning point",
    }),
    createElement(document, "h3", { text: decision.title }),
    createElement(document, "p", { text: decision.prompt }),
  );
  const choices = createElement(document, "div", { className: "col-adult-choice-grid col-adult-choice-grid--callback" });
  for (const option of decision.options) {
    choices.append(createChoiceButton(document, {
      title: option.label,
      copy: option.description,
      meta: scoreEffects(option.effects),
      onClick: () => callbacks.dispatch({ type: "resolve-callback", optionId: option.optionId }),
    }));
  }
  tray.append(choices);
}

function renderSettling(
  document: Document,
  tray: HTMLElement,
  state: AdultState,
  callbacks: AdultViewCallbacks,
): void {
  tray.append(
    createElement(document, "span", { className: "col-adult-kicker", text: "Adult chapter complete" }),
    createElement(document, "h3", { text: "A life with many threads" }),
    createElement(document, "p", {
      text: "Your relationships, home, career, family decisions, and care choices will travel with you into later career.",
    }),
    createTimeline(document, state),
  );
  const facts = createElement(document, "dl", { className: "col-adult-recap" });
  for (const fact of state.facts.slice(-8)) {
    facts.append(
      createElement(document, "div", { className: "col-adult-recap__item" }),
    );
    const item = facts.lastElementChild as HTMLElement;
    item.append(
      createElement(document, "dt", { text: fact.label }),
      createElement(document, "dd", { text: fact.value }),
    );
  }
  tray.append(facts);
  const finish = createElement(document, "button", {
    className: "col-button col-button--primary col-adult-cycle-button",
    text: "Finish this adult chapter",
  });
  finish.type = "button";
  finish.addEventListener("click", () => callbacks.dispatch({ type: "advance-to-later-career" }));
  tray.append(finish);
}

function renderComplete(
  document: Document,
  tray: HTMLElement,
  callbacks: AdultViewCallbacks,
): void {
  tray.append(
    createElement(document, "span", { className: "col-adult-kicker", text: "Next chapter ready" }),
    createElement(document, "h3", { text: "Continue to Later Career" }),
    createElement(document, "p", {
      text: "Midlife decisions are settled. Work, relationships, family, and support now continue into the next stage.",
    }),
  );
  const continueButton = createElement(document, "button", {
    className: "col-button col-button--primary col-adult-cycle-button",
    text: "Continue to Later Career",
  });
  continueButton.type = "button";
  continueButton.addEventListener("click", callbacks.onContinueToLaterCareer);
  tray.append(continueButton);
}

export function mountAdultView(
  host: HTMLElement,
  callbacks: AdultViewCallbacks,
): AdultView {
  const document = host.ownerDocument;
  let disposed = false;

  const section = createElement(document, "section", {
    className: "col-adult-view",
    attributes: {
      "aria-labelledby": "adult-stage-heading",
      "data-phase": "route-choice",
    },
  });
  const header = createElement(document, "header", { className: "col-adult-header" });
  const headingBlock = createElement(document, "div");
  headingBlock.append(
    createElement(document, "span", { className: "col-adult-kicker", text: "Choice of Life" }),
    createElement(document, "h2", {
      text: "Relationships, Home & Midlife",
      attributes: { id: "adult-stage-heading", tabindex: "-1" },
    }),
    createElement(document, "p", {
      text: "Build belonging, navigate work and care, and let each choice shape the years ahead.",
    }),
  );
  const headerStatus = createElement(document, "div", { className: "col-adult-header__status" });
  const age = createElement(document, "span", { className: "col-adult-age" });
  const progress = createElement(document, "progress", {
    className: "col-adult-progress",
    attributes: { max: "100", "aria-label": "Adult chapter progress" },
  });
  const seasons = createElement(document, "div", {
    className: "col-adult-season-toggle",
    attributes: { role: "group", "aria-label": "Character outfit season" },
  });
  const standardSeason = createElement(document, "button", { text: "Standard" });
  const summerSeason = createElement(document, "button", { text: "Summer" });
  standardSeason.type = "button";
  summerSeason.type = "button";
  standardSeason.addEventListener("click", () => callbacks.dispatch({ type: "set-season", season: "standard" }));
  summerSeason.addEventListener("click", () => callbacks.dispatch({ type: "set-season", season: "summer" }));
  seasons.append(standardSeason, summerSeason);
  headerStatus.append(age, progress, seasons);
  header.append(headingBlock, headerStatus);

  const scoreRow = createElement(document, "div", {
    className: "col-adult-scores",
    attributes: { "aria-label": "Life scores" },
  });
  const scoreOutputs = new Map<keyof typeof SCORE_COPY, HTMLOutputElement>();
  for (const scoreId of ["health", "happiness", "money"] as const) {
    const card = createElement(document, "div", {
      className: `col-adult-score col-adult-score--${scoreId}`,
    });
    const label = createElement(document, "span", {
      text: `${SCORE_COPY[scoreId].icon} ${SCORE_COPY[scoreId].label}`,
    });
    const output = createElement(document, "output");
    const meter = createElement(document, "meter", { attributes: { min: "0", max: "100" } });
    card.append(label, output, meter);
    scoreOutputs.set(scoreId, output);
    scoreRow.append(card);
  }

  const sceneHost = createElement(document, "div", { className: "col-adult-scene-host" });
  const tray = createElement(document, "div", {
    className: "col-adult-tray",
    attributes: { "aria-live": "polite" },
  });
  const footer = createElement(document, "footer", { className: "col-adult-footer" });
  if (callbacks.onReturnToReady) {
    const back = createElement(document, "button", {
      className: "col-button col-button--quiet",
      text: "Back to life overview",
    });
    back.type = "button";
    back.addEventListener("click", callbacks.onReturnToReady);
    footer.append(back);
  }
  footer.append(createElement(document, "span", {
    text: "No single route is the only successful adult life.",
  }));

  section.append(header, scoreRow, sceneHost, tray, footer);
  host.replaceChildren(section);

  const view: AdultView = {
    section,
    render(state: AdultState): void {
      if (disposed) return;
      section.dataset.phase = state.phase;
      section.dataset.chapter = state.chapter;
      section.dataset.season = state.season;
      age.textContent = `${ageLabel(state.ageYears)} · ${state.chapter === "midlife" ? "Midlife" : "Adult life"}`;
      progress.value = cycleProgress(state);
      standardSeason.classList.toggle("is-selected", state.season === "standard");
      standardSeason.setAttribute("aria-pressed", String(state.season === "standard"));
      summerSeason.classList.toggle("is-selected", state.season === "summer");
      summerSeason.setAttribute("aria-pressed", String(state.season === "summer"));
      for (const scoreId of ["health", "happiness", "money"] as const) {
        const value = state.scores[scoreId];
        const output = scoreOutputs.get(scoreId);
        if (!output) continue;
        output.value = String(value);
        output.textContent = String(value);
        output.setAttribute("aria-label", `${SCORE_COPY[scoreId].label}: ${value} out of 100`);
        const meter = output.nextElementSibling as HTMLMeterElement | null;
        if (meter) meter.value = value;
      }
      sceneHost.replaceChildren(createScene(document, state));
      tray.className = "col-adult-tray";
      tray.replaceChildren();
      if (state.phase === "route-choice") renderRouteChoice(document, tray, callbacks);
      else if (state.phase === "partner-choice") renderPartnerChoice(document, tray, state, callbacks);
      else if (state.phase === "commitment-choice") renderCommitmentChoice(document, tray, state, callbacks);
      else if (state.phase === "home-choice") renderHomeChoice(document, tray, state, callbacks);
      else if (state.phase === "family-choice") renderFamilyChoice(document, tray, callbacks);
      else if (state.phase === "active") renderActiveLife(document, tray, state, callbacks);
      else if (state.phase === "callback") renderCallback(document, tray, state, callbacks);
      else if (state.phase === "settling") renderSettling(document, tray, state, callbacks);
      else renderComplete(document, tray, callbacks);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      host.replaceChildren();
    },
  };

  return view;
}
