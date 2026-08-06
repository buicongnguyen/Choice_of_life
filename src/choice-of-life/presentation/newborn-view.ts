import {
  NEWBORN_CAREGIVER_OPTIONS,
  NEWBORN_STAGE_CONTRACT,
  canSettleNewborn,
  type NewbornAction,
  type NewbornCaregiverOptionId,
  type NewbornEntity,
  type NewbornLane,
  type NewbornState,
} from "../core/newborn/index";
import { createElement } from "./elements";
import { drawEventItem, drawRunnerToken, type RunnerTokenKind } from "../../sprites";
import {
  createCharacterElement,
  createCharacterModel,
  type CharacterAppearanceOverrides,
  type CharacterGender,
  type CharacterHeritage,
} from "./character-system";

export interface NewbornViewCallbacks {
  dispatch(action: NewbornAction): void;
  onContinue(): void;
  onReturnToTitle(): void;
  readonly playerCharacter?: Readonly<{
    gender: CharacterGender;
    heritage: CharacterHeritage;
    appearance: CharacterAppearanceOverrides;
  }>;
}

export interface NewbornView {
  readonly section: HTMLElement;
  render(state: NewbornState): void;
  dispose(): void;
}

type EntityProjection = Readonly<{
  id: string;
  kind: "pickup" | "hazard";
  lane: NewbornLane;
  xMilli: number;
  score: "health" | "happiness" | "money";
  collected: boolean;
  contentId: string;
}>;

type CaregiverOptionProjection = Readonly<{
  id: NewbornCaregiverOptionId;
  label: string;
  description: string;
  consequence: string;
}>;

const LANE_LABELS = ["Top lane", "Middle lane", "Bottom lane"] as const;
const SCORE_LABELS = Object.freeze({
  health: "Health",
  happiness: "Happiness",
  money: "Money",
} as const);

const ENTITY_ICONS = Object.freeze({
  health: "🍼",
  happiness: "🧸",
  money: "●",
  hazard: "!",
} as const);

function button(
  document: Document,
  label: string,
  className = "col-button",
): HTMLButtonElement {
  const element = createElement(document, "button", {
    className,
    text: label,
  });
  element.type = "button";
  return element;
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function finiteValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function projectCaregiverOption(
  option: (typeof NEWBORN_CAREGIVER_OPTIONS)[number],
  index: number,
): CaregiverOptionProjection {
  const effectSummary = option.effects
    .map((effect) => `${SCORE_LABELS[effect.scoreId]} +${effect.requestedDelta}`)
    .join(" · ");
  return Object.freeze({
    id: option.optionId,
    label: textValue(option.label, `Care choice ${index + 1}`),
    description: textValue(option.description, "Choose how to respond to your caregiver."),
    consequence: effectSummary,
  });
}

function projectEntity(entity: NewbornEntity, index: number): EntityProjection {
  return Object.freeze({
    id: textValue(entity.instanceId, `newborn-entity-${index}`),
    kind: entity.kind,
    lane: entity.lane,
    xMilli: finiteValue(entity.xMilli, NEWBORN_STAGE_CONTRACT.entitySpawnXMilli),
    score: entity.scoreId,
    collected: false,
    contentId: entity.contentId,
  });
}

const ITEM_ART = Object.freeze({
  "newborn-pickup-milk-v1": Object.freeze({ eventId: "milk", emoji: "🍼", label: "Milk" }),
  "newborn-pickup-rattle-v1": Object.freeze({ eventId: "toy", emoji: "🧸", label: "Rattle" }),
  "newborn-pickup-nest-egg-v1": Object.freeze({ eventId: "nest-egg", emoji: "●", label: "Savings" }),
  "newborn-hazard-spill-v1": Object.freeze({ eventId: "spill", emoji: "💧", label: "Spill" }),
  "newborn-hazard-noise-v1": Object.freeze({ eventId: "noise", emoji: "📢", label: "Noise" }),
  "newborn-hazard-cost-v1": Object.freeze({ eventId: "bill", emoji: "🧾", label: "Cost" }),
} as const);

function createEntityArt(document: Document, entity: EntityProjection): HTMLCanvasElement {
  const canvas = createElement(document, "canvas", {
    className: "col-newborn-entity-art",
    attributes: { width: "112", height: "112", "aria-hidden": "true" },
  });
  const art = ITEM_ART[entity.contentId as keyof typeof ITEM_ART] ?? {
    eventId: entity.kind === "hazard" ? "hazard" : entity.score === "money" ? "coin" : "gift",
    emoji: entity.kind === "hazard" ? ENTITY_ICONS.hazard : ENTITY_ICONS[entity.score],
    label: entity.kind === "hazard" ? "Avoid" : SCORE_LABELS[entity.score],
  };
  const context = canvas.getContext("2d");
  if (context !== null) {
    drawEventItem(context, 56, 101, art.eventId, art.emoji, art.label, entity.kind === "pickup", false, 0);
  }
  return canvas;
}

function createBaby(
  document: Document,
  playerCharacter: NewbornViewCallbacks["playerCharacter"],
): HTMLDivElement {
  const baby = createElement(document, "div", {
    className: "col-newborn-baby col-newborn-baby--storybook col-polish-actor col-polish-actor--character",
    attributes: { "aria-hidden": "true" },
  });
  baby.append(createCharacterElement(document, createCharacterModel({
    characterId: "newborn-player",
    label: "Player as a newborn",
    gender: playerCharacter?.gender ?? "female",
    heritage: playerCharacter?.heritage ?? "asian",
    lifeStage: "newborn",
    direction: "front",
    motion: "sit",
    expression: "smile",
    seed: "newborn-player-v1",
    appearance: playerCharacter?.appearance,
  })));
  return baby;
}

function createCaregiver(document: Document): HTMLDivElement {
  const caregiver = createElement(document, "div", {
    className: "col-newborn-caregiver col-newborn-caregiver--storybook col-polish-actor col-polish-actor--character",
    attributes: { "aria-hidden": "true" },
  });
  caregiver.append(createCharacterElement(document, createCharacterModel({
    characterId: "newborn-caregiver",
    label: "Mom",
    gender: "female",
    heritage: "asian",
    lifeStage: "adult",
    direction: "left",
    motion: "idle",
    expression: "smile",
    seed: "newborn-caregiver-v1",
    appearance: { clothingPaletteId: "coral-teal" },
  })));
  return caregiver;
}

function scoreCard(
  document: Document,
  score: keyof typeof SCORE_LABELS,
): Readonly<{
  card: HTMLDivElement;
  output: HTMLOutputElement;
  meter: HTMLMeterElement;
}> {
  const card = createElement(document, "div", {
    className: `col-newborn-score col-newborn-score--${score}`,
  });
  const term = createElement(document, "dt", { text: SCORE_LABELS[score] });
  const value = createElement(document, "dd");
  const output = createElement(document, "output", {
    className: "col-newborn-score-value",
    attributes: { "data-newborn-score": score },
  });
  const meter = createElement(document, "meter", {
    attributes: { min: "0", max: "100", "aria-hidden": "true" },
  });
  value.append(output, meter);
  card.append(term, value);
  return Object.freeze({ card, output, meter });
}

function completionCopy(state: NewbornState): string {
  const memory = state.story.memories[0]?.summary;
  const opening = memory === undefined ? "Your first nursery chapter is complete." : memory;
  return `${opening} You leave with Health ${state.scores.health}, Happiness ${state.scores.happiness}, and Money ${state.scores.money}.`;
}

export function mountNewbornView(
  container: HTMLElement,
  callbacks: NewbornViewCallbacks,
): NewbornView {
  const document = container.ownerDocument;
  const ownerWindow = document.defaultView;
  const cleanup: Array<() => void> = [];
  let currentState: NewbornState | null = null;
  let disposed = false;
  let pointerStartY: number | null = null;

  const listen = <T extends EventTarget>(
    target: T,
    eventName: string,
    listener: EventListenerOrEventListenerObject,
  ): void => {
    target.addEventListener(eventName, listener);
    cleanup.push(() => target.removeEventListener(eventName, listener));
  };

  const section = createElement(document, "section", {
    className: "col-newborn-view",
    attributes: {
      "aria-labelledby": "newborn-stage-heading",
      "data-newborn-view": "",
    },
  });

  const top = createElement(document, "header", { className: "col-newborn-stage-header" });
  const headingCopy = createElement(document, "div");
  headingCopy.append(
    createElement(document, "p", { className: "col-eyebrow", text: "Stage 1 · Newborn" }),
    createElement(document, "h2", {
      text: "A little room, a whole new world",
      attributes: { id: "newborn-stage-heading", tabindex: "-1" },
    }),
    createElement(document, "p", {
      className: "col-newborn-stage-copy",
      text: "Crawl between three lanes. Collect comforting things, avoid hazards, and notice when your caregiver arrives.",
    }),
  );
  const clock = createElement(document, "div", { className: "col-newborn-clock" });
  const clockLabel = createElement(document, "label", {
    text: "Time in the nursery",
    attributes: { for: "newborn-stage-clock" },
  });
  const clockProgress = createElement(document, "progress", {
    attributes: { id: "newborn-stage-clock", max: "100", value: "0" },
  });
  const clockOutput = createElement(document, "output", {
    text: "0%",
    attributes: { for: "newborn-stage-clock" },
  });
  clock.append(clockLabel, clockProgress, clockOutput);
  top.append(headingCopy);

  const scores = createElement(document, "dl", {
    className: "col-newborn-scores",
    attributes: { "aria-label": "Life scores" },
  });
  const health = scoreCard(document, "health");
  const happiness = scoreCard(document, "happiness");
  const money = scoreCard(document, "money");
  scores.append(health.card, happiness.card, money.card);

  const playfield = createElement(document, "div", {
    className: "col-newborn-playfield",
    attributes: {
      tabindex: "0",
      role: "application",
      "aria-label": "Newborn nursery. Use Up Arrow or W and Down Arrow or S to change lanes.",
      "data-newborn-playfield": "",
    },
  });
  const scenery = createElement(document, "div", {
    className: "col-newborn-scenery",
    attributes: { "aria-hidden": "true" },
  });
  scenery.style.setProperty(
    "--col-newborn-nursery-image",
    `url("${import.meta.env.BASE_URL}assets/newborn-nursery-v1.png")`,
  );
  const skyLight = createElement(document, "div", { className: "col-newborn-window-light" });
  const roomTrack = createElement(document, "div", { className: "col-newborn-room-track" });
  roomTrack.append(
    createElement(document, "span", { className: "col-newborn-window col-newborn-window--one" }),
    createElement(document, "span", { className: "col-newborn-window col-newborn-window--two" }),
    createElement(document, "span", { className: "col-newborn-shelf col-newborn-shelf--one" }),
    createElement(document, "span", { className: "col-newborn-shelf col-newborn-shelf--two" }),
    createElement(document, "span", { className: "col-newborn-dresser col-newborn-dresser--one" }),
    createElement(document, "span", { className: "col-newborn-dresser col-newborn-dresser--two" }),
    createElement(document, "span", { className: "col-newborn-mobile col-newborn-mobile--one" }),
    createElement(document, "span", { className: "col-newborn-mobile col-newborn-mobile--two" }),
  );
  const floor = createElement(document, "div", { className: "col-newborn-floor" });
  const lanes = createElement(document, "div", { className: "col-newborn-lanes" });
  for (const label of LANE_LABELS) {
    lanes.append(createElement(document, "span", {
      className: "col-newborn-lane",
      attributes: { "aria-label": label },
    }));
  }
  scenery.append(skyLight, roomTrack, floor, lanes);

  const entityField = createElement(document, "div", {
    className: "col-newborn-entity-field",
    attributes: { "aria-hidden": "true" },
  });
  const caregiver = createCaregiver(document);
  caregiver.hidden = true;
  const baby = createBaby(document, callbacks.playerCharacter);
  baby.style.setProperty(
    "--col-newborn-player-x",
    `${(NEWBORN_STAGE_CONTRACT.playerXMilli / NEWBORN_STAGE_CONTRACT.entitySpawnXMilli) * 100}%`,
  );
  const babyLabel = createElement(document, "p", {
    className: "col-newborn-position",
    attributes: { "aria-live": "polite", "aria-atomic": "true" },
  });
  playfield.append(scenery, entityField, caregiver, baby, babyLabel);

  const controlArea = createElement(document, "div", { className: "col-newborn-control-area" });
  const instructions = createElement(document, "p", {
    className: "col-newborn-instructions",
    text: "Keyboard: ↑/W moves up, ↓/S moves down, P pauses. Touch: use the lane buttons or swipe vertically in the room.",
  });
  const controlRow = createElement(document, "div", { className: "col-newborn-controls" });
  const upButton = button(
    document,
    "Move up",
    "col-button col-newborn-lane-button col-icon-button col-icon-button--up",
  );
  upButton.setAttribute("aria-keyshortcuts", "ArrowUp W");
  const pauseButton = button(
    document,
    "Pause",
    "col-button col-newborn-pause-button col-icon-button col-icon-button--pause",
  );
  pauseButton.setAttribute("aria-keyshortcuts", "P");
  const downButton = button(
    document,
    "Move down",
    "col-button col-newborn-lane-button col-icon-button col-icon-button--down",
  );
  downButton.setAttribute("aria-keyshortcuts", "ArrowDown S");
  controlRow.append(upButton, downButton);
  controlArea.append(instructions);

  const choiceTray = createElement(document, "section", {
    className: "col-newborn-choice-tray",
    attributes: {
      "aria-labelledby": "newborn-caregiver-heading",
      "data-newborn-choice-tray": "",
    },
  });
  const choiceHeading = createElement(document, "h3", {
    text: "Mom is here",
    attributes: { id: "newborn-caregiver-heading" },
  });
  const choiceIntro = createElement(document, "p", {
    text: "You are safe while choosing. What do you reach for?",
  });
  const trayHeader = createElement(document, "div", { className: "col-newborn-choice-header" });
  const trayMom = createElement(document, "div", {
    className: "col-newborn-choice-mom col-polish-actor col-polish-actor--character",
    attributes: { "aria-hidden": "true" },
  });
  trayMom.append(createCharacterElement(document, createCharacterModel({
    characterId: "newborn-caregiver-tray",
    label: "Mom",
    gender: "female",
    heritage: "asian",
    lifeStage: "adult",
    direction: "front",
    motion: "idle",
    expression: "smile",
    seed: "newborn-caregiver-v1",
    appearance: { clothingPaletteId: "coral-teal" },
  })));
  const trayCopy = createElement(document, "div", { className: "col-newborn-choice-copy" });
  const choiceTokenByGoal: Readonly<Record<string, RunnerTokenKind>> = Object.freeze({
    comfort: "health",
    curiosity: "happiness",
    stability: "money",
  });
  const choiceList = createElement(document, "div", { className: "col-newborn-choice-list" });
  const optionButtons = NEWBORN_CAREGIVER_OPTIONS.map((option, index) => {
    const projected = projectCaregiverOption(option, index);
    const choice = button(document, "", "col-newborn-choice");
    const icon = document.createElement("canvas");
    icon.width = 40;
    icon.height = 40;
    icon.className = "col-newborn-choice-icon";
    icon.setAttribute("aria-hidden", "true");
    const iconContext = icon.getContext("2d");
    if (iconContext !== null) {
      drawRunnerToken(iconContext, 20, 38, choiceTokenByGoal[option.goalId] ?? "happiness");
    }
    const label = createElement(document, "strong", { text: projected.label });
    const description = createElement(document, "span", { text: projected.description });
    const consequence = createElement(document, "small", { text: projected.consequence });
    choice.append(icon, label, description, consequence);
    choice.dataset.optionId = projected.id;
    listen(choice, "click", () => {
      if (disposed || currentState?.phase !== "caregiver-choice") return;
      callbacks.dispatch({ type: "choose-caregiver", optionId: projected.id });
    });
    choiceList.append(choice);
    return choice;
  });
  trayCopy.append(choiceHeading, choiceIntro);
  trayHeader.append(trayMom, trayCopy);
  choiceTray.append(trayHeader, choiceList);
  choiceTray.hidden = true;

  const recap = createElement(document, "section", {
    className: "col-newborn-recap",
    attributes: { "aria-labelledby": "newborn-recap-heading" },
  });
  const recapHeading = createElement(document, "h3", {
    text: "Your newborn chapter",
    attributes: { id: "newborn-recap-heading", tabindex: "-1" },
  });
  const recapCopy = createElement(document, "p");
  const recapScores = createElement(document, "p", { className: "col-newborn-recap-scores" });
  const recapActions = createElement(document, "div", { className: "col-newborn-recap-actions" });
  const settleButton = button(document, "Finish this chapter", "col-button col-button--primary");
  const continueButton = button(document, "Continue to the next stage", "col-button col-button--primary");
  const titleButton = button(document, "Keep for this session and return to title", "col-button");
  recapActions.append(settleButton, continueButton, titleButton);
  recap.append(recapHeading, recapCopy, recapScores, recapActions);
  recap.hidden = true;

  const status = createElement(document, "p", {
    className: "col-newborn-status",
    attributes: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
  });

  const stageWrap = createElement(document, "div", { className: "col-newborn-stage" });
  stageWrap.append(playfield, scores, clock, top, pauseButton, controlRow, choiceTray);
  section.append(stageWrap, controlArea, recap, status);
  container.replaceChildren(section);

  const requestMove = (direction: "up" | "down"): void => {
    const state = currentState;
    if (disposed || state === null || state.phase !== "active" || state.clock.paused) return;
    callbacks.dispatch({ type: "move", direction });
  };

  const togglePause = (): void => {
    const state = currentState;
    if (disposed || state === null || state.phase !== "active") return;
    callbacks.dispatch({ type: "set-paused", paused: !state.clock.paused });
  };

  listen(upButton, "click", () => requestMove("up"));
  listen(downButton, "click", () => requestMove("down"));
  listen(pauseButton, "click", togglePause);
  listen(settleButton, "click", () => {
    if (currentState !== null && canSettleNewborn(currentState)) {
      callbacks.dispatch({ type: "settle" });
    }
  });
  listen(continueButton, "click", () => callbacks.onContinue());
  listen(titleButton, "click", () => callbacks.onReturnToTitle());

  if (ownerWindow !== null) {
    listen(ownerWindow, "keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      const target = keyboardEvent.target;
      if (
        target instanceof HTMLInputElement || target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      if (keyboardEvent.code === "ArrowUp" || keyboardEvent.code === "KeyW") {
        keyboardEvent.preventDefault();
        requestMove("up");
      } else if (keyboardEvent.code === "ArrowDown" || keyboardEvent.code === "KeyS") {
        keyboardEvent.preventDefault();
        requestMove("down");
      } else if (keyboardEvent.code === "KeyP") {
        keyboardEvent.preventDefault();
        togglePause();
      }
    });
  }

  listen(playfield, "pointerdown", (event) => {
    pointerStartY = (event as PointerEvent).clientY;
  });
  listen(playfield, "pointerup", (event) => {
    if (pointerStartY === null) return;
    const delta = (event as PointerEvent).clientY - pointerStartY;
    pointerStartY = null;
    if (Math.abs(delta) < 24) return;
    requestMove(delta < 0 ? "up" : "down");
  });
  listen(playfield, "pointercancel", () => {
    pointerStartY = null;
  });

  const renderScore = (
    card: ReturnType<typeof scoreCard>,
    label: string,
    value: number,
  ): void => {
    const bounded = Math.max(0, Math.min(100, Math.round(value)));
    card.output.value = String(bounded);
    card.output.textContent = String(bounded);
    card.output.setAttribute("aria-label", `${label}: ${bounded} out of 100`);
    card.meter.value = bounded;
  };

  const renderEntities = (state: NewbornState): void => {
    const projected = state.world.entities
      .map(projectEntity)
      .filter((entity) => !entity.collected);
    const children = projected.map((entity) => {
      const x = (entity.xMilli / NEWBORN_STAGE_CONTRACT.entitySpawnXMilli) * 100;
      const token = createElement(document, "span", {
        className: `col-newborn-entity col-newborn-entity--${entity.kind} col-newborn-entity--${entity.score}`,
      });
      token.append(createEntityArt(document, entity));
      token.style.setProperty("--col-newborn-entity-x", `${x}%`);
      token.style.setProperty(
        "--col-newborn-entity-y",
        `${55 + entity.lane * 18}%`,
      );
      token.dataset.entityId = entity.id;
      return token;
    });
    entityField.replaceChildren(...children);
  };

  const render = (state: NewbornState): void => {
    if (disposed) return;
    const previousPhase = currentState?.phase ?? null;
    currentState = state;
    section.dataset.phase = state.phase;
    section.dataset.paused = String(state.clock.paused);

    const duration = Math.max(1, state.clock.durationTicks);
    const progress = Math.max(0, Math.min(100, Math.round((state.clock.activeTicks / duration) * 100)));
    clockProgress.value = progress;
    clockOutput.value = `${progress}%`;
    clockOutput.textContent = `${progress}%`;
    renderScore(health, "Health", state.scores.health);
    renderScore(happiness, "Happiness", state.scores.happiness);
    renderScore(money, "Money", state.scores.money);
    renderEntities(state);

    baby.style.setProperty(
      "--col-newborn-lane-y",
      `${55 + state.player.lane * 18}%`,
    );
    baby.dataset.motion = state.player.visualMotion;
    baby.dataset.frame = String(state.player.crawlFrame);
    babyLabel.textContent = `${LANE_LABELS[state.player.lane]}. ${
      state.player.visualMotion === "crawl" ? "Crawling" : "Sitting"
    }.`;

    const active = state.phase === "active";
    upButton.disabled = !active || state.clock.paused || state.player.lane === 0;
    downButton.disabled = !active || state.clock.paused || state.player.lane === 2;
    pauseButton.disabled = !active;
    pauseButton.textContent = state.clock.paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(state.clock.paused));

    const choiceVisible = state.phase === "caregiver-choice";
    choiceTray.hidden = !choiceVisible;
    caregiver.hidden = !choiceVisible;
    for (const choice of optionButtons) choice.disabled = !choiceVisible;

    const canSettle = canSettleNewborn(state);
    const recapVisible = state.phase === "settling" || state.phase === "complete";
    recap.hidden = !recapVisible;
    settleButton.hidden = !canSettle || state.phase === "complete";
    settleButton.disabled = !canSettle;
    continueButton.hidden = state.phase !== "complete";
    titleButton.hidden = state.phase !== "complete";
    recapCopy.textContent = state.phase === "complete"
      ? completionCopy(state)
      : "The room has slowed down. Take a look at what this first chapter added to your life.";
    recapScores.textContent = `Health ${state.scores.health} · Happiness ${state.scores.happiness} · Money ${state.scores.money}`;

    status.textContent = choiceVisible
      ? "Caregiver choice ready. Time is paused while you choose."
      : state.phase === "complete"
        ? "Newborn stage complete."
        : state.phase === "settling"
          ? "Nursery run complete. Review the chapter recap."
          : state.clock.paused
            ? "Nursery paused."
            : `${LANE_LABELS[state.player.lane]}. ${progress}% through the nursery.`;

    if (previousPhase !== state.phase) {
      if (choiceVisible) optionButtons[0]?.focus();
      else if (state.phase === "settling" || state.phase === "complete") recapHeading.focus();
    }
  };

  return Object.freeze({
    section,
    render,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      currentState = null;
      pointerStartY = null;
      for (const remove of cleanup.splice(0).reverse()) remove();
      section.remove();
    },
  });
}
