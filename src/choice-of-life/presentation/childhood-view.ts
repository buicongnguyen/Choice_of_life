import "./childhood.css";

import {
  CHILDHOOD_STAGE_DEFINITIONS,
  getActiveChildhoodChoice,
  getChildhoodFriendForStage,
  getChildhoodInfluenceProfile,
  getCurrentChildhoodStage,
  type ChildhoodAction,
  type ChildhoodAppearance,
  type ChildhoodCompanion,
  type ChildhoodFriendRelationship,
  type ChildhoodScoreDeltaTotals,
  type ChildhoodStageId,
  type ChildhoodState,
} from "../core/childhood/index";
import { createElement } from "./elements";
import { createStagePlayerAvatar, type StagePlayerCharacter } from "./stage-player-avatar";

export interface ChildhoodViewCallbacks {
  readonly dispatch: (action: ChildhoodAction) => void;
  readonly onContinueToNextChapter: (state: ChildhoodState) => void;
  readonly onReturnToTitle?: () => void;
  readonly playerCharacter?: StagePlayerCharacter;
}

export interface ChildhoodView {
  readonly section: HTMLElement;
  render(state: ChildhoodState): void;
  dispose(): void;
}

type ScoreId = "health" | "happiness" | "money";

interface ScoreWidget {
  readonly output: HTMLOutputElement;
  readonly meter: HTMLMeterElement;
}

const SCORE_COPY: Readonly<Record<ScoreId, { label: string; icon: string }>> =
  Object.freeze({
    health: { label: "Healthy", icon: "♥" },
    happiness: { label: "Happy", icon: "☀" },
    money: { label: "Money", icon: "◆" },
  });

const STAGE_COPY: Readonly<
  Record<
    ChildhoodStageId,
    {
      readonly shortLabel: string;
      readonly sceneTitle: string;
      readonly sceneCopy: string;
      readonly propOne: string;
      readonly propTwo: string;
    }
  >
> = Object.freeze({
  "toddler-v1": {
    shortLabel: "Toddler",
    sceneTitle: "The family playroom",
    sceneCopy: "Every toy is a tiny invitation to explore and share.",
    propOne: "▦",
    propTwo: "★",
  },
  "early-childhood-v1": {
    shortLabel: "Early Childhood",
    sceneTitle: "Neighborhood preschool",
    sceneCopy: "Paint, stories, and new voices make the room feel bigger.",
    propOne: "✎",
    propTwo: "♬",
  },
  "elementary-school-v1": {
    shortLabel: "Elementary",
    sceneTitle: "Elementary campus",
    sceneCopy: "Questions become projects and classmates become teammates.",
    propOne: "⌂",
    propTwo: "⚗",
  },
  "middle-school-v1": {
    shortLabel: "Middle School",
    sceneTitle: "A wider school world",
    sceneCopy: "More choices arrive, but none of them decide your whole future.",
    propOne: "▤",
    propTwo: "⚽",
  },
});

const SKIN_COLORS: Readonly<Record<ChildhoodAppearance["skinToneId"], string>> =
  Object.freeze({
    "porcelain-warm": "#f7d5bd",
    peach: "#eebf9e",
    golden: "#d99b68",
    tan: "#bd794f",
    "warm-brown": "#925334",
    "deep-brown": "#613520",
  });

const HAIR_COLORS: Readonly<Record<ChildhoodAppearance["hairColorId"], string>> =
  Object.freeze({
    black: "#28221f",
    "dark-brown": "#3d2b26",
    "warm-brown": "#684336",
    auburn: "#8a402b",
  });

const PALETTE_COLORS: Readonly<
  Record<ChildhoodAppearance["clothingPaletteId"], readonly [string, string, string]>
> = Object.freeze({
  "coral-teal": ["#e46f62", "#297b7a", "#ffd98d"],
  "berry-cream": ["#a84868", "#fff0d2", "#dd9db0"],
  "sunflower-denim": ["#f1ba43", "#38658b", "#fff2b7"],
  "mint-navy": ["#65bca0", "#263d68", "#d5f3df"],
  "sky-caramel": ["#67a9d4", "#a76537", "#f2dfbd"],
  "lavender-plum": ["#b590d0", "#673f70", "#f5d8ef"],
  "rust-ocean": ["#b9583f", "#2c7180", "#f5c486"],
  "forest-sand": ["#3c7257", "#c8a56b", "#f1dfb7"],
});

const PLAYER_PALETTE = Object.freeze(["#f28b66", "#317f89", "#ffe1a3"] as const);

function ageCopy(ageMonths: number): string {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (years < 2) return `${ageMonths} months old`;
  if (months === 0) return `${years} years old`;
  return `${years} years, ${months} months`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function deltaCopy(delta: ChildhoodScoreDeltaTotals): string {
  return (Object.keys(SCORE_COPY) as ScoreId[])
    .map((scoreId) => `${SCORE_COPY[scoreId].label} ${signed(delta[scoreId])}`)
    .join(" · ");
}

function choiceEffectCopy(
  effects: readonly { readonly scoreId: ScoreId; readonly requestedDelta: number }[],
): string {
  return effects
    .map((effect) => `${SCORE_COPY[effect.scoreId].label} ${signed(effect.requestedDelta)}`)
    .join(" · ");
}

function button(
  document: Document,
  text: string,
  className = "col-button",
): HTMLButtonElement {
  const element = createElement(document, "button", { className, text });
  element.type = "button";
  return element;
}

function createScoreWidget(
  document: Document,
  scoreId: ScoreId,
): Readonly<{ card: HTMLDivElement; widget: ScoreWidget }> {
  const copy = SCORE_COPY[scoreId];
  const card = createElement(document, "div", {
    className: `col-childhood-score col-childhood-score--${scoreId}`,
  });
  card.append(
    createElement(document, "dt", { text: `${copy.icon} ${copy.label}` }),
  );
  const value = createElement(document, "dd");
  const output = createElement(document, "output", {
    className: "col-childhood-score-value",
    text: "0",
  });
  const meter = createElement(document, "meter", {
    attributes: { min: "0", max: "100", value: "0", "aria-hidden": "true" },
  });
  value.append(output, meter);
  card.append(value);
  return Object.freeze({ card, widget: Object.freeze({ output, meter }) });
}

function appendFace(document: Document, head: HTMLElement): void {
  head.append(
    createElement(document, "span", { className: "col-childhood-ear col-childhood-ear--left" }),
    createElement(document, "span", { className: "col-childhood-ear col-childhood-ear--right" }),
    createElement(document, "span", { className: "col-childhood-eye col-childhood-eye--left" }),
    createElement(document, "span", { className: "col-childhood-eye col-childhood-eye--right" }),
    createElement(document, "span", { className: "col-childhood-cheek col-childhood-cheek--left" }),
    createElement(document, "span", { className: "col-childhood-cheek col-childhood-cheek--right" }),
    createElement(document, "span", { className: "col-childhood-smile" }),
  );
}

function createCharacter(
  document: Document,
  role: "player" | "friend",
  label: string,
  appearance?: ChildhoodAppearance,
): HTMLElement {
  const figure = createElement(document, "figure", {
    className: `col-childhood-character col-childhood-character--${role}`,
    attributes: { "aria-label": label },
  });
  const palette = appearance ? PALETTE_COLORS[appearance.clothingPaletteId] : PLAYER_PALETTE;
  figure.style.setProperty("--child-skin", appearance ? SKIN_COLORS[appearance.skinToneId] : "#dba071");
  figure.style.setProperty("--child-hair", appearance ? HAIR_COLORS[appearance.hairColorId] : "#302720");
  figure.style.setProperty("--child-primary", palette[0]);
  figure.style.setProperty("--child-secondary", palette[1]);
  figure.style.setProperty("--child-accent", palette[2]);
  if (appearance) {
    figure.dataset.hair = appearance.hairStyleId;
    figure.dataset.clothes = appearance.clothingStyleId;
    figure.dataset.shoes = appearance.shoeStyleId;
    figure.dataset.bag = appearance.bagStyleId;
    figure.dataset.accessory = appearance.accessoryId;
    figure.dataset.body = appearance.bodyPresentationId;
    figure.dataset.heritage = appearance.heritageStyleId;
    figure.dataset.appearanceSignature = appearance.appearanceSignature;
  } else {
    figure.dataset.hair = "tousled-crop";
    figure.dataset.clothes = "bright-overalls";
    figure.dataset.shoes = "canvas-sneakers";
    figure.dataset.bag = "mini-backpack";
    figure.dataset.accessory = "none";
    figure.dataset.body = "player-child";
  }

  const art = createElement(document, "div", {
    className: "col-childhood-character-art",
    attributes: { "aria-hidden": "true" },
  });
  const shadow = createElement(document, "span", { className: "col-childhood-character-shadow" });
  const legs = createElement(document, "span", { className: "col-childhood-legs" });
  legs.append(
    createElement(document, "i", { className: "col-childhood-leg col-childhood-leg--left" }),
    createElement(document, "i", { className: "col-childhood-leg col-childhood-leg--right" }),
  );
  const body = createElement(document, "span", { className: "col-childhood-body" });
  body.append(
    createElement(document, "i", { className: "col-childhood-collar" }),
    createElement(document, "i", { className: "col-childhood-arm col-childhood-arm--left" }),
    createElement(document, "i", { className: "col-childhood-arm col-childhood-arm--right" }),
    createElement(document, "i", { className: "col-childhood-bag" }),
  );
  const head = createElement(document, "span", { className: "col-childhood-head" });
  appendFace(document, head);
  head.append(
    createElement(document, "i", { className: "col-childhood-hair col-childhood-hair--base" }),
    createElement(document, "i", { className: "col-childhood-hair col-childhood-hair--detail" }),
    createElement(document, "i", { className: "col-childhood-accessory" }),
  );
  art.append(shadow, legs, body, head);
  figure.append(
    art,
    createElement(document, "figcaption", { text: label }),
  );
  return figure;
}

function createCompanion(
  document: Document,
  companion: ChildhoodCompanion,
): HTMLElement {
  const figure = createElement(document, "figure", {
    className: `col-childhood-companion col-childhood-companion--${companion.kind}`,
    attributes: {
      "aria-label": `${companion.name}, a ${companion.personalityId} ${companion.kind}`,
    },
  });
  figure.dataset.coat = companion.coatId;
  figure.dataset.accessory = companion.accessoryId;
  const art = createElement(document, "span", {
    className: "col-childhood-companion-art",
    attributes: { "aria-hidden": "true" },
  });
  art.append(
    createElement(document, "i", { className: "col-childhood-pet-tail" }),
    createElement(document, "i", { className: "col-childhood-pet-body" }),
    createElement(document, "i", { className: "col-childhood-pet-head" }),
    createElement(document, "i", { className: "col-childhood-pet-ear col-childhood-pet-ear--left" }),
    createElement(document, "i", { className: "col-childhood-pet-ear col-childhood-pet-ear--right" }),
    createElement(document, "i", { className: "col-childhood-pet-face" }),
    createElement(document, "i", { className: "col-childhood-pet-collar" }),
  );
  figure.append(art, createElement(document, "figcaption", { text: companion.name }));
  return figure;
}

function friendCard(
  document: Document,
  relationship: ChildhoodFriendRelationship,
  activeStageId: ChildhoodStageId,
): HTMLElement {
  const person = relationship.person;
  const card = createElement(document, "article", {
    className: `col-childhood-friend-card${person.introductionStageId === activeStageId ? " is-current" : ""}`,
    attributes: {
      "data-person-id": person.personId,
      "data-appearance-signature": person.appearance.appearanceSignature,
    },
  });
  const portrait = createCharacter(document, "friend", person.givenName, person.appearance);
  const copy = createElement(document, "div", { className: "col-childhood-friend-copy" });
  copy.append(
    createElement(document, "strong", { text: person.displayName }),
    createElement(document, "span", {
      text: `${STAGE_COPY[person.introductionStageId].shortLabel} friend · same age`,
    }),
    createElement(document, "small", {
      text: `${person.appearance.heritageStyleId === "asian" ? "Asian" : "Western"} style · ${person.gender === "female" ? "girl" : "boy"} · closeness ${relationship.closeness}`,
    }),
  );
  card.append(portrait, copy);
  return card;
}

function latestCallbackStory(state: ChildhoodState): string | null {
  for (let index = state.storyLog.length - 1; index >= 0; index -= 1) {
    const entry = state.storyLog[index];
    if (entry.kind === "callback-resolved") return entry.text;
  }
  return null;
}

export function mountChildhoodView(
  host: HTMLElement,
  callbacks: ChildhoodViewCallbacks,
): ChildhoodView {
  const document = host.ownerDocument;
  const ownerWindow = document.defaultView;
  let currentState: ChildhoodState | null = null;
  let disposed = false;
  let choiceRenderKey = "";
  let summaryRenderKey = "";
  let rosterRenderKey = "";

  const section = createElement(document, "section", {
    className: "col-childhood-view",
    attributes: {
      "aria-labelledby": "childhood-heading",
      "data-childhood-view": "",
    },
  });

  const header = createElement(document, "header", { className: "col-childhood-header" });
  const titleBlock = createElement(document, "div", { className: "col-childhood-title-block" });
  const eyebrow = createElement(document, "p", { className: "col-childhood-eyebrow", text: "Chapter 2 · Growing up" });
  const heading = createElement(document, "h2", {
    text: "Childhood Adventures",
    attributes: { id: "childhood-heading", tabindex: "-1" },
  });
  const stageDescription = createElement(document, "p", { className: "col-childhood-stage-description" });
  titleBlock.append(eyebrow, heading, stageDescription);
  const agePanel = createElement(document, "div", { className: "col-childhood-age-panel" });
  const stageNumber = createElement(document, "strong");
  const age = createElement(document, "span");
  const stageProgress = createElement(document, "progress", {
    attributes: { max: "100", value: "0", "aria-label": "Current childhood stage progress" },
  });
  agePanel.append(stageNumber, age, stageProgress);
  header.append(titleBlock, agePanel);

  const scoreList = createElement(document, "dl", {
    className: "col-childhood-scores",
    attributes: { "aria-label": "Life scores" },
  });
  const scoreWidgets = new Map<ScoreId, ScoreWidget>();
  for (const scoreId of Object.keys(SCORE_COPY) as ScoreId[]) {
    const result = createScoreWidget(document, scoreId);
    scoreList.append(result.card);
    scoreWidgets.set(scoreId, result.widget);
  }

  const scene = createElement(document, "section", {
    className: "col-childhood-scene",
    attributes: { "aria-labelledby": "childhood-scene-heading" },
  });
  const sky = createElement(document, "div", { className: "col-childhood-sky", attributes: { "aria-hidden": "true" } });
  sky.append(
    createElement(document, "span", { className: "col-childhood-sun" }),
    createElement(document, "span", { className: "col-childhood-cloud col-childhood-cloud--one" }),
    createElement(document, "span", { className: "col-childhood-cloud col-childhood-cloud--two" }),
  );
  const scenery = createElement(document, "div", { className: "col-childhood-scenery", attributes: { "aria-hidden": "true" } });
  scenery.append(
    createElement(document, "span", { className: "col-childhood-tree col-childhood-tree--left" }),
    createElement(document, "span", { className: "col-childhood-building" }),
    createElement(document, "span", { className: "col-childhood-tree col-childhood-tree--right" }),
    createElement(document, "span", { className: "col-childhood-fence" }),
  );
  const sceneCopy = createElement(document, "div", { className: "col-childhood-scene-copy" });
  const sceneHeading = createElement(document, "h3", { attributes: { id: "childhood-scene-heading" } });
  const sceneDescription = createElement(document, "p");
  sceneCopy.append(sceneHeading, sceneDescription);
  const propOne = createElement(document, "span", { className: "col-childhood-scene-prop col-childhood-scene-prop--one", attributes: { "aria-hidden": "true" } });
  const propTwo = createElement(document, "span", { className: "col-childhood-scene-prop col-childhood-scene-prop--two", attributes: { "aria-hidden": "true" } });
  const characterField = createElement(document, "div", { className: "col-childhood-character-field" });
  scene.append(sky, scenery, sceneCopy, propOne, propTwo, characterField);

  const playControls = createElement(document, "div", { className: "col-childhood-play-controls" });
  const pauseButton = button(document, "Pause story", "col-button col-childhood-pause");
  pauseButton.setAttribute("aria-keyshortcuts", "P");
  const advanceButton = button(document, "Move ahead", "col-button col-button--primary col-childhood-advance");
  advanceButton.setAttribute("aria-keyshortcuts", "Space");
  const controlHint = createElement(document, "p", {
    text: "The story moves automatically. Pause any time, or move ahead to the next moment.",
  });
  playControls.append(controlHint, pauseButton, advanceButton);

  const echo = createElement(document, "aside", {
    className: "col-childhood-echo",
    attributes: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
  });
  echo.hidden = true;

  const choiceTray = createElement(document, "section", {
    className: "col-childhood-choice-tray",
    attributes: { "aria-labelledby": "childhood-choice-heading" },
  });
  choiceTray.hidden = true;

  const summaryTray = createElement(document, "section", {
    className: "col-childhood-summary",
    attributes: { "aria-labelledby": "childhood-summary-heading" },
  });
  summaryTray.hidden = true;

  const friendsSection = createElement(document, "section", {
    className: "col-childhood-friends",
    attributes: { "aria-labelledby": "childhood-friends-heading" },
  });
  friendsSection.append(
    createElement(document, "div", { className: "col-childhood-section-heading" }),
  );
  const friendsHeading = friendsSection.firstElementChild as HTMLElement;
  friendsHeading.append(
    createElement(document, "div", { className: "col-childhood-heading-copy" }),
  );
  const friendsHeadingCopy = friendsHeading.firstElementChild as HTMLElement;
  friendsHeadingCopy.append(
    createElement(document, "h3", { text: "Friends through childhood", attributes: { id: "childhood-friends-heading" } }),
    createElement(document, "p", { text: "Each school stage keeps its own unique, same-age friend." }),
  );
  const roster = createElement(document, "div", { className: "col-childhood-friend-roster" });
  friendsSection.append(roster);

  const status = createElement(document, "p", {
    className: "col-childhood-status",
    attributes: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
  });

  section.append(header, scoreList, scene, playControls, echo, choiceTray, summaryTray, friendsSection, status);
  host.replaceChildren(section);

  const dispatchAdvance = (ticks: number): void => {
    if (disposed || currentState?.phase !== "active" || currentState.paused) return;
    callbacks.dispatch({ type: "advance", ticks });
  };

  pauseButton.addEventListener("click", () => {
    if (disposed || currentState?.phase !== "active") return;
    callbacks.dispatch({ type: "set-paused", paused: !currentState.paused });
  });
  advanceButton.addEventListener("click", () => dispatchAdvance(8));

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) return;
    if (event.code === "KeyP") {
      event.preventDefault();
      pauseButton.click();
    } else if (event.code === "Space" && currentState?.phase === "active") {
      event.preventDefault();
      dispatchAdvance(8);
    }
  };
  ownerWindow?.addEventListener("keydown", onKeyDown);

  const timer = ownerWindow?.setInterval(() => dispatchAdvance(1), 260) ?? null;

  const renderScores = (state: ChildhoodState): void => {
    for (const scoreId of Object.keys(SCORE_COPY) as ScoreId[]) {
      const widget = scoreWidgets.get(scoreId);
      if (!widget) continue;
      const value = Math.max(0, Math.min(100, Math.round(state.scores[scoreId])));
      widget.output.value = String(value);
      widget.output.textContent = String(value);
      widget.output.setAttribute("aria-label", `${SCORE_COPY[scoreId].label}: ${value} out of 100`);
      widget.meter.value = value;
    }
  };

  const renderScene = (state: ChildhoodState): void => {
    const definition = getCurrentChildhoodStage(state);
    const sceneText = STAGE_COPY[definition.stageId];
    const friend = getChildhoodFriendForStage(state);
    sceneHeading.textContent = sceneText.sceneTitle;
    sceneDescription.textContent = sceneText.sceneCopy;
    propOne.textContent = sceneText.propOne;
    propTwo.textContent = sceneText.propTwo;
    const player = createStagePlayerAvatar(document, callbacks.playerCharacter, "child", "col-childhood-character col-childhood-character--player");
    const friendFigure = createCharacter(document, "friend", friend.person.givenName, friend.person.appearance);
    const children: HTMLElement[] = [player, friendFigure];
    if (state.companion) children.push(createCompanion(document, state.companion));
    characterField.replaceChildren(...children);
  };

  const renderEcho = (state: ChildhoodState): void => {
    const callbackStory = latestCallbackStory(state);
    if (callbackStory === null) {
      echo.hidden = true;
      echo.replaceChildren();
      return;
    }
    echo.hidden = false;
    echo.replaceChildren(
      createElement(document, "strong", { text: "A past choice echoes forward" }),
      createElement(document, "p", { text: callbackStory }),
    );
  };

  const renderChoice = (state: ChildhoodState): void => {
    const active = getActiveChildhoodChoice(state);
    if (active === null) {
      choiceTray.hidden = true;
      choiceRenderKey = "";
      return;
    }
    const key = active.transaction.transactionId;
    choiceTray.hidden = false;
    if (choiceRenderKey === key) return;
    choiceRenderKey = key;
    const title = createElement(document, "div", { className: "col-childhood-choice-title" });
    title.append(
      createElement(document, "span", { className: "col-childhood-kicker", text: "A moment that matters" }),
      createElement(document, "h3", { text: active.definition.title, attributes: { id: "childhood-choice-heading", tabindex: "-1" } }),
      createElement(document, "p", { text: active.friendPrompt }),
      createElement(document, "p", { className: "col-childhood-choice-prompt", text: active.definition.prompt }),
    );
    const grid = createElement(document, "div", { className: "col-childhood-choice-grid" });
    for (const [index, option] of active.definition.options.entries()) {
      const optionButton = button(document, "", "col-childhood-choice");
      optionButton.dataset.optionId = option.optionId;
      optionButton.append(
        createElement(document, "span", { className: "col-childhood-choice-number", text: String(index + 1) }),
        createElement(document, "strong", { text: option.label }),
        createElement(document, "span", { text: option.description }),
        createElement(document, "small", { className: "col-childhood-effect", text: choiceEffectCopy(option.effects) }),
        createElement(document, "small", { text: option.consequencePreview }),
      );
      optionButton.addEventListener("click", () => callbacks.dispatch({ type: "choose", optionId: option.optionId }));
      grid.append(optionButton);
    }
    choiceTray.replaceChildren(title, grid);
    (title.querySelector("h3") as HTMLElement | null)?.focus();
  };

  const renderSummary = (state: ChildhoodState): void => {
    const latest = state.summaries[state.summaries.length - 1];
    if (state.phase !== "stage-summary" && state.phase !== "complete") {
      summaryTray.hidden = true;
      summaryRenderKey = "";
      return;
    }
    const key = `${state.phase}:${latest?.summaryId ?? "complete"}`;
    summaryTray.hidden = false;
    if (summaryRenderKey === key) return;
    summaryRenderKey = key;
    summaryTray.replaceChildren();

    if (state.phase === "stage-summary" && latest) {
      const memory = state.memories.find((candidate) => latest.memoryIds.includes(candidate.memoryId));
      summaryTray.append(
        createElement(document, "span", { className: "col-childhood-kicker", text: `${latest.stageLabel} complete` }),
        createElement(document, "h3", { text: "A chapter to remember", attributes: { id: "childhood-summary-heading", tabindex: "-1" } }),
        createElement(document, "p", { className: "col-childhood-summary-narration", text: latest.narration }),
      );
      const cards = createElement(document, "div", { className: "col-childhood-summary-grid" });
      const memoryCard = createElement(document, "article");
      memoryCard.append(
        createElement(document, "span", { text: "Memory made" }),
        createElement(document, "strong", { text: memory?.title ?? latest.selectedOptionLabel }),
        createElement(document, "p", { text: memory?.summary ?? "This choice becomes part of your childhood story." }),
      );
      const impactCard = createElement(document, "article");
      impactCard.append(
        createElement(document, "span", { text: "Chapter impact" }),
        createElement(document, "strong", { text: deltaCopy(latest.scoreDelta) }),
        createElement(document, "p", { text: `Later echo: ${latest.nextEchoPreview}` }),
      );
      cards.append(memoryCard, impactCard);
      const continueButton = button(document, "Continue to the next stage", "col-button col-button--primary col-childhood-summary-continue");
      continueButton.addEventListener("click", () => callbacks.dispatch({ type: "continue-stage" }));
      summaryTray.append(cards, continueButton);
    } else {
      const influence = getChildhoodInfluenceProfile(state);
      const strongest = influence.strongestSignals.length > 0
        ? influence.strongestSignals.join(" and ")
        : "open possibility";
      summaryTray.append(
        createElement(document, "span", { className: "col-childhood-kicker", text: "Childhood complete" }),
        createElement(document, "h3", { text: "Your story is ready to grow", attributes: { id: "childhood-summary-heading", tabindex: "-1" } }),
        createElement(document, "p", {
          className: "col-childhood-summary-narration",
          text: `Four choices, ${state.memories.length} memories, and friendships that can return later. ${strongest} stands out, but no future identity is locked.`,
        }),
      );
      const memoryList = createElement(document, "div", { className: "col-childhood-memory-list" });
      for (const memory of state.memories) {
        const item = createElement(document, "article");
        item.append(
          createElement(document, "strong", { text: memory.title }),
          createElement(document, "span", { text: memory.summary }),
        );
        memoryList.append(item);
      }
      const actions = createElement(document, "div", { className: "col-childhood-final-actions" });
      const continueButton = button(document, "Continue to the next chapter", "col-button col-button--primary");
      continueButton.addEventListener("click", () => callbacks.onContinueToNextChapter(state));
      actions.append(continueButton);
      if (callbacks.onReturnToTitle) {
        const titleButton = button(document, "Return to title", "col-button");
        titleButton.addEventListener("click", callbacks.onReturnToTitle);
        actions.append(titleButton);
      }
      summaryTray.append(memoryList, actions);
    }
    (summaryTray.querySelector("h3") as HTMLElement | null)?.focus();
  };

  const renderRoster = (state: ChildhoodState): void => {
    const key = `${state.stage.stageId}:${state.friends.map((friend) => `${friend.person.personId}:${friend.closeness}:${friend.status}`).join("|")}`;
    if (rosterRenderKey === key) return;
    rosterRenderKey = key;
    roster.replaceChildren(...state.friends.map((friend) => friendCard(document, friend, state.stage.stageId)));
  };

  const view: ChildhoodView = Object.freeze({
    section,
    render(state: ChildhoodState): void {
      if (disposed) return;
      currentState = state;
      const definition = getCurrentChildhoodStage(state);
      const progress = Math.round((state.stage.activeTicks / Math.max(1, state.stage.durationTicks)) * 100);
      section.dataset.phase = state.phase;
      section.dataset.stage = definition.stageId;
      section.dataset.paused = String(state.paused);
      stageDescription.textContent = definition.summary;
      stageNumber.textContent = `Stage ${state.stage.stageIndex + 1} of ${CHILDHOOD_STAGE_DEFINITIONS.length} · ${definition.label}`;
      age.textContent = ageCopy(state.stage.ageMonths);
      stageProgress.value = Math.max(0, Math.min(100, progress));
      renderScores(state);
      renderScene(state);
      renderEcho(state);
      renderChoice(state);
      renderSummary(state);
      renderRoster(state);

      const isActive = state.phase === "active";
      pauseButton.disabled = !isActive;
      pauseButton.textContent = state.paused ? "Resume story" : "Pause story";
      pauseButton.setAttribute("aria-pressed", String(state.paused));
      advanceButton.disabled = !isActive || state.paused;
      playControls.hidden = !isActive;
      status.textContent = state.phase === "choice"
        ? `Time is paused while you choose with ${getChildhoodFriendForStage(state).person.givenName}.`
        : state.phase === "stage-summary"
          ? `${definition.label} is complete. Your choice and memory are saved in this run.`
          : state.phase === "complete"
            ? "Childhood is complete. Continue when you are ready."
            : state.paused
              ? `${definition.label} is paused.`
              : `${definition.label}, ${progress}% complete.`;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      currentState = null;
      if (timer !== null && ownerWindow !== null) ownerWindow.clearInterval(timer);
      ownerWindow?.removeEventListener("keydown", onKeyDown);
      section.remove();
    },
  });

  return view;
}
